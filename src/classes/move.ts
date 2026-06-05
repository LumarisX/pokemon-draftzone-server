import { ID, TypeName, Move } from "@pkmn/data";
import {
  As,
  BoostsTable,
  GenerationNum,
  HitEffect,
  MoveCategory,
  MoveName,
  MoveTarget,
  SecondaryEffect,
  SpeciesName,
  StatusName,
} from "@pkmn/dex-types";
import { Ruleset } from "../data/rulesets";
import { ErrorCodes } from "../errors/error-codes";
import { PDZError } from "../errors/pdz-error";

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

export class DraftMove implements Move {
  effectType!: "Move";
  kind!: "Move";
  secondaries!: SecondaryEffect[] | null;
  flags!: Move["flags"];
  zMoveEffect?: ID | undefined;
  isZ!: boolean | ID;
  zMove?:
    | { basePower?: number; effect?: ID; boost?: Partial<BoostsTable> }
    | undefined;
  isMax!: boolean | SpeciesName;
  maxMove?: { basePower: number } | undefined;
  volatileStatus?: ID | undefined;
  slotCondition?: ID | undefined;
  sideCondition?: ID | undefined;
  terrain?: ID | undefined;
  pseudoWeather?: ID | undefined;
  weather?: ID | undefined;
  id!: ID;
  name!: string & As<"MoveName">;
  fullname!: string;
  exists!: boolean;
  num!: number;
  gen!: GenerationNum;
  shortDesc!: string;
  desc!: string;
  isNonstandard!:
    | "Past"
    | "Future"
    | "Unobtainable"
    | "CAP"
    | "LGPE"
    | "Custom"
    | "Gigantamax"
    | null;
  duration?: number | undefined;
  inherit?: boolean | undefined;
  basePower!: number;
  type!: TypeName;
  accuracy!: number | true;
  pp!: number;
  target!: MoveTarget;
  priority!: number;
  category!: MoveCategory;
  realMove?: string | undefined;
  condition?: Move["condition"];
  damage?: number | false | "level" | null | undefined;
  noPPBoosts?: boolean | undefined;
  ohko?: boolean | "Ice" | undefined;
  thawsTarget?: boolean | undefined;
  heal?: number[] | null | undefined;
  forceSwitch?: boolean | undefined;
  selfSwitch?: boolean | "copyvolatile" | "shedtail" | undefined;
  selfBoost?: { boosts?: Partial<BoostsTable> } | undefined;
  selfdestruct?: boolean | "ifHit" | "always" | undefined;
  breaksProtect?: boolean | undefined;
  recoil?: [number, number] | undefined;
  drain?: [number, number] | undefined;
  mindBlownRecoil?: boolean | undefined;
  stealsBoosts?: boolean | undefined;
  secondary?: SecondaryEffect | null | undefined;
  self?: HitEffect | null | undefined;
  struggleRecoil?: boolean | undefined;
  alwaysHit?: boolean | undefined;
  basePowerModifier?: number | undefined;
  critModifier?: number | undefined;
  critRatio?: number | undefined;
  overrideOffensivePokemon?: "target" | "source" | undefined;
  overrideOffensiveStat?: "atk" | "def" | "spa" | "spd" | "spe" | undefined;
  overrideDefensivePokemon?: "target" | "source" | undefined;
  overrideDefensiveStat?: "atk" | "def" | "spa" | "spd" | "spe" | undefined;
  forceSTAB?: boolean | undefined;
  ignoreAbility?: boolean | undefined;
  ignoreAccuracy?: boolean | undefined;
  ignoreDefensive?: boolean | undefined;
  ignoreEvasion?: boolean | undefined;
  ignoreImmunity?:
    | boolean
    | {
        readonly [x: number]: boolean | undefined;
        toString?: boolean | undefined;
        charAt?: boolean | undefined;
        charCodeAt?: boolean | undefined;
        concat?: boolean | undefined;
        indexOf?: boolean | undefined;
        lastIndexOf?: boolean | undefined;
        localeCompare?: boolean | undefined;
        match?: boolean | undefined;
        replace?: boolean | undefined;
        search?: boolean | undefined;
        slice?: boolean | undefined;
        split?: boolean | undefined;
        substring?: boolean | undefined;
        toLowerCase?: boolean | undefined;
        toLocaleLowerCase?: boolean | undefined;
        toUpperCase?: boolean | undefined;
        toLocaleUpperCase?: boolean | undefined;
        trim?: boolean | undefined;
        readonly length?: boolean | undefined;
        substr?: boolean | undefined;
        valueOf?: boolean | undefined;
        codePointAt?: boolean | undefined;
        includes?: boolean | undefined;
        endsWith?: boolean | undefined;
        normalize?: boolean | undefined;
        repeat?: boolean | undefined;
        startsWith?: boolean | undefined;
        anchor?: boolean | undefined;
        big?: boolean | undefined;
        blink?: boolean | undefined;
        bold?: boolean | undefined;
        fixed?: boolean | undefined;
        fontcolor?: boolean | undefined;
        fontsize?: boolean | undefined;
        italics?: boolean | undefined;
        link?: boolean | undefined;
        small?: boolean | undefined;
        strike?: boolean | undefined;
        sub?: boolean | undefined;
        sup?: boolean | undefined;
        padStart?: boolean | undefined;
        padEnd?: boolean | undefined;
        trimEnd?: boolean | undefined;
        trimStart?: boolean | undefined;
        trimLeft?: boolean | undefined;
        trimRight?: boolean | undefined;
        matchAll?: boolean | undefined;
        [Symbol.iterator]?: boolean | undefined;
        at?: boolean | undefined;
      }
    | undefined;
  ignoreNegativeOffensive?: boolean | undefined;
  ignoreOffensive?: boolean | undefined;
  ignorePositiveDefensive?: boolean | undefined;
  ignorePositiveEvasion?: boolean | undefined;
  infiltrates?: boolean | undefined;
  multiaccuracy?: boolean | undefined;
  multihit?: number | number[] | undefined;
  multihitType?: "parentalbond" | undefined;
  noCopy?: boolean | undefined;
  noDamageVariance?: boolean | undefined;
  noFaint?: boolean | undefined;
  nonGhostTarget?: MoveTarget | undefined;
  pressureTarget?: MoveTarget | undefined;
  sleepUsable?: boolean | undefined;
  smartTarget?: boolean | undefined;
  spreadModifier?: number | undefined;
  tracksTarget?: boolean | undefined;
  willCrit?: boolean | undefined;
  callsMove?: boolean | undefined;
  hasCrashDamage?: boolean | undefined;
  hasSheerForce?: boolean | undefined;
  isConfusionSelfHit?: boolean | undefined;
  stallingMove?: boolean | undefined;
  boosts?: Partial<BoostsTable> | undefined;
  status?: StatusName | undefined;

