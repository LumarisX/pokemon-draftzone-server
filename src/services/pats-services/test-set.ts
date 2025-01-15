import { AbilityName, ItemName, MoveName, Stats, StatsTable } from "@pkmn/data";
import { calculate, Field, Move, NATURES, Pokemon, Result } from "@smogon/calc";
import { NatureName } from "@smogon/calc/dist/data/interface";
import fs from "fs";

const PATH = "./src/services/pats-services/pats.json";

export type PikalyticData = {
  name: string;
  types: string[];
  stats: {
    hp: number;
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
  };
  abilities: {
    ability?: string;
    percent: string;
  }[];
  raw_count: string;
  percent: number;
  ranking: string;
  viability: string;
  items: {
    item: string;
    item_us: string;
    percent: string;
  }[];
  spreads: {
    nature: string;
    ev: string;
    percent: string;
  }[];
  moves: (
    | {
        move: string;
        percent: string;
        type: string;
      }
    | { move: "Other"; percent: string }
  )[];
  team: {
    pokemon: string;
    percent: string;
    types: string[];
    ss?: boolean;
    id?: number;
    pokemon_trans: string;
    l: string;
  }[];
  name_trans: string;
  l: string;
  ss?: boolean;
};

type PokemonSet = {
  ivs: StatsTable;
  evs: StatsTable;
  nature: NatureName;
  ability?: AbilityName;
  item?: ItemName;
};

