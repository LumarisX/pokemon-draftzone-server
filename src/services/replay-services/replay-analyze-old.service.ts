import { Generations, Move, toID } from "@pkmn/data";
import { Dex } from "@pkmn/dex";

export namespace Replay {
  const critChances = [0, 0.041667, 0.125, 0.5, 1, 1];
  const gens = new Generations(Dex);
  export class Analysis {
    field!: Field;
    playerData!: Player[];
    lastMove: { data: MoveData; move: Move } | undefined;
    tempMons: { [key: string]: Pokemon } = {};
    events: { player: number; turn: number; message: string }[] = [];
    killStrings: KillString[] = [];
    gametype: undefined | GAMETYPE = undefined;
    genNum: number = 9;
    gameTime: number;
    preview: number = 6;
    t0: number;
    tf: number;
    matchData: {
      pre: Line[];
      turns?: Turn[];
    } = {
      pre: [],
    };

    constructor(log: string) {
      const replayLines = log.split("\n|").reduce((lines, log) => {
        const line = new Line(log);
        if (line.isChild()) lines[lines.length - 1].addChildLine(line);
        else lines.push(line);
        return lines;
      }, [] as Line[]);
      this.playerData = [];
      this.field = new Field();
      this.t0 = 0;
      this.tf = 0;
      replayLines.forEach((line) => {
        switch (line.data[0]) {
          case "start":
            this.matchData.turns = [];
            this.matchData.turns.push(new Turn(0));
            return;
          case "turn":
            this.matchData.turns?.push(new Turn(+line.data[1]));
            return;
        }
        if (this.matchData.turns)
          this.matchData.turns[this.matchData.turns.length - 1].addLine(line);
        else this.matchData.pre.push(line);
      });
      this.matchData.pre.forEach((line) => {
        this.executeLine(line);
      });
      this.matchData.turns?.forEach((turn) => {
        this.updateChart(turn.number);
        turn.lines.forEach((line) => {
          this.executeLine(line);
        });
      });
      this.gameTime = this.tf - this.t0;
    }

