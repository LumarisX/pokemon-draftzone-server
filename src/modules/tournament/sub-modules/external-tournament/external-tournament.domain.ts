import { Format } from "@core/data/formats/formats";
import { Ruleset } from "@core/data/rulesets/rulesets";
import { Types } from "mongoose";
import { ExternalMatchup } from "../../../matchup/sub-modules/external-matchup/external-matchup.domain";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { PokemonEntity } from "@modules/pokemon/pokemon.schema";

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
  team: PDZPokemon[];
  unresolvedTeam: PokemonEntity[];
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
      team: PDZPokemon[];
      unresolvedTeam?: PokemonEntity[];
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
    this.unresolvedTeam = props.unresolvedTeam ?? [];
    this.doc = props.doc;
    this.matchups = matchups;
  }

  getScore(): TournamentScore {
    const score: TournamentScore = { wins: 0, losses: 0, diff: "+0" };
    let numDiff = 0;
    const seriesScoring = this.matchups.some(
      (matchup) => (matchup.matches?.length ?? 0) > 1,
    );

    if (seriesScoring) {
      for (const matchup of this.matchups) {
        let matchupWins = 0;
        let matchupLosses = 0;
        for (const match of matchup.matches ?? []) {
          if (match.winner === "a") matchupWins++;
          else if (match.winner === "b") matchupLosses++;
        }
        if (matchupWins > matchupLosses) score.wins++;
        else if (matchupLosses > matchupWins) score.losses++;
        numDiff += matchupWins - matchupLosses;
      }
    } else {
      for (const matchup of this.matchups) {
        const match = matchup.matches?.[0];
        if (!match) continue;
        const aScore = match.aTeam?.score ?? 0;
        const bScore = match.bTeam?.score ?? 0;
        if (aScore > bScore) score.wins++;
        else if (aScore < bScore) score.losses++;
        numDiff += aScore - bScore;
      }
    }

    score.diff = (numDiff < 0 ? "" : "+") + numDiff;
    return score;
  }
}
