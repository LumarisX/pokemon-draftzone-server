import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { Injectable } from "@nestjs/common";
import { ID } from "@pkmn/data";
import { UpdateTierListDto, UpdateTierListSettingsDto } from "./tier-list.dto";
import {
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
};

type TierView = {
  name: string;
  cost?: number;
  pokemon: TierPokemonView[];
};

@Injectable()
export class TierListService {
  constructor(private readonly tierListRepo: TierListRepository) {}

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
      ruleset: tierList.ruleset.name,
      name: tierList.name,
      description: tierList.description,
      draftCount: tierList.draftCount,
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
    if (dto.pointTotal !== undefined) update["pointTotal"] = dto.pointTotal;
    if (dto.draftCount !== undefined) update["draftCount"] = dto.draftCount;

    await this.tierListRepo.updateSettings(tierListId, update);
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

    tierList.applyTierUpdate(dto.tiers as ClientTierInput[]);
    await this.tierListRepo.save(tierList);

    return { success: true, message: "Tier list updated successfully" };
  }

  private async buildTierView(
    tierList: TierList,
    showAll: boolean,
  ): Promise<TierView[]> {
    const ruleset = tierList.ruleset;
    const assignedPokemon = new Set<string>();

    const tiers: TierView[] = await Promise.all(
      tierList.tiers.map(async (tier) => {
        const pokemonEntries = Array.from(tierList.pokemon.entries()).filter(
          ([, data]) => data.tier === tier.name,
        );

        const pokemon = await Promise.all(
          pokemonEntries.map(async ([pokemonId, data]) => {
            assignedPokemon.add(pokemonId);
            const specie = new PDZPokemon(pokemonId as ID, ruleset);
            return this.toPokemonView(specie, data, tierList.banned);
          }),
        );

        return { name: tier.name, cost: tier.cost, pokemon };
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
      ...((bannedMoves.length || bannedAbilities.length) && {
        banned: {
          ...(bannedMoves.length && { moves: bannedMoves }),
          ...(bannedAbilities.length && { abilities: bannedAbilities }),
        },
      }),
    };
  }
}
