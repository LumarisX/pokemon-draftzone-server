import { Format } from "@core/data/formats/formats";
import { Ruleset } from "@core/data/rulesets/rulesets";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { ExternalMatch } from "./sub-modules/external-matchup/external-matchup-match/external-matchup-match.domain";

export interface MatchupSide {
  team: PDZPokemon[];
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
