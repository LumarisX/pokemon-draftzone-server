import { Move, TypeName } from "@pkmn/data";
import { DraftSpecie, PokemonFormData } from "../../classes/pokemon";
import { Ruleset } from "../../data/rulesets";

const moveList: { [key: string]: string[] } = {
  afteryou: ["Speed Control"],
  allyswitch: ["Support"],
  anchorshot: ["Trapping"],
  aromatherapy: ["Cleric"],
  auroraveil: ["Support"],
  beatup: ["Support"],
  block: ["Trapping"],
  ceaselessedge: ["Hazard Control"],
  clearsmog: ["Disruption"],
  coaching: ["Support"],
  copycat: ["Disruption"],
  corrosivegas: ["Disruption"],
  cottonspore: ["Speed Control"],
  courtchange: ["Hazard Control"],
  craftyshield: ["Support"],
  defog: ["Hazard Control"],
  destinybond: ["Disruption"],
  disable: ["Disruption"],
  dragoncheer: ["Support"],
  encore: ["Disruption"],
  expandingforce: ["Field Manipulation"],
  fairylock: ["Trapping"],
  floralhealing: ["Cleric"],
  followme: ["Support"],
  grassyglide: ["Field Manipulation"],
  gravity: ["Support"],
  haze: ["Disruption"],
  healbell: ["Cleric"],
  healingwish: ["Cleric"],
  healorder: ["Cleric"],
  healpulse: ["Cleric"],
  helpinghand: ["Support"],
  hiddenpower: ["Type Changing"],
  imprison: ["Disruption"],
  jawlock: ["Trapping"],
  junglehealing: ["Cleric"],
  knockoff: ["Disruption"],
  leechseed: ["Cleric"],
  lifedew: ["Cleric"],
  lightscreen: ["Support"],
  luckychant: ["Support"],
  lunarblessing: ["Cleric"],
  lunardance: ["Cleric"],
  magiccoat: ["Disruption"],
  magicroom: ["Disruption"],
  matblock: ["Support"],
  meanlook: ["Trapping"],
  mefirst: ["Disruption"],
  milkdrink: ["Cleric"],
  mist: ["Support"],
  mistyexplosion: ["Field Manipulation"],
  moonlight: ["Cleric"],
  morningsun: ["Cleric"],
  mortalspin: ["Hazard Control"],
  multiattack: ["Type Changing"],
  naturalgift: ["Type Changing"],
  naturepower: ["Field Manipulation", "Type Changing"],
  octolock: ["Trapping"],
  painsplit: ["Cleric"],
  pollenpuff: ["Cleric"],
  psychup: ["Disruption"],
  purify: ["Cleric"],
  pursuit: ["Trapping"],
  quash: ["Speed Control"],
  quickguard: ["Support"],
  ragepowder: ["Support"],
  rapidspin: ["Hazard Control"],
  recover: ["Cleric"],
  reflect: ["Support"],
  refresh: ["Cleric"],
  rest: ["Cleric"],
  revelationdance: ["Type Changing"],
  risingvoltage: ["Field Manipulation"],
  roost: ["Cleric"],
  safeguard: ["Support"],
  scaryface: ["Speed Control"],
  shoreup: ["Cleric"],
  slackoff: ["Cleric"],
  snatch: ["Disruption"],
  softboiled: ["Cleric"],
  speedswap: ["Speed Control"],
  spiderweb: ["Trapping"],
  spikes: ["Hazard Control"],
  spiritshackle: ["Trapping"],
  stealthrock: ["Hazard Control"],
  stickyweb: ["Hazard Control", "Speed Control"],
  stoneaxe: ["Hazard Control"],
  strengthsap: ["Cleric"],
  stringshot: ["Speed Control"],
  swallow: ["Cleric"],
  switcheroo: ["Disruption"],
  synthesis: ["Cleric"],
  tailwind: ["Speed Control"],
  taunt: ["Disruption"],
  technoblast: ["Type Changing"],
  terablast: ["Type Changing"],
  terrainpulse: ["Field Manipulation", "Type Changing"],
  thousandwaves: ["Trapping"],
  tidyup: ["Hazard Control"],
  toxicspikes: ["Hazard Control"],
  trick: ["Disruption"],
  trickroom: ["Speed Control"],
  weatherball: ["Field Manipulation", "Type Changing"],
  wideguard: ["Support"],
  wish: ["Cleric"],
  wonderroom: ["Field Manipulation"],
  yawn: ["Status"],
  baddybad: ["Support"],
  brickbreak: ["Disruption"],
  psychicfangs: ["Disruption"],
  ragingbull: ["Disruption"],
  coreenforcer: ["Disruption"],
  covet: ["Disruption"],
  eeriespell: ["Disruption"],
  electrify: ["Disruption"],
  embargo: ["Disruption"],
  entainment: ["Support", "Disruption"],
  fling: ["Disruption"],
  forestscurse: ["Disruption"],
  gastroacid: ["Disruption"],
  glitzyglow: ["Support"],
  grudge: ["Disruption"],
  healblock: ["Disruption"],
  psychicnoise: ["Disruption"],
  icespinner: ["Field Manipulation"],
  incinerate: ["Disruption"],
  instruct: ["Support"],
};

