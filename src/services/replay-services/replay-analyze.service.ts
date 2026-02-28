import { Generations, Move, toID } from "@pkmn/data";
import { Dex } from "@pkmn/dex";

const gens = new Generations(Dex);
const critChances = [0, 0.041667, 0.125, 0.5, 1, 1];

type StatBreakdown = {
  direct: number;
  indirect: number;
  teammate: number;
};

function emptyStatBreakdown(): StatBreakdown {
  return { direct: 0, indirect: 0, teammate: 0 };
}

export namespace Replay {
  export class Analysis {
    t0: number = 0;
    tf: number = 0;
    field: Field = new Field();
    playerData: Player[] = [];
    lastMove: { data: MoveData; move: Move } | undefined;
    tempMons: { [key: string]: Pokemon } = {};
    events: { player: number; turn: number; message: string }[] = [];
    killStrings: KillString[] = [];
    gametype: undefined | GAMETYPE = undefined;
    genNum: number = 9;
    preview: number = 6;

    constructor(log: string) {
      const replayLines = log.split("\n|").reduce((lines, log) => {
        const line = new ReplayLine(log);
        if (line.isChild()) lines[lines.length - 1].addChildLine(line);
        else lines.push(line);
        return lines;
      }, [] as ReplayLine[]);

      const turns: Turn[] = [new Turn(0)];
      replayLines.forEach((line) => {
        if (line.action === "turn") {
          const [turnNumber] = line.args as [NUMBER];
          turns.push(new Turn(+turnNumber));
          return;
        }
        turns[turns.length - 1].addLine(line);
      });

      turns.forEach((turn) => {
        this.updateChart(turn.number);
        turn.lines.forEach((line) => this.executeLine(line));
      });
    }

