import { Format, FormatId } from "@core/data/formats/formats";
import { Ruleset, RulesetId } from "@core/data/rulesets/rulesets";
import { DraftPokemonDto } from "@modules/draft-pokemon/draft-pokemon.dto";
import { StatsTable, TypeName } from "@pkmn/data";
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
import { DraftPokemon } from "@modules/draft-pokemon/draft-pokemon.domain";

export interface MatchupSide {
  team: DraftPokemon[];
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
}
