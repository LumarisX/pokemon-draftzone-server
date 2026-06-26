import { Module } from "@nestjs/common";
import { PokemonService } from "./pokemon.service";

@Module({
  imports: [],
  controllers: [],
  providers: [PokemonService],
  exports: [PokemonService],
})
export class PokemonModule {}
