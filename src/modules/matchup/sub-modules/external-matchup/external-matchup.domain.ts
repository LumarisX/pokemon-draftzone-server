import { Format } from "@core/data/formats/formats";
import { Ruleset } from "@core/data/rulesets/rulesets";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { getMatchupCoverage } from "@modules/matchup/domain/coverage";
import { getTeamMoves } from "@modules/matchup/domain/movechart";
import { speedchart } from "@modules/matchup/domain/speedchart";
import { summarizeTeam } from "@modules/matchup/domain/summary";
import { getTeamTypechart } from "@modules/matchup/domain/typechart";
import { Types } from "mongoose";
import { ExternalMatch } from "./external-matchup-match/external-matchup-match.domain";

export interface MatchupSide {
  id?: Types.ObjectId;
  team: PDZPokemon[];
  teamName: string;
  coach?: string;
  owner?: string;
  paste?: string;
  notes?: string;
}

export class ExternalMatchup {
  ruleset: Ruleset;
  format: Format;
  aTeam: MatchupSide;
  bTeam: MatchupSide;
  matches: ExternalMatch[];
  stage?: string;
  gameTime?: Date;
  reminder?: number;
  tournamentName?: string;
  constructor(props: {
    aTeam: MatchupSide;
    bTeam: MatchupSide;
    ruleset: Ruleset;
    format: Format;
    matches?: ExternalMatch[];
    stage?: string;
    gameTime?: Date;
    reminder?: number;
    tournamentName?: string;
  }) {
    this.ruleset = props.ruleset;
    this.format = props.format;
    this.matches = props.matches ?? [];
    this.stage = props.stage;
    this.gameTime = props.gameTime;
    this.reminder = props.reminder;
    this.tournamentName = props.tournamentName;
    this.aTeam = props.aTeam;
    this.bTeam = props.bTeam;
  }

  async analyze(sub?: string) {
    const flip = !!sub && this.bTeam.owner === sub;
    const aTeam = flip ? this.bTeam : this.aTeam;
    const bTeam = flip ? this.aTeam : this.bTeam;
    const [aCoverageChart, bCoverageChart, aMoveChart, bMoveChart] =
      await Promise.all([
        getMatchupCoverage(aTeam.team, bTeam.team),
        getMatchupCoverage(bTeam.team, aTeam.team),
        getTeamMoves(aTeam.team),
        getTeamMoves(bTeam.team),
      ]);
    const data = {
      details: {
        level: this.format.level,
        format: this.format.name,
        ruleset: this.ruleset.name,
        gameTime: this.gameTime,
        leagueName: this.tournamentName,
        stage: this.stage,
      },
      summary: [
        summarizeTeam(aTeam.team, aTeam.teamName, aTeam.coach),
        summarizeTeam(bTeam.team, bTeam.teamName, bTeam.coach),
      ],
      speedchart: speedchart([aTeam.team, bTeam.team], this.format.level),
      coveragechart: [aCoverageChart, bCoverageChart],
      typechart: [getTeamTypechart(aTeam.team), getTeamTypechart(bTeam.team)],
      movechart: [aMoveChart, bMoveChart],
      notes:
        sub && sub === aTeam.owner
          ? aTeam.notes
          : sub && sub === bTeam.owner
            ? bTeam.notes
            : undefined,
    };
    return data;
  }

  calculateScore(): [number, number] | null {
    if (!this.matches || this.matches.length === 0) return null;

    if (this.matches.length === 1) {
      const match = this.matches[0];
      const countAlivePokemon = (
        team: typeof match.aTeam | typeof match.bTeam,
      ) => {
        if (!team?.stats || !Array.isArray(team.stats)) return 0;

        return team.stats.filter((p) => p?.[1]?.brought && !p?.[1]?.deaths)
          .length;
      };

      return [countAlivePokemon(match.aTeam), countAlivePokemon(match.bTeam)];
    }

    return this.matches.reduce(
      (score: [number, number], match) => {
        if (match.winner === "a") {
          score[0]++;
        } else if (match.winner === "b") {
          score[1]++;
        }
        return score;
      },
      [0, 0],
    );
  }
}
