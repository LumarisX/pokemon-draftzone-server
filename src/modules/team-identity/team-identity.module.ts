import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { TeamIdentityController } from "./team-identity.controller";
import { TeamIdentityRepository } from "./team-identity.repository";
import {
  TeamIdentityEntity,
  TeamIdentitySchema,
} from "./team-identity.schema";

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TeamIdentityEntity.name, schema: TeamIdentitySchema },
    ]),
  ],
  controllers: [TeamIdentityController],
  providers: [TeamIdentityRepository],
  exports: [TeamIdentityRepository],
})
export class TeamIdentityModule {}
