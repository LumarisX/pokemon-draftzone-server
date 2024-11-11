import { TypeName } from "@pkmn/data";
import { DraftSpecies } from "../../classes/pokemon";
import { typeWeak } from "../data-services/type.services";

export class Typechart {
  team: DraftSpecies[];
  teraTypes: {
    [key: string]: {};
  };

  constructor(team: DraftSpecies[]) {
    this.team = team;
    this.teraTypes = {};
    // if (pokemon.capt && pokemon.capt.tera) {
    //   pokemon.capt.tera = pokemon.capt.tera.filter((type) => type != "Stellar");
    // }
  }

  toJson() {
    return {
      team: this.team.map((pokemon) => ({
        ...pokemon.toPokemon(),
        weak: pokemon.typechart(),
      })),
      teraTypes: this.teraTypes,
    };
  }

  recommended() {
    let teamTypeChart = this.team
      .map((pokemon) => pokemon.typechart())
      .reduce((totalTypes, pokemon) => {
        for (let type in pokemon) {
          let log = pokemon[type] > 0 ? Math.log2(pokemon[type]) : -2;
          if (type in totalTypes) {
            totalTypes[type] += log;
          } else {
            totalTypes[type] = log;
          }
        }
        return totalTypes;
      }, {});
    let types: TypeName[] = Array.from(this.team[0].ruleset.gen.types)
      .map((type) => type.toString())
      .filter((x) => x != "Stellar");
    let base = Object.values(teamTypeChart).reduce(
      (sum, e) => sum + Math.pow(2, e),
      0
    );
    let typeList: [[TypeName] | [TypeName, TypeName], number][] = [];
    for (let i = 0; i < types.length; i++) {
      for (let j = i; j < types.length; j++) {
        let selectedTypes: [TypeName] | [TypeName, TypeName] = [types[i]];
        if (i !== j) selectedTypes.push(types[j]);
        let newTC = { ...teamTypeChart };
        let tw = typeWeak(selectedTypes, this.team[0].ruleset);
        for (let type in tw) {
          let log = tw[type] > 0 ? Math.log2(tw[type]) : -2;
          if (type in newTC) {
            newTC[type] += log;
          } else {
            newTC[type] = log;
          }
          newTC[type] = Math.pow(2, newTC[type]);
        }
        typeList.push([
          selectedTypes,
          Object.values(newTC).reduce((sum, e) => sum + e, 0) - base,
        ]);
      }
    }
    let pokemonList: [{ id: string; name: string }, number][] = [];
    for (let species of this.team[0].ruleset.gen.species) {
      if (species.nfe) continue;
      let newTC = { ...teamTypeChart };
      let draftSpecies = new DraftSpecies(species, {}, this.team[0].ruleset);
      let tw = draftSpecies.typechart();
      for (let type in tw) {
        let log = tw[type] > 0 ? Math.log2(tw[type]) : -2;
        if (type in newTC) {
          newTC[type] += log;
        } else {
          newTC[type] = log;
        }
        newTC[type] = Math.pow(2, newTC[type]);
      }
      pokemonList.push([
        { id: draftSpecies.id, name: draftSpecies.name },
        Object.values(newTC).reduce((sum, e) => sum + e, 0) - base,
      ]);
    }
    return {
      pokemon: pokemonList
        .sort((x, y) => x[1] - y[1])
        .slice(0, 10)
        .map((e) => e[0]),
      types: typeList
        .sort((x, y) => x[1] - y[1])
        .slice(0, 10)
        .map((e) => e[0]),
    };
  }
}
