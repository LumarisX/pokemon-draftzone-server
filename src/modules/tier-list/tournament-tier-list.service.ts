import { TransactionRunner } from "@core/database/transaction-runner";
import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { TeamRepository } from "@modules/team/team.repository";
import { TournamentLogWriter } from "@modules/tournament-log/tournament-log.writer";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { assertCan } from "@modules/tournament/tournament-policy";
import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { TierListAccessService } from "./tier-list-access.service";
import { TierListHistoryService } from "./tier-list-history.service";
import { TierList, upstreamOf } from "./tier-list.domain";
import { TierListRepository } from "./tier-list.repository";
import { TierListService } from "./tier-list.service";
import {
  diffStates,
  emptyState,
  mergeStates,
  TierListState,
  toState,
} from "./tier-list.state";

export type RequirementPlan = {
  tierName: string;
  required: number;
  max?: number;
  kept: boolean;
};

export type AffectedPick = {
  team: string;
  pokemonId: string;
  name: string;
  from: number | null;
  to: number | null;
};

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

@Injectable()
export class TournamentTierListService {
  constructor(
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
    private readonly tierListService: TierListService,
    private readonly access: TierListAccessService,
    private readonly history: TierListHistoryService,
    private readonly teamRepo: TeamRepository,
    private readonly logWriter: TournamentLogWriter,
    private readonly transactions: TransactionRunner,
  ) {}

  private async organizerContext(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
  ) {
    const tournament = await this.tournamentRepo.findBySlug(
      leagueSlug,
      tournamentSlug,
    );
    assertCan(tournament, sub, "manageSettings");
    const current = tournament.tierListId
      ? await this.tierListRepo.findById(tournament.tierListId).catch(() => null)
      : null;
    return { tournament, current };
  }

  planRequirements(
    tournament: HostedTournament,
    current: TierList | null,
    incoming: { tiers: { id: string; name: string }[] },
  ): { plan: RequirementPlan[]; requirements: { tierId: string; required: number; max?: number }[] } {
    const plan: RequirementPlan[] = [];
    const requirements: { tierId: string; required: number; max?: number }[] = [];
    for (const requirement of tournament.tierRequirements) {
      const tierName = current?.getTierById(requirement.tierId)?.name;
      if (!tierName) continue;
      const match = incoming.tiers.find((tier) => sameName(tier.name, tierName));
      plan.push({
        tierName,
        required: requirement.required,
        ...(requirement.max != null && { max: requirement.max }),
        kept: !!match,
      });
      if (match)
        requirements.push({
          tierId: match.id,
          required: requirement.required,
          ...(requirement.max != null && { max: requirement.max }),
        });
    }
    return { plan, requirements };
  }

  private async affectedPicks(
    tournament: HostedTournament,
    current: TierList | null,
    incoming: TierListState,
  ): Promise<{ draftStarted: boolean; picks: AffectedPick[] }> {
    const teams = await this.teamRepo.findAllByTournament(tournament.id);
    const tierCost = new Map(incoming.tiers.map((tier) => [tier.id, tier.cost]));
    const picks: AffectedPick[] = [];
    let draftStarted = false;

    for (const team of teams) {
      for (const pick of (team.picks ?? []).flat()) {
        draftStarted = true;
        const from = current?.getPokemonCost(pick.pokemonId, pick.addons) ?? null;
        const entry = incoming.pokemon[pick.pokemonId];
        const addon = pick.addons?.length
          ? entry?.addons?.find((candidate) => candidate.name === pick.addons![0])
          : undefined;
        const to = !entry || entry.banned
          ? null
          : (addon?.cost ?? (entry.tierId ? (tierCost.get(entry.tierId) ?? null) : null));
        if (from === to) continue;
        picks.push({
          team: team.teamName,
          pokemonId: pick.pokemonId,
          name: entry?.name ?? current?.pokemon.get(pick.pokemonId)?.name ?? pick.pokemonId,
          from,
          to,
        });
      }
    }
    return { draftStarted, picks };
  }

