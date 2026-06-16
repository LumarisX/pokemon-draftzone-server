import { Types } from "mongoose";
import { DraftSpecie } from "../../classes/pokemon";
import { getRuleset, Ruleset } from "../../data/rulesets";
import { MatchupDocument } from "../../models/draft/matchup.model";
import { Format, getFormat } from "../../data/formats";
import { DraftDocument } from "../../models/draft/draft.model";
import { TournamentDto } from "./tournament.dto";

export interface TournamentScore {
  wins: number;
  losses: number;
  diff: string;
}

export class Tournament {
  constructor(
    public readonly _id: Types.ObjectId | undefined,
    public readonly ruleset: Ruleset,
    public readonly format: Format,
    public readonly leagueName: string,
    public readonly teamName: string,
    public readonly tournamentId: string,
    public readonly owner: string,
    public readonly team: DraftSpecie[],
    public readonly doc?: string,
  ) {}

  public calculateScore(matchups: MatchupDocument[]): TournamentScore {
    let wins = 0;
    let losses = 0;
    let netDiff = 0;

    for (const matchup of matchups) {
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

  public toDatabasePayload() {
    return {
      leagueName: this.leagueName,
      leagueId: this.tournamentId,
      teamName: this.teamName,
      format: this.format.name,
      ruleset: this.ruleset.name,
      owner: this.owner,
      doc: this.doc,
      team: this.team.map((pokemon) => pokemon.toData()),
    };
  }

  public toClientPayload(matchups: MatchupDocument[]) {
    return {
      id: this._id?.toString(),
      leagueName: this.leagueName,
      tournamentId: this.tournamentId,
      teamName: this.teamName,
      format: this.format.name,
      ruleset: this.ruleset.name,
      score: this.calculateScore(matchups),
      doc: this.doc,
      team: this.team.map((pokemon) => pokemon.toClient()),
    };
  }

  public static fromForm(dto: TournamentDto, userId: string): Tournament {
    const computedId = dto.leagueName.toLowerCase().trim().replace(/\W/gi, "");
    const ruleset = getRuleset(dto.ruleset);
    const format = getFormat(dto.format);
    const mappedTeam = dto.team
      .filter((poke) => poke.id)
      .map((poke) => new DraftSpecie(poke, ruleset));

    return new Tournament(
      undefined,
      ruleset,
      format,
      dto.leagueName.trim(),
      dto.teamName.trim(),
      computedId,
      userId,
      mappedTeam,
      dto.doc?.trim(),
    );
  }

  public static fromDatabase(doc: DraftDocument): Tournament {
    const ruleset = getRuleset(doc.ruleset);
    const format = getFormat(doc.format);
    return new Tournament(
      doc._id,
      ruleset,
      format,
      doc.leagueName,
      doc.teamName,
      doc.leagueId,
      doc.owner,
      DraftSpecie.getTeam(doc.team, ruleset),
      doc.doc,
    );
  }
}
