import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { StageDocument, StageTradeSideEntity } from "@modules/stage/stage.schema";
import { TeamDocument, TeamEntity, TeamSchema } from "@modules/team/team.schema";
import mongoose from "mongoose";
import { getRosterByRound } from "./roster-service";

export type TradeSide = StageTradeSideEntity;

// Plain Mongoose model lookup (not Nest-DI) — mirrors the same pattern used
// in draft-service.ts, for the same reason: this file is a free-function
// service module, not a Nest-managed class.
const TeamMongooseModel: mongoose.Model<TeamDocument> =
  (mongoose.models[TeamEntity.name] as mongoose.Model<TeamDocument>) ??
  (mongoose.model(TeamEntity.name, TeamSchema) as unknown as mongoose.Model<TeamDocument>);

/**
 * Records a trade between two teams in the same Stage, validating that each
 * side's offered Pokemon actually exist on that team's current roster
 * (post any earlier trades, walked via getRosterByRound) before approving it.
 */
export async function makeTrade(
  stage: StageDocument,
  side1: TradeSide,
  side2: TradeSide,
  activeRoundIndex: number,
) {
  if (side1.team === undefined && side2.team === undefined) return;

  const team1 = side1.team
    ? await TeamMongooseModel.findById(side1.team).populate("coach")
    : null;
  if (side1.team && !team1)
    throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId: side1.team });

  const team2 = side2.team
    ? await TeamMongooseModel.findById(side2.team).populate("coach")
    : null;
  if (side2.team && !team2)
    throw new PDZError(ErrorCodes.TEAM.NOT_FOUND, { teamId: side2.team });

  if (team1) {
    const draftedPokemonIds = new Set(
      getRosterByRound(team1 as any, stage).map((pokemon) => pokemon.id),
    );
    for (const pokemon of side1.pokemon) {
      if (!draftedPokemonIds.has(pokemon.id)) {
        throw new PDZError(ErrorCodes.SPECIES.NOT_FOUND, {
          pokemonId: pokemon.id,
          teamId: team1._id.toString(),
        });
      }
    }
  }

  if (team2) {
    const draftedPokemonIds = new Set(
      getRosterByRound(team2 as any, stage).map((pokemon) => pokemon.id),
    );
    for (const pokemon of side2.pokemon) {
      if (!draftedPokemonIds.has(pokemon.id)) {
        throw new PDZError(ErrorCodes.SPECIES.NOT_FOUND, {
          pokemonId: pokemon.id,
          teamId: team2._id.toString(),
        });
      }
    }
  }

  stage.trades.push({
    side1,
    side2,
    timestamp: new Date(),
    activeRound: activeRoundIndex,
    status: "APPROVED",
  });

  await stage.save();
}
