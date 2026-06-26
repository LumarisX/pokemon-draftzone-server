import { Ruleset } from "@core/data/rulesets/rulesets";
import { PDZPokemon } from "./pokemon.domain";
import { PokemonDto } from "./pokemon.dto";
import { PokemonEntity } from "./pokemon.schema";
import { ID, TypeName } from "@pkmn/data";

export class PokemonMapper {
  static fromDatabase(data: PokemonEntity, ruleset: Ruleset): PDZPokemon {
    return new PDZPokemon(
      {
        id: data.id,
        shiny: data.shiny,
        nickname: data.nickname,
        draftFormes: data.draftFormes as ID[] | undefined,
        modifiers: data.modifiers
          ? {
              abilities: data.modifiers.abilities,
              moves: data.modifiers.moves,
            }
          : undefined,
        capt: data.capt
          ? {
              tera: data.capt.tera as TypeName[] | undefined,
              z: data.capt.z as TypeName[] | undefined,
              dmax: data.capt.dmax,
            }
          : undefined,
      },
      ruleset,
    );
  }

  static fromForm(data: PokemonDto, ruleset: Ruleset): PDZPokemon {
    return new PDZPokemon(
      {
        id: data.id,
        shiny: data.shiny,
        nickname: data.nickname,
        draftFormes: data.draftFormes as ID[] | undefined,
        modifiers: data.modifiers
          ? {
              abilities: data.modifiers.abilities,
              moves: data.modifiers.moves,
            }
          : undefined,
        capt: data.capt
          ? {
              tera: data.capt.tera as TypeName[] | undefined,
              z: data.capt.z as TypeName[] | undefined,
              dmax: data.capt.dmax,
            }
          : undefined,
      },
      ruleset,
    );
  }

  static toClientPayload(pokemon: PDZPokemon): PokemonDto {
    const TYPES = Array.from(pokemon.ruleset.types).map((type) => type.name);
    const ZTYPES = TYPES.filter((name) => name !== "Stellar");
    const capt = {
      tera: pokemon.capt?.tera
        ? pokemon.capt.tera.length
          ? pokemon.capt.tera
          : [...TYPES]
        : undefined,
      z: pokemon.capt?.z
        ? pokemon.capt.z.length
          ? pokemon.capt.z
          : [...ZTYPES]
        : undefined,
      dmax: pokemon.capt?.dmax,
    };
    return {
      id: pokemon.id,
      name: pokemon.name,
      nickname: pokemon.nickname,
      shiny: pokemon.shiny,
      draftFormes: pokemon.draftFormes,
      modifiers: pokemon.modifiers,
      capt: Object.values(capt).some((value) => value !== undefined)
        ? capt
        : undefined,
    };
  }

  static toDatabasePayload(pokemon: PDZPokemon): PokemonEntity {
    return {
      id: pokemon.id,
      nickname: pokemon.nickname,
      shiny: pokemon.shiny,
      draftFormes: pokemon.draftFormes,
      modifiers: pokemon.modifiers,
      capt: pokemon.capt,
    };
  }
}
