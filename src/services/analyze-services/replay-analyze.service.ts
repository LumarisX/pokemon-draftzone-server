import * as fs from "fs";

export class Replay {
  replayData: ReplayData[] = [];

  constructor(pathString: string) {
    let data = fs.readFileSync(pathString, "utf8");
    this.replayData = data
      .split("\n|")
      .map((line) => line.trim().split("|")) as ReplayData[];
  }

  analyze() {
    let gametype: undefined | Gametype = undefined;
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
    let playerData: {
      username: undefined | string;
      teamSize: undefined | number;
      totalKills: number;
      totalDeaths: number;
      team: Team[];
      win: boolean;
    }[] = [];

    let field: {
      a: {
        mon: undefined | Team;
        vStatus: { status: string; setter: string }[];
      };
      b: {
        mon: undefined | Team;
        vStatus: { status: string; setter: string }[];
      };
      sideStatus: { status: string; setter: Team }[];
    }[] = [];
    let gen: string | undefined = undefined;
    let turn: number = 0;
    let t0: number = 0;
    let tf: number = 0;
    let events: string[] = [];
    let lastMove: string[] = [];
    let lastDamage: number = -1;
    for (let i = 0; i < this.replayData.length; i++) {
      let lineData = this.replayData[i];
      switch (lineData[0]) {
        case "":
          break;
        //|-damage|POKEMON|HP STATUS|[from]EFFECT|[of] SOURCE
        case "-damage":
          lastDamage = i;
          let damagePosition =
            field[+lineData[1].charAt(1) - 1][
              lineData[1].charAt(2) as "a" | "b"
            ].mon;
          if (damagePosition) {
            let newDamage = +lineData[2].split(" ")[0].split("/")[0];
            let damageDiff = damagePosition.hpp - newDamage;
            // damagePosition.damageTaken += newDamage;
            damagePosition.hpp = newDamage;
            if (lastMove[0] === "move") {
              let moveDamagePosition =
                field[+lastMove[1].charAt(1) - 1][
                  lastMove[1].charAt(2) as "a" | "b"
                ].mon;
              if (moveDamagePosition) {
                moveDamagePosition.damageDealt += damageDiff;
              }
            }
          }
          break;
        //|t:|TIMESTAMP
        case "t:":
          if (t0) {
            tf = +lineData[1];
          } else {
            t0 = +lineData[1];
          }
          break;
        //|move|POKEMON|MOVE|TARGET
        case "move":
          lastMove = lineData;
          break;
        //|turn|NUMBER
        case "turn":
          turn = +lineData[1];
          break;
        case "upkeep":
          break;
        case "-anim":
          break;
        //|switch|POKEMON|DETAILS|HP STATUS or |drag|POKEMON|DETAILS|HP STATUS
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

          field[switchPlayer][lineData[1].charAt(2) as "a" | "b"].mon =
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
        //|poke|PLAYER|DETAILS|ITEM
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
        //|-heal|POKEMON|HP STATUS
        case "-heal":
          // console.log(JSON.stringify(playerData, null, 2));
          let [healIdentifier, healName] = lineData[1].split(": ");
          let healPosition =
            healIdentifier.length > 2
              ? field[+healIdentifier.charAt(1) - 1][
                  healIdentifier.charAt(2) as "a" | "b"
                ].mon
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
        //|faint|POKEMON
        case "faint":
          let faintPosition =
            field[+lineData[1].charAt(1) - 1][
              lineData[1].charAt(2) as "a" | "b"
            ].mon;
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
                    ].sideStatus.find((s) => s.status === faintStatus);
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
                  let faintAttacker =
                    field[+lastMove[1].charAt(1) - 1][
                      lastMove[1].charAt(2) as "a" | "b"
                    ].mon;
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
                  faintString += ` somehow`;
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
        case "-supereffective":
          break;
        //|player|PLAYER|USERNAME|AVATAR|RATING
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
        //|teamsize|PLAYER|NUMBER
        case "teamsize":
          playerData[this.getPlayer(lineData[1])].teamSize = +lineData[2];
          break;
        //|detailschange|POKEMON|DETAILS|HP STATUS or |-formechange|POKEMON|SPECIES|HP STATUS
        case "-formechange":
        case "detailschange":
          let detailField =
            field[+lineData[1].charAt(1) - 1][
              lineData[1].charAt(2) as "a" | "b"
            ].mon;
          if (detailField) {
            detailField.detail = lineData[2];
          }
          break;
        case "-activate":
          break;
        case "-status":
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
        //|gametype|GAMETYPE
        case "gametype":
          gametype = lineData[1];
          break;
        //|gen|GENNUM
        case "gen":
          gen = lineData[1];
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
        //|-sidestart|SIDE|CONDITION
        case "-sidestart":
          let sideParent = this.getParent(i);

          if (sideParent[0] == "move") {
            let sideMon =
              field[+sideParent[1].charAt(1) - 1][
                sideParent[1].charAt(2) as "a" | "b"
              ].mon;
            if (sideMon) {
              field[+lineData[1].charAt(1) - 1].sideStatus.push({
                status: lineData[2],
                setter: sideMon,
              });
            }
          }
          break;
        case "-sideend":
          break;
        case "-fieldstart":
          break;
        case "-fieldend":
          break;
        //|win|USER
        case "win":
          let winPlayer = playerData.find(
            (player) => player.username == lineData[1]
          );
          if (winPlayer) winPlayer.win = true;
          break;
        //|rated|MESSAGE
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
    console.log(JSON.stringify(playerData, undefined, 2));
    // console.log(JSON.stringify(field, undefined, 2));
    let seconds = tf - t0;
    console.log(
      `${gametype} | Gen ${gen} | ${turn} turns | Game time: ${Math.floor(
        seconds / 60
      )} minutes ${seconds % 60} seconds`
    );
    console.log(events);
  }

  private getPlayer(position: string): number {
    return +position.charAt(1) - 1;
  }

  private getParent(index: number) {
    for (let i = index - 1; i > 0; i--) {
      if (this.replayData[i][0].charAt(0) !== "-") return this.replayData[i];
    }
    return [];
  }

  guessTeams() {}
}

type Gametype = `singles` | `doubles` | `triples` | `multi` | `freeforall`;
type ReplayData =
  | [""]
  | ["-damage", string, string]
  | ["-damage", string, string, ...string[]]
  | ["t:", string]
  | ["move", string, string, string]
  | ["turn", string]
  | ["upkeep"]
  | ["switch" | "drag", string, string, string]
  | ["-hint"]
  | ["c:"]
  | ["c"]
  | ["debug"]
  | ["-anim"]
  | ["inactive"]
  | ["-boost"]
  | ["-resisted"]
  | ["poke", string, string, "item" | ""]
  | ["-start"]
  | ["-heal", string, string]
  | ["rule"]
  | ["faint", string]
  | ["j"]
  | ["-ability"]
  | ["-unboost"]
  | ["-supereffective"]
  | ["player", string, string, string]
  | ["teamsize", string, string]
  | ["detailschange" | "-formechange", string, string]
  | ["-activate"]
  | ["-status"]
  | ["-crit"]
  | ["-miss"]
  | ["cant"]
  | ["l"]
  | ["raw"]
  | ["html"]
  | ["uhtml"]
  | ["-item"]
  | ["-enditem"]
  | ["gametype", Gametype]
  | ["gen", string]
  | ["tier"]
  | ["clearpoke"]
  | ["teampreview"]
  | ["start"]
  | ["-mega"]
  | ["-terastallize"]
  | ["-fieldactivate"]
  | ["-end"]
  | ["message"]
  | ["-message"]
  | ["-singleturn"]
  | ["-singlemove"]
  | ["-sidestart", string, string]
  | ["-sideend"]
  | ["-fieldstart"]
  | ["-fieldend"]
  | ["win", string]
  | ["rated", string];
