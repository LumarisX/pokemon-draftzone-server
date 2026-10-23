import { TransactionRunner } from "@core/database/transaction-runner";
import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { TeamRepository } from "@modules/team/team.repository";
import { TournamentLogType } from "@modules/tournament-log/tournament-log.schema";
import { TournamentLogWriter } from "@modules/tournament-log/tournament-log.writer";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import {
  HostedTournamentDocument,
  HostedTournamentEntity,
} from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ID } from "@pkmn/data";
import { Model, Types } from "mongoose";
import { RevisionKind } from "./tier-list-revision.schema";
import {
  ResolvedTierList,
  TierListAccessService,
} from "./tier-list-access.service";
import { TierListHistoryService } from "./tier-list-history.service";
import { TierListInviteRepository } from "./tier-list-invite.repository";
import { TierListRevisionRepository } from "./tier-list-revision.repository";
import {
  BrowseTierListsDto,
  CompareTierListDto,
  CreateTierListDto,
  ForkTierListDto,
  UpdateTierListDto,
  UpdateTierListSettingsDto,
} from "./tier-list.dto";
import {
  BANNED_TIER_NAME,
  ClientTierInput,
  TierList,
  TierListPokemon,
  UNTIERED_TIER_NAME,
} from "./tier-list.domain";
import { TierListMapper } from "./tier-list.mapper";
import { normalizeTag, TierListRepository } from "./tier-list.repository";
import {
  applyState,
  diffStates,
  emptyState,
  TierListState,
  toState,
} from "./tier-list.state";

type TierPokemonView = {
  id: string;
  name: string;
  types: readonly string[];
  abilities: string[];
  bst: number;
  stats: unknown;
  notes?: string;
  addons?: unknown[];
  draftBanned?: boolean;
  banned?: {
    moves?: string[];
    abilities?: string[];
  };
  formes?: { id: string; name: string }[];
};

type TierView = {
  id?: string;
  name: string;
  cost?: number;
  pokemon: TierPokemonView[];
};

export function normalizeTags(tags: string[] | undefined): string[] | undefined {
  if (!tags) return undefined;
  return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}

export function stateFromClient(
  tiers: ClientTierInput[],
  format: string,
  ruleset: string,
  bannedMoves: string[] = [],
): TierListState {
  const draft = new TierList({
    id: new Types.ObjectId().toString(),
    slug: "",
    name: "",
    createdBy: "",
    pokemon: new Map(),
    tiers: [],
    banned: { moves: bannedMoves, abilities: [] },
    format,
    ruleset,
  });
  draft.applyTierUpdate(tiers);
  return toState(draft);
}

export function cloneTierList(tierList: TierList): TierList {
  const clone = new TierList({
    id: tierList.id,
    slug: tierList.slug,
    name: tierList.name,
    createdBy: tierList.createdBy,
    pokemon: new Map(),
    tiers: [],
    banned: { moves: [], abilities: [] },
    format: tierList.format.name,
    ruleset: tierList.ruleset.name,
  });
  applyState(clone, toState(tierList));
  return clone;
}

@Injectable()
export class TierListService {
  constructor(
    private readonly tierListRepo: TierListRepository,
    private readonly access: TierListAccessService,
    private readonly history: TierListHistoryService,
    private readonly revisionRepo: TierListRevisionRepository,
    private readonly inviteRepo: TierListInviteRepository,
    private readonly teamRepo: TeamRepository,
    private readonly logWriter: TournamentLogWriter,
    private readonly transactions: TransactionRunner,
    @InjectModel(HostedTournamentEntity.name)
    private readonly tournamentModel: Model<HostedTournamentDocument>,
  ) {}

  async getTierList(
    tierListSlug: string,
    sub: string | undefined,
    edit: boolean,
  ) {
    const resolved = await this.access.resolve(
      tierListSlug,
      sub,
      edit ? "edit" : "view",
    );
    const { tierList } = resolved;
    const tiers = await this.buildTierView(tierList, edit);

    return {
      tierList: tiers,
      format: tierList.format.name,
      ruleset: tierList.ruleset.name,
      name: tierList.name,
      description: tierList.description,
      meta: await this.meta(resolved, sub),
    };
  }

