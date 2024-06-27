import { Generation, Generations } from "@pkmn/data";
import { Dex } from "@pkmn/dex";

export class Replay {
  replayData: ReplayData[] = [];

  constructor(data: string) {
    this.replayData = data
      .split("\n|")
      .map((line) => line.trim().split("|")) as ReplayData[];
  }

  analyze() {
    let gametype: undefined | GAMETYPE = undefined;
    let playerData: {
      username: undefined | string;
      teamSize: undefined | number;
      totalKills: number;
      totalDeaths: number;
      team: Team[];
      win: boolean;
    }[] = [];
    let field: Field = [];
    let genNum: number = 9;
    let turn: number = 0;
    let t0: number = 0;
    let tf: number = 0;
    let events: string[] = [];
    let lastMove: ReplayData = [""];
    let lastDamage: number = -1;
    for (let i = 0; i < this.replayData.length; i++) {
      let lineData = this.replayData[i];
      switch (lineData[0]) {
        case "":
          break;
        case "-damage":
          lastDamage = i;
          let damagePosition = this.getMonByFieldPos(field, lineData[1]);
          if (damagePosition) {
            let newDamage = +lineData[2].split(" ")[0].split("/")[0];
            let damageDiff = damagePosition.hpp - newDamage;
            damagePosition.hpp = newDamage;
            if (lastMove[0] === "move") {
              let moveDamagePosition = this.getMonByFieldPos(
                field,
                lastMove[1]
              );
              if (moveDamagePosition) {
                moveDamagePosition.damageDealt += damageDiff;
              }
            }
          }
          break;
        case "t:":
          if (t0) {
            tf = +lineData[1];
          } else {
            t0 = +lineData[1];
          }
          break;
        case "move":
          lastMove = lineData;
          break;
        case "turn":
          turn = +lineData[1];
          break;
        case "upkeep":
          break;
        case "-anim":
          break;
        case "drag":
        case "switch":
          let switchPlayer = +lineData[1].charAt(1) - 1;
          let switchedMon = playerData[switchPlayer].team.find(
            (mon) => mon.detail == lineData[2]
          );
          if (switchedMon) {
            if (!switchedMon.brought) {
              switchedMon.brought = true;
              switchedMon.name = lineData[1].split(" ")[1];
            }
          } else {
            playerData[switchPlayer].team.push({
              detail: lineData[2],
              name: lineData[1].split(" ")[1],
              hpp: 100,
              hpRestored: 0,
              damageDealt: 0,
              damageTaken: 0,
              kills: [0, 0],
              fainted: false,
              brought: true,
            });
          }

          field[switchPlayer][lineData[1].charAt(2) as PPosition].mon =
            playerData[switchPlayer].team.find(
              (mon) => mon.detail == lineData[2]
            );
          break;
        case "c:":
        case "c":
          break;
        case "debug":
          break;
        case "inactive":
          break;
        case "-boost":
          break;
        case "-resisted":
          break;
        case "poke":
          playerData[this.getPlayer(lineData[1])].team.push({
            detail: lineData[2],
            name: "",
            hpp: 100,
            hpRestored: 0,
            damageDealt: 0,
            damageTaken: 0,
            kills: [0, 0],
            fainted: false,
            brought: false,
          });
          break;
        case "-start":
          break;
        case "-heal":
          let [healIdentifier, healName] = lineData[1].split(": ");
          let healPosition =
            healIdentifier.length > 2
              ? this.getMonByFieldPos(field, lineData[1])
              : playerData[+healIdentifier.charAt(1)].team.find(
                  (mon) => mon.name == healName
                );
          if (healPosition) {
            let newHealth = +lineData[2].split(" ")[0].split("/")[0];
            let healthDiff = newHealth - healPosition.hpp;
            healPosition.hpp = newHealth;
            healPosition.fainted = false;
            healPosition.hpRestored += healthDiff;
          }
          break;
        case "rule":
          break;
        case "faint":
          let faintPosition = this.getMonByFieldPos(field, lineData[1]);
          if (faintPosition) {
            faintPosition.fainted = true;
            let faintString = `Turn ${turn}: ${
              playerData[+lineData[1].charAt(1) - 1].username
            }'s ${faintPosition.detail.split(", ")[0]} fainted`;
            if (
              lastDamage > 0 &&
              this.replayData[lastDamage][1] === lineData[1]
            ) {
              let lastFaintDamage = this.replayData[lastDamage];
              if (lastFaintDamage.length > 3) {
                for (let j = 3; j < lastFaintDamage.length; j++) {
                  let [first, ...rest] = lastFaintDamage[j].split(" ");
                  let faintStatus = rest.join(" ");
                  faintString += ` from ${faintStatus}`;
                  if (lastFaintDamage[1]) {
                    let faintSideStatus = field[
                      +lastFaintDamage[1].charAt(1) - 1
                    ].sideStatus.find(
                      (s) => s.status.split(": ")[1] === faintStatus
                    );
                    console.log(JSON.stringify(field, null, 2));
                    if (faintSideStatus) {
                      faintSideStatus.setter.kills[1]++;
                      faintString += ` indirectly by ${
                        faintSideStatus.setter.detail.split(", ")[0]
                      } `;
                    }
                  }
                }
              } else {
                if (lastMove[0] === "move") {
                  let faintAttacker = this.getMonByFieldPos(field, lastMove[1]);
                  faintString += ` from ${lastMove[2]} by ${
                    playerData[+lastMove[1].charAt(1) - 1].username
                  }'s`;
                  if (faintAttacker) {
                    faintAttacker.kills[0]++;
                    faintString += ` ${faintAttacker.detail.split(", ")[0]}`;
                  } else {
                    faintString += `${lastMove[1].split(": ")[1]}`;
                  }
                } else {
                  console.log(lineData);
                }
              }
            } else {
              if (lastMove[0] === "move") {
                let gens = new Generations(Dex);
                let faintMove = gens.get(genNum).dex.moves.get(lastMove[2]);
                if ("selfdestruct" in faintMove) {
                  faintString += ` itself by using ${faintMove.name}`;
                }
              }
            }
            events.push(faintString);
          } else {
            console.log(lineData);
          }
          break;
        case "j":
          break;
        case "-ability":
          break;
        case "-unboost":
          break;
        case "-immune":
          break;
        case "-supereffective":
          break;
        case "player":
          if (lineData[2]) {
            playerData.push({
              username: lineData[2],
              teamSize: 0,
              totalKills: 0,
              totalDeaths: 0,
              team: [],
              win: false,
            });
            field.push({
              a: { mon: undefined, vStatus: [] },
              b: { mon: undefined, vStatus: [] },
              sideStatus: [],
            });
          }
          break;
        case "teamsize":
          playerData[this.getPlayer(lineData[1])].teamSize = +lineData[2];
          break;
        case "-formechange":
        case "detailschange":
          let detailField = this.getMonByFieldPos(field, lineData[1]);
          if (detailField) {
            detailField.detail = lineData[2];
          }
          break;
        case "-activate":
          break;
        case "-status":
          break;
        case "-weather":
          break;
        case "-crit":
          break;
        case "-miss":
          break;
        case "cant":
          break;
        case "l":
          break;
        case "raw":
        case "html":
        case "uhtml":
          break;
        case "-item":
          break;
        case "-enditem":
          break;
        case "gametype":
          gametype = lineData[1];
          break;
        case "gen":
          genNum = +lineData[1];
          break;
        case "tier":
          break;
        case "clearpoke":
          break;
        case "teampreview":
          break;
        case "-singlemove":
          break;
        case "-singleturn":
          break;
        case "start":
          break;
        case "-mega":
          break;
        case "-terastallize":
          break;
        case "-fieldactivate":
          break;
        case "-hint":
        case "message":
        case "-message":
          break;
        case "-end":
          break;
        case "-sidestart":
          let sideParent = this.getParent(i);
          if (sideParent[0] == "move") {
            let sideMon = this.getMonByFieldPos(field, sideParent[1]);
            if (sideMon) {
              field[+lineData[1].charAt(1) - 1].sideStatus.push({
                status: lineData[2],
                setter: sideMon,
              });
            }
          }
          break;
        case "-sideend":
          field[+lineData[1].charAt(1) - 1].sideStatus.splice(
            field[+lineData[1].charAt(1) - 1].sideStatus.findIndex(
              (s) => s.status === lineData[2]
            ),
            1
          );

          break;
        case "-fieldstart":
          break;
        case "-fieldend":
          break;
        case "win":
          let winPlayer = playerData.find(
            (player) => player.username == lineData[1]
          );
          if (winPlayer) winPlayer.win = true;
          break;
        case "rated":
          break;
        default:
          console.log(`Error: unknown identifier '${lineData[0]}'`);
      }
    }
    playerData.forEach(
      (player) =>
        (player.totalKills = player.team.reduce(
          (sum, mon) => sum + mon.kills[0] + mon.kills[1],
          0
        ))
    );
    playerData.forEach(
      (player) =>
        (player.totalDeaths = player.team.reduce(
          (sum, mon) => sum + (mon.fainted ? 1 : 0),
          0
        ))
    );
    // console.log(JSON.stringify(playerData, undefined, 2));
    let seconds = tf - t0;
    console.log(
      `${gametype} | Gen ${genNum} | ${turn} turns | Game time: ${Math.floor(
        seconds / 60
      )} minutes ${seconds % 60} seconds`
    );
    console.log(events);
  }

