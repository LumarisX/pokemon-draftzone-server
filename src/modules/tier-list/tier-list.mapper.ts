import {
  Tier,
  TierList,
  TierListPokemon,
  TierListPokemonAddon,
  TierListSettings,
} from "./tier-list.domain";
import {
  TierEntity,
  TierListDocument,
  TierListPokemonAddonEntity,
  TierListPokemonEntity,
} from "./tier-list.schema";

export class TierListMapper {
  static fromDatabase(doc: TierListDocument): TierList {
    const pokemon = new Map<string, TierListPokemon>();
    for (const [id, data] of doc.pokemon.entries()) {
      pokemon.set(
        id,
        new TierListPokemon({
          name: data.name,
          tier: data.tier,
          notes: data.notes,
          banned: data.banned,
          formes: data.formes ? [...data.formes] : undefined,
          addons: data.addons?.map(
            (addon) =>
              new TierListPokemonAddon({
                name: addon.name,
                cost: addon.cost,
                notes: addon.notes,
              }),
          ),
        }),
      );
    }

    return new TierList({
      id: doc._id.toString(),
      name: doc.name,
      description: doc.description,
      createdBy: doc.createdBy,
      copiedFrom: doc.copiedFrom?.toString(),
      pokemon,
      tiers: doc.tiers.map(
        (tier) =>
          new Tier({ name: tier.name, cost: tier.cost, color: tier.color }),
      ),
      banned: {
        moves: [...doc.banned.moves],
        abilities: [...doc.banned.abilities],
      },
      format: doc.format,
      ruleset: doc.ruleset,
      settings: new TierListSettings({
        isPublic: doc.settings.isPublic,
        shareToken: doc.settings.shareToken,
      }),
      collaborators: [...doc.collaborators],
    });
  }

  static toSettingsPayload(tierList: TierList) {
    return {
      name: tierList.name,
      description: tierList.description,
    };
  }

  static toTierEntities(tiers: Tier[]): TierEntity[] {
    return tiers.map((tier) => ({
      name: tier.name,
      cost: tier.cost,
      color: tier.color,
    }));
  }

  static toPokemonEntityMap(
    pokemon: Map<string, TierListPokemon>,
  ): Map<string, TierListPokemonEntity> {
    const entries = new Map<string, TierListPokemonEntity>();
    for (const [id, data] of pokemon.entries()) {
      entries.set(id, {
        name: data.name,
        tier: data.tier,
        notes: data.notes,
        banned: data.banned,
        formes: data.formes?.length ? [...data.formes] : undefined,
        addons: data.addons?.map(
          (addon): TierListPokemonAddonEntity => ({
            name: addon.name,
            cost: addon.cost,
            notes: addon.notes,
          }),
        ),
      });
    }
    return entries;
  }
}
