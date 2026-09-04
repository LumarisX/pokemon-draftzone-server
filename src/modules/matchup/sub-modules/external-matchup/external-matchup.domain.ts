import { Format } from "@core/data/formats/formats";
import { Ruleset } from "@core/data/rulesets/rulesets";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { PokemonEntity } from "@modules/pokemon/pokemon.schema";
import { getMatchupCoverage } from "@modules/matchup/domain/coverage";
import { getTeamMoves } from "@modules/matchup/domain/movechart";
import { speedchart } from "@modules/matchup/domain/speedchart";
import { summarizeTeam } from "@modules/matchup/domain/summary";
import { getTeamTypechart } from "@modules/matchup/domain/typechart";
import { Types } from "mongoose";
import { ExternalMatch } from "./external-matchup-match/external-matchup-match.domain";
import {
  ForfeitSide,
  MatchWinner,
} from "./external-matchup-match/external-matchup-match.schema";

export interface MatchupSide {
  id?: Types.ObjectId;
  team: PDZPokemon[];
  unresolvedTeam?: PokemonEntity[];
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
  tournamentName?: string;
  scheduledDate?: Date;
  opponentTimezone?: string;
  scoreOverride?: [number, number];
  winnerOverride?: MatchWinner;
  forfeitedBy?: ForfeitSide;
  constructor(props: {
    aTeam: MatchupSide;
    bTeam: MatchupSide;
    ruleset: Ruleset;
    format: Format;
    matches?: ExternalMatch[];
    stage?: string;
    tournamentName?: string;
    scheduledDate?: Date;
    opponentTimezone?: string;
    scoreOverride?: [number, number];
    winnerOverride?: MatchWinner;
    forfeitedBy?: ForfeitSide;
  }) {
    this.ruleset = props.ruleset;
    this.format = props.format;
    this.matches = props.matches ?? [];
    this.stage = props.stage;
    this.tournamentName = props.tournamentName;
    this.scheduledDate = props.scheduledDate;
    this.opponentTimezone = props.opponentTimezone;
    this.scoreOverride = props.scoreOverride;
    this.winnerOverride = props.winnerOverride;
    this.forfeitedBy = props.forfeitedBy;
    this.aTeam = props.aTeam;
    this.bTeam = props.bTeam;
  }

  async analyze(sub?: string) {
    const flip = !!sub && this.bTeam.owner === sub;
    const aTeam = flip ? this.bTeam : this.aTeam;
    const bTeam = flip ? this.aTeam : this.bTeam;
    const ownsSide = !!sub && (sub === aTeam.owner || sub === bTeam.owner);
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
        leagueName: this.tournamentName,
        stage: this.stage,
        scheduledDate: this.scheduledDate?.toISOString(),
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
      canEditNotes: ownsSide,
    };
    return data;
  }

  inferScore(): [number, number] | null {
    if (!this.matches || this.matches.length === 0) return null;

    if (this.matches.length === 1) {
      const match = this.matches[0];
      return [match.aTeam?.score ?? 0, match.bTeam?.score ?? 0];
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

  calculateScore(): [number, number] | null {
    return this.scoreOverride ?? this.inferScore();
  }

  inferWinner(): MatchWinner | undefined {
    const score = this.calculateScore();
    if (!score) return undefined;
    if (score[0] > score[1]) return "a";
    if (score[1] > score[0]) return "b";
    return undefined;
  }

  calculateWinner(): MatchWinner | undefined {
    if (this.forfeitedBy === "both") return undefined;
    if (this.forfeitedBy === "a") return "b";
    if (this.forfeitedBy === "b") return "a";
    return this.winnerOverride ?? this.inferWinner();
  }

  isDoubleForfeit(): boolean {
    return this.forfeitedBy === "both";
  }
}
