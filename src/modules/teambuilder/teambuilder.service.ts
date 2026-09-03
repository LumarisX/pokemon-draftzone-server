import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { PDZMove } from "@modules/move/move.domain";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { getPowerModifier } from "@modules/data/domain/move-power";
import { Injectable, Logger } from "@nestjs/common";
import { getStatSystem, StatSystemId } from "@pdz/sets";
import { ID, Move, TypeName } from "@pkmn/data";

export interface TeambuilderItem {
  readonly id: string;
  readonly pngId: string;
  readonly name: string;
  readonly desc: string;
  readonly tags: string[];
}

function getStatSystemPayload(id: StatSystemId) {
  const system = getStatSystem(id);
  return {
    id: system.id,
    label: system.label,
    pointLabel: system.pointLabel,
    field: system.field,
    perStatMax: system.perStatMax,
    total: system.total,
    usableTotal: system.usableTotal,
    granularity: system.granularity,
    usesIvs: system.usesIvs,
  };
}

export interface TeambuilderPokemonSet {
  id: ID;
  types: [string] | [string, string];
  teraType: TypeName;
  ability: string;
  moves: (Move | null)[];
}

export interface ProcessedLearnsetMove {
  id: string;
  name: string;
  type: TypeName;
  category: "Physical" | "Special" | "Status";
  basePower: number;
  accuracy: number | true;
  pp: number;
  desc: string;
  tags: string[];
  isStab: boolean;
  strength: number;
}

function isStab(
  move: { type: TypeName },
  pokemon: TeambuilderPokemonSet,
): boolean {
  return pokemon.types.includes(move.type);
}

function pdzCalculateStrength(
  pokemon: PDZPokemon,
  move: PDZMove,
  isStabMove: boolean,
): number {
  if (!move) return 0;
  const attackStat = move.overrideOffensiveStat
    ? pokemon.baseStats[move.overrideOffensiveStat]
    : move.category === "Physical"
      ? pokemon.baseStats.atk
      : move.category === "Special"
        ? pokemon.baseStats.spa
        : 0;
  const baseDamage = move.basePower * attackStat;
  const stabMod = isStabMove ? 0x1800 : 0x1000;
  let damageAmount = baseDamage;
  damageAmount = (damageAmount * stabMod) / 0x1000;
  const epMod = getPowerModifier(move);
  damageAmount = damageAmount * epMod;
  return Math.round((damageAmount * 10) / 2048) / 10;
}

@Injectable()
export class TeambuilderService {
  private readonly logger = new Logger(TeambuilderService.name);

  async getSpecies(id: string, rulesetId: string) {
    const ruleset = getRuleset(rulesetId);
    const specie = ruleset.species.get(id);
    if (!specie) throw new PDZError(ErrorCodes.SPECIES.NOT_FOUND, { id });

    const pokemon = new PDZPokemon(specie, ruleset);
    const data = await pokemon.toTeambuilder();
    const statSystem: StatSystemId = ruleset.statSystem;
    return { ...data, statSystem, statRules: getStatSystemPayload(statSystem) };
  }

  async getProcessedLearnset(params: {
    pokemon: TeambuilderPokemonSet;
    ruleset: string;
  }): Promise<ProcessedLearnsetMove[]> {
    const { pokemon, ruleset: rulesetId } = params || ({} as typeof params);

    try {
      if (!pokemon || !pokemon.id || !rulesetId) {
        this.logger.error(
          `Invalid parameters for getProcessedLearnset: ${JSON.stringify(params)}`,
        );
        return [];
      }

      const ruleset = getRuleset(rulesetId);
      const specie = new PDZPokemon(pokemon.id, ruleset);

      const learnset = await specie.learnset();
      return learnset
        .map((move) => {
          const isStabMove = isStab({ type: move.type }, pokemon);
          const strength = pdzCalculateStrength(specie, move, isStabMove);

          const tags: string[] = [];
          if (move.flags.bite) tags.push("Bite");
          if (move.flags.punch) tags.push("Punch");
          if (move.flags.sound) tags.push("Sound");
          if (move.recoil) tags.push("Recoil");
          if (move.multihit) tags.push("Multi-Hit");
          if (move.flags.charge || move.flags.recharge) tags.push("Charge");
          if (move.critRatio && move.critRatio > 1) tags.push("Crit");
          if (move.flags.contact) tags.push("Contact");
          if (move.flags.pulse) tags.push("Pulse");
          if (move.flags.heal) tags.push("Healing");
          if (move.flags.slicing) tags.push("Slicing");
          if (move.isZ) tags.push("Z");
          if (move.isMax) tags.push("Max");
          if (move.flags.bullet) tags.push("Bullet");
          if (move.flags.wind) tags.push("Wind");

          const clientMove: ProcessedLearnsetMove = {
            id: move.id,
            name: move.name,
            basePower: move.basePower,
            type: move.type,
            category: move.category,
            isStab: isStabMove,
            accuracy: move.accuracy,
            desc: move.shortDesc,
            pp: move.pp,
            strength,
            tags,
          };
          return clientMove;
        })
        .sort((a, b) => b.strength - a.strength);
    } catch (error) {
      this.logger.error(
        `Error in getProcessedLearnset for pokemon ${pokemon?.id} / ruleset ${rulesetId}`,
        error as Error,
      );
      return [];
    }
  }
}