    actionFns: { [key: string]: (line: ReplayLine) => void } = {
      "-ability": (line) => {
        const [pokemonStr, ability, fromEffect] = line.args as
          | [POKEMON, ABILITY, FROMEFFECT]
          | [POKEMON, ABILITY];
      },
      "-activate": (line) => {
        const [pokemonStr, effect, majoraction] = line.args as [
          POKEMON,
          EFFECT,
          MARJORACTION?,
        ];
        const activateMon = this.getPokemon(pokemonStr);
        if (!activateMon) return;
        activateMon.statuses.push({
          status: effect,
          setter: this.getPokemonFromOfArg(majoraction),
          name: effect.split(": ").at(-1),
        });
      },
      "-anim": (line) => {
        const [] = line.args as [];
      },
      "-block": (line) => {
        const [pokemonStr, effect, move, attacker] = line.args as [
          POKEMON,
          EFFECT,
          MOVE,
          ATTACKER,
        ];
      },
      "-boost": (line) => {
        const [pokemonStr, stat, amount] = line.args as [POKEMON, STAT, AMOUNT];
      },
      "-burst": (line) => {
        const [pokemonStr, species, item] = line.args as [
          POKEMON,
          SPECIES,
          ITEM,
        ];
      },
      "-center": (line) => {
        const [] = line.args as [];
      },
      "-clearallboost": (line) => {
        const [] = line.args as [];
      },
      "-clearboost": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      "-clearnegativeboost": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      "-clearpositiveboost": (line) => {
        const [target, pokemonStr, effect] = line.args as [
          TARGET,
          POKEMON,
          EFFECT,
        ];
      },
      "-combine": (line) => {
        const [] = line.args as [];
      },
      "-copyboost": (line) => {
        const [source, target] = line.args as [SOURCE, TARGET];
      },
      "-crit": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
        if (line.parent?.raw[0] !== "move") return;
        const critAttacker = this.getPokemon(line.parent.raw[1] as POKEMON);
        if (!critAttacker) return;
        critAttacker.player.luck.crits.hits++;
      },
      "-curestatus": (line) => {
        const [pokemonStr, status] = line.args as [POKEMON, STATUS];
        const curePosition = this.getPokemon(pokemonStr);
        if (!curePosition) return;
        curePosition.status = { status: "healthy" };
      },
      "-cureteam": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      "-damage": (line) => {
        const [pokemonStr, hpstatus, ...marjoractions] = line.args as [
          POKEMON,
          HPSTATUS,
          ...MARJORACTION[],
        ];
        const target = this.getPokemon(pokemonStr);
        if (!target) return;
        this.damage(
          target,
          this.calculateHPPercent(hpstatus),
          marjoractions,
          line,
        );
      },
      "-end": (line) => {
        const [pokemonStr, effect] = line.args as [POKEMON, EFFECT];
        const endMon = this.getPokemon(pokemonStr);
        if (!endMon) return;
        const endStatus = endMon.statuses.find(
          (status) =>
            status.status === effect ||
            status.status.startsWith(effect.toLowerCase().replace(" ", "")),
        );
        if (!endStatus) return;
        endStatus.ended = true;
      },
      "-endability": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      "-enditem": (line) => {
        const [pokemonStr, item] = line.args as [POKEMON, ITEM];
      },
      "-fail": (line) => {
        const [pokemonStr, action] = line.args as [POKEMON, ACTION];
      },
      "-fieldactivate": (line) => {
        const [] = line.args as [];
      },
      "-fieldend": (line) => {
        const [condition] = line.args as [CONDITION];
        this.field.statuses.splice(
          this.field.statuses.findIndex(
            (status) => status.status === condition,
          ),
          1,
        );
      },
      "-fieldstart": (line) => {
        const [condition, majoraction] = line.args as [
          CONDITION,
          MARJORACTION?,
        ];
        const fieldStartStatus: Status = {
          status: condition,
          setter: this.getPokemonFromOfArg(majoraction),
        };
        this.field.statuses.push(fieldStartStatus);
      },
      "-heal": (line) => {
        const [pokemonStr, hpstatus, ...majoractions] = line.args as [
          POKEMON,
          HPSTATUS,
          ...MARJORACTION[],
        ];
        const healPosition = this.getPokemon(pokemonStr);
        if (!healPosition) return;
        const newHp = this.calculateHPPercent(hpstatus);
        this.heal(healPosition, newHp, majoractions);
      },
      "-hint": (line) => {
        const [message] = line.args as [MESSAGE];
      },
      "-hitcount": (line) => {
        const [pokemonStr, num] = line.args as [POKEMON, NUM];
        this.handleHitCount(+num);
      },
      "-immune": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      "-invertboost": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      "-item": (line) => {
        const [pokemonStr, item] = line.args as [POKEMON, ITEM];
      },
      "-mega": (line) => {
        const [pokemonStr, megaStone] = line.args as [POKEMON, MEGASTONE];
      },
      "-message": (line) => {
        const [message] = line.args as [MESSAGE];
        this.events.push({
          player: 0,
          turn: line.turn?.number ?? 0,
          message: `${message}`,
        });
      },
      "-miss": (line) => {
        const [source, target] = line.args as [SOURCE, TARGET];
        const missAttacker = this.getPokemon(source);
        if (!missAttacker) return;
        missAttacker.player.luck.moves.hits--;
      },
      "-mustrecharge": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      "-notarget": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      "-prepare": (line) => {
        const [attacker, move, defender] = line.args as
          | [ATTACKER, MOVE, DEFENDER]
          | [ATTACKER, MOVE];
      },
      "-primal": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      "-resisted": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      "-setboost": (line) => {
        const [pokemonStr, stat, amount] = line.args as [POKEMON, STAT, AMOUNT];
      },
      "-sethp": (line) => {
        const [pokemonStr, hpstatus, ...majoractions] = line.args as [
          POKEMON,
          HP,
          ...MARJORACTION[],
        ];
        const hpTarget = this.getPokemon(pokemonStr);
        if (!hpTarget) return;
        const newHpp = this.calculateHPPercent(hpstatus);
        const hpDiff = hpTarget.hpp - newHpp;
        if (hpDiff > 0) {
          this.damage(hpTarget, newHpp, majoractions, line);
          return;
        }
        if (hpDiff < 0) {
          this.heal(hpTarget, newHpp, majoractions);
        }
      },
      "-sideend": (line) => {
        const [side, condition] = line.args as [SIDE, CONDITION];
        this.field.sides[this.getSide(side)].statuses.splice(
          this.field.sides[this.getSide(side)].statuses.findIndex(
            (s) => s.status === condition,
          ),
          1,
        );
      },
      "-sidestart": (line) => {
        const [side, condition] = line.args as [SIDE, CONDITION];
        if (line.parent?.raw[0] !== "move") return;
        const sideMon = this.getPokemon(line.parent.raw[1] as POKEMON);
        if (!sideMon) return;
        const sideStartStatus = condition.split(": ");
        this.field.sides[this.getSide(side)].statuses.push({
          status:
            sideStartStatus.length === 2
              ? sideStartStatus[1]
              : sideStartStatus[0],
          setter: sideMon,
        });
      },
      "-singlemove": (line) => {
        const [pokemonStr, move] = line.args as [POKEMON, MOVE];
        const singleMoveMon = this.getPokemon(pokemonStr);
        if (!singleMoveMon) return;
        singleMoveMon.statuses.push({
          status: `move: ${move}`,
          setter: singleMoveMon,
          name: move,
        });
      },
      "-singleturn": (line) => {
        const [pokemonStr, move] = line.args as [POKEMON, MOVE];
      },
      "-start": (line) => {
        const [pokemonStr, effect] = line.args as [POKEMON, EFFECT];
        const startMon = this.getPokemon(pokemonStr);
        if (!startMon || !line.parent) return;
        const isMoveStart = line.parent.raw[0] === "move";
        const startSetter = isMoveStart
          ? this.getPokemon(line.parent.raw[1] as POKEMON)
          : startMon;
        const startMonTarget =
          isMoveStart && line.parent.raw[3]
            ? this.getPokemon(line.parent.raw[3] as POKEMON)
            : startMon;
        startMonTarget.statuses.push({
          status: effect,
          setter: startSetter,
        });
      },
      "-status": (line) => {
        const [pokemonStr, status] = line.args as [POKEMON, STATUS];
        const statusPosition = this.getPokemon(pokemonStr);
        if (!statusPosition) return;
        const statusStart = this.buildStatusStart(line, statusPosition);
        statusPosition.status = statusStart;
      },
      "-supereffective": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      "-swapboost": (line) => {
        const [source, target, stats] = line.args as [SOURCE, TARGET, STATS];
      },
      "-swapsideconditions": (line) => {
        const [] = line.args as [];
      },
      "-terastallize": (line) => {
        const [pokemonStr, type] = line.args as [POKEMON, TYPE];
        const teraMon = this.getPokemon(pokemonStr);
        if (!teraMon) return;
        teraMon.formes = teraMon.formes.map((forme) => ({
          detail: `${forme.detail}, tera:${type}`,
          id: forme.id,
        }));
      },
      "-transform": (line) => {
        const [pokemonStr, species] = line.args as [POKEMON, SPECIES];
      },
      "-unboost": (line) => {
        const [pokemonStr, stat, amount] = line.args as [POKEMON, STAT, AMOUNT];
      },
      "-waiting": (line) => {
        const [source, target] = line.args as [SOURCE, TARGET];
      },
      "-weather": (line) => {
        const [weather] = line.args as [WEATHER];
        if (weather === this.field.weather.status) return;
        const weatherStatus: Status = { status: weather };
        weatherStatus.setter =
          this.getPokemonFromOfArg(line.args[2]) ??
          (this.lastMove ? this.getPokemon(this.lastMove.data[1]) : undefined);
        this.field.weather = weatherStatus;
      },
      "-zbroken": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      "-zpower": (line) => {
        const [pokemonStr] = line.args as [POKEMON];
      },
      c: (line) => {
        const [] = line.args as [];
      },
      "c:": (line) => {
        const [] = line.args as [];
      },
      cant: (line) => {
        const [pokemonStr, reason, move] = line.args as
          | [POKEMON, REASON]
          | [POKEMON, REASON, MOVE];
        if (reason !== "par") return;
        const cantMon = this.getPokemon(pokemonStr);
        if (!cantMon) return;
        cantMon.player.luck.status.full++;
        cantMon.player.luck.status.total++;
        cantMon.player.luck.status.expected += 0.25;
      },
      clearpoke: (line) => {
        const [] = line.args as [];
      },
      debug: (line) => {
        const [] = line.args as [];
      },
      detailschange: (line) => {
        const [pokemonStr, details, hpstatus] = line.args as [
          POKEMON,
          DETAILS,
          HPSTATUS,
        ];
        this.pushFormeIfPresent(pokemonStr, details);
      },
      drag: (line) => {
        const [pokemonStr, details, hpstatus] = line.args as [
          POKEMON,
          DETAILS,
          HPSTATUS,
        ];
        const switchPlayer = this.getPlayer(pokemonStr);
        const switchedMon = this.findTeamPokemonByDetails(
          switchPlayer,
          details,
        );
        if (switchedMon) {
          if (!switchedMon.brought) {
            switchedMon.brought = true;
            switchedMon.formes[0] = {
              detail: details,
              id: gens.dex.species.get(getSpeciesName(details))?.id,
            };
            switchedMon.nickname = pokemonStr.split(" ")[1];
          }
        } else {
          switchPlayer.team.push(
            new Pokemon(details, switchPlayer, pokemonStr, { brought: true }),
          );
        }
        const switchInMon = switchPlayer.team.find((pokemon) =>
          pokemon.formes.some((forme) => details.startsWith(forme.detail)),
        );
        this.field.sides[this.getSide(pokemonStr)][
          this.getPosition(pokemonStr)
        ].pokemon = switchInMon;
        if (switchInMon)
          this.tempMons[pokemonStr.substring(0, 3)] =
            structuredClone(switchInMon);
      },
      "-formechange": (line) => {
        const [pokemonStr, details, hpstatus] = line.args as [
          POKEMON,
          DETAILS,
          HPSTATUS,
        ];
        this.pushFormeIfPresent(pokemonStr, details);
      },
      error: (line) => {
        const [message] = line.args as
          | [`[Invalid choice] ${MESSAGE}`]
          | [`[Unavailable choice] ${MESSAGE}`];
      },
      faint: (line) => {
        const [pokemonStr] = line.args as [POKEMON];
        const faintMon = this.getPokemon(pokemonStr);
        if (!faintMon) return;

        faintMon.fainted = true;
        const killString: KillString = { target: faintMon };

        if (!faintMon.lastDamage) {
          this.applyFaintWithoutLastDamage(killString, faintMon);
          this.killStrings.push(killString);
          return;
        }

        const destinyBondMon = this.findDestinyBondFainter(faintMon);
        if (destinyBondMon) {
          destinyBondMon.kills.indirect++;
          killString.reason = "Destiny Bond";
          killString.indirect = true;
          killString.attacker = destinyBondMon;
          this.killStrings.push(killString);
          return;
        }

        this.applyFaintFromLastDamage(killString, faintMon, line);
        this.killStrings.push(killString);
      },
      gametype: (line) => {
        const [gametype] = line.args as [GAMETYPE];
        this.gametype = gametype;
      },
      gen: (line) => {
        const [genNum] = line.args as [GENNUM];
        this.genNum = +genNum;
      },
      html: (line) => {
        const [] = line.args as [];
      },
      inactive: (line) => {
        const [message] = line.args as [MESSAGE];
      },
      inactiveoff: (line) => {
        const [message] = line.args as [MESSAGE];
      },
      j: (line) => {
        const [] = line.args as [];
      },
      l: (line) => {
        const [] = line.args as [];
      },
      message: (line) => {
        const [] = line.args as [];
      },
      move: (line) => {
        const [pokemonStr, moveName, target, ...marjoractions] = line.args as [
          POKEMON,
          MOVE,
          TARGET,
          ...MARJORACTION[],
        ];
        const attacker = this.getPokemon(pokemonStr);
        if (!attacker) return;
        const move = attacker.getMove(moveName);
        if (move.exists !== true) return;
        this.lastMove = {
          data: line.raw as MoveData,
          move: move,
        };
        this.recordMoveUsageLuck(attacker, move);
        if (attacker.status.status !== "par") return;
        attacker.player.luck.status.total++;
        attacker.player.luck.status.expected += 0.25;
      },
      n: (line) => {
        const [] = line.args as [];
      },
      player: (line) => {
        const [playerStr, username, avatar, rating] = line.args as [
          PLAYER,
          USERNAME,
          AVATAR,
          RATING,
        ];
        if (
          username &&
          !this.playerData.find((player) => player.username === username)
        ) {
          const side = new Side();
          this.playerData.push(new Player(side, username));
          this.field.sides.push(side);
        }
      },
      poke: (line) => {
        const [playerStr, details, item] = line.args as [PLAYER, DETAILS, ITEM];
        const pokePlayer = this.getPlayer(playerStr);
        pokePlayer.team.push(new Pokemon(details, pokePlayer));
      },
      rated: (line) => {
        const [message] = line.args as [MESSAGE];
      },
      raw: (line) => {
        const [] = line.args as [];
      },
      request: (line) => {
        const [request] = line.args as [REQUEST];
      },
      rule: (line) => {
        const [rule] = line.args as [`${RULE}: ${DESCRIPTION}`];
      },
      start: (line) => {
        const [] = line.args as [];
      },
      swap: (line) => {
        const [pokemonStr, position] = line.args as [POKEMON, POSITION];
        let swapSide = this.field.sides[this.getSide(pokemonStr)];
        [
          swapSide[this.getPosition(pokemonStr)],
          swapSide[["a", "b", "c"][+position] as PPosition],
        ] = [
          swapSide[["a", "b", "c"][+position] as PPosition],
          swapSide[this.getPosition(pokemonStr)],
        ];
      },
      switch: (line) => {
        const [pokemonStr, details, hpstatus] = line.args as [
          POKEMON,
          DETAILS,
          HPSTATUS,
        ];
        this.playerData[this.getSide(pokemonStr)].stats.switches++;
        this.actionFns.drag(line);
      },