  ruleset: Ruleset;

  constructor(moveData: ID | Move, ruleset: Ruleset) {
    const move =
      typeof moveData === "string" ? ruleset.moves.get(moveData) : moveData;
    if (!move) throw new PDZError(ErrorCodes.MOVE.NOT_FOUND, { moveData });

    Object.assign(this, move);
    this.ruleset = ruleset;
  }

  toString(): MoveName {
    return this.name;
  }

  get accuracyPercent(): number {
    return (this.accuracy === true ? 100 : this.accuracy) / 100;
  }

  get expectedPower(): number {
    return this.expectedPower * this.accuracyPercent;
  }

  get tags(): Set<string> {
    const tags = new Set<string>(
      this.id in moveList ? [...moveList[this.id]] : [],
    );
    if (this.boosts && Object.entries(this.boosts).length) tags.add("Setup");
    if (this.priority > 0) tags.add("Priority");
    if (this.volatileStatus === "partiallytrapped") tags.add("Trapping");
    if (this.forceSwitch) tags.add("Disruption");
    const statusSecondary = this.secondaries?.find((s) => s.status);
    if (
      this.status ||
      (statusSecondary &&
        (!statusSecondary.chance ||
          (statusSecondary.chance *
            (this.accuracy === true ? 100 : this.accuracy)) /
            100 >
            49))
    )
      tags.add("Status");
    if (this.selfSwitch || this.selfdestruct) tags.add("Momentum");
    if (this.secondaries?.some((s) => s.boosts?.spe && s.boosts.spe < 0))
      tags.add("Speed Control");
    if (this.weather || this.pseudoWeather || this.terrain)
      tags.add("Field Manipulation");

    return tags;
  }

  toData() {
    return {
      name: this.name,
      type: this.type,
      desc: this.shortDesc,
      accuracy: this.accuracy === true ? "-" : `${this.accuracy}`,
      basePower: this.basePower,
      category: this.category,
    };
  }
}
