import { Natures } from "@pkmn/data";
import { Nature } from "@pkmn/dex";
import { calculate, Field, Move, NATURES, Pokemon, Result } from "@smogon/calc";
import { NatureName } from "@smogon/calc/dist/data/interface";
import fs from "fs";

const PATH = "./src/tests/pats.json";

type PikalyticData = {
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
    ability: string;
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

export async function getPats() {
  const rawData: { name: string; rank: string; percent: string }[] = JSON.parse(
    await (
      await fetch(
        "https://www.pikalytics.com/api/l/2024-10/gen9vgc2024regh-1760"
      )
    ).text()
  );

  const monData = await Promise.all(
    rawData.filter((e) => +e.rank <= 100).map((e) => getMonData(e.name))
  );

  fs.writeFileSync(PATH, JSON.stringify(monData, null, 2));
}

export async function getMonData(name: string) {
  const rawMon = JSON.parse(
    await (
      await fetch(
        `https://www.pikalytics.com/api/p/2024-10/gen9vgc2024regh-1760/${name}`
      )
    ).text()
  );
  return rawMon;
}

export function getSpreads() {
  let pokemon = new Pokemon(9, "Primarina", {
    ability: "Liquid Voice",
    level: 50,
  });
  let calcs: { pokemon: Pokemon; move: Move; field?: Field }[] = [
    {
      pokemon: new Pokemon(9, "Charizard", {
        ability: "Solar Power",
        level: 50,
        item: "Choice Specs",
        evs: { spa: 252 },
        nature: "Modest",
      }),
      move: new Move(9, "Weather Ball", {}),
      field: new Field({ weather: "Sun", gameType: "Doubles" }),
    },
  ];
  const natures: NatureName[] = Object.entries(NATURES)
    .filter((e) => e[1][0] !== e[1][1])
    .map((e) => e[0] as NatureName);
  let count = 0;
  let timeCount = 0;
  let topChance = 100;
  let topResult: Result | undefined;
  const startTime = Date.now();
  for (let spread of generateSpreads({}, 8)) {
    const elapsedTime = (Date.now() - startTime) / 1000;
    if (elapsedTime - timeCount > 1) {
      timeCount = Math.floor(elapsedTime);
      let percent = Math.round(count / 2845.2) / 10;
      process.stdout.write(`\r${" ".repeat(100)}\r`);
      process.stdout.write(
        `Progress: ${percent}% | Elapsed time: ${elapsedTime.toFixed(
          2
        )}s | Time remaining: ${Math.round(elapsedTime * (100 / percent - 1))}`
      );
    }
    pokemon.evs = spread;
    for (let nature of natures) {
      pokemon.nature = nature;
      for (let calc of calcs) {
        let result = calculate(9, calc.pokemon, pokemon, calc.move, calc.field);
        if (
          topChance >
          1 + result.kochance().n - +(result.kochance().chance ?? 1)
        ) {
          topResult = result;
        }
      }
    }
    count++;
  }
  console.log();
  console.log(topResult?.fullDesc());
  console.log(count);
}

interface Spread {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

function* generateSpreads(
  fixed: Partial<Spread> = {},
  number = 4
): Generator<Spread> {
  const maxEV = 252;
  const totalEVs = 508;
  const statsNames: (keyof Spread)[] = [
    "hp",
    "atk",
    "def",
    "spa",
    "spd",
    "spe",
  ];
  const statsCount = statsNames.length;

  // Initialize the fixed stats
  const fixedStats = statsNames.map((stat) => fixed[stat] ?? 0);
  const remainingEVs = totalEVs - fixedStats.reduce((sum, ev) => sum + ev, 0);

  if (remainingEVs < 0) {
    throw new Error("Fixed EVs exceed the total EV limit of 508.");
  }

  const stack: { stats: number[]; index: number; remainingEVs: number }[] = [];
  stack.push({
    stats: [...fixedStats],
    index: 0,
    remainingEVs,
  });

  while (stack.length > 0) {
    const { stats, index, remainingEVs } = stack.pop()!;

    if (index === statsCount) {
      if (remainingEVs === 0) {
        const spread: Spread = stats.reduce((obj, ev, i) => {
          obj[statsNames[i]] = ev;
          return obj;
        }, {} as Spread);
        yield spread;
      }
      continue;
    }

    if (fixed[statsNames[index]] !== undefined) {
      // Skip processing if the value is fixed
      stack.push({ stats, index: index + 1, remainingEVs });
    } else {
      for (let ev = -4; ev <= maxEV && ev <= remainingEVs; ev += number) {
        const newStats = [...stats];
        const adjustedEv = ev < 0 ? 0 : ev;
        newStats[index] = adjustedEv;
        stack.push({
          stats: newStats,
          index: index + 1,
          remainingEVs: remainingEVs - adjustedEv,
        });
      }
    }
  }
}

export function getCalcs() {
  const data: PikalyticData[] = JSON.parse(fs.readFileSync(PATH, "utf-8"));

  let pokemon = new Pokemon(9, "Primarina", {
    ability: "Liquid Voice",
    moves: ["Hyper Voice", "Moonblast", "Icy Wind", "Protect"],
    evs: { hp: 252, spa: 252 },
    nature: "Modest",
  });

  let totalPoints = 0;
  data
    .filter((mon) => true)
    .forEach((mon) => {
      let monTotal = 0;
      mon.items.forEach((item) => {
        if (item.item === "Other") return;
        (mon.abilities.length > 0 ? mon.abilities : [undefined]).forEach(
          (ability) => {
            mon.spreads.forEach((spread) => {
              let evs = spread.ev.split("/");
              let oPokemon = new Pokemon(9, mon.name, {
                nature: spread.nature,
                evs: {
                  hp: +evs[0],
                  atk: +evs[1],
                  def: +evs[2],
                  spa: +evs[3],
                  spd: +evs[4],
                  spe: +evs[5],
                },
                item: item.item,
                ability: ability?.ability,
              });
              mon.moves.forEach((move) => {
                if (move.move == "Other") return;
                let calcMove = new Move(9, move.move);
                if (calcMove.category !== "Status") {
                  let result = calculate(
                    9,
                    oPokemon,
                    pokemon,
                    new Move(9, move.move)
                  );
                  // console.log(result.fullDesc());
                  monTotal +=
                    (((((((+move.percent / 100) * +item.percent) / 100) *
                      +(ability?.percent ?? 100)) /
                      100) *
                      +spread.percent) /
                      100) *
                    (1 + result.kochance().n - (result.kochance().chance ?? 0));
                }
              });
            });
          }
        );
      });
      totalPoints += (+mon.percent / 100) * monTotal;
      console.log(mon.name, monTotal);
    });
  console.log("Total", totalPoints);
}
