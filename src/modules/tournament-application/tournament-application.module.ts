import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TournamentApplicationRepository } from "./tournament-application.repository";
import {
  TournamentApplicationEntity,
  TournamentApplicationSchema,
} from "./tournament-application.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: TournamentApplicationEntity.name,
        schema: TournamentApplicationSchema,
      },
    ]),
  ],
  providers: [TournamentApplicationRepository],
  exports: [TournamentApplicationRepository, MongooseModule],
})
export class TournamentApplicationModule {}