      replace: (line) => {
        const [pokemonStr, details, hpstatus] = line.args as [
          POKEMON,
          DETAILS,
          HPSTATUS,
        ];
        let replaceMon = this.getPokemon(pokemonStr);
        if (!replaceMon) return;
        const illusionPlayer = this.getPlayer(pokemonStr);
        let illusionMon = this.findTeamPokemonByDetails(
          illusionPlayer,
          details,
        );

        const tempReplaceMon = this.tempMons[pokemonStr.substring(0, 3)];
        if (!illusionMon) {
          illusionMon = new Pokemon(details, illusionPlayer, pokemonStr, {
            brought: true,
          });
        }
        illusionMon.brought = replaceMon.brought;
        illusionMon.hpp = replaceMon.hpp;
        illusionMon.moveset = new Set([
          ...illusionMon.moveset,
          ...replaceMon.moveset,
        ]);
        illusionMon.hpRestored +=
          replaceMon.hpRestored - tempReplaceMon.hpRestored;
        illusionMon.damageDealt = {
          direct:
            replaceMon.damageDealt.direct - tempReplaceMon.damageDealt.direct,
          indirect:
            replaceMon.damageDealt.indirect -
            tempReplaceMon.damageDealt.indirect,
          teammate:
            replaceMon.damageDealt.teammate -
            tempReplaceMon.damageDealt.teammate,
        };
        illusionMon.lastDamage = replaceMon.lastDamage;
        illusionMon.damageTaken = {
          direct:
            replaceMon.damageTaken.direct - tempReplaceMon.damageTaken.direct,
          indirect:
            replaceMon.damageTaken.indirect -
            tempReplaceMon.damageTaken.indirect,
          teammate:
            replaceMon.damageTaken.teammate -
            tempReplaceMon.damageTaken.teammate,
        };
        // illusionMon.calcLog
        illusionMon.status = replaceMon.status;
        illusionMon.statuses = replaceMon.statuses.filter(
          (status) =>
            !tempReplaceMon.statuses.find((s) => s.name === status.name),
        );
        illusionMon.kills = {
          direct: replaceMon.kills.direct - tempReplaceMon.kills.direct,
          indirect: replaceMon.kills.indirect - tempReplaceMon.kills.indirect,
          teammate: replaceMon.kills.teammate - tempReplaceMon.kills.teammate,
        };
        illusionMon.fainted = replaceMon.fainted;
        this.killStrings.forEach((ks) => {
          if (ks.attacker === replaceMon) ks.attacker = illusionMon;
          if (ks.target === replaceMon) ks.target = illusionMon;
        });
        this.field.sides[this.getSide(pokemonStr)][
          this.getPosition(pokemonStr)
        ].pokemon = illusionMon;
        replaceMon = tempReplaceMon;
      },
      "t:": (line) => {
        const [timestamp] = line.args as [TIMESTAMP];
        if (this.t0) this.tf = +timestamp;
        else this.t0 = +timestamp;
      },
      teampreview: (line) => {
        const [number] = line.args as [NUMBER?];
        if (number) this.preview = +number;
      },
      teamsize: (line) => {
        const [playerStr, number] = line.args as [PLAYER, NUMBER];
        this.getPlayer(playerStr).teamSize = +number;
      },
      tie: (line) => {
        const [] = line.args as [];
      },
      tier: (line) => {
        const [formatName] = line.args as [FORMATNAME];
      },
      turn: (line) => {
        const [number] = line.args as [NUMBER];
      },
      uhtml: (line) => {
        const [] = line.args as [];
      },
      upkeep: (line) => {
        const [] = line.args as [];
        this.upkeep(line.turn);
      },
      win: (line) => {
        const [user] = line.args as [USER];
        this.upkeep(line.turn);
        this.updateChart(line.turn?.number ?? 0);
        const winPlayer = this.playerData.findIndex(
          (player) => player.username == user,
        );
        if (winPlayer < 0) return;
        this.playerData[winPlayer].win = true;
        this.events.push({
          turn: line.turn?.number ?? 0,
          player: winPlayer + 1,
          message: `${user} wins.`,
        });
      },
    };

