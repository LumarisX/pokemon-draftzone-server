import { Format, FormatId } from "@core/data/formats/formats";
import { Ruleset, RulesetId } from "@core/data/rulesets/rulesets";
import { PokemonDto } from "@modules/pokemon/pokemon.dto";
import { StatsTable, TypeName } from "@pkmn/data";
import { DraftSpecie } from "../../classes/pokemon";
import {
  coveragechart,
  Coveragechart,
} from "../../services/matchup-services/coverage.service";
import {
  movechart,
  Movechart,
} from "../../services/matchup-services/movechart.service";
import {
  Speedchart,
  speedchart,
} from "../../services/matchup-services/speedchart.service";
import { SummaryClass } from "../../services/matchup-services/summary.service";
import { Typechart } from "../../services/matchup-services/typechart.service";
import { ExternalMatch } from "./sub-modules/external-matchup/external-matchup-match/external-matchup-match.domain";

export interface MatchupSide {
  team: DraftSpecie[];
  teamName: string;
  coach?: string;
  owner?: string;
  paste?: string;
  notes?: string;
}

export class Matchup {
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
        new SummaryClass(aTeam.team, aTeam.teamName, aTeam.coach).toJson(),
        new SummaryClass(bTeam.team, bTeam.teamName, bTeam.coach).toJson(),
      ],
      speedchart: speedchart([aTeam.team, bTeam.team], this.format.level),
      coveragechart: [aCoverageChart, bCoverageChart],
      typechart: [
        new Typechart(aTeam.team).toJson(),
        new Typechart(bTeam.team).toJson(),
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
}
