import { Ruleset } from "@core/data/rulesets/rulesets";
import { DraftPokemon } from "./draft-pokemon.domain";
import { DraftPokemonDto } from "./draft-pokemon.dto";
import { PokemonEntity } from "./draft-pokemon.schema";
import { ID, TypeName } from "@pkmn/data";

export class DraftPokemonMapper {
  static fromDatabase(data: PokemonEntity, ruleset: Ruleset): DraftPokemon {
    return new DraftPokemon(
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

  static fromForm(data: DraftPokemonDto, ruleset: Ruleset): DraftPokemon {
    return new DraftPokemon(
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

  static toClientPayload(pokemon: DraftPokemon): DraftPokemonDto {
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
      capt: Object.values(capt).length ? capt : undefined,
    };
  }

  static toDatabasePayload(pokemon: DraftPokemon): PokemonEntity {
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
