import { DraftSpecies } from "../../classes/pokemon";
import { Ruleset } from "../../data/rulesets";
import { PokemonData } from "../../models/pokemon.schema";

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
      "leechseed",
      "lifedew",
      "lunarblessing",
      "lunardance",
      "milkdrink",
      "moonlight",
      "morningsun",
      "painsplit",
      "pollenpuff",
      "purify",
      "recover",
      "refresh",
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
      "finalgambit",
      "memento",
    ],
  },
  {
    categoryName: "Hazard Control",
    moves: [
      "spikes",
      "stealthrock",
      "stickyweb",
      "toxicspikes",
      "defog",
      "rapidspin",
      "mortalspin",
      "tidyup",
      "ceaselessedge",
      "stoneaxe",
      "courtchange",
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
      "afteryou",
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
      "disable",
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
      "psychup",
      "copycat",
      "mefirst",
      "snatch",
      "destinybond",
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
  {
    categoryName: "Trapping",
    moves: [
      "pursuit",
      "anchorshot",
      "block",
      "fairylock",
      "jawlock",
      "meanlook",
      "octolock",
      "spiderweb",
      "spiritshackle",
      "thousandwaves",
      "bind",
      "clamp",
      "firespin",
      "infestation",
      "magmastorm",
      "sandtomb",
      "snaptrap",
      "thundercage",
      "whirlpool",
      "wrap",
    ],
  },
  {
    categoryName: "Type Changing",
    moves: [
      "terablast",
      "hiddenpower",
      "naturalgift",
      "multiattack",
      "revelationdance",
      "technoblast",
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

// Old Version - Slower but single threaded
// export async function movechart(team: DraftSpecies[]) {
//   let movechart: Movechart = chartMoves.map((cat) => ({
//     categoryName: cat.categoryName,
//     moves: [],
//   }));
//   for (const pokemon of team) {
//     for (let cat of chartMoves) {
//       for (const move of cat.moves) {
//         if (await pokemon.canLearn(move.id)) {
//           let category = movechart.find(
//             (entry) => entry.categoryName === cat.categoryName
//           );
//           if (!category) {
//             category = { categoryName: cat.categoryName, moves: [] };
//             movechart.push(category);
//           }
//           let moveEntry = category.moves.find(
//             (moveEntry) => moveEntry.name === move.name
//           );
//           if (!moveEntry) {
//             moveEntry = { name: move.name, type: move.type, pokemon: [] };
//             category.moves.push(moveEntry);
//           }
//           moveEntry.pokemon.push(pokemon.toPokemon());
//         }
//       }
//     }
//   }
//   return movechart;
// }

export async function movechart(
  team: DraftSpecies[],
  ruleset: Ruleset
): Promise<Movechart> {
  const movechart = await Promise.all(
    chartMoves.map(async (category) => ({
      categoryName: category.categoryName,
      moves: await Promise.all(
        category.moves
          .map((moveId) => ruleset.gen.moves.get(moveId))
          .filter((move) => move !== undefined)
          .filter((move) => move.exists)
          .map(async (move) => ({
            name: move.name,
            type: move.type,
            pokemon: (
              await Promise.all(
                team.map(async (pokemon) => ({
                  pokemon,
                  canLearn: await pokemon.canLearn(move.id),
                }))
              )
            )
              .filter((result) => result.canLearn)
              .map((result) => result.pokemon.toPokemon()),
          }))
      ),
    }))
  );
  return movechart;
}