    private isOfPokemon(arg: string): arg is OFPOKEMON {
      return arg.startsWith("[of] ");
    }

    private getPokemonFromOfArg(
      ofArg: string | undefined,
    ): Pokemon | undefined {
      if (!ofArg || !this.isOfPokemon(ofArg)) return undefined;
      const ofPokemon = this.fromOfPokemonToPokemon(ofArg);
      if (!ofPokemon) return undefined;
      return this.getPokemon(ofPokemon);
    }

    private pushFormeIfPresent(pokemonStr: POKEMON, details: DETAILS) {
      const detailMon = this.getPokemon(pokemonStr);
      if (!detailMon) return;
      detailMon.formes.push({
        detail: details,
        id: gens.dex.species.get(getSpeciesName(details))?.id,
      });
    }

    private recordMoveUsageLuck(attacker: Pokemon, move: Move) {
      if (!move.target || move.target === "self") return;
      attacker.player.luck.moves.expected +=
        move.accuracy === true ? 1 : move.accuracy / 100;
      attacker.player.luck.moves.total++;
      attacker.player.luck.moves.hits++;

      if (
        !move.critRatio ||
        (move.category !== "Physical" && move.category !== "Special")
      ) {
        return;
      }

      const critChance = move.critRatio;
      attacker.player.luck.crits.expected +=
        critChance > 6 ? 1 : critChances[critChance];
      attacker.player.luck.crits.total++;
    }

