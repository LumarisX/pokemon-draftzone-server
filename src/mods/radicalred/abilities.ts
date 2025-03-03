import { ModdedAbilityDataTable } from "@pkmn/sim";

export const Abilities: ModdedAbilityDataTable = {
  badcompany: {
    name: "Bad Company",
    rating: 4,
    gen: 8,
    shortDesc: "Prevents self-lowering stat drops and recoil.",
  },
  blademaster: {
    name: "Blademaster",
    gen: 8,
    isNonstandard: "Past",
  },
  blazingsoul: {
    name: "Blazing Soul",
    rating: 3,
    gen: 8,
    shortDesc:
      "If this Pokemon is at full HP, its Fire-type moves have their priority increased by 1.",
  },
  blubberdefense: {
    name: "Blubber Defense",
    rating: 3.5,
    gen: 8,
    shortDesc:
      "If this Pokemon is at full HP, damage taken from attacks is halved.",
  },
  bonezone: {
    onModifyMovePriority: -5,
    name: "Bone Zone",
    rating: 4,
    gen: 8,
    shortDesc:
      "Bone moves ignore immunities and deal double damage on not very effective.",
  },
  bullrush: {
    name: "Bull Rush",
    rating: 3.5,
    gen: 8,
    desc: "On the first turn this Pokemon is out on the field for, it gets a 1.5x Speed boost and a 1.2x Attack boost.",
    shortDesc: "On first turn out, 1.5x Speed and 1.2x Attack.",
  },
  cashsplash: {
    onSourceModifyAtkPriority: 5,
    onSourceModifySpAPriority: 5,
    name: "Cash Splash",
    rating: 4.5,
    gen: 8,
    desc: "This Pokemon's attacking stat is doubled while using a Water-type attack. If a Pokemon uses a Fire-type attack against this Pokemon, that Pokemon's attacking stat is halved when calculating the damage to this Pokemon. This Pokemon cannot be burned. Gaining this Ability while burned cures it.",
    shortDesc:
      "This Pokemon's Water power is 2x; it can't be burned; Fire power against it is halved.",
  },
  fatalprecision: {
    onBasePowerPriority: 23,
    name: "Fatal Precision",
    rating: 3,
    gen: 8,
    shortDesc:
      "Super Effective Moves from this Pokemon can’t miss and receive a 20% damage boost.",
  },
  felineprowess: {
    onModifySpAPriority: 5,
    name: "Feline Prowess",
    rating: 5,
    gen: 8,
    shortDesc: "This Pokemon's Sp. Atk is doubled.",
  },
  oraoraoraora: {
    name: "ORAORAORAORA",
    rating: 5,
    gen: 8,
    shortDesc:
      "This Pokemon's punch moves hit twice. The second hit has its damage halved.",
  },
  parasiticwaste: {
    name: "Parasitic Waste",
    gen: 8,
    rating: 2.5,
    shortDesc: "Attacks that can poison also heal for 50% of the damage dealt.",
  },
  phoenixdown: {
    flags: {
      failroleplay: 1,
      noreceiver: 1,
      noentrain: 1,
      notrace: 1,
      failskillswap: 1,
      cantsuppress: 1,
    },
    name: "Phoenix Down",
    gen: 8,
    rating: 5,
    desc: "Once per battle, this Pokemon restores 1/2 of its maximum HP, rounded down, has its non-volatile status condition cured, and has its stat stages reset to 0 instead of fainting.",
    shortDesc:
      "Heals to 50% hp and has stats and status reset instead of fainting; Only once per battle.",
  },
  primalarmor: {
    name: "Primal Armor",
    rating: 4,
    gen: 8,
    shortDesc: "This Pokemon receives 1/2 damage from supereffective attacks.",
  },
  quillrush: {
    name: "Quill Rush",
    rating: 3.5,
    gen: 8,
    desc: "On the first turn this Pokemon is out on the field for, it gets a 1.5x Speed boost and a 1.2x Attack boost.",
    shortDesc: "On first turn out, 1.5x Speed and 1.2x Attack.",
  },
  sagepower: {
    onModifySpAPriority: 1,
    name: "Sage Power",
    rating: 4.5,
    gen: 8,
    shortDesc:
      "This Pokemon's Sp. Atk is 1.5x, but it can only select the first move it executes.",
  },
  selfsufficient: {
    onResidualOrder: 28,
    onResidualSubOrder: 2,
    name: "Self Sufficient",
    rating: 3,
    gen: 8,
    shortDesc:
      "At the end of every turn, this Pokemon restores 1/16 of its max HP.",
  },
  striker: {
    onBasePowerPriority: 43,
    name: "Striker",
    rating: 3,
    gen: 8,
    desc: "This Pokemon's kick-based attacks have their power multiplied by 1.3.",
    shortDesc: "This Pokemon's kick-based attacks have 1.3x power.",
  },
  surprise: {
    name: "Surprise!",
    gen: 8,
    isNonstandard: "Past",
  },
};
