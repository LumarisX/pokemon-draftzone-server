import { MajorArg, ParsedArgs, REPLAY_ACTIONS, ReplayData } from ".";

type BaseReplayLine = {
  id: string;
  rawLine: string;
  raw: ReplayData;
  action: string;
  args: string[];
  parsedArgs: ParsedArgs;
  argValidation?: ArgValidationWarning;
  turnNumber: number;
};

export type ChildReplayLine = BaseReplayLine & {
  parent: ParentReplayLine;
};

export type ParentReplayLine = BaseReplayLine & {
  children: ChildReplayLine[];
};

export type ReplayLine = ParentReplayLine | ChildReplayLine;

export type ArgValidationWarning = {
  lineId: string;
  action: string;
  args: string[];
  message: string;
};

export type ParsedTurn = {
  number: number;
  lines: ReplayLine[];
};

export type ParsedReplayLog = {
  turns: ParsedTurn[];
  byAction: Record<string, string[]>;
  unknownActions: Record<string, number>;
  argValidationWarnings: ArgValidationWarning[];
};

type MajorArgHandler = (majorActions: MajorArg, value?: string) => void;

type MajorArgValueKey = "from" | "of" | "wisher";
type MajorArgFlagKey = "miss" | "silent";

function majorMap(key: MajorArgValueKey) {
  return (majorActions: MajorArg, value?: string) => {
    if (value !== undefined) {
      (majorActions as Record<string, string>)[key] = value;
    }
  };
}

function majorFlag(key: MajorArgFlagKey) {
  return (majorActions: MajorArg) => {
    majorActions[key] = true;
  };
}

const MAJOR_ARG_HANDLERS: Record<keyof MajorArg, MajorArgHandler> = {
  from: majorMap("from"),
  of: majorMap("of"),
  wisher: majorMap("wisher"),
  miss: majorFlag("miss"),
  silent: majorFlag("silent"),
};

function isMajorArgKey(key: string): key is keyof MajorArg {
  return key in MAJOR_ARG_HANDLERS;
}

function extractMajorActions(args: string[]) {
  const majorActions: MajorArg = {};
  const remainingArgs: string[] = [];
  for (const arg of args) {
    if (!arg.startsWith("[")) {
      remainingArgs.push(arg);
      continue;
    }

    const [rawKey, value] = arg.split("] ");
    const key = rawKey.slice(1);
    if (isMajorArgKey(key)) {
      MAJOR_ARG_HANDLERS[key](majorActions, value);
    }
  }
  return { majorActions, remainingArgs };
}

export const ACTION_PARSE_ARGS: Record<
  (typeof REPLAY_ACTIONS)[number],
  readonly (keyof ParsedArgs)[]
> = {
  "-ability": ["pokemon", "ability"],
  "-activate": ["pokemon", "effect"],
  "-anim": [],
  "-block": ["pokemon", "effect", "move", "attacker"],
  "-boost": ["pokemon", "stat", "amount"],
  "-burst": ["pokemon", "species", "item"],
  "-center": [],
  "-clearallboost": [],
  "-clearboost": ["pokemon"],
  "-clearnegativeboost": ["pokemon"],
  "-clearpositiveboost": ["target", "pokemon", "effect"],
  "-combine": [],
  "-copyboost": ["source", "target"],
  "-crit": ["pokemon"],
  "-curestatus": ["pokemon", "status"],
  "-cureteam": ["pokemon"],
  "-damage": ["pokemon", "hpStatus"],
  "-end": ["pokemon", "effect"],
  "-endability": ["pokemon"],
  "-enditem": ["pokemon", "item"],
  "-fail": ["pokemon", "action"],
  "-fieldactivate": [],
  "-fieldend": ["condition"],
  "-fieldstart": ["condition"],
  "-formechange": ["pokemon", "details", "hpStatus"],
  "-heal": ["pokemon", "hpStatus"],
  "-hint": ["message"],
  "-hitcount": ["pokemon", "num"],
  "-immune": ["pokemon"],
  "-invertboost": ["pokemon"],
  "-item": ["pokemon", "item"],
  "-mega": ["pokemon", "megaStone"],
  "-message": ["message"],
  "-miss": ["source", "target"],
  "-mustrecharge": ["pokemon"],
  "-notarget": ["pokemon"],
  "-prepare": ["attacker", "move", "defender"],
  "-primal": ["pokemon"],
  "-resisted": ["pokemon"],
  "-setboost": ["pokemon", "stat", "amount"],
  "-sethp": ["pokemon", "hp"],
  "-sideend": ["side", "condition"],
  "-sidestart": ["side", "condition"],
  "-singlemove": ["pokemon", "move"],
  "-singleturn": ["pokemon", "move"],
  "-start": ["pokemon", "effect"],
  "-status": ["pokemon", "status"],
  "-supereffective": ["pokemon"],
  "-swapboost": ["source", "target", "stats"],
  "-swapsideconditions": [],
  "-terastallize": ["pokemon", "type"],
  "-transform": ["pokemon", "species"],
  "-unboost": ["pokemon", "stat", "amount"],
  "-waiting": ["source", "target"],
  "-weather": ["weather", "reason"],
  "-zbroken": ["pokemon"],
  "-zpower": ["pokemon"],
  c: ["username", "message"],
  "c:": ["timestamp", "username", "message"],
  cant: ["pokemon", "reason", "move"],
  clearpoke: [],
  debug: ["message"],
  detailschange: ["pokemon", "details", "hpStatus"],
  drag: ["pokemon", "details", "hpStatus"],
  error: ["message"],
  faint: ["pokemon"],
  gametype: ["gameType"],
  gen: ["genNum"],
  html: ["message"],
  inactive: ["message"],
  inactiveoff: ["message"],
  j: ["username"],
  l: ["username"],
  message: ["message"],
  move: ["attacker", "move", "target"],
  n: ["username"],
  player: ["player", "username", "avatar", "rating"],
  poke: ["player", "details", "item"],
  rated: ["message"],
  raw: ["message"],
  replace: ["pokemon", "details", "hpStatus"],
  request: ["request"],
  rule: ["rule"],
  start: [],
  swap: ["pokemon", "position"],
  switch: ["pokemon", "details", "hpStatus"],
  "t:": ["timestamp"],
  teampreview: ["previewSize"],
  teamsize: ["player", "number"],
  tie: [],
  tier: ["formatName"],
  turn: ["turn"],
  uhtml: ["message"],
  upkeep: [],
  win: ["winner"],
};

