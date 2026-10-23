import { Types } from "mongoose";
import {
  Tier,
  TierList,
  TierListPokemon,
  TierListPokemonAddon,
} from "./tier-list.domain";

export type TierState = {
  id: string;
  name: string;
  cost: number;
  color?: string;
};

export type PokemonState = {
  name: string;
  tierId?: string;
  banned?: boolean;
  notes?: string;
  formes?: string[];
  addons?: { name: string; cost: number; notes?: string }[];
};

export type TierListState = {
  tiers: TierState[];
  pokemon: Record<string, PokemonState>;
  banned: { moves: string[]; abilities: string[] };
};

export type TierListChange =
  | { kind: "tier-added"; tierId: string; name: string; cost: number }
  | { kind: "tier-removed"; tierId: string; name: string; cost: number }
  | { kind: "tier-renamed"; tierId: string; from: string; to: string }
  | {
      kind: "tier-repriced";
      tierId: string;
      name: string;
      from: number;
      to: number;
    }
  | {
      kind: "added";
      pokemonId: string;
      name: string;
      tier?: string;
      cost?: number;
    }
  | {
      kind: "removed";
      pokemonId: string;
      name: string;
      tier?: string;
      cost?: number;
    }
  | {
      kind: "moved";
      pokemonId: string;
      name: string;
      from?: string;
      to?: string;
      fromCost?: number;
      toCost?: number;
    }
  | { kind: "banned"; pokemonId: string; name: string }
  | { kind: "unbanned"; pokemonId: string; name: string }
  | { kind: "details"; pokemonId: string; name: string }
  | {
      kind: "ban-list";
      field: "moves" | "abilities";
      added: string[];
      removed: string[];
    };

export function toState(tierList: TierList): TierListState {
  const pokemon: Record<string, PokemonState> = {};
  for (const [id, entry] of tierList.pokemon) {
    pokemon[id] = {
      name: entry.name,
      ...(entry.tierId && { tierId: entry.tierId }),
      ...(entry.banned && { banned: true }),
      ...(entry.notes && { notes: entry.notes }),
      ...(entry.formes?.length && { formes: [...entry.formes] }),
      ...(entry.addons?.length && {
        addons: entry.addons.map((addon) => ({
          name: addon.name,
          cost: addon.cost,
          ...(addon.notes && { notes: addon.notes }),
        })),
      }),
    };
  }
  return {
    tiers: tierList.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      cost: tier.cost,
      ...(tier.color && { color: tier.color }),
    })),
    pokemon,
    banned: {
      moves: [...tierList.banned.moves],
      abilities: [...tierList.banned.abilities],
    },
  };
}

export function applyState(tierList: TierList, state: TierListState): void {
  tierList.tiers = state.tiers.map((tier) => new Tier(tier));
  tierList.pokemon = new Map(
    Object.entries(state.pokemon).map(([id, entry]) => [
      id,
      new TierListPokemon({
        name: entry.name,
        tierId: entry.tierId,
        banned: entry.banned,
        notes: entry.notes,
        formes: entry.formes ? [...entry.formes] : undefined,
        addons: entry.addons?.map((addon) => new TierListPokemonAddon(addon)),
      }),
    ]),
  );
  tierList.banned = {
    moves: [...state.banned.moves],
    abilities: [...state.banned.abilities],
  };
}

