import { Types } from "mongoose";
import { DraftSpecie } from "../../../../../classes/pokemon";
import { MatchDto } from "./external-matchup.dto";
import { Ruleset } from "@core/data/rulesets/rulesets";

export class ExternalMatchup {
  ruleset: Ruleset;
  team: DraftSpecie[];
  teamName: string;
  matches: MatchDto[];
  stage: string;
  coach?: string;
  _id?: Types.ObjectId;
  paste?: string;
  notes?: string;
  constructor(props: {
    ruleset: Ruleset;
    team: DraftSpecie[];
    teamName: string;
    matches: MatchDto[];
    stage: string;
    coach?: string;
    _id?: Types.ObjectId;
    paste?: string;
    notes?: string;
  }) {
    this.ruleset = props.ruleset;
    this.team = props.team;
    this.teamName = props.teamName;
    this.matches = props.matches;
    this.stage = props.stage;
    this.coach = props.coach;
    this._id = props._id;
    this.paste = props.paste;
    this.notes = props.paste;
  }

  calculateScore(): [number, number] | null {
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