    private executeLine(line: Line) {
      switch (line.data[0]) {
        case "":
          break;
        case "-damage":
          let damageTarget = this.getMonByString(line.data[1]);
          if (damageTarget) {
            this.damage(
              damageTarget,
              this.getHPP(line.data[2]),
              line.data.slice(3),
              line,
            );
          }
          break;
        case "t:":
          if (this.t0) {
            this.tf = +line.data[1];
          } else {
            this.t0 = +line.data[1];
          }
          break;
        case "move":
          let moveAttacker = this.getMonByString(line.data[1]);
          if (moveAttacker) {
            let move = [...moveAttacker.moveset].find(
              (move) => move.name === line.data[2],
            );
            if (!move) {
              move = gens.dex.moves.get(line.data[2]);
              moveAttacker.moveset.add(move);
            }
            if (move.exists === true) {
              this.lastMove = { data: line.data, move: move };
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
        case "win":
          this.upkeep(line.turn);
          this.updateChart(line.turn?.number ?? 0);
          let winPlayer = this.playerData.findIndex(
            (player) => player.username == line.data[1],
          );
          if (winPlayer >= 0) {
            this.playerData[winPlayer].win = true;
            this.events.push({
              turn: line.turn?.number ?? 0,
              player: winPlayer + 1,
              message: `${line.data[1]} wins.`,
            });
          }
          break;
        case "upkeep":
          this.upkeep(line.turn);
          break;
        case "-anim":
          break;
        case "replace":
          let replaceMon = this.getMonByString(line.data[1]);
          if (!replaceMon) break;
          let illusionPlayer = +line.data[1].charAt(1) - 1;
          let illusionMon = this.playerData[illusionPlayer].team.find(
            (pokemon) => {
              if (!pokemon.brought) {
                return new RegExp(
                  String.raw`^${pokemon.formes[0].detail.replace("-*", ".*")}`,
                ).test(line.data[2] as string);
              } else {
                let detailSet = new Set(line.data[2]!.split(", "));
                return pokemon.formes.some((forme) =>
                  forme.detail.split(", ").every((e) => detailSet.has(e)),
                );
              }
            },
          );

          let tempReplaceMon = this.tempMons[line.data[1].substring(0, 3)];
          if (!illusionMon) {
            illusionMon = {
              formes: [
                {
                  detail: line.data[2],
                  id: gens.dex.species.get(line.data[2].split(",")[0])?.id,
                },
              ],
              nickname: line.data[1].split(" ")[1],
              hpp: 100,
              moveset: new Set(),
              hpRestored: 0,
              lastDamage: undefined,
              damageDealt: [0, 0, 0],
              calcLog: {
                damageTaken: [],
                damageDealt: [],
              },
              damageTaken: [0, 0, 0],
              kills: [0, 0, 0],
              player: this.playerData[illusionPlayer],
              status: { status: "healthy" },
              statuses: [],
              fainted: false,
              brought: true,
            };
          }
          illusionMon.brought = replaceMon.brought;
          illusionMon.hpp = replaceMon.hpp;
          illusionMon.moveset = new Set([
            ...illusionMon.moveset,
            ...replaceMon.moveset,
          ]);
          illusionMon.hpRestored +=
            replaceMon.hpRestored - tempReplaceMon.hpRestored;
          illusionMon.damageDealt = [
            replaceMon.damageDealt[0] - tempReplaceMon.damageDealt[0],
            replaceMon.damageDealt[1] - tempReplaceMon.damageDealt[1],
            replaceMon.damageDealt[2] - tempReplaceMon.damageDealt[2],
          ];
          illusionMon.lastDamage = replaceMon.lastDamage;
          illusionMon.damageTaken = [
            replaceMon.damageTaken[0] - tempReplaceMon.damageTaken[0],
            replaceMon.damageTaken[1] - tempReplaceMon.damageTaken[1],
            replaceMon.damageTaken[2] - tempReplaceMon.damageTaken[2],
          ];
          // illusionMon.calcLog
          illusionMon.status = replaceMon.status;
          illusionMon.statuses = replaceMon.statuses.filter(
            (status) =>
              !tempReplaceMon.statuses.find((s) => s.name === status.name),
          );
          illusionMon.kills = [
            replaceMon.kills[0] - tempReplaceMon.kills[0],
            replaceMon.kills[1] - tempReplaceMon.kills[1],
            replaceMon.kills[2] - tempReplaceMon.kills[2],
          ];
          illusionMon.fainted = replaceMon.fainted;
          this.killStrings.forEach((ks) => {
            if (ks.attacker === replaceMon) ks.attacker = illusionMon;
            if (ks.target === replaceMon) ks.target = illusionMon;
          });
          this.field.sides[illusionPlayer][
            line.data[1].charAt(2) as PPosition
          ].pokemon = illusionMon;
          replaceMon = tempReplaceMon;
          break;
        case "switch":
          this.playerData[+line.data[1].charAt(1) - 1].stats.switches++;
        case "drag":
          const switchPlayer = +line.data[1].charAt(1) - 1;
          const switchedMon = this.playerData[switchPlayer].team.find(
            (pokemon) => {
              if (!pokemon.brought) {
                return new RegExp(
                  String.raw`^${pokemon.formes[0].detail.replace("-*", ".*")}`,
                ).test(line.data[2] as string);
              } else {
                let detailSet = new Set(line.data[2]!.split(", "));
                return pokemon.formes.some((forme) =>
                  forme.detail.split(", ").every((e) => detailSet.has(e)),
                );
              }
            },
          );
          if (switchedMon) {
            if (!switchedMon.brought) {
              switchedMon.brought = true;
              switchedMon.formes[0] = {
                detail: line.data[2],
                id: gens.dex.species.get(line.data[2].split(",")[0])?.id,
              };
              switchedMon.nickname = line.data[1].split(" ")[1];
            }
          } else {
            this.playerData[switchPlayer].team.push(
              new Pokemon(
                line.data[2],
                this.playerData[switchPlayer],
                line.data[1],
                { brought: true },
              ),
            );
          }
          const switchInMon = this.playerData[switchPlayer].team.find(
            (pokemon) =>
              pokemon.formes.some((forme) =>
                line.data[2]!.startsWith(forme.detail),
              ),
          );
          this.field.sides[switchPlayer][
            line.data[1].charAt(2) as PPosition
          ].pokemon = switchInMon;
          if (switchInMon)
            this.tempMons[line.data[1].substring(0, 3)] =
              structuredClone(switchInMon);
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
          const pokePlayer = this.playerData[this.getPlayer(line.data[1])];
          pokePlayer.team.push(new Pokemon(line.data[2], pokePlayer));
          break;
        case "-heal":
          let healPosition = this.getMonByString(line.data[1]);
          if (healPosition) {
            let newHp = this.getHPP(line.data[2]);
            this.heal(healPosition, newHp, line.data[3]);
          }
          break;
        case "rule":
          break;
        case "faint":
          let faintMon = this.getMonByString(line.data[1]);
          if (faintMon) {
            faintMon.fainted = true;
            let killString: KillString = {
              target: faintMon,
            };
            if (faintMon.lastDamage) {
              let destinyBondMonList = this.field.sides
                .map((side) =>
                  [side.a.pokemon, side.b.pokemon, side.c.pokemon].find(
                    (pokemon) =>
                      pokemon &&
                      this.searchStatuses(pokemon, "move: Destiny Bond"),
                  ),
                )
                .filter((pokemon) => pokemon);
              if (
                destinyBondMonList.filter((mon) => mon !== faintMon).length > 0
              ) {
                let destinyBondMon = destinyBondMonList.find(
                  (pokemon) =>
                    pokemon?.fainted &&
                    pokemon.lastDamage?.damager === faintMon,
                );
                if (destinyBondMon) {
                  destinyBondMon.kills[1]++;
                  killString.reason = "Destiny Bond";
                  killString.indirect = true;
                  killString.attacker = destinyBondMon;
                }
              } else {
                //Fainted from direct damage
                if (faintMon.lastDamage.type === "direct") {
                  if (this.lastMove) {
                    if (
                      this.lastMove.data ===
                      faintMon.lastDamage.line.parent?.data
                    ) {
                      let faintAttacker = this.getMonByString(
                        this.lastMove.data[1],
                      );
                      killString.reason = this.lastMove.data[2];
                      if (faintAttacker) {
                        let faintOwnKill = this.checkOwnKill(
                          faintAttacker,
                          faintMon,
                        );
                        killString.attacker = faintAttacker;
                        if (faintOwnKill === "opp") {
                          faintAttacker.kills[0]++;
                        } else if (faintOwnKill === "ff") {
                          faintAttacker.kills[2]++;
                        }
                      } else {
                        console.log("ks error", line.data);
                        // killString.attacker =
                        //   this.lastMove.data[1].split(": ")[1];
                      }
                    }
                    //Damaged from an indirect direct move
                    else if (faintMon.lastDamage.status) {
                      killString.reason =
                        faintMon.lastDamage.status.status.replace("move: ", "");
                      killString.indirect = true;
                      if (faintMon.lastDamage.status.setter) {
                        faintMon.lastDamage.status.setter.kills[0]++;
                      }
                    }
                  }
                } //Fainted from indirect damage
                else if (faintMon.lastDamage.type === "indirect") {
                  killString.indirect = true;
                  if (faintMon.lastDamage.damager) {
                    let faintFromOwnKill = this.checkOwnKill(
                      faintMon.lastDamage.damager,
                      faintMon,
                    );
                    killString.attacker = faintMon.lastDamage.damager;
                    killString.reason = faintMon.lastDamage.from;
                    if (faintFromOwnKill === "opp") {
                      faintMon.lastDamage.damager.kills[1]++;
                    } else if (faintFromOwnKill === "ff") {
                      faintMon.lastDamage.damager.kills[2]++;
                    }
                  }
                }
              }
            } else {
              if (this.lastMove) {
                let faintMove = gens.dex.moves.get(this.lastMove.data[2]);
                if ("selfdestruct" in faintMove) {
                  killString.attacker = faintMon;
                  killString.reason = faintMove.name;
                }
              }
            }
            this.killStrings.push(killString);
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
            line.data[2] &&
            !this.playerData.find((player) => player.username === line.data[2])
          ) {
            const side = new Side();
            this.playerData.push(new Player(side, line.data[2]));
            this.field.sides.push(side);
          }
          break;
        case "teamsize":
          this.playerData[this.getPlayer(line.data[1])].teamSize =
            +line.data[2];
          break;
        case "-formechange":
        case "detailschange":
          let detailMon = this.getMonByString(line.data[1]);
          if (detailMon) {
            detailMon.formes.push({
              detail: line.data[2],
              id: gens.dex.species.get(line.data[2].split(",")[0])?.id,
            });
          }
          break;
        case "-activate":
          let activateMon = this.getMonByString(line.data[1]);
          if (activateMon) {
            let activateSetter = undefined;
            if (line.data[3] && line.data[3].startsWith("[of] ")) {
              activateSetter = this.getMonByString(
                this.ofP2P(line.data[3] as OFPOKEMON),
              );
            }
            activateMon.statuses.push({
              status: line.data[2],
              setter: activateSetter,
              name: line.data[2].split(": ").at(-1),
            });
          }
          break;
        case "-status":
          let statusPosition = this.getMonByString(line.data[1]);
          if (statusPosition) {
            let statusStart: Status = { status: line.data[2] };
            switch (line.data[2]) {
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
            if (line.data[3]) {
              if (line.data[3].startsWith("[from] item: ")) {
                statusStart.setter = statusPosition;
              } else if (
                this.lastMove &&
                this.lastMove.data[3] === line.data[1]
              ) {
                statusStart.setter = this.getMonByString(this.lastMove.data[1]);
              } else if (line.data[4] && line.data[4].startsWith("[of] ")) {
                statusStart.setter = this.getMonByString(
                  this.ofP2P(line.data[4] as OFPOKEMON),
                );
              }
            } else if (line.parent) {
              if (
                (line.parent.data[0] === "switch" ||
                  line.parent.data[0] === "drag" ||
                  line.parent.data[0] === "replace") &&
                statusStart.status === "psn"
              ) {
                statusStart.setter = this.field.sides[
                  +(line.data[1] as POKEMON).charAt(1) - 1
                ].statuses.find(
                  (status) =>
                    status.status === "move: Toxic Spikes" ||
                    status.status === "Toxic Spikes",
                )?.setter;
              } else if (line.parent.data[0] === "move") {
                let statusOnProtect = line.parent.children.find(
                  (child) =>
                    child.data[0] === "-activate" &&
                    child.data[2] === "move: Protect",
                );
                if (
                  statusOnProtect &&
                  statusOnProtect.data[0] === "-activate"
                ) {
                  statusStart.setter = this.getMonByString(
                    statusOnProtect.data[1],
                  );
                } else {
                  statusStart.setter = this.getMonByString(line.parent.data[1]);
                }
              }
            }

            statusPosition.status = statusStart;
          }
          break;
        case "-weather":
          if (line.data[1] !== this.field.weather.status) {
            let weatherStatus: Status = { status: line.data[1] };
            if (line.data.length > 3 && line.data[3].startsWith("[of] ")) {
              let weatherPosition = this.getMonByString(
                this.ofP2P(line.data[3] as OFPOKEMON),
              );
              weatherStatus.setter = weatherPosition;
            } else {
              if (this.lastMove) {
                let weatherPosition = this.getMonByString(
                  this.lastMove.data[1],
                );
                weatherStatus.setter = weatherPosition;
              }
            }
            this.field.weather = weatherStatus;
          }
          break;
        case "-crit":
          if (line.parent?.data[0] === "move") {
            let critAttacker = this.getMonByString(line.parent.data[1]);
            if (critAttacker) {
              critAttacker.player.luck.crits.hits++;
            }
          }
          break;
        case "-miss":
          let missAttacker = this.getMonByString(line.data[1]);
          if (missAttacker) {
            if (line.data[1]) {
              missAttacker.player.luck.moves.hits--;
            }
          }
          break;
        case "cant":
          let cantMon = this.getMonByString(line.data[1]);
          if (cantMon) {
            if (line.data[2] === "par") {
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
          this.gametype = line.data[1];
          break;
        case "gen":
          this.genNum = +line.data[1];
          break;
        case "tier":
          break;
        case "clearpoke":
          break;
        case "teampreview":
          if (line.data[1]) {
            this.preview = +line.data[1];
          }
          break;
        case "-singlemove":
          let singleMoveMon = this.getMonByString(line.data[1]);
          if (singleMoveMon) {
            singleMoveMon.statuses.push({
              status: `move: ${line.data[2]}`,
              setter: singleMoveMon,
              name: line.data[2],
            });
          }
          break;
        case "-singleturn":
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
          let curePosition = this.getMonByString(line.data[1]);
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
              let hitMove = gens.dex.moves.get(this.lastMove.data[2]);
              if (hitMove.exists === true) {
                if (hitMove.target && hitMove.target !== "self") {
                  let hitCount = +line.data[2];
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
          let hpTarget = this.getMonByString(line.data[1]);
          if (hpTarget) {
            let newHpp = this.getHPP(line.data[2]);
            let hpDiff = hpTarget.hpp - newHpp;
            if (hpDiff > 0) {
              this.damage(hpTarget, newHpp, line.data.slice(3), line);
            } else if (hpDiff < 0) {
              this.heal(hpTarget, newHpp, line.data[3]);
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
          let swapSide = this.field.sides[+line.data[1].charAt(1) - 1];
          [
            swapSide[line.data[1].charAt(2) as PPosition],
            swapSide[["a", "b", "c"][+line.data[2]] as PPosition],
          ] = [
            swapSide[["a", "b", "c"][+line.data[2]] as PPosition],
            swapSide[line.data[1].charAt(2) as PPosition],
          ];
          break;
        case "-mega":
          break;
        case "-terastallize":
          let teraMon = this.getMonByString(line.data[1]);
          if (teraMon) {
            teraMon.formes.map((forme) => ({
              detail: `${forme.detail}, tera:${line.data[2]}`,
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
          this.events.push({
            player: 0,
            turn: line.turn?.number ?? 0,
            message: `${line.data[1]}`,
          });
          break;
        case "-end":
          let endMon = this.getMonByString(line.data[1]);
          if (endMon) {
            let endStatus = endMon.statuses.find(
              (status) =>
                status.status === line.data[2] ||
                status.status.startsWith(
                  line.data[2].toLowerCase().replace(" ", ""),
                ),
            );
            if (endStatus) {
              endStatus.ended = true;
            }
          }
          break;
        case "-sidestart":
          if (line.parent?.data[0] == "move") {
            let sideMon = this.getMonByString(line.parent.data[1]);
            if (sideMon) {
              let sideStartStatus = line.data[2].split(": ");
              this.field.sides[+line.data[1].charAt(1) - 1].statuses.push({
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
          this.field.sides[+line.data[1].charAt(1) - 1].statuses.splice(
            this.field.sides[+line.data[1].charAt(1) - 1].statuses.findIndex(
              (s) => s.status === line.data[2],
            ),
            1,
          );

          break;
        case "-start":
          let startMon = this.getMonByString(line.data[1]);
          if (startMon) {
            if (line.parent) {
              let startMonTarget = undefined;
              if (line.parent.data[0] === "move") {
                startMonTarget = this.getMonByString(line.parent.data[3]);
              } else {
                startMonTarget = startMon;
              }
              if (startMonTarget) {
                startMonTarget.statuses.push({
                  status: line.data[2],
                  setter: startMon,
                });
              }
            }
          }

          break;
        case "-fieldstart":
          let fieldStartStatus: Status = { status: line.data[1] };
          if (line.data[3] && line.data[3].startsWith("[of] ")) {
            let fieldStartSetter = this.getMonByString(
              this.ofP2P(line.data[3] as OFPOKEMON),
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
              (status) => status.status === line.data[1],
            ),
            1,
          );
          break;
        case "n":
          break;
        case "rated":
          break;
        default:
          console.log(line.data);
      }
      line.children.forEach((child) => {
        this.executeLine(child);
      });
    }

    toJson() {
      let stats: Stats[] = [];
      this.playerData.forEach((player) => {
        let playerStat: Stats = {
          username: player.username,
          win: player.win,
          stats: player.stats,
          total: {
            kills: player.team.reduce(
              (sum, pokemon) => sum + pokemon.kills[0] + pokemon.kills[1],
              0,
            ),
            deaths: player.team.reduce(
              (sum, pokemon) => sum + (pokemon.fainted ? 1 : 0),
              0,
            ),
            damageDealt: player.team.reduce(
              (sum, pokemon) =>
                sum + pokemon.damageDealt[0] + pokemon.damageDealt[1],
              0,
            ),
            damageTaken: player.team.reduce(
              (sum, pokemon) =>
                sum + pokemon.damageTaken[0] + pokemon.damageTaken[1],
              0,
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
            status: pokemon.fainted
              ? "fainted"
              : pokemon.brought || player.team.length >= player.teamSize
                ? "used"
                : "brought",
            moveset: [...pokemon.moveset].map((move) => move.name),
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
        gametype: this.gametype
          ? this.gametype.charAt(0).toUpperCase() + this.gametype.slice(1)
          : "",
        genNum: this.genNum,
        turns: (this.matchData.turns?.length ?? 0) - 1,
        gameTime: this.gameTime,
        stats: stats,
        events: this.events,
      };
    }

    static async fromReplayUrl(url: string) {
      if (!url || !validateUrl(url)) return null;
      const replayData = await fetch(`${formatUrl(url)}.log`);
      return new this(await replayData.text());
    }

    static async fromReplayFile(filePath: string) {
      const fs = await import("fs/promises");
      const file = await fs.readFile(filePath);
      const replayData = file.toString();
      return new this(replayData);
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
          (pokemon) => pokemon.nickname === pos.substring(4),
        );
      }
    }

    private updateChart(turnNumber: number) {
      this.playerData.forEach((player) =>
        player.turnChart.push({
          turn: turnNumber,
          damage: player.team.reduce(
            (sum, pokemon) => (sum += 100 - pokemon.hpp),
            0,
          ),
          remaining: player.team.reduce(
            (sum, pokemon) => (sum += pokemon.fainted ? 0 : 1),
            0,
          ),
        }),
      );
    }

    private searchStatuses(
      pokemon: Pokemon,
      status: string,
    ): Status | undefined {
      if (status === "Recoil") {
        return { status: status, setter: pokemon, name: "Recoil" };
      }
      if (pokemon.status.status === status) {
        return pokemon.status;
      }
      if (pokemon.lastDamage && pokemon.lastDamage.line.data[1]) {
        let monStatus = pokemon.statuses.find((s) => s.status === status);
        if (monStatus) return monStatus;
      }
      let sideStatus = pokemon.player.side.statuses.find(
        (s) => s.status === status,
      );
      if (sideStatus) {
        return sideStatus;
      }

      if (this.field.weather.status === status) {
        return this.field.weather;
      }
      if (pokemon.lastDamage && pokemon.lastDamage.line.data[1]) {
        let sideStatus = this.field.sides[
          +pokemon.lastDamage.line.data[1].charAt(1) - 1
        ].statuses.find((s) => s.status.split(": ")[1] === status);
        if (sideStatus) return sideStatus;
      }
      return;
    }

    private cleanStatuses() {
      this.field.statuses = this.field.statuses.filter(
        (status) => !status.ended,
      );
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
        }),
      );
      return;
    }

    private checkOwnKill(
      attacker: Pokemon | undefined,
      fainter: Pokemon | undefined,
    ): "self" | "ff" | "opp" {
      if (attacker === fainter) return "self";
      if (
        this.playerData.find(
          (player) => attacker && player.team.includes(attacker),
        ) ===
        this.playerData.find(
          (player) => fainter && player.team.includes(fainter),
        )
      )
        return "ff";
      return "opp";
    }

    private getHPP(hpString: HPSTATUS | HP): number {
      let hp = hpString.split(" ")[0].split("/");
      let hpp = +hp[0] > 0 ? +hp[0] / (+hp[1] / 100) : 0;
      return hpp;
    }

    private heal(
      healed: Pokemon,
      newHp: number,
      action: MARJORACTION | undefined,
    ) {
      let hpDiff = newHp - healed.hpp;
      healed.hpp = newHp;
      healed.fainted = false;
      healed.hpRestored += hpDiff;
    }

    private damage(
      target: Pokemon,
      newHpp: number,
      actions: MARJORACTION[] | undefined,
      line: Line,
    ) {
      let hppDiff = target.hpp - newHpp;
      target.hpp = newHpp;
      let lastDamage: LastDamage = {
        line: line,
        type: "indirect",
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
      if (from && from !== toID(lastDamage.line.parent?.data[2])) {
        if (of) {
          let ofMon = this.getMonByString(of);
          if (ofMon) {
            ofMon.damageDealt[1] += hppDiff;
            lastDamage.damager = ofMon;
          }
        } else if (from.startsWith("item: ")) {
          lastDamage.from = from.replace("item: ", "");
          lastDamage.damager = target;
        } else if (from.startsWith("ability: ")) {
        } else {
          let damageIndirect = this.searchStatuses(target, from);
          if (damageIndirect) {
            lastDamage.status = damageIndirect;
            lastDamage.from = damageIndirect.name;
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
        if (
          this.lastMove &&
          lastDamage.line.parent?.data === this.lastMove.data
        ) {
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
          let endSub = lastDamage.line.parent?.children.find(
            (child) => child.data[0] === "-end",
          );
          if (endSub) {
            let endMon = this.getMonByString(endSub.data[1] as POKEMON);
            if (endMon) {
              let endStatus = endMon.statuses.find(
                (status) => status.status === endSub.data[2],
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

    private makeKillString(ks: KillString): string {
      let s = `${ks.target.player.username}'s ${
        ks.target.formes[ks.target.formes.length - 1].detail.split(",")[0]
      } fainted`;

      if (ks.attacker) {
        if (ks.attacker === ks.target) {
          s += ` itself`;
          if (ks.reason) {
            s += ` from ${ks.reason}`;
          }
        } else {
          if (ks.indirect) s += " indirectly";
          if (ks.reason) {
            s += ` from ${ks.reason}`;
          }
          s += ` by ${ks.attacker.player.username}'s ${
            ks.attacker.formes[ks.attacker.formes.length - 1].detail.split(
              ",",
            )[0]
          }`;
        }
      }
      return s;
    }

    private upkeep(turn: Turn | undefined) {
      if (!turn) return;
      this.cleanStatuses();
      this.killStrings.forEach((ks) =>
        this.events.push({
          player: this.field.sides.indexOf(ks.target.player.side) + 1,
          turn: turn.number,
          message: `${this.makeKillString(ks)}.`,
        }),
      );
      this.killStrings = [];
    }

    getTest(): {
      gametype: string;
      genNum: number;
      turns: number;
      gameTime: number;
      stats: {
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
        team: {
          kills: [number, number, number];
          status: "brought" | "used" | "fainted";
          damageDealt: [number, number];
          damageTaken: [number, number];
          hpRestored: number;
          formes: {
            id: string;
          }[];
        }[];
      }[];
      events: number;
    } {
      const analysis = this.toJson();
      return {
        gametype: analysis.gametype,
        genNum: analysis.genNum,
        turns: analysis.turns,
        gameTime: analysis.gameTime,
        stats: analysis.stats.map((stat) => ({
          username: stat.username,
          win: stat.win,
          total: stat.total,
          stats: stat.stats,
          team: stat.team.map((pokemon) => ({
            kills: pokemon.kills,
            status: pokemon.status,
            damageDealt: [
              Math.round(pokemon.damageDealt[0] * 10) / 10,
              Math.round(pokemon.damageDealt[1] * 10) / 10,
            ],
            damageTaken: [
              Math.round(pokemon.damageTaken[0] * 10) / 10,
              Math.round(pokemon.damageTaken[1] * 10) / 10,
            ],
            hpRestored: Math.round(pokemon.hpRestored * 10) / 10,
            formes: pokemon.formes.map((forme) => ({
              id: forme.id ?? "",
            })),
          })),
        })),
        events: analysis.events.length,
      };
    }
  }

  export type Stats = {
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
      kills: [number, number, number];
      status: "brought" | "used" | "fainted";
      moveset: string[];
      damageDealt: [number, number, number];
      damageTaken: [number, number, number];
      calcLog: {
        damageTaken: { attacker: string; move: string; hpDiff: number }[];
        damageDealt: { target: string; move: string; hpDiff: number }[];
      };
      hpRestored: number;
      formes: { detail: string; id?: string }[];
    }[];
  };

  type LastDamage = {
    line: Line;
    damager?: Pokemon;
    type: "indirect" | "direct";
    status?: Status;
    from?: string;
  };

  type Status = {
    status: string;
    setter?: Pokemon;
    name?: string;
    ended?: true;
  };

  type KillString = {
    attacker?: Pokemon;
    target: Pokemon;
    reason?: string;
    indirect?: true;
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
  type POKEMON =
    | `p${PPlayer}${PPosition}: ${string}`
    | `p${PPlayer}: ${string}`;
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

  class Line {
    parent?: Line;
    turn?: Turn;
    data: ReplayData;
    get id(): ReplayData[0] {
      return this.data[0];
    }
    get parameters() {
      return this.data.slice(1);
    }

    children: Line[] = [];
    constructor(lineString: string) {
      this.data = lineString.split("|").map((e) => e.trim()) as ReplayData;
    }

    addChildLine(subLine: Line) {
      this.children.push(subLine);
      subLine.parent = this;
    }

    getTurnNumber() {
      if (this.turn) return this.turn.number;
      if (this.parent?.turn) return this.parent.turn.number;
      return undefined;
    }

    isChild(): boolean {
      return this.id.startsWith("-") || this.id === "debug";
    }
  }

  class Turn {
    number;
    lines: Line[];
    constructor(turnNumber: number, lines: Line[] = []) {
      this.number = turnNumber;
      this.lines = lines;
    }

    addLine(line: Line) {
      this.lines.push(line);
      line.turn = this;
    }
  }

  class Pokemon {
    formes: { detail: string; id?: string }[];
    nickname: string;
    hpp: number;
    moveset: Set<Move>;
    kills: [number, number, number] = [0, 0, 0];
    damageDealt: [number, number, number] = [0, 0, 0];
    damageTaken: [number, number, number] = [0, 0, 0];
    calcLog: {
      damageTaken: { attacker: Pokemon; move: Move; hpDiff: number }[];
      damageDealt: { target: Pokemon; move: Move; hpDiff: number }[];
    } = {
      damageTaken: [],
      damageDealt: [],
    };
    hpRestored: number = 0;
    lastDamage?: LastDamage;
    fainted: boolean = false;
    brought: boolean;
    status: Status = { status: "healthy" };
    player: Player;
    statuses: Status[] = [];

    constructor(
      dString: DETAILS,
      player: Player,
      pString?: POKEMON,
      options: {
        brought?: boolean;
      } = {},
    ) {
      this.formes = [
        {
          detail: dString,
          id: gens.dex.species.get(dString.split(",")[0])?.id,
        },
      ];
      this.nickname = pString?.split(" ")[1] ?? "";
      this.moveset = new Set<Move>();
      //normalize hpstatus
      this.hpp = 100;
      this.player = player;
      this.brought = options.brought ?? false;
    }
  }

  class Player {
    username: PLAYER;
    teamSize: number = 0;
    team: Pokemon[] = [];
    side: Side;
    turnChart: { turn: number; damage: number; remaining: number }[] = [];
    win: boolean = false;
    stats: {
      switches: number;
    } = { switches: 0 };
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
    } = {
      moves: { total: 0, hits: 0, expected: 0 },
      crits: { total: 0, hits: 0, expected: 0 },
      status: { total: 0, full: 0, expected: 0 },
    };

    constructor(side: Side, username: PLAYER) {
      this.side = side;
      this.username = username;
    }
  }

  class Side {
    a: {
      pokemon: undefined | Pokemon;
      statuses: Status[];
    } = { pokemon: undefined, statuses: [] };
    b: {
      pokemon: undefined | Pokemon;
      statuses: Status[];
    } = { pokemon: undefined, statuses: [] };
    c: {
      pokemon: undefined | Pokemon;
      statuses: Status[];
    } = { pokemon: undefined, statuses: [] };
    statuses: Status[] = [];
  }

  class Field {
    sides: Side[] = [];
    statuses: Status[] = [];
    weather: Status = { status: "none" };
  }
}

export function validateUrl(url: string): boolean {
  const pattern =
    /^(https:\/\/)?replay\.pokemonshowdown\.com\/[a-zA-Z0-9\-._~:/?#[\]\\@!$&'()*+,;=]+$/;
  return pattern.test(url);
}

export function formatUrl(url: string): string {
  if (!url) return url;
  if (!url.startsWith("https://")) {
    url = `https://${url}`;
  }
  const plainUrl = url.split("?")[0].split("#")[0];
  return plainUrl;
}
