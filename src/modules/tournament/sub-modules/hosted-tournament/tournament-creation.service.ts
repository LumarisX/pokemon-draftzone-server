import { TransactionRunner } from "@core/database/transaction-runner";
import { nullIfNotFound, PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { DraftRepository } from "@modules/draft/draft.repository";
import { leagueRole } from "@modules/league/league-access";
import { LeagueRepository } from "@modules/league/league.repository";
import { TierListAccessService } from "@modules/tier-list/tier-list-access.service";
import { TierListHistoryService } from "@modules/tier-list/tier-list-history.service";
import { TierList, upstreamOf } from "@modules/tier-list/tier-list.domain";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { toState } from "@modules/tier-list/tier-list.state";
import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { assertRosterRules } from "./hosted-tournament.domain";
import { CreateTournamentDto } from "./hosted-tournament.dto";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import { HostingAccessService } from "./hosting-access.service";
import {
  HostedTournamentEntity,
  SignUpQuestionEntity,
} from "./hosted-tournament.schema";

export const DEFAULT_POOL_NAME = "Draft Pool";

export const DEFAULT_DRAFT_COUNT = { min: 10, max: 12 } as const;

const DEFAULT_SIGN_UP_DAYS = 14;

export function defaultSignUpDeadline(now = new Date()): Date {
  const deadline = new Date(now);
  deadline.setUTCDate(deadline.getUTCDate() + DEFAULT_SIGN_UP_DAYS);
  return deadline;
}

export function carriedQuestions(
  questions: readonly SignUpQuestionEntity[],
): SignUpQuestionEntity[] {
  const kept = questions.filter((question) => !question.archived);
  const keptIds = new Set(kept.map((question) => question.id));
  return kept.map(({ dependsOn, ...question }) =>
    dependsOn && keptIds.has(dependsOn.questionId)
      ? { ...question, dependsOn }
      : question,
  );
}

export function carriedSettings(
  source: HostedTournamentEntity,
): Partial<HostedTournamentEntity> {
  return {
    description: source.description,
    logo: source.logo,
    discord: source.discord,
    rules: source.rules,
    signUpQuestions: carriedQuestions(source.signUpQuestions ?? []),
    maxTeams: source.maxTeams,
    forfeit: source.forfeit,
    diffMode: source.diffMode,
    standingsRules: source.standingsRules,
    draftCount: source.draftCount,
    pointTotal: source.pointTotal,
    tradePointLimit: source.tradePointLimit,
    prizeSplit: source.prizeSplit,
    matchSettings: source.matchSettings,
    adSettings: source.adSettings
      ? { ...source.adSettings, advertise: false }
      : undefined,
  };
}

@Injectable()
export class TournamentCreationService {
  constructor(
    private readonly leagueRepo: LeagueRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
    private readonly hosting: HostingAccessService,
    private readonly transactions: TransactionRunner,
    private readonly draftRepo: DraftRepository,
    private readonly tierListAccess: TierListAccessService,
    private readonly tierListHistory: TierListHistoryService,
  ) {}

  async createTournament(
    leagueSlug: string,
    sub: string,
    dto: CreateTournamentDto,
  ) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    const role = leagueRole(league, sub);
    if (!role) throw new PDZError(ErrorCodes.LEAGUE.NOT_ADMIN, { leagueSlug });
    if (role === "owner") await this.hosting.assertCanCreateTournament(sub);

    const source = dto.copyFrom
      ? await this.tournamentRepo.findPlainInLeague(league._id, dto.copyFrom)
      : null;
    if (dto.copyFrom && !source)
      throw new PDZError(ErrorCodes.TOURNAMENT.COPY_SOURCE_INVALID, {
        copyFrom: dto.copyFrom,
      });

    const tierListSlug =
      dto.tierListFrom === undefined ? dto.copyFrom : dto.tierListFrom;
    const tierListTournament = !tierListSlug
      ? null
      : tierListSlug === dto.copyFrom
        ? source
        : await this.tournamentRepo.findPlainInLeague(league._id, tierListSlug);

    const sourceTierList = dto.tierListSlug
      ? (await this.tierListAccess.resolve(dto.tierListSlug, sub, "view")).tierList
      : tierListTournament?.tierList
        ? await nullIfNotFound(
            this.tierListRepo.findById(tierListTournament.tierList.toString()),
          )
        : null;
    if (dto.tierListFrom && !sourceTierList)
      throw new PDZError(ErrorCodes.TOURNAMENT.COPY_SOURCE_INVALID, {
        tierListFrom: dto.tierListFrom,
      });

    const draftCount =
      dto.draftCount ?? source?.draftCount ?? DEFAULT_DRAFT_COUNT;
    const diffMode = dto.diffMode ?? source?.diffMode ?? "pokemon";

    const tierRequirements =
      sourceTierList && source && tierListTournament === source && !dto.tierListSlug
        ? (source.tierRequirements ?? [])
        : [];
    assertRosterRules({
      tierIds: sourceTierList
        ? new Set(sourceTierList.tiers.map((tier) => tier.id))
        : null,
      draftCount,
      tierRequirements: tierRequirements.map((requirement) => ({
        tierId: requirement.tierId.toString(),
        required: requirement.required,
        max: requirement.max,
      })),
    });

    const created = await this.transactions.run(async () => {
      const tournament = await this.tournamentRepo.create({
        ...(source ? carriedSettings(source) : {}),
        name: dto.name,
        league: league._id,
        ...(role === "owner"
          ? { ownerName: { sub, name: dto.ownerName }, staff: [] }
          : {
              ownerName:
                source?.ownerName?.sub === league.owner
                  ? source.ownerName
                  : undefined,
              staff: [{ sub, name: dto.ownerName, role: "organizer" as const }],
            }),
        signUpDeadline: dto.signUpDeadline ?? defaultSignUpDeadline(),
        signUpAccess: "closed",
        forfeit: source?.forfeit ?? { gameDiff: 0, pokemonDiff: 0 },
        diffMode,
        draftCount: { min: draftCount.min, max: draftCount.max },
        tierRequirements,
      });
      if (sourceTierList) {
        const copyId = await this.copyTierList(
          sourceTierList,
          tournament._id,
          sub,
          dto.ownerName,
        );
        await this.tournamentRepo.updateSettings(tournament._id, {
          tierList: copyId,
        });
      }
      await this.draftRepo.create({
        tournamentId: tournament._id,
        name: DEFAULT_POOL_NAME,
      });
      return tournament;
    });

    return { tournamentSlug: created.slug };
  }

  private async copyTierList(
    source: TierList,
    tournamentId: Types.ObjectId,
    sub: string,
    actorName: string,
  ): Promise<Types.ObjectId> {
    const upstream = upstreamOf(source);
    const copy = await this.tierListRepo.create({
      name: source.name,
      description: source.description,
      createdBy: sub,
      format: source.format.name,
      ruleset: source.ruleset.name,
      tournament: tournamentId,
      copiedFrom: new Types.ObjectId(upstream.id),
      copiedFromVersion: upstream.version,
      state: toState(source),
    });
    await this.tierListHistory.recordCreated({
      tierList: copy,
      actor: sub,
      actorName,
      kind: "copy",
      summary: `Copied from ${source.name}`,
    });
    if (!source.isTournamentCopy)
      await this.tierListRepo.incrementUseCount(source.id);
    return new Types.ObjectId(copy.id);
  }
}
