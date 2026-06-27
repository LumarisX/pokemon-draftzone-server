import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Types } from "mongoose";
import { ExternalMatchupBreakdownService } from "./external-matchup-breakdown.service";
import { OptionalAuth } from "@modules/auth/optional-auth.decorator";
import { getFormat } from "@core/data/formats/formats";
import { getRuleset } from "@core/data/rulesets/rulesets";
import { ExternalMatchup } from "../external-matchup.domain";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";
import { PokemonDto } from "@modules/pokemon/pokemon.dto";

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
        team: PokemonDto[];
        teamName: string;
      };
      side2: {
        team: PokemonDto[];
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
          PokemonMapper.fromForm(pokemon, ruleset),
        ),
      },
      bTeam: {
        teamName: data.side2.teamName || "Team 2",
        team: data.side2.team.map((pokemon) =>
          PokemonMapper.fromForm(pokemon, ruleset),
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
  async getAnalyzedMatchup(
    @Param("matchupId") matchupId: Types.ObjectId,
    @User() sub?: string,
  ) {
    const matchup =
      await this.matchupBreakdownService.getMatchupById(matchupId);
    return matchup.analyze(sub);
  }
}