  private async meta(resolved: ResolvedTierList, sub: string | undefined) {
    const { tierList, tournament, access } = resolved;
    const source = tierList.copiedFrom
      ? await this.tierListRepo.findById(tierList.copiedFrom).catch(() => null)
      : null;
    const sourceVisible =
      !!source && !source.isTournamentCopy && source.presetAccess(sub) !== "none";

    return {
      slug: tierList.slug,
      authorName: tierList.authorName ?? null,
      visibility: tierList.visibility,
      tags: tierList.tags,
      featured: tierList.featured,
      version: tierList.version,
      forkCount: tierList.forkCount,
      useCount: tierList.useCount,
      updatedAt: tierList.updatedAt ?? null,
      access,
      role:
        sub && tierList.createdBy === sub
          ? ("owner" as const)
          : tierList.memberRole(sub),
      retired: !!tierList.retiredAt,
      copiedFrom: !tierList.copiedFrom
        ? null
        : sourceVisible && source
          ? {
              slug: source.slug,
              name: source.name,
              authorName: source.authorName ?? null,
              behind:
                tierList.copiedFromVersion !== undefined &&
                source.version > tierList.copiedFromVersion,
            }
          : { slug: null, name: null, authorName: null, behind: false },
      tournament: tournament
        ? {
            name: tournament.name,
            leagueSlug: tournament.leagueSlug,
            tournamentSlug: tournament.slug,
            current: tournament.tierListId === tierList.id,
          }
        : null,
    };
  }

  async getSettings(tierListSlug: string, sub: string | undefined) {
    const { tierList, access } = await this.access.resolve(tierListSlug, sub, "view");
    return { ...TierListMapper.toSettingsPayload(tierList), access };
  }

  async updateSettings(
    tierListSlug: string,
    sub: string,
    dto: UpdateTierListSettingsDto,
  ) {
    const resolved = await this.access.resolve(tierListSlug, sub, "edit");
    const { tierList } = resolved;
    const managesPreset = !tierList.isTournamentCopy && resolved.access === "manage";

    const presetOnly =
      dto.visibility !== undefined ||
      dto.authorName !== undefined ||
      dto.tags !== undefined;
    if (presetOnly && tierList.isTournamentCopy)
      throw new PDZError(ErrorCodes.TIER_LIST.TOURNAMENT_COPY);
    const ownerOnly =
      presetOnly || dto.format !== undefined || dto.ruleset !== undefined;
    if (ownerOnly && !tierList.isTournamentCopy && !managesPreset)
      throw new PDZError(ErrorCodes.TIER_LIST.FORBIDDEN);

    if (dto.format !== undefined) getFormat(dto.format);
    if (dto.ruleset !== undefined) getRuleset(dto.ruleset);

    const authorName = dto.authorName?.trim() || tierList.authorName;
    if (dto.visibility && dto.visibility !== "private" && !authorName)
      throw new PDZError(ErrorCodes.TIER_LIST.INVALID_DATA, {
        reason: "Add the name to show as the author before sharing this list.",
      });

    const updated = await this.transactions.run(async () => {
      const result = await this.tierListRepo.updateSettings(tierList.id, {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.description !== undefined && {
          description: dto.description.trim() || null,
        }),
        ...(dto.authorName !== undefined && { authorName: dto.authorName.trim() }),
        ...(dto.tags !== undefined && { tags: normalizeTags(dto.tags) }),
        ...(dto.visibility !== undefined && { visibility: dto.visibility }),
        ...(dto.format !== undefined && { format: dto.format }),
        ...(dto.ruleset !== undefined && { ruleset: dto.ruleset }),
      });

      const rulesChanged =
        (dto.format !== undefined && dto.format !== tierList.format.name) ||
        (dto.ruleset !== undefined && dto.ruleset !== tierList.ruleset.name);
      if (rulesChanged && resolved.tournament && (await this.isLive(resolved.tournament)))
        await this.logWriter.record(resolved.tournament, sub, {
          type: "tier-list.edited",
          summary: `Changed the tier list's format or ruleset to ${result.format.name} · ${result.ruleset.name}`,
          target: { kind: "tier-list", id: tierList.slug, name: tierList.name },
          before: { format: tierList.format.name, ruleset: tierList.ruleset.name },
          after: { format: result.format.name, ruleset: result.ruleset.name },
        });
      return result;
    });

