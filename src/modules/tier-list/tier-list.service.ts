import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import {
  HostedTournamentDocument,
  HostedTournamentEntity,
} from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.schema";
import { Injectable, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ID } from "@pkmn/data";
import { Model, Types } from "mongoose";
import {
  BrowseTierListsDto,
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
import { TierListRepository } from "./tier-list.repository";

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

@Injectable()
export class TierListService {
  private readonly logger = new Logger(TierListService.name);

  constructor(
    private readonly tierListRepo: TierListRepository,
    @InjectModel(HostedTournamentEntity.name)
    private readonly tournamentModel: Model<HostedTournamentDocument>,
  ) {}

  async getTierList(
    tierListId: string,
    sub: string | undefined,
    edit: boolean,
  ) {
    const tierList = await this.tierListRepo.findById(tierListId);

    if (edit && !tierList.canEdit(sub))
      throw new PDZError(ErrorCodes.TIER_LIST.FORBIDDEN);

    const tiers = await this.buildTierView(tierList, edit);

    return {
      tierList: tiers,
      divisions: {},
      format: tierList.format.name,
      ruleset: tierList.ruleset.name,
      name: tierList.name,
      description: tierList.description,
    };
  }

  async getSettings(tierListId: string) {
    const tierList = await this.tierListRepo.findById(tierListId);
    return TierListMapper.toSettingsPayload(tierList);
  }

  async updateSettings(
    tierListId: string,
    sub: string | undefined,
    dto: UpdateTierListSettingsDto,
  ) {
    const tierList = await this.tierListRepo.findById(tierListId);
    if (!tierList.canEdit(sub)) {
      throw new PDZError(ErrorCodes.TIER_LIST.FORBIDDEN);
    }

    const update: Record<string, unknown> = {};
    if (dto.name !== undefined) update["name"] = dto.name;
    if (dto.description !== undefined) update["description"] = dto.description;

    await this.tierListRepo.updateSettings(tierListId, update);
    return { success: true };
  }

  async browse(dto: BrowseTierListsDto, sub: string | undefined) {
    const scope = dto.scope ?? "public";
    if (scope === "mine" && !sub) {
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
      limit,
      skip,
    });

    return { tierLists: rows, total, limit, skip };
  }

  async create(dto: CreateTierListDto, sub: string) {
    // Both throw on an unknown id, which is the validation — a list created
    // with a bad format would only break later, when something tried to
    // resolve its species.
    getFormat(dto.format);
    getRuleset(dto.ruleset);

    const created = await this.tierListRepo.create({
      name: dto.name.trim(),
      description: dto.description?.trim() || undefined,
      createdBy: sub,
      format: dto.format,
      ruleset: dto.ruleset,
    });

    return { id: created.id, slug: created.slug, name: created.name };
  }

  /**
   * Copies a list rather than referencing it, so a later edit by the source's
   * owner can never reprice a draft that has already happened.
   */
  async fork(tierListId: string, dto: ForkTierListDto, sub: string) {
    const source = await this.tierListRepo.findDocument(tierListId);
    const canSee =
      source.settings.isPublic ||
      source.createdBy === sub ||
      source.collaborators.includes(sub);
    if (!canSee) throw new PDZError(ErrorCodes.TIER_LIST.FORBIDDEN);

    const created = await this.tierListRepo.create({
      name: dto.name?.trim() || `${source.name} (copy)`,
      description: source.description,
      createdBy: sub,
      format: source.format,
      ruleset: source.ruleset,
      copiedFrom: source._id,
      tiers: source.tiers,
      pokemon: source.pokemon,
      banned: source.banned,
    });

    await this.tierListRepo.incrementForkCount(tierListId);

    return {
      id: created.id,
      slug: created.slug,
      name: created.name,
      copiedFrom: source.slug,
    };
  }

  /**
   * Only the owner can delete, and only while nothing depends on it — a
   * tournament whose tier list vanished would 500 on every page that prices a
   * roster.
   */
  async remove(tierListSlug: string, sub: string) {
    const doc = await this.tierListRepo.findDocument(tierListSlug);
    if (doc.createdBy !== sub) {
      throw new PDZError(ErrorCodes.TIER_LIST.FORBIDDEN);
    }

    const dependents = await this.tournamentModel
      .find({ tierList: doc._id })
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

    await this.tierListRepo.deleteById(doc._id.toString());
    return { success: true };
  }

  async updateTierList(
    tierListId: string,
    sub: string | undefined,
    dto: UpdateTierListDto,
  ) {
    const tierList = await this.tierListRepo.findById(tierListId);
    if (!tierList.canEdit(sub)) {
      throw new PDZError(ErrorCodes.TIER_LIST.FORBIDDEN);
    }

    const tierIdsBefore = new Set(tierList.tiers.map((tier) => tier.id));
    tierList.applyTierUpdate(dto.tiers as ClientTierInput[]);
    await this.tierListRepo.save(tierList);

    const orphaned = await this.findOrphanedRequirements(
      tierListId,
      tierIdsBefore,
      new Set(tierList.tiers.map((tier) => tier.id)),
    );

    return {
      success: true,
      message: "Tier list updated successfully",
      orphanedRequirements: orphaned,
    };
  }

  /**
   * Tournaments left holding a requirement for a tier this save deleted. The
   * draft engine ignores them so they cannot deadlock a draft, but nothing
   * else would tell the organizer they now exist.
   */
  private async findOrphanedRequirements(
    tierListId: string,
    before: Set<string>,
    after: Set<string>,
  ): Promise<{ tournament: string; requirements: number }[]> {
    const removed = new Set(
      [...before].filter((tierId) => !after.has(tierId)),
    );
    if (removed.size === 0) return [];
    if (!Types.ObjectId.isValid(tierListId)) return [];

    // The save has already committed. This lookup is advisory, so a failure
    // here must never turn a successful write into an error for the caller.
    try {
      const dependents = await this.tournamentModel
        .find({ tierList: new Types.ObjectId(tierListId) })
        .select("name tierRequirements")
        .lean()
        .exec();

      const affected = dependents.flatMap((tournament) => {
        const orphans = (tournament.tierRequirements ?? []).filter(
          (requirement) => removed.has(requirement.tierId?.toString()),
        );
        return orphans.length
          ? [{ tournament: tournament.name, requirements: orphans.length }]
          : [];
      });

      for (const entry of affected) {
        this.logger.warn(
          `Tier list ${tierListId}: deleting a tier orphaned ${entry.requirements} requirement(s) on "${entry.tournament}"`,
        );
      }

      return affected;
    } catch (error) {
      this.logger.warn(
        `Tier list ${tierListId}: could not check for orphaned requirements`,
        error,
      );
      return [];
    }
  }

  private async buildTierView(
    tierList: TierList,
    showAll: boolean,
  ): Promise<TierView[]> {
    const ruleset = tierList.ruleset;
    const assignedPokemon = new Set<string>();

    // In view-only mode banned pokemon are pulled out of their stored tier
    // and shown in a leading "Banned" bucket instead (edit mode keeps them
    // in place, flagged draftBanned, so the client can build its own panel).
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
