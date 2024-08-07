import { toID } from "@pkmn/data";
import { Ruleset } from "../../data/rulesets";
import { PokemonData } from "../../models/pokemon.schema";
import { getLearnset } from "../data-services/learnset.service";
import { getMove } from "../data-services/move.service";

const chartMoves: { categoryName: string; moves: string[] }[] = [
  {
    categoryName: "Priority",
    moves: [
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
  },
  {
    categoryName: "Setup",
    moves: [
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
  },
  {
    categoryName: "Cleric",
    moves: [
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
  },
  {
    categoryName: "Momentum",
    moves: [
      "batonpass",
      "chillyreception",
      "flipturn",
      "partingshot",
      "revivalblessing",
      "shedtail",
      "teleport",
      "uturn",
      "voltswitch",
      "explosion",
      "selfdestruct",
      "mistyexplosion",
    ],
  },
  {
    categoryName: "Hazard Control",
    moves: [
      "spikes",
      "stealthrock",
      "stickyweb",
      "defog",
      "rapidspin",
      "mortalspin",
      "tidyup",
      "toxicspikes",
    ],
  },
  {
    categoryName: "Speed Control",
    moves: [
      "tailwind",
      "stickyweb",
      "trickroom",
      "bleakwindstorm",
      "bulldoze",
      "cottonspore",
      "stringshot",
      "electroweb",
      "glaciate",
      "icywind",
    ],
  },
  {
    categoryName: "Support",
    moves: [
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
      "dragoncheer",
    ],
  },
  {
    categoryName: "Status",
    moves: [
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
  },
  {
    categoryName: "Disruption",
    moves: [
      "taunt",
      "encore",
      "magiccoat",
      "knockoff",
      "trick",
      "switcheroo",
      "corrosivegas",
      "magicroom",
      "imprison",
      "circlethrow",
      "dragontail",
      "roar",
      "whirlwind",
      "haze",
      "clearsmog",
      "copycat",
      "mefirst",
      "snatch",
    ],
  },
  {
    categoryName: "Field Manipulation",
    moves: [
      "chillyreception",
      "electricterrain",
      "grassyterrain",
      "mistyterrain",
      "psychicterrain",
      "raindance",
      "sandstorm",
      "snowscape",
      "hail",
      "sunnyday",
      "terrainpulse",
      "naturepower",
      "weatherball",
      "risingvoltage",
      "expandingforce",
      "grassyglide",
      "mistyexplosion",
      "gravity",
    ],
  },
];

export type Movechart = {
  categoryName: string;
  moves: {
    name: string;
    type: string;
    pokemon: PokemonData[];
  }[];
}[];

export async function movechart(ruleset: Ruleset, team: PokemonData[]) {
  let movechart: Movechart = chartMoves.map((cat) => ({
    categoryName: cat.categoryName,
    moves: [],
  }));
  for (const pokemon of team) {
    let learnset = await getLearnset(ruleset, pokemon.pid);
    for (let cat of chartMoves) {
      for (const move of cat.moves) {
        const moveID = toID(move);
        if (moveID in learnset) {
          let category = movechart.find(
            (entry) => entry.categoryName === cat.categoryName
          );
          if (!category) {
            category = { categoryName: cat.categoryName, moves: [] };
            movechart.push(category);
          }
          let move = getMove(ruleset, moveID);
          let moveEntry = category.moves.find(
            (moveEntry) => moveEntry.name === move.name
          );
          if (!moveEntry) {
            moveEntry = { name: move.name, type: move.type, pokemon: [] };
            category.moves.push(moveEntry);
          }
          moveEntry.pokemon.push(pokemon);
        }
      }
    }
  }
  return movechart;
}
