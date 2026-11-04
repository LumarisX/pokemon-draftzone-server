import {
  MatchWinner,
  PokemonResultStatus,
} from "./external-matchup-match.schema";

export interface PokemonMatchStat {
  indirect?: number;
  kills?: number;
  teammate?: number;
  deaths?: number;
  brought?: number;
  status?: PokemonResultStatus;
}

export interface TeamMatchStat {
  stats: [string, PokemonMatchStat][];
  score: number;
}

export function normalizePokemonMatchStat(
  stat: PokemonMatchStat,
): PokemonMatchStat {
  const status =
    stat.status ??
    (stat.deaths
      ? "fainted"
      : stat.brought || stat.kills || stat.indirect || stat.teammate
        ? "survived"
        : undefined);
  const played = status === "survived" || status === "fainted";

  return {
    kills: stat.kills ?? 0,
    indirect: stat.indirect ?? 0,
    teammate: stat.teammate ?? 0,
    brought: played ? 1 : 0,
    deaths: status === "fainted" ? 1 : 0,
    status,
  };
}

export interface MatchPokemonRef {
  team: MatchWinner;
  pokemon: string;
}

export interface MatchKo {
  victim: MatchPokemonRef;
  attacker?: MatchPokemonRef;
  indirect: boolean;
  note?: string;
}

function isSameRef(a: MatchPokemonRef, b: MatchPokemonRef): boolean {
  return a.team === b.team && a.pokemon === b.pokemon;
}

export function teamWithKoCounts(
  team: TeamMatchStat,
  side: MatchWinner,
  kos: readonly MatchKo[],
): TeamMatchStat {
  return {
    score: team.score,
    stats: team.stats.map(([pokemonId, stat]) => {
      const self: MatchPokemonRef = { team: side, pokemon: pokemonId };
      const counts = { kills: 0, indirect: 0, teammate: 0 };
      for (const ko of kos) {
        if (!ko.attacker || !isSameRef(ko.attacker, self)) continue;
        if (isSameRef(ko.victim, self)) continue;
        if (ko.victim.team === side) counts.teammate += 1;
        else if (ko.indirect) counts.indirect += 1;
        else counts.kills += 1;
      }
      return [pokemonId, normalizePokemonMatchStat({ ...stat, ...counts })];
    }),
  };
}

function statsSignature(team?: TeamMatchStat): string {
  return (team?.stats ?? [])
    .map(([pokemonId, stat]) =>
      [
        pokemonId,
        stat.kills ?? 0,
        stat.indirect ?? 0,
        stat.teammate ?? 0,
        stat.status ?? "",
      ].join(":"),
    )
    .sort()
    .join("|");
}

export class ExternalMatch {
  winner?: MatchWinner;
  replay?: string;
  aTeam: TeamMatchStat;
  bTeam?: TeamMatchStat;
  kos?: MatchKo[];

  constructor(props: {
    winner?: MatchWinner;
    replay?: string;
    aTeam: TeamMatchStat;
    bTeam?: TeamMatchStat;
    kos?: MatchKo[];
  }) {
    this.winner = props.winner;
    this.replay = props.replay;
    this.aTeam = props.aTeam;
    this.bTeam = props.bTeam;
    this.kos = props.kos;
  }

  withKoCounts(): ExternalMatch {
    if (!this.kos) return this;
    return new ExternalMatch({
      winner: this.winner,
      replay: this.replay,
      aTeam: teamWithKoCounts(this.aTeam, "a", this.kos),
      bTeam: this.bTeam ? teamWithKoCounts(this.bTeam, "b", this.kos) : undefined,
      kos: this.kos,
    });
  }
}

export function keepUnchangedKos(
  match: ExternalMatch,
  previous?: ExternalMatch,
): ExternalMatch {
  if (match.kos || !previous?.kos) return match;
  const unchanged =
    statsSignature(match.aTeam) === statsSignature(previous.aTeam) &&
    statsSignature(match.bTeam) === statsSignature(previous.bTeam);
  if (!unchanged) return match;
  return new ExternalMatch({
    winner: match.winner,
    replay: match.replay,
    aTeam: match.aTeam,
    bTeam: match.bTeam,
    kos: previous.kos,
  });
}
