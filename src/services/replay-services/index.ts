export const REPLAY_ACTIONS = [
  "-ability",
  "-activate",
  "-anim",
  "-block",
  "-boost",
  "-burst",
  "-center",
  "-clearallboost",
  "-clearboost",
  "-clearnegativeboost",
  "-clearpositiveboost",
  "-combine",
  "-copyboost",
  "-crit",
  "-curestatus",
  "-cureteam",
  "-damage",
  "-end",
  "-endability",
  "-enditem",
  "-fail",
  "-fieldactivate",
  "-fieldend",
  "-fieldstart",
  "-formechange",
  "-heal",
  "-hint",
  "-hitcount",
  "-immune",
  "-invertboost",
  "-item",
  "-mega",
  "-message",
  "-miss",
  "-mustrecharge",
  "-notarget",
  "-prepare",
  "-primal",
  "-resisted",
  "-setboost",
  "-sethp",
  "-sideend",
  "-sidestart",
  "-singlemove",
  "-singleturn",
  "-start",
  "-status",
  "-supereffective",
  "-swapboost",
  "-swapsideconditions",
  "-terastallize",
  "-transform",
  "-unboost",
  "-waiting",
  "-weather",
  "-zbroken",
  "-zpower",
  "c",
  "c:",
  "cant",
  "clearpoke",
  "debug",
  "detailschange",
  "drag",
  "error",
  "faint",
  "gametype",
  "gen",
  "html",
  "inactive",
  "inactiveoff",
  "j",
  "l",
  "message",
  "move",
  "n",
  "player",
  "poke",
  "rated",
  "raw",
  "replace",
  "request",
  "rule",
  "start",
  "swap",
  "switch",
  "t:",
  "teampreview",
  "teamsize",
  "tie",
  "tier",
  "turn",
  "uhtml",
  "upkeep",
  "win",
] as const;

export type ABILITY = string;
export type ACTION = string;
export type AMOUNT = string;
export type ATTACKER = string;
export type AVATAR = string;
export type CONDITION = string;
export type DEFENDER = string;
export type DESCRIPTION = string;
export type DETAILS = string;
export type EFFECT = string;
export type FORMATNAME = string;
export type FROMEFFECT = `[from] ${EFFECT}`;
export type GAMETYPE =
  | "singles"
  | "doubles"
  | "triples"
  | "multi"
  | "freeforall";
export type GENNUM = string;
export type HP = `${string}/${string}`;
export type HPSTATUS = `${HP} ${STATUS}`;
export type ITEM = "item" | "";
export type MEGASTONE = string;
export type MESSAGE = string;
export type MOVE = string;
export type NUM = string;
export type NUMBER = string;
export type PLAYER = string;
export type POSITION = "0" | "1" | "2";
export type PPlayer = "1" | "2" | "3" | "4";
export type PPosition = "a" | "b" | "c";
export type POKEMON =
  | `p${PPlayer}${PPosition}: ${string}`
  | `p${PPlayer}: ${string}`;
export type OFPOKEMON = `[of] ${POKEMON}`;
export type RATING = string;
export type REASON = string;
export type REQUEST = string;
export type RULE = string;
export type SIDE = string;
export type SOURCE = POKEMON;
export type SPECIES = string;
export type STAT = string;
export type STATS = string;
export type STATUS = string;
export type TARGET = POKEMON;
export type TIMESTAMP = string;
export type TYPE = string;
export type USER = string;
export type USERNAME = string;
export type WEATHER = string;

export type MoveData = ["move", POKEMON, MOVE, TARGET];
export type DamageData = ["-damage", POKEMON, HPSTATUS];
export type SetHPData = ["-sethp", POKEMON, HP];

export type ReplayData = string[];

export type ParsedArgs = {
  ability?: ABILITY;
  action?: ACTION;
  amount?: AMOUNT;
  attacker?: ATTACKER;
  defender?: DEFENDER;
  player?: PLAYER;
  username?: USERNAME;
  avatar?: AVATAR;
  rating?: RATING;
  formatName?: FORMATNAME;
  message?: MESSAGE;
  num?: NUM;
  number?: NUMBER;
  pokemon?: POKEMON;
  source?: SOURCE;
  target?: TARGET;
  move?: MOVE;
  megaStone?: MEGASTONE;
  request?: REQUEST;
  rule?: RULE;
  details?: DETAILS;
  item?: ITEM;
  hpStatus?: HPSTATUS;
  hp?: HP;
  position?: POSITION;
  reason?: REASON;
  species?: SPECIES;
  stat?: STAT;
  stats?: STATS;
  status?: STATUS;
  timestamp?: TIMESTAMP;
  effect?: EFFECT;
  side?: SIDE;
  condition?: CONDITION;
  weather?: WEATHER;
  type?: TYPE;
  winner?: USER;
  genNum?: GENNUM;
  gameType?: GAMETYPE;
  previewSize?: NUMBER;
  turn?: NUMBER;
};

export type MajorArg = {
  from?: EFFECT;
  of?: POKEMON;
  wisher?: DETAILS;
  miss?: true;
  silent?: true;
};
