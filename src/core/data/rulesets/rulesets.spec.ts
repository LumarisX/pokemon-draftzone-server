import { getRuleset, getRulesets, getRulesetsGrouped } from './rulesets';

// Mock @pkmn/data and @pkmn/dex
jest.mock('@pkmn/data', () => ({
  Data: jest.fn(() => ({
    exists: true,
    kind: 'Species',
    id: 'pikachu',
    name: 'Pikachu',
    isNonstandard: null,
    tier: null,
    forme: null,
  })),
  Generation: jest.fn(() => ({})),
}));

jest.mock('@pkmn/dex', () => ({
  Dex: {
    forGen: jest.fn(() => ({})),
  },
  ModdedDex: jest.fn(() => ({})),
}));

describe('getRuleset', () => {
  it('should return the correct ruleset for a valid ID', () => {
    const gen9NatDexRuleset = getRuleset('Gen9 NatDex');
    expect(gen9NatDexRuleset).toBeDefined();
    expect(gen9NatDexRuleset.name).toBe('Gen9 NatDex');

    const paldeaDexRuleset = getRuleset('Paldea Dex');
    expect(paldeaDexRuleset).toBeDefined();
    expect(paldeaDexRuleset.name).toBe('Paldea Dex');
  });

  it('should throw an error for an invalid ruleset ID', () => {
    expect(() => getRuleset('InvalidRuleset')).toThrow('Ruleset Id not found: InvalidRuleset');
  });

  it('resolves every id advertised by getRulesets() without throwing', () => {
    for (const rulesetId of getRulesets()) {
      expect(getRuleset(rulesetId).name).toBe(rulesetId);
    }
  });

  it('marks the National Dex rulesets (and only those) as isNatDex', () => {
    expect(getRuleset('Gen9 NatDex').isNatDex).toBe(true);
    expect(getRuleset('Gen8 NatDex').isNatDex).toBe(true);
    expect(getRuleset('Paldea Dex').isNatDex).toBe(false);
  });
});

describe('getRulesets', () => {
  it('should return an array of ruleset IDs', () => {
    const rulesets = getRulesets();
    expect(Array.isArray(rulesets)).toBe(true);
    expect(rulesets.length).toBeGreaterThan(0);
    expect(rulesets).toContain('Gen9 NatDex');
    expect(rulesets).toContain('Paldea Dex');
    expect(rulesets).toContain('Gen8 NatDex');
    expect(rulesets).toContain('Sword/Shield');
    expect(rulesets).toContain('Galar Dex');
    expect(rulesets).toContain('Alola Dex');
    expect(rulesets).toContain('Kalos Dex');
    expect(rulesets).toContain('Unova Dex');
    expect(rulesets).toContain('Sinnoh Dex');
    expect(rulesets).toContain('Hoenn Dex');
    expect(rulesets).toContain('Johto Dex');
    expect(rulesets).toContain('Kanto Dex');
  });

  it('includes every group, not just Gen 9/Gen 8/Older Gens (e.g. Champions and Rom Hacks)', () => {
    const rulesets = getRulesets();
    expect(rulesets).toContain('Champions MA');
    expect(rulesets).toContain('Champions MB');
    expect(rulesets).toContain('radicalred');
    expect(rulesets).toContain('insurgance');
  });
});

describe('getRulesetsGrouped', () => {
  it('should return an array of grouped rulesets', () => {
    const groupedRulesets = getRulesetsGrouped();
    expect(Array.isArray(groupedRulesets)).toBe(true);
    expect(groupedRulesets.length).toBeGreaterThan(0);

    const gen9Group = groupedRulesets.find(([groupName]) => groupName === 'Gen 9');
    expect(gen9Group).toBeDefined();
    expect(gen9Group![1]).toContainEqual({ name: 'National Dex', id: 'Gen9 NatDex', desc: 'Only Pokémon available in Generation 9 and before' });
    expect(gen9Group![1]).toContainEqual({ name: 'Paldea Dex', id: 'Paldea Dex', desc: 'Only Pokémon available in the Paldea Dex' });

    const romHacksGroup = groupedRulesets.find(([groupName]) => groupName === 'Rom Hacks');
    expect(romHacksGroup).toBeDefined();
    expect(romHacksGroup![1]).toContainEqual({ name: 'Radical Red', id: 'radicalred', desc: 'All Pokémon from the Radical Red rom hack' });
    expect(romHacksGroup![1]).toContainEqual({ name: 'Insurgance', id: 'insurgance', desc: 'All Pokémon from the Insurgance rom hack' });
  });
});