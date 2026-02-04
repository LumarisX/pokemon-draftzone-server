import { TypeName } from "@pkmn/data";
import { DraftSpecie } from "../../classes/pokemon";
import { typeWeak } from "../data-services/type.services";

export class Typechart {
  team: DraftSpecie[];
  teraTypes: {
    [key: string]: {};
  };

  constructor(team: DraftSpecie[]) {
    this.team = team;
    this.teraTypes = {};
    // if (pokemon.capt && pokemon.capt.tera) {
    //   pokemon.capt.tera = pokemon.capt.tera.filter((type) => type != "Stellar");
    // }
  }

  toJson() {
    return {
      team: this.team.map((pokemon) => ({
        ...pokemon.toClient(),
        weak: [pokemon.typechart(), typeWeak(pokemon.types, pokemon.ruleset)],
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
      .reduce(
        (totalTypes, pokemon) => {
          for (const type of Object.keys(pokemon) as TypeName[]) {
            const value = pokemon[type];
            let log = value > 0 ? Math.log2(value) : -2;
            if (type in totalTypes) {
              totalTypes[type] += log;
            } else {
              totalTypes[type] = log;
            }
          }
          return totalTypes;
        },
        {} as Record<TypeName, number>,
      );
    const types: TypeName[] = Array.from(this.team[0].ruleset.types)
      .map((type) => type.toString())
      .filter((x) => x != "Stellar");
    const usedTypes: Set<TypeName> = this.team.reduce((set, mon) => {
      mon.types.forEach((type) => set.add(type));
      return set;
    }, new Set<TypeName>());
    const base = Object.values(teamTypeChart).reduce(
      (sum, e) => sum + Math.pow(2, e),
      0,
    );
    let typeList: [[TypeName] | [TypeName, TypeName], number][] = [];
    for (let i = 0; i < types.length; i++) {
      for (let j = i; j < types.length; j++) {
        let selectedTypes: [TypeName] | [TypeName, TypeName] = [types[i]];
        if (i !== j) selectedTypes.push(types[j]);
        let newTC = { ...teamTypeChart };
        let tw = typeWeak(selectedTypes, this.team[0].ruleset);
        for (const type of Object.keys(tw) as TypeName[]) {
          const value = tw[type];
          let log = value > 0 ? Math.log2(value) : -2;
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
    let pokemonList: [DraftSpecie, number][] = [];
    for (let species of this.team[0].ruleset.species) {
      if (
        species.nfe || //only fully evolved
        species.id === "shedinja" ||
        this.team.some((pokemon) => species.baseSpecies === pokemon.baseSpecies)
      )
        continue;
      const newTC = { ...teamTypeChart };
      const draftSpecies = new DraftSpecie(species, this.team[0].ruleset);
      const tw = draftSpecies.typechart();
      for (const type of Object.keys(tw) as TypeName[]) {
        const value = tw[type];
        let log = value > 0 ? Math.log2(value) : -2;
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
            pokemon.types.some((type) => !usedTypes.has(type)),
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
    return recommended;
  }
}
