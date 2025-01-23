import { Type, TypeName } from "@pkmn/data";
import { DraftSpecies } from "../../classes/pokemon";
import { typeWeak } from "../data-services/type.services";
import { spec } from "node:test/reporters";

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
        types: pokemon.types,
      })),
      teraTypes: this.teraTypes,
    };
  }

  recommended(): {
    all: {
      pokemon: {
        id: string;
        name: string;
      }[];
      types: ([TypeName] | [TypeName, TypeName])[];
    };
    unique: {
      pokemon: {
        id: string;
        name: string;
      }[];
      types: ([TypeName] | [TypeName, TypeName])[];
    };
  } {
    const teamTypeChart = this.team
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
    const types: TypeName[] = Array.from(this.team[0].ruleset.gen.types)
      .map((type) => type.toString())
      .filter((x) => x != "Stellar");
    const usedTypes: Set<TypeName> = this.team.reduce((set, mon) => {
      mon.types.forEach((type) => set.add(type));
      return set;
    }, new Set<TypeName>());
    const base = Object.values(teamTypeChart).reduce(
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
    let pokemonList: [DraftSpecies, number][] = [];
    for (let species of this.team[0].ruleset.gen.species) {
      if (
        species.nfe || //only fully evolved
        this.team.some((pokemon) => species.baseSpecies === pokemon.baseSpecies)
      )
        continue;
      const newTC = { ...teamTypeChart };
      const draftSpecies = new DraftSpecies(species, {}, this.team[0].ruleset);
      const tw = draftSpecies.typechart();
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
        draftSpecies,
        Object.values(newTC).reduce((sum, e) => sum + e, 0) - base,
      ]);
    }
    pokemonList = pokemonList.sort((x, y) => x[1] - y[1]);
    typeList = typeList.sort((x, y) => x[1] - y[1]);
    const recommended = {
      all: {
        pokemon: pokemonList.slice(0, 10).map((e) => ({
          id: e[0].id,
          name: e[0].name,
        })),
        types: typeList.slice(0, 10).map((e) => e[0]),
      },
      unique: {
        pokemon: pokemonList
          .filter(([pokemon]) =>
            pokemon.types.some((type) => !usedTypes.has(type))
          )
          .slice(0, 10)
          .map(([pokemon]) => ({
            id: pokemon.id,
            name: pokemon.name,
          })),
        types: typeList
          .filter(([types]) => types.some((type) => !usedTypes.has(type)))
          .slice(0, 10)
          .map((e) => e[0]),
      },
    };
    console.log(recommended.all, recommended.unique);
    return recommended;
  }
}