export type Movechart = {
  moves: {
    name: string;
    type: TypeName;
    desc: string;
    pokemon: string[];
    tags: string[];
  }[];
  pokemon: PokemonFormData[];
  tags: ReadonlyArray<string>;
};

function getMoveTags(move: Move) {
  const tags = new Set<string>(
    move.id in moveList ? [...moveList[move.id]] : [],
  );
  if (move.boosts && Object.entries(move.boosts).length) tags.add("Setup");
  if (move.priority > 0) tags.add("Priority");
  if (move.volatileStatus === "partiallytrapped") tags.add("Trapping");
  if (move.forceSwitch) tags.add("Disruption");
  const statusSecondary = move.secondaries?.find((s) => s.status);
  if (
    move.status ||
    (statusSecondary &&
      (!statusSecondary.chance ||
        (statusSecondary.chance *
          (move.accuracy === true ? 100 : move.accuracy)) /
          100 >
          49))
  )
    tags.add("Status");
  if (move.selfSwitch || move.selfdestruct) tags.add("Momentum");
  if (move.secondaries?.some((s) => s.boosts?.spe && s.boosts.spe < 0))
    tags.add("Speed Control");
  if (move.weather || move.pseudoWeather || move.terrain)
    tags.add("Field Manipulation");

  return tags;
}

export async function movechart(
  team: DraftSpecie[],
  ruleset: Ruleset,
): Promise<Movechart> {
  const combinedLearnset = new Map<
    string,
    {
      move: Move;
      pokemon: string[];
    }
  >();

  const teamWithLearnsets = await Promise.all(
    team.map(async (pokemon) => ({
      pokemon,
      learnset: await pokemon.learnset(),
    })),
  );

  for (let { pokemon, learnset } of teamWithLearnsets) {
    for (let move of learnset) {
      if (!combinedLearnset.has(move.id)) {
        combinedLearnset.set(move.id, {
          move,
          pokemon: [],
        });
      }
      combinedLearnset.get(move.id)?.pokemon.push(pokemon.id);
    }
  }

  // for (let move of ruleset.moves) {
  //   const tags = getMoveTags(move);
  //   if (tags.size) console.log(`${move.name}: ${Array.from(tags).join(", ")}`);
  // }
  // console.log();

  // console.log(ruleset.moves.get("explosion"));

  const allTags = new Set<string>();
  const moves = Array.from(combinedLearnset.values())
    .map(({ move, pokemon }) => {
      const tags = getMoveTags(move);
      tags.forEach((tag) => allTags.add(tag));
      return {
        name: move.name,
        type: move.type,
        desc: move.shortDesc,
        accuracy: move.accuracy === true ? "-" : `${move.accuracy}%`,
        basePower: move.basePower,
        category: move.category,
        tags: Array.from(tags),
        pokemon,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    moves,
    pokemon: team.map((p) => p.toClient()),
    tags: Array.from(allTags).sort(),
  };
}