    return {
      message: "Tier list settings saved.",
      settings: TierListMapper.toSettingsPayload(updated),
    };
  }

  async browse(dto: BrowseTierListsDto, sub: string | undefined) {
    const scope = dto.scope ?? "public";
    if ((scope === "mine" || scope === "shared") && !sub) {
      throw new PDZError(ErrorCodes.AUTH.UNAUTHORIZED);
    }

    const limit = dto.limit ?? 24;
    const skip = dto.skip ?? 0;
    const { rows, total } = await this.tierListRepo.browse({
      sub,
      scope,
      query: dto.q,
      format: dto.format,
      ruleset: dto.ruleset,
      tag: dto.tag,
      pokemon: dto.pokemon,
      sort: dto.sort ?? "updated",
      limit,
      skip,
    });

    return { tierLists: rows, total, limit, skip };
  }

  async create(dto: CreateTierListDto, sub: string) {
    getFormat(dto.format);
    getRuleset(dto.ruleset);

    const state = dto.tiers
      ? stateFromClient(
          dto.tiers as ClientTierInput[],
          dto.format,
          dto.ruleset,
          dto.bannedMoves,
        )
      : emptyState();

    const created = await this.transactions.run(async () => {
      const tierList = await this.tierListRepo.create({
        name: dto.name.trim(),
        description: dto.description?.trim() || undefined,
        authorName: dto.authorName?.trim() || undefined,
        createdBy: sub,
        format: dto.format,
        ruleset: dto.ruleset,
        tags: normalizeTags(dto.tags),
        state,
      });
      await this.history.recordCreated({
        tierList,
        actor: sub,
        actorName: tierList.authorName,
        kind: dto.tiers ? "import" : "create",
        summary: dto.tiers ? "Imported from a sheet" : "Created",
      });
      return tierList;
    });

    return { id: created.id, slug: created.slug, name: created.name };
  }

  async fork(tierListSlug: string, dto: ForkTierListDto, sub: string) {
    const { tierList: source } = await this.access.resolve(tierListSlug, sub, "view");

    const created = await this.transactions.run(async () => {
      const tierList = await this.tierListRepo.create({
        name: dto.name?.trim() || `${source.name} (copy)`,
        description: source.description,
        createdBy: sub,
        format: source.format.name,
        ruleset: source.ruleset.name,
        tags: source.isTournamentCopy ? [] : source.tags,
        copiedFrom: new Types.ObjectId(source.id),
        copiedFromVersion: source.version,
        state: toState(source),
      });
      await this.history.recordCreated({
        tierList,
        actor: sub,
        kind: "fork",
        summary: `Forked from ${source.name}`,
      });
      await this.tierListRepo.incrementForkCount(source.id);
      return tierList;
    });

    return {
      id: created.id,
      slug: created.slug,
      name: created.name,
      copiedFrom: source.slug,
    };
  }

  async remove(tierListSlug: string, sub: string) {
    const { tierList } = await this.access.resolve(tierListSlug, sub, "view");
    if (tierList.isTournamentCopy)
      throw new PDZError(ErrorCodes.TIER_LIST.TOURNAMENT_COPY);
    if (tierList.createdBy !== sub)
      throw new PDZError(ErrorCodes.TIER_LIST.FORBIDDEN);

    const dependents = await this.tournamentModel
      .find({ tierList: new Types.ObjectId(tierList.id) })
      .select("name")
      .lean()
      .exec();

    if (dependents.length) {
      throw new PDZError(ErrorCodes.TIER_LIST.INVALID_DATA, {
        reason: `In use by ${dependents.length} tournament(s): ${dependents
          .map((tournament) => tournament.name)
          .join(", ")}`,
      });
    }

    await this.transactions.run(async () => {
      await this.tierListRepo.deleteById(tierList.id);
      await this.revisionRepo.deleteForTierList(tierList.id);
      await this.inviteRepo.deleteForTierList(tierList.id);
    });
    return { message: "Tier list deleted." };
  }

  async updateTierList(
    tierListSlug: string,
    sub: string,
    dto: UpdateTierListDto,
  ) {
    const resolved = await this.access.resolve(tierListSlug, sub, "edit");
    const { tierList } = resolved;

    const working = cloneTierList(tierList);
    working.applyTierUpdate(dto.tiers as ClientTierInput[]);

    const saved = await this.save(resolved, sub, {
      next: toState(working),
      expectedVersion: dto.version ?? tierList.version,
      kind: dto.kind ?? "edit",
      reason: dto.reason,
    });

    return {
      message: "Tier list updated successfully",
      version: saved.version,
      summary: saved.summary,
      orphanedRequirements: this.orphanedRequirements(resolved),
    };
  }

  async save(
    resolved: ResolvedTierList,
    sub: string,
    input: {
      next: TierListState;
      expectedVersion: number;
      kind: RevisionKind;
      reason?: string;
      restoredFrom?: number;
      logType?: TournamentLogType;
      summaryPrefix?: string;
    },
  ) {
    const { tierList, tournament } = resolved;
    const current = !!tournament && tournament.tierListId === tierList.id;
    const live = tournament && current ? await this.isLive(tournament) : false;

    return this.transactions.run(async () => {
      const saved = await this.history.saveState({
        tierList,
        next: input.next,
        expectedVersion: input.expectedVersion,
        actor: sub,
        actorName: this.access.actorName(resolved, sub),
        kind: input.kind,
        restoredFrom: input.restoredFrom,
        summaryPrefix: input.summaryPrefix,
      });
      if (tournament && live && saved.changes.length)
        await this.logWriter.record(tournament, sub, {
          type:
            input.logType ??
            (input.kind === "revert" ? "tier-list.reverted" : "tier-list.edited"),
          summary: saved.summary,
          target: { kind: "tier-list", id: tierList.slug, name: tierList.name },
          details: { version: saved.version, changes: saved.changes },
          reason: input.reason,
        });
      return saved;
    });
  }

  async isLive(tournament: HostedTournament): Promise<boolean> {
    if (tournament.signUpAccess !== "closed") return true;
    return (await this.teamRepo.countApprovedByTournament(tournament.id)) > 0;
  }

  private orphanedRequirements(resolved: ResolvedTierList) {
    const { tierList, tournament } = resolved;
    if (!tournament || tournament.tierListId !== tierList.id) return [];
    const tierIds = new Set(tierList.tiers.map((tier) => tier.id));
    const orphans = tournament.tierRequirements.filter(
      (requirement) => !tierIds.has(requirement.tierId),
    );
    return orphans.length
      ? [{ tournament: tournament.name, requirements: orphans.length }]
      : [];
  }

  async revisions(tierListSlug: string, sub: string | undefined, before?: number) {
    const { tierList } = await this.access.resolve(tierListSlug, sub, "view");
    return {
      current: tierList.version,
      ...(await this.history.list(tierList.id, before)),
    };
  }

  async revision(tierListSlug: string, sub: string | undefined, version: number) {
    const { tierList } = await this.access.resolve(tierListSlug, sub, "view");
    const revision = await this.history.revision(tierList.id, version);
    return {
      version: revision.version,
      at: revision.createdAt,
      actorName: revision.actorName ?? null,
      kind: revision.kind,
      summary: revision.summary,
      changes: revision.changes ?? [],
      restoredFrom: revision.restoredFrom,
    };
  }

  async revert(
    tierListSlug: string,
    sub: string,
    version: number,
    expectedVersion: number,
  ) {
    const resolved = await this.access.resolve(tierListSlug, sub, "edit");
    const revision = await this.history.revision(resolved.tierList.id, version);
    const saved = await this.save(resolved, sub, {
      next: revision.state,
      expectedVersion,
      kind: "revert",
      restoredFrom: version,
    });
    return {
      message: `Restored version ${version}.`,
      version: saved.version,
      orphanedRequirements: this.orphanedRequirements(resolved),
    };
  }

  async compare(tierListSlug: string, sub: string | undefined, dto: CompareTierListDto) {
    const { tierList } = await this.access.resolve(tierListSlug, sub, "view");
    const target = { label: tierList.name, slug: tierList.slug, version: tierList.version };

    if (dto.rev !== undefined) {
      const state = await this.history.stateAt(tierList, dto.rev);
      if (!state) throw new PDZError(ErrorCodes.TIER_LIST.NOT_FOUND);
      return {
        base: { label: `Version ${dto.rev}`, slug: tierList.slug, version: dto.rev },
        target,
        changes: diffStates(state, toState(tierList)),
      };
    }

    const otherSlug = dto.with ?? tierList.copiedFrom;
    if (!otherSlug)
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, {
        reason: "Pick a list or a version to compare with.",
      });
    const { tierList: other } = await this.access.resolve(otherSlug, sub, "view");
    return {
      base: { label: other.name, slug: other.slug, version: other.version },
      target,
      changes: diffStates(toState(other), toState(tierList)),
    };
  }

  async legality(tierListSlug: string, sub: string | undefined) {
    const { tierList } = await this.access.resolve(tierListSlug, sub, "view");
    return this.legalityReport(tierList);
  }

  async legalityReport(tierList: TierList) {
    const ruleset = tierList.ruleset;
    const notInRuleset: { id: string; name: string; tier?: string }[] = [];
    const listed = new Set<string>();

    for (const [id, entry] of tierList.pokemon) {
      if (!entry.tierId && !entry.banned) continue;
      listed.add(id);
      if (!ruleset.species.get(id))
        notInRuleset.push({
          id,
          name: entry.name,
          tier: tierList.getTierById(entry.tierId)?.name,
        });
    }

    const leftOff = Array.from(ruleset.species)
      .filter((specie) => !listed.has(specie.id))
      .map((specie) => ({ id: specie.id, name: specie.name }));

    const placed = [...tierList.pokemon.entries()].filter(
      ([id, entry]) => entry.tierId && ruleset.species.get(id),
    );
    const unusedMoves: string[] = [];
    for (const move of tierList.banned.moves) {
      let used = false;
      for (const [id] of placed) {
        if (await new PDZPokemon(id as ID, ruleset).canLearn(move)) {
          used = true;
          break;
        }
      }
      if (!used) unusedMoves.push(move);
    }
    const unusedAbilities = tierList.banned.abilities.filter(
      (ability) =>
        !placed.some(([id]) =>
          Object.values(new PDZPokemon(id as ID, ruleset).abilities).includes(ability),
        ),
    );

    const counts = new Map<string, number>();
    for (const [, entry] of tierList.pokemon)
      if (entry.tierId && !entry.banned)
        counts.set(entry.tierId, (counts.get(entry.tierId) ?? 0) + 1);

    return {
      format: tierList.format.name,
      ruleset: ruleset.name,
      notInRuleset,
      leftOff,
      unusedBans: { moves: unusedMoves, abilities: unusedAbilities },
      emptyTiers: tierList.tiers
        .filter((tier) => !counts.get(tier.id))
        .map((tier) => tier.name),
      unpricedTiers: tierList.tiers
        .filter((tier) => !tier.cost)
        .map((tier) => tier.name),
    };
  }

  async export(tierListSlug: string, sub: string | undefined) {
    const { tierList } = await this.access.resolve(tierListSlug, sub, "view");
    const byTier = (tierId: string | undefined, banned: boolean) =>
      [...tierList.pokemon.entries()]
        .filter(([, entry]) =>
          banned ? !!entry.banned : entry.tierId === tierId && !entry.banned,
        )
        .map(([id, entry]) => ({
          id,
          name: entry.name,
          ...(entry.notes && { notes: entry.notes }),
          ...(entry.formes?.length && { formes: entry.formes }),
          ...(entry.addons?.length && {
            addons: entry.addons.map((addon) => ({
              name: addon.name,
              cost: addon.cost,
              ...(addon.notes && { notes: addon.notes }),
            })),
          }),
        }));

    return {
      kind: "pokemon-draftzone/tier-list",
      version: 1,
      name: tierList.name,
      description: tierList.description,
      format: tierList.format.name,
      ruleset: tierList.ruleset.name,
      tiers: tierList.tiers.map((tier) => ({
        name: tier.name,
        cost: tier.cost,
        pokemon: byTier(tier.id, false),
      })),
      banned: {
        pokemon: byTier(undefined, true),
        moves: tierList.banned.moves,
        abilities: tierList.banned.abilities,
      },
    };
  }

  async setFeatured(tierListSlug: string, featured: boolean) {
    const tierList = await this.tierListRepo.findById(tierListSlug);
    if (tierList.isTournamentCopy || tierList.visibility !== "public")
      throw new PDZError(ErrorCodes.TIER_LIST.INVALID_DATA, {
        reason: "Only public lists can be featured.",
      });
    await this.tierListRepo.setFeatured(tierList.id, featured);
    return { featured };
  }

  async buildTierView(
    tierList: TierList,
    showAll: boolean,
  ): Promise<TierView[]> {
    const ruleset = tierList.ruleset;
    const assignedPokemon = new Set<string>();

    const tiers: TierView[] = await Promise.all(
      tierList.tiers.map(async (tier) => {
        const pokemonEntries = Array.from(tierList.pokemon.entries()).filter(
          ([, data]) => data.tierId === tier.id && (showAll || !data.banned),
        );

        const pokemon = await Promise.all(
          pokemonEntries.map(async ([pokemonId, data]) => {
            assignedPokemon.add(pokemonId);
            const specie = new PDZPokemon(pokemonId as ID, ruleset);
            return this.toPokemonView(specie, data, tierList.banned);
          }),
        );

        return { id: tier.id, name: tier.name, cost: tier.cost, pokemon };
      }),
    );

    if (showAll) {
      const untieredPokemon = Array.from(ruleset.species)
        .filter((specie) => !assignedPokemon.has(specie.id))
        .map((specie) => {
          const draftSpecie = new PDZPokemon(specie.id as ID, ruleset);
          const data = tierList.pokemon.get(specie.id);
          return {
            id: specie.id,
            name: specie.name,
            types: draftSpecie.types,
            abilities: Object.values(draftSpecie.abilities),
            bst: draftSpecie.bst,
            stats: draftSpecie.baseStats,
            ...(data?.banned && { draftBanned: true }),
          };
        });

      tiers.push({ name: UNTIERED_TIER_NAME, pokemon: untieredPokemon });
    } else {
      const bannedEntries = Array.from(tierList.pokemon.entries()).filter(
        ([, data]) => data.banned,
      );
      if (bannedEntries.length > 0) {
        const bannedPokemon = await Promise.all(
          bannedEntries.map(([pokemonId, data]) => {
            const specie = new PDZPokemon(pokemonId as ID, ruleset);
            return this.toPokemonView(specie, data, tierList.banned);
          }),
        );
        tiers.unshift({ name: BANNED_TIER_NAME, pokemon: bannedPokemon });
      }
    }

    return tiers;
  }

  private async toPokemonView(
    specie: PDZPokemon,
    data: TierListPokemon,
    banned: { moves: string[]; abilities: string[] },
  ): Promise<TierPokemonView> {
    const learnableMoves = await Promise.all(
      banned.moves.map(async (move) => ({
        move,
        canLearn: await specie.canLearn(move),
      })),
    );
    const bannedMoves = learnableMoves
      .filter(({ canLearn }) => canLearn)
      .map(({ move }) => move);
    const bannedAbilities = banned.abilities.filter((ability) =>
      Object.values(specie.abilities).includes(ability),
    );

    return {
      id: specie.id,
      name: data.name,
      types: specie.types,
      abilities: Object.values(specie.abilities),
      bst: specie.bst,
      stats: specie.baseStats,
      notes: data.notes,
      ...(data.banned && { draftBanned: true }),
      ...(data.addons?.length && { addons: data.addons }),
      ...(data.formes?.length && {
        formes: data.formes.map((formeId) => ({
          id: formeId,
          name: specie.ruleset.species.get(formeId)?.name ?? formeId,
        })),
      }),
      ...((bannedMoves.length || bannedAbilities.length) && {
        banned: {
          ...(bannedMoves.length && { moves: bannedMoves }),
          ...(bannedAbilities.length && { abilities: bannedAbilities }),
        },
      }),
    };
  }
}
