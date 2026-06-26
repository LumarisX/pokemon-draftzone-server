import { PokemonDto } from "@modules/pokemon/pokemon.dto";
import { Types } from "mongoose";
import { ExternalMatchupBreakdownController } from "./external-matchup-breakdown.controller";
import { ExternalMatchupBreakdownService } from "./external-matchup-breakdown.service";

function buildPokemon(id: string, name: string): PokemonDto {
  return { id, name } as PokemonDto;
}

describe("ExternalMatchupBreakdownController", () => {
  let service: jest.Mocked<ExternalMatchupBreakdownService>;
  let controller: ExternalMatchupBreakdownController;

  beforeEach(() => {
    service = {
      getMatchupById: jest.fn(),
    } as unknown as jest.Mocked<ExternalMatchupBreakdownService>;
    controller = new ExternalMatchupBreakdownController(service);
  });

  describe("analyzeQuickMatchup", () => {
    it("builds an ExternalMatchup from the posted teams/ruleset/format and returns its analysis", async () => {
      const result = await controller.analyzeQuickMatchup({
        format: "Singles",
        ruleset: "Gen9 NatDex",
        side1: { teamName: "Team A", team: [buildPokemon("pikachu", "Pikachu")] },
        side2: { teamName: "Team B", team: [buildPokemon("charizard", "Charizard")] },
      });

      expect(result.summary[0].teamName).toBe("Team A");
      expect(result.summary[1].teamName).toBe("Team B");
      expect(result.typechart[0].team).toHaveLength(1);
      expect(result.typechart[1].team).toHaveLength(1);
      expect(result.details.ruleset).toBe("Gen9 NatDex");
      expect(result.details.format).toBe("Singles");
    });

    it("defaults team names to 'Team 1'/'Team 2' when none are provided", async () => {
      const result = await controller.analyzeQuickMatchup({
        format: "Singles",
        ruleset: "Gen9 NatDex",
        side1: { teamName: "", team: [buildPokemon("pikachu", "Pikachu")] },
        side2: { teamName: "", team: [buildPokemon("charizard", "Charizard")] },
      });

      expect(result.summary[0].teamName).toBe("Team 1");
      expect(result.summary[1].teamName).toBe("Team 2");
    });
  });

  describe("getAnalyzedMatchup", () => {
    it("loads the matchup by id and returns its analysis", async () => {
      const analyze = jest.fn().mockResolvedValue({ analyzed: true });
      service.getMatchupById.mockResolvedValue({ analyze } as any);
      const matchupId = new Types.ObjectId();

      const result = await controller.getAnalyzedMatchup(matchupId);

      expect(service.getMatchupById).toHaveBeenCalledWith(matchupId);
      expect(analyze).toHaveBeenCalled();
      expect(result).toEqual({ analyzed: true });
    });
  });
});