export function testSet(
  myPokemon: Pokemon,
  otherPokemon: string,
  field?: Field
) {
  const data: PikalyticData[] = JSON.parse(fs.readFileSync(PATH, "utf-8"));
  const otherData = data.find((mon) => mon.name === otherPokemon);
  if (!otherData) throw new Error(otherPokemon + " not found in the dataset");
  const offensive: {
    [key: MoveName]: {
      move: {
        name: string;
        type: string;
      };
      cumulative: {
        koValue: number;
        totalPercent: number;
        basePercent: number;
      };
      min?: {
        koValue: number;
        set: PokemonSet;
      };
      max?: {
        koValue: number;
        set: PokemonSet;
      };
    };
  } = {};
  const defensive: {
    [key: MoveName]: {
      move: {
        name: string;
        type: string;
      };
      cumulative: {
        koValue: number;
        totalPercent: number;
        basePercent: number;
      };
      min?: {
        koValue: number;
        set: PokemonSet;
      };
      max?: {
        koValue: number;
        set: PokemonSet;
      };
    };
  } = {};
  let abilities = otherData.abilities;
  if (abilities.length === 0)
    abilities = [
      {
        ability: undefined,
        percent: "100",
      },
    ];
  abilities.forEach((ability) => {
    if (ability.ability === "Other") return;
    otherData.items.forEach((item) => {
      if (item.item === "Other") return;
      otherData.spreads.forEach((spread) => {
        const evs = spread.ev.split("/");
        const oPokemon = new Pokemon(9, otherPokemon, {
          level: myPokemon.level,
          item: item.item,
          ability: ability.ability,
          evs: {
            hp: +evs[0],
            atk: +evs[1],
            def: +evs[2],
            spa: +evs[3],
            spd: +evs[4],
            spe: +evs[5],
          },
          nature: spread.nature,
        });
        //Defensive
        otherData.moves.forEach((moveData) => {
          if (moveData.move === "Other") return;
          const move = new Move(9, moveData.move);
          const koValue = getKoValue(oPokemon, myPokemon, move, field);
          if (!defensive[move.name])
            defensive[move.name] = {
              move: {
                name: move.name,
                type: move.type,
              },
              cumulative: {
                koValue: 0,
                totalPercent: 0,
                basePercent: +moveData.percent / 100,
              },
            };
          if (move && move.category === "Status") return;
          const adjustedPercent =
            (+ability.percent / 100) *
            (+item.percent / 100) *
            (+moveData.percent / 100) *
            (+spread.percent / 100);
          defensive[move.name].cumulative.koValue += koValue * adjustedPercent;
          defensive[move.name].cumulative.totalPercent += adjustedPercent;
          if (
            defensive[move.name].max === undefined ||
            defensive[move.name].max!.koValue > koValue
          ) {
            defensive[move.name].max = {
              koValue,
              set: {
                ivs: oPokemon.ivs,
                evs: oPokemon.evs,
                nature: oPokemon.nature,
                ability: oPokemon.ability,
                item: oPokemon.item,
              },
            };
          }
          if (
            defensive[move.name].min === undefined ||
            defensive[move.name].min!.koValue < koValue
          ) {
            defensive[move.name].min = {
              koValue,
              set: {
                ivs: oPokemon.ivs,
                evs: oPokemon.evs,
                nature: oPokemon.nature,
                ability: oPokemon.ability,
                item: oPokemon.item,
              },
            };
          }
        });

        const adjustedPercent =
          (+ability.percent / 100) *
          (+item.percent / 100) *
          (+spread.percent / 100);
        //Offensive
        myPokemon.moves.forEach((moveName) => {
          const move = new Move(9, moveName);
          const koValue = getKoValue(myPokemon, oPokemon, move, field);
          if (!offensive[move.name])
            offensive[move.name] = {
              move: {
                name: move.name,
                type: move.type,
              },
              cumulative: {
                koValue: 0,
                totalPercent: 0,
                basePercent: 1,
              },
            };
          offensive[move.name].cumulative.koValue += koValue * adjustedPercent;
          offensive[move.name].cumulative.totalPercent += adjustedPercent;
          if (
            offensive[move.name].max === undefined ||
            offensive[move.name].max!.koValue > koValue
          ) {
            offensive[move.name].max = {
              koValue,
              set: {
                ivs: oPokemon.ivs,
                evs: oPokemon.evs,
                nature: oPokemon.nature,
                ability: oPokemon.ability,
                item: oPokemon.item,
              },
            };
          }
          if (
            offensive[move.name].min === undefined ||
            offensive[move.name].min!.koValue < koValue
          ) {
            offensive[move.name].min = {
              koValue,
              set: {
                ivs: oPokemon.ivs,
                evs: oPokemon.evs,
                nature: oPokemon.nature,
                ability: oPokemon.ability,
                item: oPokemon.item,
              },
            };
          }
        });
      });
    });
  });
  return {
    link: `https://www.pikalytics.com/pokedex/gen9vgc2024regg/${otherPokemon.toLowerCase()}`,
    results: [
      {
        attacker: myPokemon.name,
        defender: otherPokemon,
        calcs: Object.values(offensive).map((calc) => {
          const adjustedValue =
            calc.cumulative.koValue / calc.cumulative.totalPercent;
          const [n, chance] = fromKoValue(adjustedValue);
          const [minN, minChance] = fromKoValue(calc.min?.koValue);
          const [maxN, maxChance] = fromKoValue(calc.max?.koValue);
          return {
            move: calc.move,
            chance,
            n,
            min: {
              n: minN,
              chance: minChance,
              set: calc.min?.set,
            },
            max: {
              n: maxN,
              chance: maxChance,
              set: calc.max?.set,
            },
          };
        }),
      },
      {
        attacker: otherPokemon,
        defender: myPokemon.name,
        calcs: Object.values(defensive).map((calc) => {
          const adjustedValue =
            calc.cumulative.koValue / calc.cumulative.totalPercent;
          const [n, chance] = fromKoValue(adjustedValue);
          const [minN, minChance] = fromKoValue(calc.min?.koValue);
          const [maxN, maxChance] = fromKoValue(calc.max?.koValue);
          return {
            move: calc.move,
            chance,
            n,
            min: {
              n: minN,
              chance: minChance,
              set: calc.min?.set,
            },
            max: {
              n: maxN,
              chance: maxChance,
              set: calc.max?.set,
            },
          };
        }),
      },
    ],
  };
}

function getKoValue(
  attacker: Pokemon,
  defender: Pokemon,
  move: Move,
  field: Field | undefined = undefined
): number {
  if (move && move.category === "Status") return 0;
  const result = calculate(9, attacker, defender, move, field);
  const koChance = result.kochance();
  const koValue = koChance.n ? koChance.n + 1 - (koChance.chance ?? 0) : 0;
  return koValue;
}

function fromKoValue(
  koValue: number | undefined
): [number | undefined, string | undefined] {
  if (koValue === undefined) return [undefined, undefined];
  const n = Number.isNaN(koValue) ? NaN : Math.floor(koValue);
  const chance = ((1 - (koValue - n)) * 100).toFixed(1);
  return [n, chance];
}
