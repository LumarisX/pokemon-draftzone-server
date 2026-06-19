export interface PokemonMatchStat {
  indirect?: number;
  kills?: number;
  deaths?: number;
  brought?: number;
}

export interface TeamMatchStat {
  stats: [string, PokemonMatchStat][];
  score: number;
}

export class ExternalMatch {
  winner?: "a" | "b";
  replay?: string;
  aTeam: TeamMatchStat;
  bTeam?: TeamMatchStat;

  constructor(props: {
    winner?: "a" | "b";
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
