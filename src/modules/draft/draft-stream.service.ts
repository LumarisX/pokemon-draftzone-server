import { CoachRepository } from "@modules/coach/coach.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { isActiveCoach } from "@modules/tournament/membership";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { can, isStaff } from "@modules/tournament/tournament-policy";
import { Injectable, MessageEvent } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { filter, interval, map, merge, Observable, Subject } from "rxjs";
import {
  DraftAddedEvent,
  DraftCompletedEvent,
  DraftCounterEvent,
  DraftEventAudience,
  DraftPickUpdatedEvent,
  DraftSkipEvent,
  DraftStatusEvent,
} from "./draft-events.service";

export const HEARTBEAT_MS = 25_000;

type StreamPayload = {
  tournamentSlug: string;
  audience: DraftEventAudience;
};

type EventData = Record<string, unknown>;

export type StreamAccess = {
  member: boolean;
  seesAllPicks: boolean;
  teamIds: Set<string>;
};

const NO_ACCESS: StreamAccess = {
  member: false,
  seesAllPicks: false,
  teamIds: new Set(),
};

const PICK_EVENTS = new Set(["league.draft.added", "league.draft.updated"]);

function hidePick(data: EventData): EventData {
  const pick = data["pick"] as EventData | undefined;
  const team = data["team"] as EventData | undefined;
  const { pokemon: _pokemon, previous: _previous, ...rest } = data;
  return {
    ...rest,
    ...(pick ? { pick: { team: pick["team"], pool: pick["pool"] } } : {}),
    ...(team ? { team: { id: team["id"], name: team["name"], draft: [] } } : {}),
  };
}

@Injectable()
export class DraftStreamService {
  private readonly events$ = new Subject<{
    type: string;
    payload: StreamPayload;
  }>();

  constructor(
    private readonly coachRepo: CoachRepository,
    private readonly teamRepo: TeamRepository,
  ) {}

  async streamFor(
    tournament: HostedTournament,
    sub: string | null,
  ): Promise<Observable<MessageEvent>> {
    const access = await this.accessFor(tournament, sub);
    const events = this.events$.pipe(
      filter(({ payload }) => payload.tournamentSlug === tournament.slug),
      map(({ type, payload }) => this.messageFor(type, payload, access)),
      filter((message): message is MessageEvent => message !== null),
    );
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ comment: "keepalive" })),
    );
    return merge(events, heartbeat);
  }

  private messageFor(
    type: string,
    payload: StreamPayload,
    access: StreamAccess,
  ): MessageEvent | null {
    const { audience, ...data } = payload;
    if (!audience.draftPublic && !access.member) return null;

    const hidden =
      !!audience.blindTeamId &&
      !access.seesAllPicks &&
      !access.teamIds.has(audience.blindTeamId);
    return {
      type,
      data: hidden && PICK_EVENTS.has(type) ? hidePick(data) : data,
    };
  }

  private async accessFor(
    tournament: HostedTournament,
    sub: string | null,
  ): Promise<StreamAccess> {
    if (!sub) return NO_ACCESS;
    const coaches = (await this.coachRepo.findByAuth0Id(sub)).filter(
      isActiveCoach,
    );
    const teams = coaches.length
      ? await this.teamRepo.findManyByIds(coaches.map((coach) => coach.teamId))
      : [];
    const teamIds = new Set(
      teams
        .filter(
          (team) =>
            team.tournamentId.toString() === tournament.id &&
            team.status === "approved",
        )
        .map((team) => team._id.toString()),
    );
    return {
      member: isStaff(tournament, sub) || teamIds.size > 0,
      seesAllPicks: can(tournament, sub, "manageDrafts"),
      teamIds,
    };
  }

  private publish(type: string, payload: StreamPayload): void {
    this.events$.next({ type, payload });
  }

  @OnEvent("league.draft.added")
  onDraftAdded(payload: DraftAddedEvent) {
    this.publish("league.draft.added", payload);
  }

  @OnEvent("league.draft.counter")
  onDraftCounter(payload: DraftCounterEvent) {
    this.publish("league.draft.counter", payload);
  }

  @OnEvent("league.draft.updated")
  onDraftPickUpdated(payload: DraftPickUpdatedEvent) {
    this.publish("league.draft.updated", payload);
  }

  @OnEvent("league.draft.status")
  onDraftStatus(payload: DraftStatusEvent) {
    this.publish("league.draft.status", payload);
  }

  @OnEvent("league.draft.skip")
  onDraftSkip(payload: DraftSkipEvent) {
    this.publish("league.draft.skip", payload);
  }

  @OnEvent("league.draft.completed")
  onDraftCompleted(payload: DraftCompletedEvent) {
    this.publish("league.draft.completed", payload);
  }
}
