import { Types } from "mongoose";
import { DraftSpecie } from "../../../../../classes/pokemon";
import { Ruleset } from "../../../../../data/rulesets";
import { MatchDto, ExternalMatchupDto } from "./external-matchup.dto";
import { ExternalMatchupDocument } from "./external-matchup.schema";

export class ExternalMatchup {
  constructor(
    public ruleset: Ruleset,
    public team: DraftSpecie[],
    public teamName: string,
    public matches: MatchDto[],
    public stage: string,
    public coach?: string,
    public _id?: Types.ObjectId,
    public paste?: string,
    public notes?: string,
  ) {}

  toClientPayload() {
    return {
      stage: this.stage,
      teamName: this.teamName,
      coach: this.coach,
      team: this.team.map((pokemon) => pokemon.toClient()),
      score: this.calculateScore(),
      matches: this.matches,
      _id: this._id,
      paste: this.paste,
    };
  }

  toDatabasePayload() {
    return {
      bTeam: {
        teamName: this.teamName,
        coach: this.coach ?? undefined,
        team: this.team.map((pokemon) => pokemon.toData()),
        paste: this.paste,
      },
      stage: this.stage,
    };
  }

  static fromForm(data: ExternalMatchupDto, ruleset: Ruleset): ExternalMatchup {
    const errors: string[] = [];

    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }

    return new ExternalMatchup(
      ruleset,
      data.team
        .filter((pokemonData) => pokemonData.id)
        .map((pokemonData) => new DraftSpecie(pokemonData, ruleset)),
      data.teamName,
      data.matches || [],
      data.stage,
      data.coach,
    );
  }

  static fromDatabase(
    doc: ExternalMatchupDocument,
    ruleset: Ruleset,
  ): ExternalMatchup {
    return new ExternalMatchup(
      ruleset,
      DraftSpecie.getTeam(doc.bTeam.team, ruleset),
      doc.bTeam.teamName,
      doc.matches ?? [],
      doc.stage,
      doc.bTeam.coach,
      doc._id,
      doc.bTeam.paste,
      doc.notes,
    );
  }

  private calculateScore(): [number, number] | null {
    if (!this.matches?.length) return null;

    if (this.matches.length === 1) {
      const aScore = this.matches[0].aTeam.stats.filter(
        (p) => p[1].brought && !p[1].deaths,
      ).length;
      const bScore = this.matches[0].bTeam!.stats.filter(
        (p) => p[1].brought && !p[1].deaths,
      ).length;
      return [aScore, bScore];
    }

    return this.matches.reduce(
      (score: [number, number], match) => {
        if (match.winner === "a") score[0]++;
        else score[1]++;
        return score;
      },
      [0, 0],
    );
  }
}
