import { Module } from "@nestjs/common";
import { MongooseModule, Schema } from "@nestjs/mongoose";
import { TemplateController } from "./template.controller";
import { Template } from "./template.domain";

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Template.name, schema: Schema }]),
  ],
  controllers: [TemplateController],
  providers: [],
  exports: [],
})
export class TemplateModule {}