  private getPlayer(position: string): number {
    return +position.charAt(1) - 1;
  }

  private getMonByFieldPos(field: Field, pos: POKEMON): Team | undefined {
    return field[+pos.charAt(1) - 1][pos.charAt(2) as PPosition].mon;
  }

  private getParent(index: number) {
    for (let i = index - 1; i > 0; i--) {
      if (this.replayData[i][0].charAt(0) !== "-") return this.replayData[i];
    }
    return [];
  }

  guessTeams() {}
}

type Team = {
  detail: string;
  name: string;
  hpp: number;
  kills: [number, number];
  damageDealt: number;
  damageTaken: number;
  hpRestored: number;
  fainted: boolean;
  brought: boolean;
};

type Field = {
  a: {
    mon: undefined | Team;
    vStatus: { status: string; setter: string }[];
  };
  b: {
    mon: undefined | Team;
    vStatus: { status: string; setter: string }[];
  };
  sideStatus: { status: string; setter: Team }[];
}[];

type ABILITY = string;
type ACTION = string;
type AMOUNT = string;
type ATTACKER = string;
type AVATAR = string;
type CONDITION = string;
type DEFENDER = string;
type DESCRIPTION = string;
type DETAILS = string;
type EFFECT = string;
type FORMATNAME = string;
type FROMEFFECT = `[from] ${EFFECT}`;
type GAMETYPE = `singles` | `doubles` | `triples` | `multi` | `freeforall`;
type GENNUM = string;
type HP = string;
type HPSTATUS = `${HP} ${STATUS}`;
type ITEM = "item" | "";
type MEGASTONE = string;
type MESSAGE = string;
type MOVE = string;
type NUM = string;
type NUMBER = string;
type PLAYER = string;
type POKEMON = `p${PPlayer}${PPosition}: ${string}`;
type POSITION = "0" | "1" | "2";
type PPlayer = "1" | "2" | "3" | "4";
type PPosition = "a" | "b";
type RATING = string;
type REASON = string;
type REQUEST = string;
type SIDE = string;
type SOURCE = string;
type SPECIES = string;
type STAT = string;
type STATS = string;
type STATUS = string;
type TARGET = string;
type TIMESTAMP = string;
type USER = string;
type USERNAME = string;
type WEATHER = string;

