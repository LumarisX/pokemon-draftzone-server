import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from "mongoose";

export type ImportAliasDocument = HydratedDocument<ImportAliasEntity>;

@Schema({ timestamps: true, collection: "tierlistimportaliases" })
export class ImportAliasEntity {
  @Prop({ required: true })
  owner!: string;

  @Prop({ required: true })
  text!: string;

  @Prop({ required: true })
  pokemonIds!: string[];
}

export const ImportAliasSchema = SchemaFactory.createForClass(ImportAliasEntity);

ImportAliasSchema.index({ owner: 1, text: 1 }, { unique: true });
