import { TypeName } from "@pkmn/data";
import { DraftSpecies } from "../../classes/pokemon";
import { PokemonData } from "../../models/pokemon.schema";
import { typeWeak } from "../data-services/type.services";
import { Draft } from "../../classes/draft";

export class Typechart {
  team: (
    | PokemonData & {
        weak: { [key: string]: number };
      }
  )[];
  rawTeam: DraftSpecies[];
  teraTypes: {
    [key: string]: {};
  };

  constructor(team: DraftSpecies[]) {
    this.rawTeam = team;
    this.team = team.map((pokemon) => ({
      ...pokemon.toPokemon(),
      weak: pokemon.typechart(),
    }));
    this.teraTypes = {};
    // if (pokemon.capt && pokemon.capt.tera) {
    //   pokemon.capt.tera = pokemon.capt.tera.filter((type) => type != "Stellar");
    // }
    this.newBestMon();
  }

  toJson() {
    return { team: this.team, teraTypes: this.teraTypes };
  }

  nextBestType() {
    let teamTypeChart = this.rawTeam
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
    let types: TypeName[] = [
      "Bug",
      "Dark",
      "Dragon",
      "Electric",
      "Fairy",
      "Fighting",
      "Fire",
      "Flying",
      "Ghost",
      "Grass",
      "Ground",
      "Ice",
      "Normal",
      "Poison",
      "Psychic",
      "Rock",
      "Steel",
      "Water",
    ];

    let base = Object.values(teamTypeChart).reduce(
      (sum, e) => sum + Math.pow(2, e),
      0
    );
    let typeList: [
      TypeName,
      TypeName,
      number,
      {
        [x: string]: number;
      }
    ][] = [];
    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        let newTC = { ...teamTypeChart };
        let tw = typeWeak([types[i], types[j]], this.rawTeam[0].ruleset);
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
          types[i],
          types[j],
          Object.values(newTC).reduce((sum, e) => sum + e, 0) - base,
          newTC,
        ]);
      }
    }
    console.log(typeList.sort((x, y) => x[2] - y[2])[0]);
  }

  newBestMon() {
    let teamTypeChart = this.rawTeam
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
    let types: TypeName[] = [
      "Bug",
      "Dark",
      "Dragon",
      "Electric",
      "Fairy",
      "Fighting",
      "Fire",
      "Flying",
      "Ghost",
      "Grass",
      "Ground",
      "Ice",
      "Normal",
      "Poison",
      "Psychic",
      "Rock",
      "Steel",
      "Water",
    ];
    let base = Object.values(teamTypeChart).reduce(
      (sum, e) => sum + Math.pow(2, e),
      0
    );
    let typeList: [string, number][] = [];
    for (let species of this.rawTeam[0].ruleset.gen.species) {
      let newTC = { ...teamTypeChart };
      let draftSpecies = new DraftSpecies(species, {}, this.rawTeam[0].ruleset);
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
      typeList.push([
        draftSpecies.name,
        Object.values(newTC).reduce((sum, e) => sum + e, 0) - base,
      ]);
    }
    console.log(typeList.sort((x, y) => x[1] - y[1]));
  }
}
