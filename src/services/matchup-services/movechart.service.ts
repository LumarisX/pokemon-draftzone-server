import { Generation, ID, toID } from "@pkmn/data";
import { canLearn } from "../data-services/learnset.service";
import { getMoveName } from "../data-services/move.service";
import { Ruleset } from "../../data/rulesets";

const chartMoves: {
  Priority: string[];
  Setup: string[];
  Cleric: string[];
  Momentum: string[];
  "Hazard Control": string[];
  "Speed Control": string[];
  Support: string[];
  Status: string[];
  Disruption: string[];
  Condition: string[];
} = {
  Priority: [
    "accelerock",
    "aquajet",
    "bulletpunch",
    "extremespeed",
    "fakeout",
    "feint",
    "firstimpression",
    "iceshard",
    "jetpunch",
    "machpunch",
    "quickattack",
    "shadowsneak",
    "suckerpunch",
    "thunderclap",
    "upperhand",
    "vacuumwave",
    "watershuriken",
    "zippyzap",
  ],
  Setup: [
    "acidarmor",
    "agility",
    "amnesia",
    "aromaticmist",
    "autotomize",
    "barrier",
    "bulkup",
    "calmmind",
    "charge",
    "clangoroussoul",
    "coaching",
    "coil",
    "cosmicpower",
    "cottonguard",
    "curse",
    "decorate",
    "defendorder",
    "defensecurl",
    "doubleteam",
    "dragondance",
    "extremeevoboost",
    "filletaway",
    "flatter",
    "geomancy",
    "growth",
    "harden",
    "honeclaws",
    "howl",
    "irondefense",
    "meditate",
    "minimize",
    "nastyplot",
    "noretreat",
    "quiverdance",
    "rockpolish",
    "sharpen",
    "shellsmash",
    "shelter",
    "shiftgear",
    "spicyextract",
    "swagger",
    "swordsdance",
    "tailglow",
    "tidyup",
    "victorydance",
    "withdraw",
    "workup",
  ],
  Cleric: [
    "floralhealing",
    "healingwish",
    "healorder",
    "healpulse",
    "junglehealing",
    "lifedew",
    "lunarblessing",
    "lunardance",
    "milkdrink",
    "moonlight",
    "morningsun",
    "purify",
    "recover",
    "rest",
    "roost",
    "shoreup",
    "slackoff",
    "softboiled",
    "strengthsap",
    "swallow",
    "synthesis",
    "wish",
    "aromatherapy",
    "healbell",
  ],
  Momentum: [
    "batonpass",
    "chillyreception",
    "flipturn",
    "partingshot",
    "revivalblessing",
    "shedtail",
    "teleport",
    "uturn",
    "voltswitch",
  ],
  "Hazard Control": [
    "spikes",
    "stealthrock",
    "stickyweb",
    "defog",
    "rapidspin",
    "mortalspin",
    "tidyup",
    "toxicspikes",
  ],
  "Speed Control": [
    "tailwind",
    "stickyweb",
    "trickroom",
    "bleakwindstorm",
    "bulldoze",
    "electroweb",
    "glaciate",
    "icywind",
  ],
  Support: [
    "reflect",
    "lightscreen",
    "auroraveil",
    "helpinghand",
    "coaching",
    "allyswitch",
    "ragepowder",
    "followme",
    "quickguard",
    "wideguard",
    "beatup",
    "craftyshield",
    "luckychant",
    "matblock",
    "mist",
    "safeguard",
  ],
  Status: [
    "darkvoid",
    "glare",
    "grasswhistle",
    "hypnosis",
    "lovelykiss",
    "mortalspin",
    "nuzzle",
    "poisongas",
    "poisonpowder",
    "sing",
    "sleeppowder",
    "spore",
    "stunspore",
    "thunderwave",
    "toxic",
    "toxicthread",
    "willowisp",
    "yawn",
  ],
  Disruption: [
    "taunt",
    "encore",
    "knockoff",
    "trick",
    "switcheroo",
    "corrosivegas",
    "imprison",
    "circlethrow",
    "dragontail",
    "roar",
    "whirlwind",
    "haze",
    "clearsmog",
  ],
  Condition: [
    "chillyreception",
    "electricterrain",
    "grassyterrain",
    "hail",
    "mistyterrain",
    "psychicterrain",
    "raindance",
    "sandstorm",
    "snowscape",
    "sunnyday",
    "terrainpulse",
    "naturepower",
    "weatherball",
    "solarbeam",
    "risingvoltage",
    "expandingforce",
    "grassyglide",
    "mistyexplosion",
    "hurricane",
    "solarblade",
  ],
};

export type Movechart = {
  catName: keyof typeof chartMoves;
  moves: {
    moveName: string;
    pokemon: string[];
  }[];
}[];

export async function movechart(
  ruleset: Ruleset,
  team: {
    coverage?: {
      [key: string]: {
        ePower: number;
        id?: string;
        name?: string;
        type: string;
        stab: boolean;
        recommended?: number[] | undefined;
      }[];
    };
    pid: ID;
    name: string;
  }[]
): Promise<Movechart> {
  let chartData: {
    catName: keyof typeof chartMoves;
    moves: { moveName: string; pokemon: ID[] }[];
  }[] = [];

  for (const [catName, moves] of Object.entries(chartMoves)) {
    let catData = {
      catName: catName as keyof typeof chartMoves,
      moves: [] as { moveName: string; pokemon: ID[] }[],
    };

    for (const move of moves) {
      const moveID = toID(move);
      let moveData = {
        moveName: getMoveName(ruleset, moveID),
        pokemon: [] as ID[],
      };

      for (const pokemon of team) {
        if (await canLearn(ruleset, pokemon.pid, moveID)) {
          moveData.pokemon.push(pokemon.pid);
        }
      }

      if (moveData.pokemon.length > 0) {
        catData.moves.push(moveData);
      }
    }

    chartData.push(catData);
  }

  return chartData;
}
