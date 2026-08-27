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

export class ExternalMatch {
  winner?: MatchWinner;
  replay?: string;
  aTeam: TeamMatchStat;
  bTeam?: TeamMatchStat;

  constructor(props: {
    winner?: MatchWinner;
    replay?: string;
    aTeam: TeamMatchStat;
    bTeam?: TeamMatchStat;
  }) {
    this.winner = props.winner;
    this.replay = props.replay;
    this.aTeam = props.aTeam;
    this.bTeam = props.bTeam;
  }
}
