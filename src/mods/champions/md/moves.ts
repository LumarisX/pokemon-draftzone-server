import { ModdedMoveDataTable } from "@pkmn/sim";

export const Moves: ModdedMoveDataTable = {
  rockslide: {
    inherit: true,
    accuracy: 95,
    secondary: {
      chance: 20,
      volatileStatus: "flinch",
    },
  },
  screech: {
    inherit: true,
    accuracy: 100,
  },
  steelwing: {
    inherit: true,
    accuracy: 100,
  },
  metalsound: {
    inherit: true,
    accuracy: 100,
  },
  frostbreath: {
    inherit: true,
    accuracy: 100,
  },
};