    private handleHitCount(hitCount: number) {
      if (!this.lastMove || hitCount <= 1) return;
      const hitAttacker = this.getPokemon(this.lastMove.data[1]);
      if (!hitAttacker) return;

      const hitMove = gens.dex.moves.get(this.lastMove.data[2]);
      if (
        hitMove.exists !== true ||
        !hitMove.target ||
        hitMove.target === "self"
      ) {
        return;
      }

      for (let h = 1; h < hitCount; h++) {
        this.recordMoveUsageLuck(hitAttacker, hitMove);
      }
    }

    private getBaseStatus(status: STATUS): Status {
      switch (status) {
        case "tox":
          return { status: "psn", name: "Toxic" };
        case "psn":
          return { status: "psn", name: "Poison" };
        case "brn":
          return { status: "brn", name: "Burn" };
        case "par":
          return { status: "par", name: "Paralysis" };
        case "frz":
          return { status: "frz", name: "Freeze" };
        default:
          return { status };
      }
    }

    private resolveSwitchStatusSetter(
      line: ReplayLine,
      pokemonStr: POKEMON,
      statusStart: Status,
    ): Pokemon | undefined {
      if (!line.parent) return undefined;

      if (
        (line.parent.raw[0] === "switch" ||
          line.parent.raw[0] === "drag" ||
          line.parent.raw[0] === "replace") &&
        statusStart.status === "psn"
      ) {
        return this.field.sides[this.getSide(pokemonStr)].statuses.find(
          (s) =>
            s.status === "move: Toxic Spikes" || s.status === "Toxic Spikes",
        )?.setter;
      }

      if (line.parent.raw[0] !== "move") return undefined;
      const statusOnProtect = line.parent.children.find(
        (child) =>
          child.raw[0] === "-activate" && child.raw[2] === "move: Protect",
      );
      if (statusOnProtect?.raw[0] === "-activate") {
        return this.getPokemon(statusOnProtect.raw[1] as POKEMON);
      }

      return this.getPokemon(line.parent.raw[1] as POKEMON);
    }