export function emptyState(): TierListState {
  return { tiers: [], pokemon: {}, banned: { moves: [], abilities: [] } };
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

export function matchTiers(
  before: TierState[],
  after: TierState[],
): Map<string, string> {
  const matches = new Map<string, string>();
  const afterIds = new Set(after.map((tier) => tier.id));
  const claimed = new Set<string>();
  for (const tier of before) {
    if (afterIds.has(tier.id)) {
      matches.set(tier.id, tier.id);
      claimed.add(tier.id);
    }
  }
  for (const tier of before) {
    if (matches.has(tier.id)) continue;
    const byName = after.find(
      (candidate) =>
        !claimed.has(candidate.id) &&
        normalize(candidate.name) === normalize(tier.name),
    );
    if (byName) {
      matches.set(tier.id, byName.id);
      claimed.add(byName.id);
    }
  }
  return matches;
}

function sameDetails(a: PokemonState, b: PokemonState): boolean {
  return (
    (a.notes ?? "") === (b.notes ?? "") &&
    JSON.stringify(a.formes ?? []) === JSON.stringify(b.formes ?? []) &&
    JSON.stringify(a.addons ?? []) === JSON.stringify(b.addons ?? [])
  );
}

export function diffStates(
  before: TierListState,
  after: TierListState,
): TierListChange[] {
  const changes: TierListChange[] = [];
  const matches = matchTiers(before.tiers, after.tiers);
  const matchedAfter = new Set(matches.values());
  const beforeTier = new Map(before.tiers.map((tier) => [tier.id, tier]));
  const afterTier = new Map(after.tiers.map((tier) => [tier.id, tier]));

  for (const tier of before.tiers) {
    const matchId = matches.get(tier.id);
    const next = matchId ? afterTier.get(matchId) : undefined;
    if (!next) {
      changes.push({
        kind: "tier-removed",
        tierId: tier.id,
        name: tier.name,
        cost: tier.cost,
      });
      continue;
    }
    if (next.name !== tier.name)
      changes.push({
        kind: "tier-renamed",
        tierId: next.id,
        from: tier.name,
        to: next.name,
      });
    if (next.cost !== tier.cost)
      changes.push({
        kind: "tier-repriced",
        tierId: next.id,
        name: next.name,
        from: tier.cost,
        to: next.cost,
      });
  }
  for (const tier of after.tiers) {
    if (!matchedAfter.has(tier.id))
      changes.push({
        kind: "tier-added",
        tierId: tier.id,
        name: tier.name,
        cost: tier.cost,
      });
  }

  const ids = new Set([
    ...Object.keys(before.pokemon),
    ...Object.keys(after.pokemon),
  ]);
  for (const id of [...ids].sort()) {
    const was = before.pokemon[id];
    const now = after.pokemon[id];
    const wasTier = was?.tierId ? beforeTier.get(was.tierId) : undefined;
    const nowTier = now?.tierId ? afterTier.get(now.tierId) : undefined;

    if (!was && now) {
      if (!now.tierId && !now.banned) continue;
      changes.push({
        kind: "added",
        pokemonId: id,
        name: now.name,
        tier: nowTier?.name,
        cost: nowTier?.cost,
      });
      if (now.banned) changes.push({ kind: "banned", pokemonId: id, name: now.name });
      continue;
    }
    if (was && !now) {
      if (!was.tierId && !was.banned) continue;
      changes.push({
        kind: "removed",
        pokemonId: id,
        name: was.name,
        tier: wasTier?.name,
        cost: wasTier?.cost,
      });
      continue;
    }
    if (!was || !now) continue;

    const sameTier = wasTier
      ? matches.get(wasTier.id) === nowTier?.id
      : !nowTier;
    if (!sameTier)
      changes.push({
        kind: "moved",
        pokemonId: id,
        name: now.name,
        from: wasTier?.name,
        to: nowTier?.name,
        fromCost: wasTier?.cost,
        toCost: nowTier?.cost,
      });
    if (!!was.banned !== !!now.banned)
      changes.push({
        kind: now.banned ? "banned" : "unbanned",
        pokemonId: id,
        name: now.name,
      });
    if (!sameDetails(was, now))
      changes.push({ kind: "details", pokemonId: id, name: now.name });
  }

  for (const field of ["moves", "abilities"] as const) {
    const wasSet = new Set(before.banned[field]);
    const nowSet = new Set(after.banned[field]);
    const added = [...nowSet].filter((entry) => !wasSet.has(entry)).sort();
    const removed = [...wasSet].filter((entry) => !nowSet.has(entry)).sort();
    if (added.length || removed.length)
      changes.push({ kind: "ban-list", field, added, removed });
  }

  return changes;
}

export function summarizeChanges(changes: TierListChange[]): string {
  if (!changes.length) return "No changes";
  const count = (kind: TierListChange["kind"]) =>
    changes.filter((change) => change.kind === kind).length;
  const parts: string[] = [];

  const added = count("added");
  const removed = count("removed");
  const moved = count("moved");
  if (added) parts.push(`added ${added} Pokémon`);
  if (removed) parts.push(`removed ${removed} Pokémon`);
  if (moved) parts.push(`moved ${moved} Pokémon`);

  for (const change of changes) {
    if (change.kind === "tier-repriced")
      parts.push(`repriced ${change.name} ${change.from} → ${change.to}`);
    if (change.kind === "tier-renamed")
      parts.push(`renamed ${change.from} to ${change.to}`);
    if (change.kind === "tier-added") parts.push(`added tier ${change.name}`);
    if (change.kind === "tier-removed") parts.push(`removed tier ${change.name}`);
  }

  const banned = count("banned");
  const unbanned = count("unbanned");
  if (banned) parts.push(`banned ${banned}`);
  if (unbanned) parts.push(`unbanned ${unbanned}`);
  const details = count("details");
  if (details) parts.push(`edited details on ${details}`);
  if (changes.some((change) => change.kind === "ban-list"))
    parts.push("changed banned moves or abilities");

  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export type MergeConflict = {
  pokemonId: string;
  name: string;
  source: PokemonState | null;
  current: PokemonState | null;
};

export type MergeResult = {
  state: TierListState;
  changes: TierListChange[];
  conflicts: MergeConflict[];
};

function canonical(entry: PokemonState | undefined): string {
  if (!entry) return "null";
  return JSON.stringify([
    entry.name,
    entry.tierId ?? null,
    !!entry.banned,
    entry.notes ?? "",
    entry.formes ?? [],
    entry.addons ?? [],
  ]);
}

function samePokemon(
  a: PokemonState | undefined,
  b: PokemonState | undefined,
): boolean {
  return canonical(a) === canonical(b);
}

function withTier(
  entry: PokemonState | undefined,
  tierIds: Map<string, string>,
): PokemonState | undefined {
  if (!entry) return undefined;
  const { tierId, ...rest } = entry;
  const mapped = tierId ? tierIds.get(tierId) : undefined;
  return mapped ? { ...rest, tierId: mapped } : rest;
}

export function mergeStates(
  base: TierListState | null,
  source: TierListState,
  current: TierListState,
  resolutions: Record<string, "source" | "current"> = {},
): MergeResult {
  const ancestor = base ?? current;
  const sourceToCurrent = matchTiers(source.tiers, current.tiers);
  const baseToSource = matchTiers(ancestor.tiers, source.tiers);
  const baseToCurrent = matchTiers(ancestor.tiers, current.tiers);
  const sourceToBase = new Map(
    [...baseToSource.entries()].map(([baseId, sourceId]) => [sourceId, baseId]),
  );

  const tiers = current.tiers.map((tier) => ({ ...tier }));
  const tierById = new Map(tiers.map((tier) => [tier.id, tier]));
  const sourceTierIds = new Map<string, string>();

  for (const sourceTier of source.tiers) {
    const currentId = sourceToCurrent.get(sourceTier.id);
    const baseId = sourceToBase.get(sourceTier.id);
    const baseTier = ancestor.tiers.find((tier) => tier.id === baseId);

    if (currentId) {
      sourceTierIds.set(sourceTier.id, currentId);
      const mine = tierById.get(currentId)!;
      const untouched =
        !baseTier ||
        (mine.cost === baseTier.cost && mine.name === baseTier.name);
      if (untouched) {
        mine.cost = sourceTier.cost;
        mine.name = sourceTier.name;
      }
      continue;
    }
    if (base && baseTier) continue;

    const added = { ...sourceTier, id: new Types.ObjectId().toString() };
    tiers.push(added);
    tierById.set(added.id, added);
    sourceTierIds.set(sourceTier.id, added.id);
  }

  const baseTierIds = new Map<string, string>();
  for (const tier of ancestor.tiers) {
    const viaSource = baseToSource.get(tier.id);
    const mapped =
      (viaSource && sourceTierIds.get(viaSource)) ?? baseToCurrent.get(tier.id);
    if (mapped) baseTierIds.set(tier.id, mapped);
  }

  const pokemon: Record<string, PokemonState> = {};
  for (const [id, entry] of Object.entries(current.pokemon))
    pokemon[id] = { ...entry };
  const conflicts: MergeConflict[] = [];
  const ids = new Set([
    ...Object.keys(source.pokemon),
    ...Object.keys(ancestor.pokemon),
  ]);

  for (const id of [...ids].sort()) {
    const theirs = withTier(source.pokemon[id], sourceTierIds);
    const ancestorEntry = base
      ? withTier(ancestor.pokemon[id], baseTierIds)
      : current.pokemon[id];
    const mine = current.pokemon[id];

    if (samePokemon(theirs, ancestorEntry)) continue;
    if (samePokemon(theirs, mine)) continue;

    if (base && !samePokemon(mine, ancestorEntry)) {
      const choice = resolutions[id];
      if (!choice) {
        conflicts.push({
          pokemonId: id,
          name: theirs?.name ?? mine?.name ?? id,
          source: theirs ?? null,
          current: mine ?? null,
        });
        continue;
      }
      if (choice === "current") continue;
    }

    if (theirs) pokemon[id] = theirs;
    else delete pokemon[id];
  }

  if (base) {
    for (const baseTier of ancestor.tiers) {
      if (baseToSource.has(baseTier.id)) continue;
      const currentId = baseToCurrent.get(baseTier.id);
      const mine = currentId ? tierById.get(currentId) : undefined;
      if (!mine || mine.cost !== baseTier.cost) continue;
      const used = Object.values(pokemon).some(
        (entry) => entry.tierId === mine.id,
      );
      if (used) continue;
      tiers.splice(tiers.indexOf(mine), 1);
      tierById.delete(mine.id);
    }
  }

  for (const entry of Object.values(pokemon)) {
    if (entry.tierId && !tierById.has(entry.tierId)) delete entry.tierId;
  }

  const banned = {
    moves: [...current.banned.moves],
    abilities: [...current.banned.abilities],
  };
  for (const field of ["moves", "abilities"] as const) {
    const baseSet = new Set(ancestor.banned[field]);
    const sourceSet = new Set(source.banned[field]);
    const next = new Set(banned[field]);
    for (const entry of sourceSet) if (!baseSet.has(entry)) next.add(entry);
    if (base)
      for (const entry of baseSet) if (!sourceSet.has(entry)) next.delete(entry);
    banned[field] = [...next];
  }

  const state: TierListState = { tiers, pokemon, banned };
  return { state, changes: diffStates(current, state), conflicts };
}