  async preview(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    fromSlug: string,
  ) {
    const { tournament, current } = await this.organizerContext(
      leagueSlug,
      tournamentSlug,
      sub,
    );
    const { tierList: incoming } = await this.access.resolve(fromSlug, sub, "view");
    const incomingState = toState(incoming);
    const { plan } = this.planRequirements(tournament, current, incomingState);
    const { draftStarted, picks } = await this.affectedPicks(
      tournament,
      current,
      incomingState,
    );

    return {
      incoming: {
        slug: incoming.slug,
        name: incoming.name,
        authorName: incoming.authorName ?? null,
        format: incoming.format.name,
        ruleset: incoming.ruleset.name,
        tierCount: incoming.tiers.length,
      },
      current: current ? { slug: current.slug, name: current.name } : null,
      changes: diffStates(current ? toState(current) : emptyState(), incomingState),
      legality: await this.tierListService.legalityReport(incoming),
      requirements: plan,
      draftStarted,
      affectedPicks: picks,
    };
  }

  async attach(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    input: {
      tierListSlug?: string;
      blank?: { name: string; format: string; ruleset: string };
      reason?: string;
    },
  ) {
    const { tournament, current } = await this.organizerContext(
      leagueSlug,
      tournamentSlug,
      sub,
    );
    if (!input.tierListSlug && !input.blank)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Pick a tier list, or start a blank one.",
      });

    const source = input.tierListSlug
      ? (await this.access.resolve(input.tierListSlug, sub, "view")).tierList
      : null;
    if (input.blank) {
      getFormat(input.blank.format);
      getRuleset(input.blank.ruleset);
    }

    const state = source ? toState(source) : emptyState();
    const { plan, requirements } = this.planRequirements(tournament, current, state);
    const { picks } = await this.affectedPicks(tournament, current, state);

    const copy = await this.transactions.run(async () => {
      const created = await this.tierListRepo.create({
        name: source?.name ?? input.blank!.name,
        description: source?.description,
        createdBy: sub,
        format: source?.format.name ?? input.blank!.format,
        ruleset: source?.ruleset.name ?? input.blank!.ruleset,
        tournament: new Types.ObjectId(tournament.id),
        ...(source && {
          copiedFrom: new Types.ObjectId(upstreamOf(source).id),
          copiedFromVersion: upstreamOf(source).version,
        }),
        state,
      });
      await this.history.recordCreated({
        tierList: created,
        actor: sub,
        actorName: tournament.staffName(sub) ?? undefined,
        kind: "copy",
        summary: source ? `Copied from ${source.name}` : "Started blank",
      });
      await this.tournamentRepo.updateSettings(tournament.id, {
        tierList: new Types.ObjectId(created.id),
        tierRequirements: requirements,
      });
      if (current?.tournamentId === tournament.id)
        await this.tierListRepo.retire(current.id);
      if (source && !source.isTournamentCopy)
        await this.tierListRepo.incrementUseCount(source.id);

      await this.logWriter.record(tournament, sub, {
        type: current ? "tier-list.swapped" : "tier-list.attached",
        summary: current
          ? `Replaced the tier list ${current.name} with ${created.name}`
          : `Attached the tier list ${created.name}`,
        target: { kind: "tier-list", id: created.slug, name: created.name },
        before: current ? { slug: current.slug, name: current.name } : undefined,
        after: {
          slug: created.slug,
          name: created.name,
          format: created.format.name,
          ruleset: created.ruleset.name,
        },
        details: {
          ...(source && { source: { slug: source.slug, name: source.name } }),
          requirementsKept: plan
            .filter((entry) => entry.kept)
            .map((entry) => entry.tierName),
          requirementsCleared: plan
            .filter((entry) => !entry.kept)
            .map((entry) => entry.tierName),
          affectedPicks: picks,
          ...(current && { changes: diffStates(toState(current), state) }),
        },
        reason: input.reason,
      });
      return created;
    });

    return {
      slug: copy.slug,
      name: copy.name,
      requirements: plan,
      message: current ? "Tier list replaced." : "Tier list attached.",
    };
  }

  async sourceStatus(leagueSlug: string, tournamentSlug: string, sub: string) {
    const { current } = await this.organizerContext(leagueSlug, tournamentSlug, sub);
    if (!current?.copiedFrom) return { source: null };
    const source = await this.tierListRepo.findById(current.copiedFrom).catch(() => null);
    if (!source || source.presetAccess(sub) === "none") return { source: null };

    const base =
      current.copiedFromVersion !== undefined
        ? await this.history.stateAt(source, current.copiedFromVersion)
        : null;
    const merged = mergeStates(base, toState(source), toState(current));
    return {
      source: {
        slug: source.slug,
        name: source.name,
        authorName: source.authorName ?? null,
        version: source.version,
      },
      copiedFromVersion: current.copiedFromVersion ?? null,
      hasBase: !!base,
      behind:
        current.copiedFromVersion === undefined ||
        source.version > current.copiedFromVersion,
      changes: merged.changes,
      conflicts: merged.conflicts,
    };
  }

  async pull(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    input: {
      version: number;
      resolutions?: Record<string, "source" | "current">;
      reason?: string;
    },
  ) {
    const { tournament, current } = await this.organizerContext(
      leagueSlug,
      tournamentSlug,
      sub,
    );
    if (!current?.copiedFrom || current.tournamentId !== tournament.id)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "This tier list has no source to pull from.",
      });
    const source = await this.tierListRepo.findById(current.copiedFrom);
    if (source.presetAccess(sub) === "none")
      throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);

    const base =
      current.copiedFromVersion !== undefined
        ? await this.history.stateAt(source, current.copiedFromVersion)
        : null;
    const merged = mergeStates(
      base,
      toState(source),
      toState(current),
      input.resolutions,
    );
    if (merged.conflicts.length)
      throw new PDZError(ErrorCodes.TIER_LIST.MERGE_CONFLICT, {
        conflicts: merged.conflicts.map((conflict) => conflict.pokemonId),
      });

    const resolved = await this.access.accessTo(current, sub);
    const saved = await this.tierListService.save(resolved, sub, {
      next: merged.state,
      expectedVersion: input.version,
      kind: "pull",
      reason: input.reason,
      logType: "tier-list.pulled",
      summaryPrefix: `Pulled changes from ${source.name}`,
    });
    await this.tierListRepo.setCopiedFromVersion(current.id, source.version);

    return {
      message: "Changes pulled.",
      version: saved.version,
      summary: saved.summary,
    };
  }

  async saveAsPreset(
    leagueSlug: string,
    tournamentSlug: string,
    sub: string,
    input: { name: string },
  ) {
    const { tournament, current } = await this.organizerContext(
      leagueSlug,
      tournamentSlug,
      sub,
    );
    if (!current)
      throw new PDZError(ErrorCodes.TOURNAMENT.TIER_LIST_REQUIRED);

    const preset = await this.transactions.run(async () => {
      const created = await this.tierListRepo.create({
        name: input.name.trim(),
        description: current.description,
        createdBy: sub,
        format: current.format.name,
        ruleset: current.ruleset.name,
        ...(current.copiedFrom && {
          copiedFrom: new Types.ObjectId(current.copiedFrom),
          copiedFromVersion: current.copiedFromVersion,
        }),
        state: toState(current),
      });
      await this.history.recordCreated({
        tierList: created,
        actor: sub,
        kind: "fork",
        summary: `Saved from ${tournament.name}`,
      });
      return created;
    });

    return { slug: preset.slug, name: preset.name };
  }
}