    private buildStatusStart(
      line: ReplayLine,
      statusPosition: Pokemon,
    ): Status {
      const [pokemonStr, status, ...majoractions] = line.args as [
        POKEMON,
        STATUS,
        ...MARJORACTION[],
      ];
      const statusStart = this.getBaseStatus(status);

      if (line.args[2]) {
        if (line.args[2].startsWith("[from] item: ")) {
          statusStart.setter = statusPosition;
          return statusStart;
        }
        if (this.lastMove && this.lastMove.data[3] === pokemonStr) {
          statusStart.setter = this.getPokemon(this.lastMove.data[1]);
          return statusStart;
        }
        if (majoractions[0] && this.isOfPokemon(majoractions[0])) {
          statusStart.setter = this.getPokemonFromOfArg(
            majoractions[0] as OFPOKEMON,
          );
        }
        return statusStart;
      }

      statusStart.setter = this.resolveSwitchStatusSetter(
        line,
        pokemonStr,
        statusStart,
      );
      return statusStart;
    }

    private findTeamPokemonByDetails(
      player: Player,
      details: DETAILS,
    ): Pokemon | undefined {
      return player.team.find((pokemon) => {
        if (!pokemon.brought) {
          return new RegExp(
            String.raw`^${pokemon.formes[0].detail.replace("-*", ".*")}`,
          ).test(details);
        }
        const detailSet = new Set(details.split(", "));
        return pokemon.formes.some((forme) =>
          forme.detail.split(", ").every((entry) => detailSet.has(entry)),
        );
      });
    }

    private findDestinyBondFainter(faintMon: Pokemon): Pokemon | undefined {
      const destinyBondMonList = this.field.sides
        .map((side) =>
          [side.a.pokemon, side.b.pokemon, side.c.pokemon].find(
            (pokemon) =>
              pokemon && this.searchStatuses(pokemon, "move: Destiny Bond"),
          ),
        )
        .filter((pokemon): pokemon is Pokemon => Boolean(pokemon));

      if (!destinyBondMonList.some((mon) => mon !== faintMon)) return undefined;

      return destinyBondMonList.find(
        (pokemon) =>
          pokemon.fainted && pokemon.lastDamage?.damager === faintMon,
      );
    }

    private applyFaintFromLastDamage(
      killString: KillString,
      faintMon: Pokemon,
      line: ReplayLine,
    ) {
      if (faintMon.lastDamage?.type === "direct") {
        this.applyFaintFromDirectDamage(killString, faintMon, line);
        return;
      }

      if (faintMon.lastDamage?.type === "indirect") {
        this.applyFaintFromIndirectDamage(killString, faintMon);
      }
    }

