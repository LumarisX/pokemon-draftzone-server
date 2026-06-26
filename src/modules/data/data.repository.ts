import { _getFormats, getFormats } from "@core/data/formats/formats";
import {
  getRuleset,
  getRulesets,
  getRulesetsGrouped,
} from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { PDZMove } from "@modules/move/move.domain";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { Injectable } from "@nestjs/common";

@Injectable()
export class DataRepository {
  getFormats() {
    return _getFormats();
  }

  getFormatsLegacy(): string[] {
    return getFormats();
  }

  getRulesets() {
    return getRulesetsGrouped();
  }

  getRulesetsLegacy(): string[] {
    return getRulesets();
  }

  getSpeciesForRuleset(rulesetId: string): PDZPokemon[] {
    const ruleset = getRuleset(rulesetId);
    return Array.from(ruleset.species).map((s) => new PDZPokemon(s, ruleset));
  }

  getRandomSpecies(
    rulesetId: string,
    count: number,
    options: { tier?: string; banned?: string[] } = {},
  ): PDZPokemon[] {
    const pool = this.getSpeciesForRuleset(rulesetId).filter((specie) => {
      if (options.tier && specie.tier !== options.tier) return false;
      if (options.banned?.includes(specie.id)) return false;
      return true;
    });

    const remaining = [...pool];
    const sampleSize = Math.min(count, remaining.length);
    const sample: PDZPokemon[] = [];
    for (let i = 0; i < sampleSize; i++) {
      const index = Math.floor(Math.random() * remaining.length);
      sample.push(remaining.splice(index, 1)[0]);
    }
    return sample;
  }

  async getMovesForPokemon(
    rulesetId: string,
    pokemonId: string,
  ): Promise<PDZMove[]> {
    const ruleset = getRuleset(rulesetId);
    const specie = ruleset.species.get(pokemonId);
    if (!specie)
      throw new PDZError(ErrorCodes.SPECIES.NOT_FOUND, { pokemonId });

    const pokemon = new PDZPokemon(specie, ruleset);
    return pokemon.learnset();
  }

  getFormesForPokemon(rulesetId: string, pokemonId: string): PDZPokemon[] {
    const ruleset = getRuleset(rulesetId);
    const specie = ruleset.species.get(pokemonId);
    if (!specie)
      throw new PDZError(ErrorCodes.SPECIES.NOT_FOUND, { pokemonId });

    const pokemon = new PDZPokemon(specie, ruleset);
    const baseSpecie =
      pokemon.baseSpecies && pokemon.baseSpecies !== pokemon.name
        ? ruleset.species.get(pokemon.baseSpecies)
        : specie;
    const formeNames = baseSpecie?.formeOrder ?? [pokemon.name];

    const formes: PDZPokemon[] = [];
    for (const formeName of formeNames) {
      if (formeName === pokemon.name) continue;
      const formeSpecie = ruleset.species.get(formeName);
      if (!formeSpecie || formeSpecie.isCosmeticForme) continue;
      formes.push(new PDZPokemon(formeSpecie, ruleset));
    }
    return formes;
  }
}
