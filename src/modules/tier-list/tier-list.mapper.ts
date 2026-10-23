import {
  Tier,
  TierList,
  TierListMember,
  TierListPokemon,
  TierListPokemonAddon,
} from "./tier-list.domain";
import { Types } from "mongoose";
import {
  TierEntity,
  TierListDocument,
  TierListPokemonAddonEntity,
  TierListPokemonEntity,
  TierListVisibility,
} from "./tier-list.schema";

export class TierListMapper {
  static fromDatabase(doc: TierListDocument): TierList {
    const pokemon = new Map<string, TierListPokemon>();
    for (const [id, data] of doc.pokemon.entries()) {
      pokemon.set(
        id,
        new TierListPokemon({
          name: data.name,
          tierId: data.tierId?.toString(),
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
      slug: doc.slug,
      name: doc.name,
      description: doc.description,
      createdBy: doc.createdBy,
      authorName: doc.authorName,
      copiedFrom: doc.copiedFrom?.toString(),
      copiedFromVersion: doc.copiedFromVersion,
      tournamentId: doc.tournament?.toString(),
      retiredAt: doc.retiredAt,
      pokemon,
      tiers: doc.tiers.map(
        (tier) =>
          new Tier({
            id: tier._id.toString(),
            name: tier.name,
            cost: tier.cost,
            color: tier.color,
          }),
      ),
      banned: {
        moves: [...doc.banned.moves],
        abilities: [...doc.banned.abilities],
      },
      format: doc.format,
      ruleset: doc.ruleset,
      visibility: TierListMapper.visibilityOf(doc),
      members: TierListMapper.membersOf(doc),
      tags: [...(doc.tags ?? [])],
      featured: doc.featured ?? false,
      version: doc.version ?? 0,
      forkCount: doc.forkCount ?? 0,
      useCount: doc.useCount ?? 0,
      updatedAt: doc.updatedAt,
    });
  }

  static visibilityOf(doc: Pick<TierListDocument, "settings">): TierListVisibility {
    return (
      doc.settings?.visibility ?? (doc.settings?.isPublic ? "public" : "private")
    );
  }

  static membersOf(
    doc: Pick<TierListDocument, "members" | "collaborators">,
  ): TierListMember[] {
    const members: TierListMember[] = (doc.members ?? []).map(
      ({ sub, name, role }) => ({ sub, name, role }),
    );
    for (const sub of doc.collaborators ?? []) {
      if (!members.some((member) => member.sub === sub))
        members.push({ sub, role: "editor" });
    }
    return members;
  }

  static toSettingsPayload(tierList: TierList) {
    return {
      name: tierList.name,
      description: tierList.description,
      authorName: tierList.authorName,
      visibility: tierList.visibility,
      tags: tierList.tags,
      format: tierList.format.name,
      ruleset: tierList.ruleset.name,
      isTournamentCopy: tierList.isTournamentCopy,
    };
  }

  static toTierEntities(tiers: Tier[]): TierEntity[] {
    return tiers.map((tier) => ({
      _id: new Types.ObjectId(tier.id),
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
        tierId: data.tierId ? new Types.ObjectId(data.tierId) : undefined,
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