    private applyFaintFromDirectDamage(
      killString: KillString,
      faintMon: Pokemon,
      line: ReplayLine,
    ) {
      if (!this.lastMove) return;

      if (this.lastMove.data === faintMon.lastDamage?.line.parent?.raw) {
        const faintAttacker = this.getPokemon(this.lastMove.data[1]);
        killString.reason = this.lastMove.data[2];
        if (!faintAttacker) {
          console.log("ks error", line.args);
          return;
        }

        const faintOwnKill = this.checkOwnKill(faintAttacker, faintMon);
        killString.attacker = faintAttacker;
        if (faintOwnKill === "opp") {
          faintAttacker.kills.direct++;
        } else if (faintOwnKill === "ff") {
          faintAttacker.kills.teammate++;
        }
        return;
      }

      const status = faintMon.lastDamage?.status;
      if (!status) return;
      killString.reason = status.status.replace("move: ", "");
      killString.indirect = true;
      if (status.setter) {
        status.setter.kills.direct++;
      }
    }

    private applyFaintFromIndirectDamage(
      killString: KillString,
      faintMon: Pokemon,
    ) {
      killString.indirect = true;
      const damager = faintMon.lastDamage?.damager;
      if (!damager) return;

      const faintFromOwnKill = this.checkOwnKill(damager, faintMon);
      killString.attacker = damager;
      killString.reason = faintMon.lastDamage?.from;
      if (faintFromOwnKill === "opp") {
        damager.kills.indirect++;
      } else if (faintFromOwnKill === "ff") {
        damager.kills.teammate++;
      }
    }

    private applyFaintWithoutLastDamage(
      killString: KillString,
      faintMon: Pokemon,
    ) {
      if (!this.lastMove) return;
      const faintMove = gens.dex.moves.get(this.lastMove.data[2]);
      if (!("selfdestruct" in faintMove)) return;
      killString.attacker = faintMon;
      killString.reason = faintMove.name;
    }

    private executeLine(line: ReplayLine) {
      try {
        const handler = this.actionFns[line.action];
        if (handler) {
          handler(line);
        }
      } catch (error) {
        console.error(`Error processing line: ${line.raw.join("|")}`, error);
      }
      line.children.forEach((child) => {
        this.executeLine(child);
      });
    }

    private getPokemon(pokemonStr: POKEMON): Pokemon {
      const pokemon =
        this.field.sides[this.getSide(pokemonStr)][this.getPosition(pokemonStr)]
          .pokemon;
      if (!pokemon)
        throw new Error(`Pokemon not found for string: ${pokemonStr}`);

      return pokemon;
    }

