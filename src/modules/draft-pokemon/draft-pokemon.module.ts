import { Module } from "@nestjs/common";
import { DraftPokemonService } from "./draft-pokemon.service";

@Module({
  imports: [],
  controllers: [],
  providers: [DraftPokemonService],
  exports: [DraftPokemonService],
})
export class DraftPokemonModule {}
