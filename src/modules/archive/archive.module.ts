import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ArchiveController } from "./archive.controller";
import { ArchiveRepository } from "./archive.repository";
import {
  ArchiveEntity,
  ArchiveSchema,
  ArchiveV1Entity,
  ArchiveV1Schema,
  ArchiveV2Entity,
  ArchiveV2Schema,
} from "./archive.schema";
import { ArchiveService } from "./archive.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ArchiveEntity.name,
        schema: ArchiveSchema,
        discriminators: [
          { name: ArchiveV1Entity.name, schema: ArchiveV1Schema },
          { name: ArchiveV2Entity.name, schema: ArchiveV2Schema },
        ],
      },
    ]),
  ],
  controllers: [ArchiveController],
  providers: [ArchiveService, ArchiveRepository],
})
export class ArchiveModule {}
