import { Generations, Move } from "@pkmn/data";
import { Dex } from "@pkmn/dex";

export class Replay {
  replayData: ReplayData[] = [];
  field!: Field;
  playerData!: Player[];
  i: number = 0;
  lastMove: { data: MoveData; move: Move } | undefined;

  constructor(data: string) {
    this.replayData = data
      .split("\n|")
      .map((line) => line.trim().split("|")) as ReplayData[];
  }

  analyze() {
    let gametype: undefined | GAMETYPE = undefined;
    this.playerData = [];
    this.field = {
      sides: [],
      statuses: [],
      weather: { status: "none" },
    };
    let genNum: number = 9;
    let turn: number = 0;
    let t0: number = 0;
    let tf: number = 0;
    let preview: number = 6;
    let events: { player: number; turn: number; message: string }[] = [];
    const gens = new Generations(Dex);
    const gen = gens.dex;
    const critChances = [0, 0.041667, 0.125, 0.5, 1, 1];
    for (this.i = 0; this.i < this.replayData.length; this.i++) {
      let lineData = this.replayData[this.i];
      switch (lineData[0]) {
        case "":
          break;
        case "-damage":
          let damageTarget = this.getMonByString(lineData[1]);
          if (damageTarget) {
            this.damage(
              damageTarget,
              this.getHPP(lineData[2]),
              lineData.slice(3)
            );
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
          let moveAttacker = this.getMonByString(lineData[1]);
          if (moveAttacker) {
            let move = moveAttacker.moveset.find(
              (move) => move.name === lineData[2]
            );
            if (!move) {
              move = gen.moves.get(lineData[2]);
              moveAttacker.moveset.push(move);
            }
            if (move.exists === true) {
              this.lastMove = { data: lineData, move: move };
              if (move.target && move.target !== "self") {
                moveAttacker.player.luck.moves.expected +=
                  move.accuracy === true ? 1 : move.accuracy / 100;
                moveAttacker.player.luck.moves.total++;
                moveAttacker.player.luck.moves.hits++;
                if (
                  move.critRatio &&
                  (move.category === "Physical" || move.category === "Special")
                ) {
                  let critChance = move.critRatio;
                  moveAttacker.player.luck.crits.expected +=
                    critChance > 6 ? 1 : critChances[critChance];
                  moveAttacker.player.luck.crits.total++;
                }
              }
              if (moveAttacker.status.status === "par") {
                moveAttacker.player.luck.status.total++;
                moveAttacker.player.luck.status.expected += 0.25;
              }
            }
          }
          break;
        case "turn":
          this.updateChart(turn);
          turn = +lineData[1];
          break;
        case "upkeep":
          this.cleanStatuses();
          break;
        case "-anim":
          break;
        case "switch":
          this.playerData[+lineData[1].charAt(1) - 1].stats.switches++;
        case "replace":
        case "drag":
          let switchPlayer = +lineData[1].charAt(1) - 1;
          let switchedMon = this.playerData[switchPlayer].team.find(
            (pokemon) => {
              if (!pokemon.brought) {
                return new RegExp(
                  String.raw`^${pokemon.formes[0].detail.replace("-*", ".*")}`
                ).test(lineData[2] as string);
              } else {
                let detailSet = new Set(lineData[2]!.split(", "));
                return pokemon.formes.some((forme) =>
                  forme.detail.split(", ").every((e) => detailSet.has(e))
                );
              }
            }
          );
          if (switchedMon) {
            if (!switchedMon.brought) {
              switchedMon.brought = true;
              switchedMon.formes[0] = {
                detail: lineData[2],
                id: gen.species.get(lineData[2].split(",")[0])?.id,
              };
              switchedMon.nickname = lineData[1].split(" ")[1];
            }
          } else {
            this.playerData[switchPlayer].team.push({
              formes: [
                {
                  detail: lineData[2],
                  id: gen.species.get(lineData[2].split(",")[0])?.id,
                },
              ],
              nickname: lineData[1].split(" ")[1],
              hpp: 100,
              moveset: [],
              hpRestored: 0,
              lastDamage: undefined,
              damageDealt: [0, 0],
              calcLog: {
                damageTaken: [],
                damageDealt: [],
              },
              damageTaken: [0, 0],
              kills: [0, 0],
              player: this.playerData[switchPlayer],
              status: { status: "healthy" },
              statuses: [],
              fainted: false,
              brought: true,
            });
          }
          this.field.sides[switchPlayer][
            lineData[1].charAt(2) as PPosition
          ].pokemon = this.playerData[switchPlayer].team.find((pokemon) =>
            pokemon.formes.some((forme) =>
              lineData[2]!.startsWith(forme.detail)
            )
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
          this.playerData[this.getPlayer(lineData[1])].team.push({
            formes: [
              {
                detail: lineData[2],
                id: gen.species.get(lineData[2].split(",")[0])?.id,
              },
            ],
            nickname: "",
            hpp: 100,
            moveset: [],
            hpRestored: 0,
            damageDealt: [0, 0],
            lastDamage: undefined,
            damageTaken: [0, 0],
            calcLog: {
              damageTaken: [],
              damageDealt: [],
            },
            player: this.playerData[this.getPlayer(lineData[1])],
            status: { status: "healthy" },
            statuses: [],
            kills: [0, 0],
            fainted: false,
            brought: false,
          });
          break;

        case "-heal":
          let healPosition = this.getMonByString(lineData[1]);
          if (healPosition) {
            let newHp = this.getHPP(lineData[2]);
            this.heal(healPosition, newHp, lineData[3]);
          }
          break;
        case "rule":
          break;
        case "faint":
          let faintMon = this.getMonByString(lineData[1]);
          if (faintMon) {
            faintMon.fainted = true;
            let faintString = `${
              this.playerData[+lineData[1].charAt(1) - 1].username
            }'s ${
              faintMon.formes[faintMon.formes.length - 1].detail.split(", ")[0]
            } fainted`;
            if (faintMon.lastDamage) {
              //Fainted from direct damage
              if (faintMon.lastDamage.type === "direct") {
                if (this.lastMove) {
                  if (this.lastMove.data === faintMon.lastDamage.parent.main) {
                    let faintAttacker = this.getMonByString(
                      this.lastMove.data[1]
                    );
                    faintString += ` from ${this.lastMove.data[2]}`;
                    if (faintAttacker) {
                      let faintOwnKill = this.checkOwnKill(
                        faintAttacker,
                        faintMon
                      );
                      if (faintOwnKill != "self") {
                        faintString += ` by ${
                          this.playerData[+this.lastMove.data[1].charAt(1) - 1]
                            .username
                        }'s ${
                          faintAttacker.formes[
                            faintAttacker.formes.length - 1
                          ].detail.split(", ")[0]
                        }`;
                        if (faintOwnKill != "ff") {
                          faintAttacker.kills[0]++;
                        }
                      }
                    } else {
                      faintString += ` by ${
                        this.lastMove.data[1].split(": ")[1]
                      }`;
                    }
                  }
                  //Damaged from not a direct move
                  else if (faintMon.lastDamage.status) {
                    faintString += ` from ${faintMon.lastDamage.status.status.replace(
                      "move: ",
                      ""
                    )}`;
                    if (faintMon.lastDamage.status.setter) {
                      faintMon.lastDamage.status.setter.kills[0]++;
                      faintString += ` by ${
                        faintMon.lastDamage.status.setter.player.username
                      }'s ${
                        faintMon.lastDamage.status.setter.formes[
                          faintMon.lastDamage.status.setter.formes.length - 1
                        ].detail.split(", ")[0]
                      }`;
                    }
                  } else {
                    console.log("Direct faint but no status");
                  }
                }
              } //Fainted from indirect damage
              else if (faintMon.lastDamage.type === "indirect") {
                if (faintMon.lastDamage.damager) {
                  let faintFromOwnKill = this.checkOwnKill(
                    faintMon.lastDamage.damager,
                    faintMon
                  );
                  if (faintFromOwnKill != "self") {
                    faintString += ` indirectly by ${
                      faintMon.lastDamage.damager.player.username
                    }'s ${
                      faintMon.lastDamage.damager.formes[
                        faintMon.lastDamage.damager.formes.length - 1
                      ].detail.split(", ")[0]
                    }`;
                  } else {
                    faintString += ` itself`;
                  }
                  if (faintFromOwnKill === "opp") {
                    faintMon.lastDamage.damager.kills[1]++;
                  }
                }
              }
            } else {
              if (this.lastMove) {
                let faintMove = gen.moves.get(this.lastMove.data[2]);
                if ("selfdestruct" in faintMove) {
                  faintString += ` itself by using ${faintMove.name}`;
                }
              }
            }
            events.push({
              player: +lineData[1].charAt(1),
              turn: turn,
              message: `${faintString}.`,
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
            !this.playerData.find((player) => player.username === lineData[2])
          ) {
            let side = {
              a: { pokemon: undefined, statuses: [] },
              b: { pokemon: undefined, statuses: [] },
              c: { pokemon: undefined, statuses: [] },
              statuses: [],
            };
            this.playerData.push({
              luck: {
                moves: { total: 0, hits: 0, expected: 0 },
                crits: { total: 0, hits: 0, expected: 0 },
                status: { total: 0, full: 0, expected: 0 },
              },
              side: side,
              stats: { switches: 0 },
              username: lineData[2],
              teamSize: 0,
              turnChart: [],
              team: [],
              win: false,
            });
            this.field.sides.push(side);
          }
          break;
        case "teamsize":
          this.playerData[this.getPlayer(lineData[1])].teamSize = +lineData[2];
          break;
        case "-formechange":
        case "detailschange":
          let detailMon = this.getMonByString(lineData[1]);
          if (detailMon) {
            detailMon.formes.push({
              detail: lineData[2],
              id: gen.species.get(lineData[2].split(",")[0])?.id,
            });
          }
          break;
        case "-activate":
          let activateMon = this.getMonByString(lineData[1]);
          if (activateMon) {
            let activateSetter = undefined;
            if (lineData[3] && lineData[3].startsWith("[of] ")) {
              activateSetter = this.getMonByString(
                this.ofP2P(lineData[3] as OFPOKEMON)
              );
            }
            activateMon.statuses.push({
              status: lineData[2],
              setter: activateSetter,
              name: lineData[2].split(": ").at(-1),
            });
          }
          break;
        case "-status":
          let statusPosition = this.getMonByString(lineData[1]);
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
              case "par":
                statusStart = { status: "par", name: "Paralysis" };
                break;
              case "frz":
                statusStart = { status: "frz", name: "Freeze" };
                break;
            }
            if (lineData[3]) {
              if (lineData[3].startsWith("[from] item: ")) {
                statusStart.setter = statusPosition;
              } else if (
                this.lastMove &&
                this.lastMove.data[3] === lineData[1]
              ) {
                statusStart.setter = this.getMonByString(this.lastMove.data[1]);
              } else if (lineData[4] && lineData[4].startsWith("[of] ")) {
                statusStart.setter = this.getMonByString(
                  this.ofP2P(lineData[4] as OFPOKEMON)
                );
              }
            } else {
              let statusParent = this.getParent(this.i);
              if (
                (statusParent.main[0] === "switch" ||
                  statusParent.main[0] === "drag" ||
                  statusParent.main[0] === "replace") &&
                statusStart.status === "psn"
              ) {
                statusStart.setter = this.field.sides[
                  +(lineData[1] as POKEMON).charAt(1) - 1
                ].statuses.find(
                  (status) => status.status === "move: Toxic Spikes"
                )?.setter;
              } else if (statusParent.main[0] === "move") {
                let statusOnProtect = statusParent.sub.find(
                  (sub) => sub[0] === "-activate" && sub[2] === "move: Protect"
                );
                if (statusOnProtect && statusOnProtect[0] === "-activate") {
                  statusStart.setter = this.getMonByString(statusOnProtect[1]);
                } else {
                  statusStart.setter = this.getMonByString(
                    statusParent.main[1]
                  );
                }
              }
            }

            statusPosition.status = statusStart;
          }
          break;
        case "-weather":
          if (lineData[1] !== this.field.weather.status) {
            let weatherStatus: Status = { status: lineData[1] };
            if (lineData.length > 3 && lineData[3].startsWith("[of] ")) {
              let weatherPosition = this.getMonByString(
                this.ofP2P(lineData[3] as OFPOKEMON)
              );
              weatherStatus.setter = weatherPosition;
            } else {
              if (this.lastMove) {
                let weatherPosition = this.getMonByString(
                  this.lastMove.data[1]
                );
                weatherStatus.setter = weatherPosition;
              }
            }
            this.field.weather = weatherStatus;
          }
          break;
        case "-crit":
          let critMain = this.getParent(this.i).main;
          if (critMain[0] === "move") {
            let critAttacker = this.getMonByString(critMain[1]);
            if (critAttacker) {
              critAttacker.player.luck.crits.hits++;
            }
          }
          break;
        case "-miss":
          let missAttacker = this.getMonByString(lineData[1]);
          if (missAttacker) {
            if (lineData[1]) {
              missAttacker.player.luck.moves.hits--;
            }
          }
          break;
        case "cant":
          let cantMon = this.getMonByString(lineData[1]);
          if (cantMon) {
            if (lineData[2] === "par") {
              cantMon.player.luck.status.full++;
              cantMon.player.luck.status.total++;
              cantMon.player.luck.status.expected += 0.25;
            }
          }
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
          if (lineData[1]) {
            preview = +lineData[1];
          }
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
          let curePosition = this.getMonByString(lineData[1]);
          if (curePosition) {
            curePosition.status = { status: "healthy" };
          }
          break;
        case "-cureteam":
          break;
        case "-endability":
          break;
        case "-fail":
          break;
        case "-hitcount":
          if (this.lastMove) {
            let hitAttacker = this.getMonByString(this.lastMove.data[1]);
            if (hitAttacker) {
              let hitMove = gen.moves.get(this.lastMove.data[2]);
              if (hitMove.exists === true) {
                if (hitMove.target && hitMove.target !== "self") {
                  let hitCount = +lineData[2];
                  for (let h = 1; h < hitCount; h++) {
                    hitAttacker.player.luck.moves.expected +=
                      hitMove.accuracy === true ? 1 : hitMove.accuracy / 100;
                    hitAttacker.player.luck.moves.total++;
                    hitAttacker.player.luck.moves.hits++;
                    if (
                      hitMove.critRatio &&
                      (hitMove.category === "Physical" ||
                        hitMove.category === "Special")
                    ) {
                      let critChance = hitMove.critRatio;
                      hitAttacker.player.luck.crits.expected +=
                        critChance > 6 ? 1 : critChances[critChance];
                      hitAttacker.player.luck.crits.total++;
                    }
                  }
                }
              }
            }
          }
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
          let hpTarget = this.getMonByString(lineData[1]);
          if (hpTarget) {
            let newHpp = this.getHPP(lineData[2]);
            let hpDiff = hpTarget.hpp - newHpp;
            if (hpDiff > 0) {
              this.damage(hpTarget, newHpp, lineData.slice(3));
            } else if (hpDiff < 0) {
              this.heal(hpTarget, newHpp, lineData[3]);
            }
          }
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
          let swapSide = this.field.sides[+lineData[1].charAt(1) - 1];
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
          let teraMon = this.getMonByString(lineData[1]);
          if (teraMon) {
            teraMon.formes.map((forme) => ({
              detail: `${forme.detail}, tera:${lineData[2]}`,
              base: forme.id,
            }));
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
          let endMon = this.getMonByString(lineData[1]);
          if (endMon) {
            let endStatus = endMon.statuses.find(
              (status) =>
                status.status === lineData[2] ||
                status.status.startsWith(
                  lineData[2].toLowerCase().replace(" ", "")
                )
            );
            if (endStatus) {
              endStatus.ended = true;
            }
          }
          break;
        case "-sidestart":
          let sideParent = this.getParent(this.i);
          if (sideParent.main[0] == "move") {
            let sideMon = this.getMonByString(sideParent.main[1]);
            if (sideMon) {
              let sideStartStatus = lineData[2].split(": ");
              this.field.sides[+lineData[1].charAt(1) - 1].statuses.push({
                status:
                  sideStartStatus.length === 2
                    ? sideStartStatus[1]
                    : sideStartStatus[0],
                setter: sideMon,
              });
            }
          }
          break;
        case "-sideend":
          this.field.sides[+lineData[1].charAt(1) - 1].statuses.splice(
            this.field.sides[+lineData[1].charAt(1) - 1].statuses.findIndex(
              (s) => s.status === lineData[2]
            ),
            1
          );

          break;
        case "-start":
          let startMon = this.getMonByString(lineData[1]);
          if (startMon) {
            let startParent = this.getParent(this.i);
            if (startParent) {
              let startMonTarget = undefined;
              if (startParent.main[0] === "move") {
                startMonTarget = this.getMonByString(startParent.main[3]);
              } else {
                startMonTarget = startMon;
              }
              if (startMonTarget) {
                startMonTarget.statuses.push({
                  status: lineData[2],
                  setter: startMon,
                });
              }
            }
          }

          break;
        case "-fieldstart":
          let fieldStartStatus: Status = { status: lineData[1] };
          if (lineData[3] && lineData[3].startsWith("[of] ")) {
            let fieldStartSetter = this.getMonByString(
              this.ofP2P(lineData[3] as OFPOKEMON)
            );
            if (fieldStartSetter) {
              fieldStartStatus.setter = fieldStartSetter;
            }
          }
          this.field.statuses.push(fieldStartStatus);
          break;
        case "-fieldend":
          this.field.statuses.splice(
            this.field.statuses.findIndex(
              (status) => status.status === lineData[1]
            ),
            1
          );
          break;
        case "win":
          this.updateChart(turn);
          let winPlayer = this.playerData.findIndex(
            (player) => player.username == lineData[1]
          );
          if (winPlayer >= 0) {
            this.playerData[winPlayer].win = true;
            events.push({
              turn: turn,
              player: winPlayer + 1,
              message: `${lineData[1]} wins.`,
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

    let gameTime = tf - t0;

    let stats: ReplayStats[] = [];
    this.playerData.forEach((player) => {
      let playerStat: ReplayStats = {
        username: player.username,
        win: player.win,
        stats: player.stats,
        total: {
          kills: player.team.reduce(
            (sum, pokemon) => sum + pokemon.kills[0] + pokemon.kills[1],
            0
          ),
          deaths: player.team.reduce(
            (sum, pokemon) => sum + (pokemon.fainted ? 1 : 0),
            0
          ),
          damageDealt: player.team.reduce(
            (sum, pokemon) =>
              sum + pokemon.damageDealt[0] + pokemon.damageDealt[1],
            0
          ),
          damageTaken: player.team.reduce(
            (sum, pokemon) =>
              sum + pokemon.damageTaken[0] + pokemon.damageTaken[1],
            0
          ),
        },
        turnChart: player.turnChart,
        luck: {
          moves: {
            total: player.luck.moves.total,
            hits: player.luck.moves.hits,
            expected: player.luck.moves.expected,
            actual: 0,
          },
          crits: {
            total: player.luck.crits.total,
            hits: player.luck.crits.hits,
            expected: player.luck.crits.expected,
            actual: 0,
          },
          status: {
            total: player.luck.status.total,
            full: player.luck.status.full,
            expected: player.luck.status.expected,
            actual: 0,
          },
        },
        team: [] as any[],
      };
      player.team.forEach((pokemon) => {
        playerStat.team.push({
          kills: pokemon.kills,
          brought: pokemon.brought || preview >= player.team.length,
          fainted: pokemon.fainted,
          moveset: pokemon.moveset.map((move) => move.name),
          damageDealt: pokemon.damageDealt,
          damageTaken: pokemon.damageTaken,
          calcLog: {
            damageDealt: pokemon.calcLog.damageDealt.map((log) => ({
              target: log.target.formes[0].detail,
              hpDiff: log.hpDiff,
              move: log.move.name,
            })),
            damageTaken: pokemon.calcLog.damageTaken.map((log) => ({
              attacker: log.attacker.formes[0].detail,
              hpDiff: log.hpDiff,
              move: log.move.name,
            })),
          },
          hpRestored: pokemon.hpRestored,
          formes: pokemon.formes,
        });
      });
      playerStat.luck.moves.expected /= playerStat.luck.moves.total;
      playerStat.luck.moves.actual =
        playerStat.luck.moves.hits / playerStat.luck.moves.total;
      playerStat.luck.crits.expected /= playerStat.luck.crits.total;
      playerStat.luck.crits.actual =
        playerStat.luck.crits.hits / playerStat.luck.crits.total;
      playerStat.luck.status.expected /= playerStat.luck.status.total;
      playerStat.luck.status.actual =
        playerStat.luck.status.full / playerStat.luck.status.total;
      stats.push(playerStat);
    });

    return {
      gametype: gametype
        ? gametype.charAt(0).toUpperCase() + gametype.slice(1)
        : "",
      genNum: genNum,
      turns: turn,
      gameTime: gameTime,
      stats: stats,
      events: events,
    };
  }

  private getPlayer(position: string): number {
    return +position.charAt(1) - 1;
  }

  private getMonByString(pos: POKEMON | undefined): Pokemon | undefined {
    if (pos === undefined) return;
    if (
      pos.charAt(2) === "a" ||
      pos.charAt(2) === "b" ||
      pos.charAt(2) === "c"
    ) {
      return this.field.sides[+pos.charAt(1) - 1][pos.charAt(2) as PPosition]
        .pokemon;
    } else {
      return this.playerData[+pos.charAt(1) - 1].team.find(
        (pokemon) => pokemon.nickname === pos.substring(4)
      );
    }
  }

  private getParent(index: number): ParentData {
    let data = { main: this.replayData[index], sub: [] as ReplayData[] };
    for (let i = index; i > 0; i--) {
      if (
        this.replayData[i][0].charAt(0) !== "-" &&
        this.replayData[i][0] !== "debug"
      ) {
        data.main = this.replayData[i];
        i = 0;
      } else {
        data.sub.push(this.replayData[i]);
      }
    }
    return data;
  }

  private updateChart(turn: number) {
    this.playerData.forEach((player) =>
      player.turnChart.push({
        turn: turn,
        damage: player.team.reduce(
          (sum, pokemon) => (sum += 100 - pokemon.hpp),
          0
        ),
        remaining: player.team.reduce(
          (sum, pokemon) => (sum += pokemon.fainted ? 0 : 1),
          0
        ),
      })
    );
  }

  private searchStatuses(pokemon: Pokemon, status: string): Status | undefined {
    if (status === "Recoil") {
      return { status: status, setter: pokemon };
    }
    if (pokemon.status.status === status) {
      return pokemon.status;
    }
    if (pokemon.lastDamage && pokemon.lastDamage.data[1]) {
      let monStatus = pokemon.statuses.find((s) => s.status === status);
      if (monStatus) return monStatus;
    }
    let sideStatus = pokemon.player.side.statuses.find(
      (s) => s.status === status
    );
    if (sideStatus) {
      return sideStatus;
    }

    if (this.field.weather.status === status) {
      return this.field.weather;
    }
    if (pokemon.lastDamage && pokemon.lastDamage.data[1]) {
      let sideStatus = this.field.sides[
        +pokemon.lastDamage.data[1].charAt(1) - 1
      ].statuses.find((s) => s.status.split(": ")[1] === status);
      if (sideStatus) return sideStatus;
    }
    return;
  }

  private cleanStatuses() {
    this.field.statuses = this.field.statuses.filter((status) => !status.ended);
    this.field.sides.forEach((side) => {
      side.statuses = side.statuses.filter((status) => !status.ended);
      side.a.statuses = side.a.statuses.filter((status) => !status.ended);
      side.b.statuses = side.b.statuses.filter((status) => !status.ended);
      side.c.statuses = side.c.statuses.filter((status) => !status.ended);
    });
    this.playerData.forEach((player) =>
      player.team.forEach((pokemon) => {
        pokemon.status = pokemon.status.ended
          ? { status: "healthy" }
          : pokemon.status;
        pokemon.statuses = pokemon.statuses.filter((status) => !status.ended);
      })
    );
    return;
  }

  private checkOwnKill(
    attacker: Pokemon | undefined,
    fainter: Pokemon | undefined
  ): "self" | "ff" | "opp" {
    if (attacker === fainter) {
      return "self";
    }
    return this.playerData.find(
      (player) => attacker && player.team.includes(attacker)
    ) ===
      this.playerData.find((player) => fainter && player.team.includes(fainter))
      ? "ff"
      : "opp";
  }

  private getHPP(hpString: HPSTATUS | HP): number {
    let hp = hpString.split(" ")[0].split("/");
    let hpp = +hp[0] > 0 ? +hp[0] / (+hp[1] / 100) : 0;
    return hpp;
  }

  private heal(
    healed: Pokemon,
    newHp: number,
    action: MARJORACTION | undefined
  ) {
    let hpDiff = newHp - healed.hpp;
    healed.hpp = newHp;
    healed.fainted = false;
    healed.hpRestored += hpDiff;
  }

  private damage(
    target: Pokemon,
    newHpp: number,
    actions: MARJORACTION[] | undefined
  ) {
    let hppDiff = target.hpp - newHpp;
    target.hpp = newHpp;
    let lastDamage: LastDamage = {
      data: this.replayData[this.i] as DamageData,
      type: "indirect",
      parent: this.getParent(this.i),
    };
    let from: EFFECT | undefined = undefined;
    let of: POKEMON | undefined = undefined;
    for (let action of actions || []) {
      if (action.startsWith("[from] ")) {
        from = this.fromE2S(action as FROMEFFECT);
      } else if (action.startsWith("[of] ")) {
        of = this.ofP2P(action as OFPOKEMON);
      }
    }
    //Indirect Damage
    if (from) {
      if (of) {
        let ofMon = this.getMonByString(of);
        if (ofMon) {
          ofMon.damageDealt[1] += hppDiff;
          lastDamage.damager = ofMon;
        }
      } else if (from.startsWith("item: ")) {
      } else if (from.startsWith("ability: ")) {
      } else {
        let damageIndirect = this.searchStatuses(target, from);
        if (damageIndirect) {
          lastDamage.status = damageIndirect;
          if (damageIndirect.setter) {
            if (target != damageIndirect.setter) {
              damageIndirect.setter.damageDealt[1] += hppDiff;
            }
            lastDamage.damager = damageIndirect.setter;
          }
        }
      }

      target.damageTaken[1] += hppDiff;
    } //Direct Damage
    else {
      lastDamage.type = "direct";
      if (this.lastMove && lastDamage.parent.main === this.lastMove.data) {
        target.damageTaken[0] += hppDiff;
        let moveDamageAttacker = this.getMonByString(this.lastMove.data[1]);
        if (moveDamageAttacker && moveDamageAttacker != target) {
          lastDamage.damager = moveDamageAttacker;
          moveDamageAttacker.damageDealt[0] += hppDiff;
          target.calcLog.damageTaken.push({
            attacker: moveDamageAttacker,
            move: this.lastMove.move,
            hpDiff: hppDiff,
          });
          moveDamageAttacker.calcLog.damageDealt.push({
            target: target,
            move: this.lastMove.move,
            hpDiff: hppDiff,
          });
        }
      } else {
        target.damageTaken[1] += hppDiff;
        let endSub = lastDamage.parent.sub.find((sub) => sub[0] === "-end");
        if (endSub) {
          let endMon = this.getMonByString(endSub[1] as POKEMON);
          if (endMon) {
            let endStatus = endMon.statuses.find(
              (status) => status.status === endSub![2]
            );
            if (endStatus) {
              lastDamage.status = endStatus;
              if (endStatus.setter) {
                lastDamage.damager = endStatus.setter;
                endStatus.setter.damageDealt[0] += hppDiff;
              }
            }
          }
        }
      }
    }
    target.lastDamage = lastDamage;
  }

  private ofP2P(ofPokemon: OFPOKEMON): POKEMON | undefined {
    if (ofPokemon.startsWith("[of] ")) {
      return ofPokemon.substring(5) as POKEMON;
    }
    return undefined;
  }

  private fromE2S(fromEffect: FROMEFFECT): EFFECT {
    return fromEffect.substring(7);
  }
}

type ReplayStats = {
  username: string | undefined;
  win: boolean;
  total: {
    kills: number;
    deaths: number;
    damageDealt: number;
    damageTaken: number;
  };
  stats: {
    switches: number;
  };
  turnChart: {
    turn: number;
    damage: number;
    remaining: number;
  }[];
  luck: {
    moves: {
      total: number;
      hits: number;
      expected: number;
      actual: number;
    };
    crits: {
      total: number;
      hits: number;
      expected: number;
      actual: number;
    };
    status: {
      total: number;
      full: number;
      expected: number;
      actual: number;
    };
  };
  team: {
    kills: [number, number];
    brought: boolean;
    fainted: boolean;
    moveset: string[];
    damageDealt: [number, number];
    damageTaken: [number, number];
    calcLog: {
      damageTaken: { attacker: string; move: string; hpDiff: number }[];
      damageDealt: { target: string; move: string; hpDiff: number }[];
    };
    hpRestored: number;
    formes: { detail: string; id?: string }[];
  }[];
};

type ParentData = { main: ReplayData; sub: ReplayData[] };

type LastDamage = {
  data: ReplayData;
  parent: ParentData;
  damager?: Pokemon;
  type: "indirect" | "direct";
  status?: Status;
};

type Pokemon = {
  formes: { detail: string; id?: string }[];
  nickname: string;
  hpp: number;
  moveset: Move[];
  kills: [number, number];
  damageDealt: [number, number];
  damageTaken: [number, number];
  calcLog: {
    damageTaken: { attacker: Pokemon; move: Move; hpDiff: number }[];
    damageDealt: { target: Pokemon; move: Move; hpDiff: number }[];
  };
  hpRestored: number;
  lastDamage: LastDamage | undefined;
  fainted: boolean;
  brought: boolean;
  status: Status;
  player: Player;
  statuses: Status[];
};

type Side = {
  a: {
    pokemon: undefined | Pokemon;
    statuses: Status[];
  };
  b: {
    pokemon: undefined | Pokemon;
    statuses: Status[];
  };
  c: {
    pokemon: undefined | Pokemon;
    statuses: Status[];
  };
  statuses: Status[];
};

type Status = { status: string; setter?: Pokemon; name?: string; ended?: true };

type Field = {
  sides: Side[];
  statuses: Status[];
  weather: Status;
};

type Player = {
  username: undefined | string;
  teamSize: undefined | number;
  team: Pokemon[];
  side: Side;
  turnChart: { turn: number; damage: number; remaining: number }[];
  win: boolean;
  stats: {
    switches: number;
  };
  luck: {
    moves: {
      total: number;
      hits: number;
      expected: number;
    };
    crits: {
      total: number;
      hits: number;
      expected: number;
    };
    status: {
      total: number;
      full: number;
      expected: number;
    };
  };
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
type HP = `${string}/${string}`;
type HPSTATUS = `${HP} ${STATUS}`;
type ITEM = "item" | "";
type MEGASTONE = string;
type MESSAGE = string;
type MOVE = string;
type NUM = string;
type NUMBER = string;
type OFPOKEMON = `[of] ${SOURCE}`;
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
type SOURCE = POKEMON;
type SPECIES = string;
type STAT = string;
type STATS = string;
type STATUS = string;
type TARGET = POKEMON;
type TIMESTAMP = string;
type TYPE = string;
type USER = string;
type USERNAME = string;
type WEATHER = string;

type MARJORACTION = OFPOKEMON | FROMEFFECT | EFFECT;

type MoveData = ["move", POKEMON, MOVE, TARGET, ...MARJORACTION[]];
type DamageData = ["-damage", POKEMON, HPSTATUS, ...MARJORACTION[]];
type SetHPData = ["-sethp", POKEMON, HP, ...MARJORACTION[]];

type ReplayData =
  | [...SubReplayData, ...MARJORACTION[]]
  | DamageData
  | SetHPData
  | MoveData;

type SubReplayData =
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
  | ["-end", POKEMON, EFFECT]
  | ["-endability", POKEMON]
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
  | ["-sideend", SIDE, CONDITION]
  | ["-sidestart", SIDE, CONDITION]
  | ["-singlemove", POKEMON, MOVE]
  | ["-singleturn", POKEMON, MOVE]
  | ["-start", POKEMON, EFFECT]
  | ["-status", POKEMON, STATUS]
  | ["-supereffective", POKEMON]
  | ["-swapboost", SOURCE, TARGET, STATS]
  | ["-swapsideconditions"]
  | ["-terastallize", POKEMON, TYPE]
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
  | ["teampreview", NUMBER?]
  | ["teamsize", PLAYER, NUMBER]
  | ["tie"]
  | ["tier", FORMATNAME]
  | ["turn", NUMBER]
  | ["uhtml"]
  | ["upkeep"]
  | ["win", USER];
