import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Types } from "mongoose";
import { ExternalMatchupBreakdownService } from "./external-matchup-breakdown.service";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { ExternalMatchup } from "../external-matchup.domain";
import { DraftPokemonMapper } from "@modules/draft-pokemon/draft-pokemon.mapper";
import { DraftPokemonDto } from "@modules/draft-pokemon/draft-pokemon.dto";

@Controller("external/matchups")
export class ExternalMatchupBreakdownController {
  constructor(
    private readonly matchupBreakdownService: ExternalMatchupBreakdownService,
  ) {}

  @Post("quick")
  async analyzeQuickMatchup(
    @Body()
    data: {
      format: string;
      ruleset: string;
      side1: {
        team: DraftPokemonDto[];
        teamName: string;
      };
      side2: {
        team: DraftPokemonDto[];
        teamName: string;
      };
    },
  ) {
    const ruleset = getRuleset(data.ruleset);
    const format = getFormat(data.format);
    const matchup = new ExternalMatchup({
      aTeam: {
        teamName: data.side1.teamName || "Team 1",
        team: data.side1.team.map((pokemon) =>
          DraftPokemonMapper.fromForm(pokemon, ruleset),
        ),
      },
      bTeam: {
        teamName: data.side2.teamName || "Team 2",
        team: data.side2.team.map((pokemon) =>
          DraftPokemonMapper.fromForm(pokemon, ruleset),
        ),
      },
      ruleset,
      format,
    });

    return matchup.analyze();
  }

  @OptionalAuth()
  @UseGuards(JwtAuthGuard)
  @Get(":matchupId")
  async getAnalyzedMatchup(@Param("matchupId") matchupId: Types.ObjectId) {
    const matchup =
      await this.matchupBreakdownService.getMatchupById(matchupId);
    return matchup.analyze();
  }
}