    private heal(
      healed: Pokemon,
      newHp: number,
      action: MARJORACTION[] | undefined,
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
      line: ReplayLine,
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
          from = this.fromEffectToEffect(action as FROMEFFECT);
        } else if (this.isOfPokemon(action)) {
          of = this.fromOfPokemonToPokemon(action as OFPOKEMON);
        }
      }

      //Indirect Damage
      if (from && from !== toID(lastDamage.line.parent?.raw[2])) {
        if (of) {
          let ofMon = this.getPokemon(of);
          if (ofMon) {
            ofMon.damageDealt.indirect += hppDiff;
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
                damageIndirect.setter.damageDealt.indirect += hppDiff;
              }
              lastDamage.damager = damageIndirect.setter;
            }
          }
        }
        target.damageTaken.indirect += hppDiff;
      } //Direct Damage
      else {
        lastDamage.type = "direct";
        if (
          this.lastMove &&
          lastDamage.line.parent?.raw === this.lastMove.data
        ) {
          target.damageTaken.direct += hppDiff;
          let moveDamageAttacker = this.getPokemon(this.lastMove.data[1]);
          if (moveDamageAttacker && moveDamageAttacker != target) {
            lastDamage.damager = moveDamageAttacker;
            moveDamageAttacker.damageDealt.direct += hppDiff;
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
          target.damageTaken.indirect += hppDiff;
          let endSub = lastDamage.line.parent?.children.find(
            (child) => child.raw[0] === "-end",
          );
          if (endSub) {
            let endMon = this.getPokemon(endSub.raw[1] as POKEMON);
            if (endMon) {
              let endStatus = endMon.statuses.find(
                (status) => status.status === endSub.raw[2],
              );
              if (endStatus) {
                lastDamage.status = endStatus;
                if (endStatus.setter) {
                  lastDamage.damager = endStatus.setter;
                  endStatus.setter.damageDealt.direct += hppDiff;
                }
              }
            }
          }
        }
      }
      target.lastDamage = lastDamage;
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
      if (pokemon.lastDamage && pokemon.lastDamage.line.raw[1]) {
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
      if (pokemon.lastDamage && pokemon.lastDamage.line.raw[1]) {
        let sideStatus = this.field.sides[
          this.getSide(pokemon.lastDamage.line.raw[1] as POKEMON)
        ].statuses.find((s) => s.status.split(": ")[1] === status);
        if (sideStatus) return sideStatus;
      }
      return;
    }

    private fromEffectToEffect(fromEffect: FROMEFFECT): EFFECT {
      return fromEffect.substring(7);
    }

    private fromOfPokemonToPokemon(ofPokemon: OFPOKEMON): POKEMON | undefined {
      if (this.isOfPokemon(ofPokemon)) return ofPokemon.substring(5) as POKEMON;
      return undefined;
    }

    private getPlayer(str: POKEMON | PLAYER): Player {
      return this.playerData[this.getSide(str)];
    }

    private getSide(str: POKEMON | PLAYER): number {
      return +str.charAt(1) - 1;
    }

    private getPosition(pokemon: POKEMON): PPosition {
      return pokemon.charAt(2) as PPosition;
    }

    private calculateHPPercent(hpString: HPSTATUS | HP): number {
      let hp = hpString.split(" ")[0].split("/");
      let hpp = +hp[0] > 0 ? +hp[0] / (+hp[1] / 100) : 0;
      return hpp;
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

    private makeKillString(ks: {
      attacker?: Pokemon;
      target: Pokemon;
      reason?: string;
      indirect?: true;
    }): string {
      let s = `${ks.target.player.username}'s ${getSpeciesName(
        ks.target.formes[ks.target.formes.length - 1].detail,
      )} fainted`;

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

    toClient() {
      return {};
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
              (sum, pokemon) =>
                sum + pokemon.kills.direct + pokemon.kills.indirect,
              0,
            ),
            deaths: player.team.reduce(
              (sum, pokemon) => sum + (pokemon.fainted ? 1 : 0),
              0,
            ),
            damageDealt: player.team.reduce(
              (sum, pokemon) =>
                sum + pokemon.damageDealt.direct + pokemon.damageDealt.indirect,
              0,
            ),
            damageTaken: player.team.reduce(
              (sum, pokemon) =>
                sum + pokemon.damageTaken.direct + pokemon.damageTaken.indirect,
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
            kills: [
              pokemon.kills.direct,
              pokemon.kills.indirect,
              pokemon.kills.teammate,
            ],
            status: pokemon.fainted
              ? "fainted"
              : pokemon.brought || player.team.length >= player.teamSize
                ? "used"
                : "brought",
            moveset: [...pokemon.moveset].map((move) => move.name),
            damageDealt: [
              pokemon.damageDealt.direct,
              pokemon.damageDealt.indirect,
              pokemon.damageDealt.teammate,
            ],
            damageTaken: [
              pokemon.damageTaken.direct,
              pokemon.damageTaken.indirect,
              pokemon.damageTaken.teammate,
            ],
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
        turns: Math.max(
          ...this.playerData
            .flatMap((player) => player.turnChart.map((entry) => entry.turn))
            .concat(0),
        ),
        gameTime: this.tf - this.t0,
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
  }

  type ReplayData = string[];

  class ReplayLine {
    parent?: ReplayLine;
    turn?: Turn;
    raw: ReplayData;
    children: ReplayLine[] = [];

    get action(): ReplayData[0] {
      return this.raw[0];
    }
    get args() {
      return this.raw.slice(1);
    }

    constructor(lineString: string) {
      this.raw = lineString.split("|").map((e) => e.trim());
    }

    addChildLine(subLine: ReplayLine) {
      this.children.push(subLine);
      subLine.parent = this;
    }

    getTurnNumber() {
      if (this.turn) return this.turn.number;
      if (this.parent?.turn) return this.parent.turn.number;
      return undefined;
    }

    isChild(): boolean {
      return this.action.startsWith("-") || this.action === "debug";
    }
  }

  class Turn {
    number;
    lines: ReplayLine[];
    constructor(turnNumber: number, lines: ReplayLine[] = []) {
      this.number = turnNumber;
      this.lines = lines;
    }

    addLine(line: ReplayLine) {
      this.lines.push(line);
      line.turn = this;
    }
  }

  type LastDamage = {
    line: ReplayLine;
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

  function getSpeciesName(details: DETAILS): string {
    return details.split(",")[0];
  }

  class Pokemon {
    formes: { detail: string; id?: string }[];
    nickname: string;
    hpp: number;
    moveset: Set<Move>;
    kills: StatBreakdown = emptyStatBreakdown();
    damageDealt: StatBreakdown = emptyStatBreakdown();
    damageTaken: StatBreakdown = emptyStatBreakdown();
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
          id: gens.dex.species.get(getSpeciesName(dString))?.id,
        },
      ];
      this.nickname = pString?.split(" ")[1] ?? "";
      this.moveset = new Set<Move>();
      this.hpp = 100;
      this.player = player;
      this.brought = options.brought ?? false;
    }

    getMove(moveName: MOVE): Move {
      let move = [...this.moveset].find((move) => move.name === moveName);
      if (!move) {
        move = gens.dex.moves.get(moveName);
        this.moveset.add(move);
      }
      return move;
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

  // TODO: See if this can be replace/removed
  type KillString = {
    attacker?: Pokemon;
    target: Pokemon;
    reason?: string;
    indirect?: true;
  };

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
