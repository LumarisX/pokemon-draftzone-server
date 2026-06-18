import { Types } from "mongoose";
import { DraftSpecie } from "../../../../classes/pokemon";
import { Format } from "@core/data/formats/formats";
import { Ruleset } from "@core/data/rulesets/rulesets";
import { ExternalMatchup } from "./external-matchup/external-matchup.domain";

export interface TournamentScore {
  wins: number;
  losses: number;
  diff: string;
}

export class ExternalTournament {
  _id?: Types.ObjectId;
  ruleset: Ruleset;
  format: Format;
  leagueName: string;
  teamName: string;
  key: string;
  owner: string;
  team: DraftSpecie[];
  doc?: string;
  matchups: ExternalMatchup[];
  constructor(
    props: {
      _id?: Types.ObjectId;
      ruleset: Ruleset;
      format: Format;
      leagueName: string;
      teamName: string;
      key: string;
      owner: string;
      team: DraftSpecie[];
      doc?: string;
    },
    matchups: ExternalMatchup[],
  ) {
    this._id = props._id;
    this.ruleset = props.ruleset;
    this.format = props.format;
    this.leagueName = props.leagueName;
    this.teamName = props.teamName;
    this.key = props.key;
    this.owner = props.owner;
    this.team = props.team;
    this.matchups = matchups;
  }

  calculateScore(): TournamentScore {
    let wins = 0;
    let losses = 0;
    let netDiff = 0;

    for (const matchup of this.matchups) {
      if (!matchup.matches || matchup.matches.length === 0) continue;

      if (matchup.matches.length > 1) {
        let seriesWins = 0;
        let seriesLosses = 0;

        for (const match of matchup.matches) {
          if (match.winner === "a") seriesWins++;
          if (match.winner === "b") seriesLosses++;
        }

        if (seriesWins > seriesLosses) wins++;
        else if (seriesLosses > seriesWins) losses++;

        netDiff += seriesWins - seriesLosses;
      } else {
        const singleMatch = matchup.matches[0];
        const scoreA = singleMatch.aTeam?.score ?? 0;
        const scoreB = singleMatch.bTeam?.score ?? 0;

        if (scoreA > scoreB) wins++;
        else if (scoreA < scoreB) losses++;

        netDiff += scoreA - scoreB;
      }
    }

    return {
      wins,
      losses,
      diff: `${netDiff >= 0 ? "+" : ""}${netDiff}`,
    };
  }
}
