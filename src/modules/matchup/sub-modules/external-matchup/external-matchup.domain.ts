import { Format, FormatId } from "@core/data/formats/formats";
import { Ruleset, RulesetId } from "@core/data/rulesets/rulesets";
import { coveragechart, Coveragechart } from "@modules/matchup/domain/coverage";
import { movechart, Movechart } from "@modules/matchup/domain/movechart";
import { Speedchart, speedchart } from "@modules/matchup/domain/speedchart";
import { summarizeTeam } from "@modules/matchup/domain/summary";
import { generateTeamTypechart } from "@modules/matchup/domain/typechart";
import { DraftSpecie } from "@modules/pokemon/pokemon.domain";
import { PokemonDto } from "@modules/pokemon/pokemon.dto";
import { StatsTable, TypeName } from "@pkmn/data";
import { Types } from "mongoose";
import { ExternalMatch } from "./external-matchup-match/external-matchup-match.domain";

export interface MatchupSide {
  id: Types.ObjectId;
  team: DraftSpecie[];
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
  stage: string;
  gameTime?: Date;
  tournamentName: string;
  constructor(props: {
    aTeam: MatchupSide;
    bTeam: MatchupSide;
    ruleset: Ruleset;
    format: Format;
    matches: ExternalMatch[];
    stage: string;
    tournamentName: string;
  }) {
    this.ruleset = props.ruleset;
    this.format = props.format;
    this.matches = props.matches;
    this.stage = props.stage;
    this.tournamentName = props.tournamentName;
    this.aTeam = props.aTeam;
    this.bTeam = props.bTeam;
  }

  async analyze(sub?: string) {
    const aTeam = this.aTeam.owner === sub ? this.aTeam : this.bTeam;
    const bTeam = this.aTeam.owner === sub ? this.bTeam : this.aTeam;
    const [aCoverageChart, bCoverageChart, aMoveChart, bMoveChart] =
      await Promise.all([
        coveragechart(aTeam.team, bTeam.team),
        coveragechart(bTeam.team, aTeam.team),
        movechart(aTeam.team, aTeam.team[0]?.ruleset ?? this.ruleset),
        movechart(bTeam.team, bTeam.team[0]?.ruleset ?? this.ruleset),
      ]);
    const data: {
      details: {
        level: number;
        format: FormatId;
        ruleset: RulesetId;
        gameTime?: Date;
        stage?: string;
        leagueName?: string;
      };
      summary: {
        teamName?: string;
        coach?: string;
        team: (PokemonDto & {
          abilities: string[];
          baseStats: StatsTable;
          types: [TypeName] | [TypeName, TypeName];
          index: number;
        })[];
        stats?: {
          mean: {
            hp?: number;
            atk?: number;
            def?: number;
            spa?: number;
            spd?: number;
            spe?: number;
          };
          median: {
            hp?: number;
            atk?: number;
            def?: number;
            spa?: number;
            spd?: number;
            spe?: number;
          };
          max: {
            hp?: number;
            atk?: number;
            def?: number;
            spa?: number;
            spd?: number;
            spe?: number;
          };
        };
      }[];
      speedchart: Speedchart;
      coveragechart: Coveragechart[];
      typechart: {
        team: (PokemonDto & {
          weak: { [key: string]: number }[];
        })[];
        teraTypes: {
          [key: string]: {};
        };
      }[];
      movechart: Movechart[];
      notes?: string;
    } = {
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
      typechart: [
        generateTeamTypechart(aTeam.team),
        generateTeamTypechart(bTeam.team),
      ],
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