type ReplayData =
  | [""]
  | ["-ability", POKEMON, ABILITY, FROMEFFECT]
  | ["-ability", POKEMON, ABILITY]
  | ["-activate", EFFECT]
  | ["-anim"]
  | ["-block", POKEMON, EFFECT, MOVE, ATTACKER]
  | ["-boost", POKEMON, STAT, AMOUNT]
  | ["-burst", POKEMON, SPECIES, ITEM]
  | ["-center"]
  | ["-clearallboost"]
  | ["-clearboost", POKEMON]
  | ["-clearnegativeboost", POKEMON]
  | ["-clearpositiveboost", TARGET, POKEMON, EFFECT]
  | ["-combine"]
  | ["-copyboost", SOURCE, TARGET]
  | ["-crit", POKEMON]
  | ["-curestatus", POKEMON, STATUS]
  | ["-cureteam", POKEMON]
  | ["-damage", POKEMON, HPSTATUS, FROMEFFECT]
  | ["-damage", POKEMON, HPSTATUS]
  | ["-end", POKEMON, EFFECT]
  | ["-endability", POKEMON]
  | ["-enditem", POKEMON, ITEM, FROMEFFECT]
  | ["-enditem", POKEMON, ITEM]
  | ["-fail", POKEMON, ACTION]
  | ["-fieldactivate"]
  | ["-fieldend", CONDITION]
  | ["-fieldstart", CONDITION]
  | ["-heal", POKEMON, HPSTATUS]
  | ["-hint", MESSAGE]
  | ["-hitcount", POKEMON, NUM]
  | ["-immune", POKEMON]
  | ["-invertboost", POKEMON]
  | ["-item", POKEMON, ITEM, FROMEFFECT]
  | ["-item", POKEMON, ITEM]
  | ["-mega", POKEMON, MEGASTONE]
  | ["-message", MESSAGE]
  | ["-miss", SOURCE, TARGET]
  | ["-mustrecharge", POKEMON]
  | ["-notarget", POKEMON]
  | ["-prepare", ATTACKER, MOVE, DEFENDER]
  | ["-prepare", ATTACKER, MOVE]
  | ["-primal", POKEMON]
  | ["-resisted", POKEMON]
  | ["-setboost", POKEMON, STAT, AMOUNT]
  | ["-sethp", POKEMON, HP]
  | ["-sideend", SIDE, CONDITION]
  | ["-sidestart", SIDE, CONDITION]
  | ["-singlemove", POKEMON, MOVE]
  | ["-singleturn", POKEMON, MOVE]
  | ["-start", POKEMON, EFFECT]
  | ["-status", POKEMON, STATUS]
  | ["-supereffective", POKEMON]
  | ["-swapboost", SOURCE, TARGET, STATS]
  | ["-swapsideconditions"]
  | ["-terastallize"]
  | ["-transform", POKEMON, SPECIES]
  | ["-unboost", POKEMON, STAT, AMOUNT]
  | ["-waiting", SOURCE, TARGET]
  | ["-weather", WEATHER]
  | ["-zbroken", POKEMON]
  | ["-zpower", POKEMON]
  | ["c"]
  | ["c:"]
  | ["cant", POKEMON, REASON]
  | ["cant", POKEMON, REASON, MOVE]
  | ["clearpoke"]
  | ["debug"]
  | ["detailschange" | "-formechange", POKEMON, DETAILS, HPSTATUS]
  | ["error", `[Invalid choice] ${MESSAGE}`]
  | ["error", `[Unavailable choice] ${MESSAGE}`]
  | ["faint", POKEMON]
  | ["gametype", GAMETYPE]
  | ["gen", GENNUM]
  | ["html"]
  | ["inactive" | "inactiveoff", MESSAGE]
  | ["j"]
  | ["l"]
  | ["message"]
  | ["move", POKEMON, MOVE, TARGET]
  | ["player", PLAYER, USERNAME, AVATAR, RATING]
  | ["poke", PLAYER, DETAILS, ITEM]
  | ["rated", MESSAGE]
  | ["raw"]
  | ["replace", POKEMON, DETAILS, HPSTATUS]
  | ["request", REQUEST]
  | ["rule", RULE: DESCRIPTION]
  | ["start"]
  | ["swap", POKEMON, POSITION]
  | ["switch" | "drag", POKEMON, DETAILS, HPSTATUS]
  | ["t:", TIMESTAMP]
  | ["teampreview"]
  | ["teamsize", PLAYER, NUMBER]
  | ["tie"]
  | ["tier", FORMATNAME]
  | ["turn", NUMBER]
  | ["uhtml"]
  | ["upkeep"]
  | ["win", USER];