export type KnownReplayAction = keyof typeof ACTION_PARSE_ARGS;

export const KNOWN_REPLAY_ACTIONS: ReadonlySet<
  (typeof REPLAY_ACTIONS)[number]
> = new Set(REPLAY_ACTIONS);

function isKnownReplayAction(action: string): action is KnownReplayAction {
  return KNOWN_REPLAY_ACTIONS.has(action as KnownReplayAction);
}

type ActionArgsParser = (args: string[]) => ParsedArgs;

const mapArgs =
  (...keys: (keyof ParsedArgs)[]): ActionArgsParser =>
  (args) => {
    const parsedArgs: ParsedArgs = {};
    keys.forEach((key, index) => {
      const value = args[index];
      if (value !== undefined) {
        (parsedArgs as Record<string, string>)[key] = value;
      }
    });
    return parsedArgs;
  };

function validateArgCount(
  lineId: string,
  action: string,
  args: string[],
): ArgValidationWarning | undefined {
  if (!isKnownReplayAction(action)) return undefined;
  if (args.length > 0)
    return {
      lineId,
      action,
      args,
      message: `Action ${action} has unexpected args: ${args.join("|")}.`,
    };
  return undefined;
}

function parseActionArgs(
  action: string,
  args: string[],
): {
  parsedArgs: ParsedArgs;
  remainingArgs: string[];
} {
  if (!isKnownReplayAction(action))
    return {
      parsedArgs: {},
      remainingArgs: [],
    };

  const parseArgs = ACTION_PARSE_ARGS[action];
  return {
    parsedArgs: mapArgs(...parseArgs)(args),
    remainingArgs: args.slice(parseArgs.length),
  };
}

function parseTurnNumber(line: ReplayLine): number | undefined {
  if (line.action !== "turn") return undefined;
  const [turnArg] = line.args;
  const parsed = Number(turnArg);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export class ReplayParseService {
  parse(log: string): ParsedReplayLog {
    const sourceLines = log
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    const lines: BaseReplayLine[] = sourceLines.map((rawLine, index) => {
      const normalized = rawLine.startsWith("|") ? rawLine.slice(1) : rawLine;
      const raw = normalized.split("|").map((segment) => segment.trim());
      const action = raw[0] ?? "";
      const args = raw.slice(1);
      const { parsedArgs, remainingArgs } = parseActionArgs(action, args);
      const { majorActions, remainingArgs: majorRemainingArgs } =
        extractMajorActions(remainingArgs);
      const id = `:${index}`;
      return {
        id,
        rawLine,
        raw,
        action,
        args,
        parsedArgs: { ...parsedArgs, ...majorActions },
        argValidation: validateArgCount(id, action, majorRemainingArgs),
        turnNumber: -1,
      };
    });

    const parentLines: ParentReplayLine[] = lines.reduce((parents, line) => {
      if (line.action.startsWith("-")) {
        const parent = parents[parents.length - 1];
        if (!parent) return parents;
        parent.children.push({ ...line, parent });
      } else {
        parents.push({ ...line, children: [] });
      }
      return parents;
    }, [] as ParentReplayLine[]);

    let currentTurnId: number = 1;

    const turns: ParsedTurn[] = parentLines.reduce(
      (turns, line) => {
        if (line.action === "turn") {
          turns.push({
            number: parseTurnNumber(line),
            lines: [],
          } as ParsedTurn);
          currentTurnId = 1;
        } else {
          const lastTurn = turns[turns.length - 1];
          if (lastTurn) {
            lastTurn.lines.push(line);
            line.turnNumber = lastTurn.number;
            line.id = `${lastTurn.number}:${currentTurnId++}`;
            line.children.forEach((child) => {
              child.turnNumber = lastTurn.number;
              child.id = `${lastTurn.number}:${currentTurnId++}`;
            });
          }
        }
        return turns;
      },
      [{ number: 0, lines: [] }] as ParsedTurn[],
    );

    const byAction: Record<string, string[]> = {};
    const unknownActions: Record<string, number> = {};
    const argValidationWarnings: ArgValidationWarning[] = [];
    lines.forEach((line) => {
      if (!line.action) return;
      if (!byAction[line.action]) byAction[line.action] = [];
      byAction[line.action].push(line.id);
      if (!isKnownReplayAction(line.action)) {
        unknownActions[line.action] = (unknownActions[line.action] ?? 0) + 1;
      }
      if (line.argValidation) {
        argValidationWarnings.push(line.argValidation);
      }
    });

    return {
      turns,
      byAction,
      unknownActions,
      argValidationWarnings,
    };
  }
}
