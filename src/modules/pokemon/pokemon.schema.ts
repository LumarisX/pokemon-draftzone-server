import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";

@Schema({ _id: false })
class CaptSubEntity {
  @Prop({ type: [String], default: undefined })
  tera?: string[];

  @Prop({ type: [String], default: undefined })
  z?: string[];

  @Prop({ type: Boolean, default: undefined })
  dmax?: boolean;
}

@Schema({ _id: false })
class ModifiersSubEntity {
  @Prop({ type: [String], default: undefined })
  moves?: string[];

  @Prop({ type: [String], default: undefined })
  abilities?: string[];
}

@Schema({ _id: false })
export class PokemonEntity {
  @Prop({ required: true })
  id!: string;

  @Prop({ type: Boolean, default: undefined })
  shiny?: boolean;

  @Prop({ type: CaptSubEntity })
  capt?: CaptSubEntity;

  @Prop({ type: ModifiersSubEntity })
  modifiers?: ModifiersSubEntity;

  @Prop({ default: undefined })
  nickname?: string;

  @Prop({ type: [String], default: undefined })
  draftFormes?: string[];
}

export const PokemonSchema = SchemaFactory.createForClass(PokemonEntity);
