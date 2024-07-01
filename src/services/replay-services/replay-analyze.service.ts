import { Generations, ID } from "@pkmn/data";
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
    let playerData: Player[] = [];
    let field: Field = {
      sides: [],
      statuses: [],
      weather: { status: "none" },
    };
    let genNum: number = 9;
    let turn: number = 0;
    let t0: number = 0;
    let tf: number = 0;
    let events: { player: number; turn: number; message: string }[] = [];
    let lastMove: MoveData | undefined;
    let gens = new Generations(Dex);
    let gen = gens.dex;
    for (let i = 0; i < this.replayData.length; i++) {
      let lineData = this.replayData[i];
      switch (lineData[0]) {
        case "":
          break;
        case "-damage":
          let damagePosition = this.getMonByString(
            lineData[1],
            field,
            playerData
          );
          if (damagePosition) {
            damagePosition.lastDamage = { data: lineData, index: i };
            let newDamage = lineData[2].split(" ")[0].split("/");
            let newDamagePercent =
              +newDamage[0] > 0 ? +newDamage[0] / (+newDamage[1] / 100) : 0;
            let damageDiff = damagePosition.hpp - newDamagePercent;
            damagePosition.hpp = newDamagePercent;
            if (lastMove) {
              let moveDamagePosition = this.getMonByString(
                lastMove[1],
                field,
                playerData
              );
              if (moveDamagePosition && moveDamagePosition != damagePosition) {
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
          if (lineData[2] === "Future Sight") {
            console.log(lineData);
          }
          break;
        case "turn":
          turn = +lineData[1];
          break;
        case "upkeep":
          break;
        case "-anim":
          break;
        case "replace":
        case "drag":
        case "switch":
          let switchPlayer = +lineData[1].charAt(1) - 1;
          let switchedMon = playerData[switchPlayer].team.find((mon) => {
            if (!mon.brought) {
              return new RegExp(
                String.raw`^${mon.detail.replace("*", "\\w+")}`
              ).test(lineData[2] as string);
            } else {
              let detailSet = new Set(lineData[2]!.split(", "));
              return mon.detail.split(", ").every((e) => detailSet.has(e));
            }
          });
          if (switchedMon) {
            if (!switchedMon.brought) {
              switchedMon.brought = true;
              switchedMon.detail = lineData[2];
              switchedMon.nickname = lineData[1].split(" ")[1];
              switchedMon.pid = gen.species.get(lineData[2].split(",")[0])?.id;
            }
          } else {
            playerData[switchPlayer].team.push({
              detail: lineData[2],
              nickname: lineData[1].split(" ")[1],
              hpp: 100,
              pid: gen.species.get(lineData[2].split(",")[0])?.id,
              hpRestored: 0,
              lastDamage: undefined,
              damageDealt: 0,
              damageTaken: 0,
              kills: [0, 0],
              player: playerData[switchPlayer],
              status: { status: "healthy" },
              statuses: [],
              fainted: false,
              brought: true,
            });
          }

          field.sides[switchPlayer][lineData[1].charAt(2) as PPosition].mon =
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
            nickname: "",
            hpp: 100,
            pid: gen.species.get(lineData[2].split(",")[0])?.id,
            hpRestored: 0,
            damageDealt: 0,
            lastDamage: undefined,
            damageTaken: 0,
            player: playerData[this.getPlayer(lineData[1])],
            status: { status: "healthy" },
            statuses: [],
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
              ? this.getMonByString(lineData[1], field, playerData)
              : playerData[+healIdentifier.charAt(1)].team.find(
                  (mon) => mon.nickname == healName
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
          let faintPosition = this.getMonByString(
            lineData[1],
            field,
            playerData
          );
          if (faintPosition) {
            faintPosition.fainted = true;
            let faintString = `${
              playerData[+lineData[1].charAt(1) - 1].username
            }'s ${faintPosition.detail.split(", ")[0]} fainted`;
            if (
              faintPosition.lastDamage &&
              faintPosition.lastDamage.data[1] === lineData[1]
            ) {
              if (faintPosition.lastDamage.data[3]) {
                let faintStatus = faintPosition.lastDamage.data[3]
                  .substring(7)
                  .split(": ");
                if (faintStatus.length === 1) {
                  let faintSideStatus = this.searchStatuses(
                    field,
                    faintPosition,
                    faintStatus[0]
                  );
                  faintString += ` from ${
                    faintSideStatus && faintSideStatus.name
                      ? faintSideStatus.name
                      : faintStatus[0]
                  }`;
                  if (faintSideStatus && faintSideStatus.setter) {
                    if (faintSideStatus.setter === faintPosition) {
                      faintString += ` self-inflicted`;
                    } else {
                      let faintOwnKill = this.checkOwnKill(
                        faintSideStatus.setter,
                        faintPosition,
                        playerData
                      );
                      if (faintOwnKill != "self") {
                        faintString += ` indirectly by ${
                          faintSideStatus.setter.player.username
                        }'s ${faintSideStatus.setter.detail.split(", ")[0]} `;
                        if (faintOwnKill != "ff") {
                          faintSideStatus.setter.kills[1]++;
                        }
                      }
                    }
                  }
                } else {
                  faintString += ` from ${faintStatus.slice(1).join(" ")}`;
                  if (faintPosition.lastDamage.data[4]) {
                    let faintAttacker = this.getMonByString(
                      this.ofP2P(faintPosition.lastDamage.data[4]),
                      field,
                      playerData
                    );
                    if (faintAttacker) {
                      let faintOwnKill = this.checkOwnKill(
                        faintAttacker,
                        faintPosition,
                        playerData
                      );
                      if (faintOwnKill != "self") {
                        faintString += ` indirectly by ${
                          faintAttacker.player.username
                        }'s ${faintAttacker.detail.split(", ")[0]} `;
                        if (faintOwnKill != "ff") {
                          faintAttacker.kills[1]++;
                        }
                      }
                    }
                  }
                }
              } else {
                let faintParent = this.getParent(
                  faintPosition.lastDamage.index
                );
                if (lastMove) {
                  let faintAttacker = this.getMonByString(
                    lastMove[1],
                    field,
                    playerData
                  );
                  faintString += ` from ${lastMove[2]}`;
                  if (faintAttacker) {
                    let faintOwnKill = this.checkOwnKill(
                      faintAttacker,
                      faintPosition,
                      playerData
                    );
                    if (faintOwnKill != "self") {
                      faintString += ` by ${
                        playerData[+lastMove[1].charAt(1) - 1].username
                      }'s ${faintAttacker.detail.split(", ")[0]}`;
                      if (faintOwnKill != "ff") {
                        faintAttacker.kills[0]++;
                      }
                    }
                  } else {
                    faintString += ` by ${lastMove[1].split(": ")[1]}`;
                  }
                } else {
                }
              }
            } else {
              if (lastMove) {
                let faintMove = gen.moves.get(lastMove[2]);
                if ("selfdestruct" in faintMove) {
                  faintString += ` itself by using ${faintMove.name}`;
                }
              }
            }
            events.push({
              player: +lineData[1].charAt(1),
              turn: turn,
              message: faintString,
            });
          } else {
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
          if (
            lineData[2] &&
            !playerData.find((player) => player.username === lineData[2])
          ) {
            playerData.push({
              username: lineData[2],
              teamSize: 0,
              totalKills: 0,
              totalDeaths: 0,
              team: [],
              win: false,
            });
            field.sides.push({
              a: { mon: undefined, statuses: [] },
              b: { mon: undefined, statuses: [] },
              c: { mon: undefined, statuses: [] },
              statuses: [],
            });
          }
          break;
        case "teamsize":
          playerData[this.getPlayer(lineData[1])].teamSize = +lineData[2];
          break;
        case "-formechange":
        case "detailschange":
          let detailField = this.getMonByString(lineData[1], field, playerData);
          if (detailField) {
            detailField.detail = lineData[2];
            detailField.pid = gen.species.get(lineData[2].split(",")[0])?.id;
          }
          break;
        case "-activate":
          break;
        case "-status":
          let statusPosition = this.getMonByString(
            lineData[1],
            field,
            playerData
          );
          if (statusPosition) {
            let statusStart: Status = { status: lineData[2] };
            switch (lineData[2]) {
              case "tox":
                statusStart = { status: "psn", name: "Toxic" };
                break;
              case "psn":
                statusStart = { status: "psn", name: "Poison" };
                break;
              case "brn":
                statusStart = { status: "brn", name: "Burn" };
                break;
            }
            if (lineData[3]) {
              if (lineData[3].startsWith("[from] item: ")) {
                statusStart.setter = statusPosition;
              } else if (lastMove && lastMove[3] === lineData[1]) {
                statusStart.setter = this.getMonByString(
                  lastMove[1],
                  field,
                  playerData
                );
              } else if (lineData[4]) {
                statusStart.setter = this.getMonByString(
                  this.ofP2P(lineData[4]),
                  field,
                  playerData
                );
              }
            } else {
              let statusParent = this.getParent(i);
              if (
                statusParent.main[0] === "switch" &&
                statusStart.status === "psn"
              ) {
                statusStart.setter = field.sides[
                  +lineData[1].charAt(1) - 1
                ].statuses.find(
                  (status) => status.status === "move: Toxic Spikes"
                )?.setter;
              } else if (statusParent.main[0] === "move") {
                let statusOnProtect = statusParent.sub.find(
                  (sub) => sub[0] === "-activate" && sub[2] === "move: Protect"
                );
                if (statusOnProtect && statusOnProtect[0] === "-activate") {
                  statusStart.setter = this.getMonByString(
                    statusOnProtect[1],
                    field,
                    playerData
                  );
                } else {
                  statusStart.setter = this.getMonByString(
                    statusParent.main[1],
                    field,
                    playerData
                  );
                }
              }
            }

            statusPosition.statuses.push(statusStart);
          }
          break;
        case "-weather":
          if (lineData[1] !== field.weather.status) {
            let weatherStatus: Status = { status: lineData[1] };
            if (lineData.length > 3 && typeof lineData[3] === "string") {
              let weatherPosition = this.getMonByString(
                this.ofP2P(lineData[3]),
                field,
                playerData
              );
              weatherStatus.setter = weatherPosition;
            } else {
              if (lastMove) {
                let weatherPosition = this.getMonByString(
                  lastMove[1],
                  field,
                  playerData
                );
                weatherStatus.setter = weatherPosition;
              }
            }
            field.weather = weatherStatus;
          }
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
        case "-transform":
          break;
        case "-block":
          break;
        case "-burst":
          break;
        case "-center":
          break;
        case "-clearallboost":
          break;
        case "-clearboost":
          break;
        case "-clearnegativeboost":
          break;
        case "-clearpositiveboost":
          break;
        case "-combine":
          break;
        case "-swapsideconditions":
          break;
        case "error":
          break;
        case "tie":
          break;
        case "-copyboost":
          break;
        case "-curestatus":
          let curePosition = this.getMonByString(
            lineData[1],
            field,
            playerData
          );
          if (curePosition) {
            curePosition.status = { status: "healthy" };
          }
          break;
        // case "-cureteam":
        //   break;
        case "-endability":
          break;
        case "-fail":
          break;
        case "-hitcount":
          break;
        case "-invertboost":
          break;
        case "-mustrecharge":
          break;
        case "-notarget":
          break;
        case "-prepare":
          break;
        case "-primal":
          break;
        case "-setboost":
          break;
        case "-sethp":
          break;
        case "-swapboost":
          break;
        case "-waiting":
          break;
        case "-zbroken":
          break;
        case "-zpower":
          break;
        case "inactiveoff":
          break;
        case "request":
          break;
        case "swap":
          let swapSide = field.sides[+lineData[1].charAt(1) - 1];
          [
            swapSide[lineData[1].charAt(2) as PPosition],
            swapSide[["a", "b", "c"][+lineData[2]] as PPosition],
          ] = [
            swapSide[["a", "b", "c"][+lineData[2]] as PPosition],
            swapSide[lineData[1].charAt(2) as PPosition],
          ];
          break;
        case "-mega":
          break;
        case "-terastallize":
          let teraMon = this.getMonByString(lineData[1], field, playerData);
          if (teraMon) {
            teraMon.detail += `, tera:${lineData[2]}`;
          }
          break;
        case "-fieldactivate":
          break;
        case "-hint":
        case "message":
          break;
        case "-message":
          events.push({ player: 0, turn: turn, message: `${lineData[1]}` });
          break;
        case "-end":
          break;
        case "-sidestart":
          let sideParent = this.getParent(i);
          if (sideParent.main[0] == "move") {
            let sideMon = this.getMonByString(
              sideParent.main[1],
              field,
              playerData
            );
            if (sideMon) {
              field.sides[+lineData[1].charAt(1) - 1].statuses.push({
                status: lineData[2],
                setter: sideMon,
              });
            }
          }
          break;
        case "-sideend":
          field.sides[+lineData[1].charAt(1) - 1].statuses.splice(
            field.sides[+lineData[1].charAt(1) - 1].statuses.findIndex(
              (s) => s.status === lineData[2]
            ),
            1
          );

          break;
        case "-fieldstart":
          let fieldStartStatus: Status = { status: lineData[1] };
          if (lineData[3]) {
            let fieldStartSetter = this.getMonByString(
              this.ofP2P(lineData[3]),
              field,
              playerData
            );
            if (fieldStartSetter) {
              fieldStartStatus.setter = fieldStartSetter;
            }
          }
          field.statuses.push(fieldStartStatus);
          break;
        case "-fieldend":
          field.statuses.splice(
            field.statuses.findIndex((status) => status.status === lineData[1]),
            1
          );
          break;
        case "win":
          let winPlayer = playerData.findIndex(
            (player) => player.username == lineData[1]
          );
          if (winPlayer >= 0) {
            playerData[winPlayer].win = true;
            events.push({
              turn: turn,
              player: winPlayer + 1,
              message: `${lineData[1]} wins`,
            });
          }
          break;
        case "n":
          break;
        case "rated":
          break;
        default:
          console.log(lineData);
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
    let gameTime = tf - t0;
    return {
      gametype: gametype,
      genNum: genNum,
      turns: turn,
      gameTime: gameTime,
      stats: playerData,
      events: events,
    };
  }

  private getPlayer(position: string): number {
    return +position.charAt(1) - 1;
  }

  private getMonByString(
    pos: POKEMON,
    field: Field,
    playerData: Player[]
  ): Mon | undefined {
    if (
      pos.charAt(2) === "a" ||
      pos.charAt(2) === "b" ||
      pos.charAt(2) === "c"
    ) {
      return field.sides[+pos.charAt(1) - 1][pos.charAt(2) as PPosition].mon;
    } else {
      return playerData[+pos.charAt(1) - 1].team.find(
        (mon) => mon.nickname === pos.substring(4)
      );
    }
  }

  private getParent(index: number): { main: ReplayData; sub: ReplayData[] } {
    let data = { main: this.replayData[index], sub: [] as ReplayData[] };
    for (let i = index; i > 0; i--) {
      if (this.replayData[i][0].charAt(0) !== "-") {
        data.main = this.replayData[i];
        i = 0;
      } else {
        data.sub.push(this.replayData[i]);
      }
    }
    return data;
  }

  private searchStatuses(
    field: Field,
    mon: Mon,
    status: string
  ): Status | undefined {
    if (mon.status.status === status) {
      return field.weather;
    }
    if (mon.lastDamage && mon.lastDamage.data[1]) {
      let monStatus = mon.statuses.find((s) => s.status === status);
      if (monStatus) return monStatus;
    }
    if (field.weather.status === status) {
      return field.weather;
    }
    if (mon.lastDamage && mon.lastDamage.data[1]) {
      let sideStatus = field.sides[
        +mon.lastDamage.data[1].charAt(1) - 1
      ].statuses.find((s) => s.status.split(": ")[1] === status);
      if (sideStatus) return sideStatus;
    }
    return;
  }

  private checkOwnKill(
    attacker: Mon | undefined,
    fainter: Mon | undefined,
    playerData: Player[]
  ): "self" | "ff" | "opp" {
    if (attacker === fainter) {
      return "self";
    }
    return playerData.find(
      (player) => attacker && player.team.includes(attacker)
    ) === playerData.find((player) => fainter && player.team.includes(fainter))
      ? "ff"
      : "opp";
  }

  private ofP2P(ofPokemon: OFPOKEMON): POKEMON {
    return ofPokemon.substring(5) as POKEMON;
  }
}

type Mon = {
  detail: string;
  nickname: string;
  pid: ID | undefined;
  hpp: number;
  kills: [number, number];
  damageDealt: number;
  damageTaken: number;
  hpRestored: number;
  lastDamage:
    | {
        data:
          | ["-damage", POKEMON, HPSTATUS]
          | ["-damage", POKEMON, HPSTATUS, FROMEFFECT]
          | ["-damage", POKEMON, HPSTATUS, FROMEFFECT, OFPOKEMON];
        index: number;
      }
    | undefined;

  fainted: boolean;
  brought: boolean;
  status: Status;
  player: Player;
  statuses: Status[];
};

type Side = {
  a: {
    mon: undefined | Mon;
    statuses: Status[];
  };
  b: {
    mon: undefined | Mon;
    statuses: Status[];
  };
  c: {
    mon: undefined | Mon;
    statuses: Status[];
  };
  statuses: Status[];
};

type Status = { status: string; setter?: Mon; name?: string };

type Field = {
  sides: Side[];
  statuses: Status[];
  weather: Status;
};

type Player = {
  username: undefined | string;
  teamSize: undefined | number;
  totalKills: number;
  totalDeaths: number;
  team: Mon[];
  win: boolean;
};

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
type OFPOKEMON = `[of] ${POKEMON}`;
type PLAYER = string;
type POKEMON = `p${PPlayer}${PPosition}: ${string}` | `p${PPlayer}: ${string}`;
type POSITION = "0" | "1" | "2";
type PPlayer = "1" | "2" | "3" | "4";
type PPosition = "a" | "b" | "c";
type RATING = string;
type REASON = string;
type REQUEST = string;
type RULE = string;
type SIDE = string;
type SOURCE = string;
type SPECIES = string;
type STAT = string;
type STATS = string;
type STATUS = string;
type TARGET = string;
type TIMESTAMP = string;
type TYPE = string;
type USER = string;
type USERNAME = string;
type WEATHER = string;

type MoveData = ["move", POKEMON, MOVE, TARGET];
type ReplayData =
  | [""]
  | ["-ability", POKEMON, ABILITY, FROMEFFECT]
  | ["-ability", POKEMON, ABILITY]
  | ["-activate", POKEMON, EFFECT]
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
  | ["-damage", POKEMON, HPSTATUS]
  | ["-damage", POKEMON, HPSTATUS, FROMEFFECT]
  | ["-damage", POKEMON, HPSTATUS, FROMEFFECT, OFPOKEMON]
  | ["-end", POKEMON, EFFECT]
  | ["-endability", POKEMON]
  | ["-enditem", POKEMON, ITEM, FROMEFFECT]
  | ["-enditem", POKEMON, ITEM]
  | ["-fail", POKEMON, ACTION]
  | ["-fieldactivate"]
  | ["-fieldend", CONDITION]
  | ["-fieldstart", CONDITION]
  | ["-fieldstart", CONDITION, FROMEFFECT]
  | ["-fieldstart", CONDITION, FROMEFFECT, OFPOKEMON]
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
  | ["-status", POKEMON, STATUS, FROMEFFECT]
  | ["-status", POKEMON, STATUS, FROMEFFECT, OFPOKEMON]
  | ["-supereffective", POKEMON]
  | ["-swapboost", SOURCE, TARGET, STATS]
  | ["-swapsideconditions"]
  | ["-terastallize", POKEMON, TYPE]
  | ["-transform", POKEMON, SPECIES]
  | ["-unboost", POKEMON, STAT, AMOUNT]
  | ["-waiting", SOURCE, TARGET]
  | ["-weather", WEATHER]
  | ["-weather", WEATHER, FROMEFFECT, OFPOKEMON]
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
  | MoveData
  | ["n"]
  | ["player", PLAYER, USERNAME, AVATAR, RATING]
  | ["poke", PLAYER, DETAILS, ITEM]
  | ["rated", MESSAGE]
  | ["raw"]
  | ["request", REQUEST]
  | ["rule", `${RULE}: ${DESCRIPTION}`]
  | ["start"]
  | ["swap", POKEMON, POSITION]
  | ["switch" | "drag" | "replace", POKEMON, DETAILS, HPSTATUS]
  | ["t:", TIMESTAMP]
  | ["teampreview"]
  | ["teamsize", PLAYER, NUMBER]
  | ["tie"]
  | ["tier", FORMATNAME]
  | ["turn", NUMBER]
  | ["uhtml"]
  | ["upkeep"]
  | ["win", USER];
