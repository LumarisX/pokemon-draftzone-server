import { calculate, Field, Move, Pokemon } from "@smogon/calc";

export const TEAM: { [key: string]: Pokemon } = {
  Primarina: new Pokemon(9, "Primarina", {
    item: "Sitrus Berry",
    ability: "Liquid Voice",
    level: 50,
    moves: ["Moonblast", "Hyper Voice", "Icy Wind", "Protect"],
    evs: {
      hp: 252,
      spa: 252,
      spe: 4,
    },
    nature: "Modest",
  }),
  Archaludon: new Pokemon(9, "Archaludon", {
    item: "Power Herb",
    ability: "Sturdy",
    level: 50,
    moves: ["Electro Shot", "Flash Cannon", "Draco Meteor", "Protect"],
    evs: {
      spd: 4,
      spa: 252,
      spe: 252,
    },
    nature: "Timid",
  }),
  Annihilape: new Pokemon(9, "Annihilape", {
    item: "Focus Sash",
    ability: "Defiant",
    level: 50,
    moves: ["Rage Fist", "Close Combat", "Taunt", "Coaching"],
    evs: {
      spd: 4,
      atk: 252,
      spe: 252,
    },
    nature: "Jolly",
  }),
  Dragonite: new Pokemon(9, "Dragonite", {
    item: "Loaded Dice",
    ability: "Multiscale",
    level: 50,
    moves: ["Scale Shot", "Extreme Speed", "Haze", "Protect"],
    evs: {
      spd: 4,
      atk: 252,
      spe: 252,
    },
    nature: "Adamant",
  }),
  Talonflame: new Pokemon(9, "Talonflame", {
    item: "Covert Cloak",
    ability: "Flame Body",
    level: 50,
    moves: ["Dual Wingbeat", "Flare Blitz", "Tailwind", "Feather Dance"],
    evs: {
      spd: 20,
      spa: 236,
      spe: 252,
    },
    nature: "Adamant",
  }),
  Rillaboom: new Pokemon(9, "Rillaboom", {
    item: "Assault Vest",
    ability: "Grassy Surge",
    level: 50,
    moves: ["Grassy Glide", "Fake Out", "Wood Hammer", "U-turn"],
    evs: {
      hp: 252,
      atk: 252,
      spd: 4,
    },
    nature: "Adamant",
  }),
};

const OPPMONS: { [key: string]: [Pokemon] } = {
  Charizard: [
    new Pokemon(9, "Charizard", {
      evs: {
        spa: 252,
      },
      nature: "Modest",
      item: "Choice Specs",
      ability: "Solar Power",
      level: 50,
    }),
  ],
  Dragonite: [
    new Pokemon(9, "Dragonite", {
      evs: {
        atk: 252,
      },
      ability: "Multiscale",
      nature: "Adamant",
      item: "Loaded Dice",
      level: 50,
    }),
  ],
  Archaludon: [
    new Pokemon(9, "Archaludon", {
      evs: {
        spa: 252,
        hp: 252,
      },
      ability: "Stamina",
      nature: "Modest",
      item: "Assault Vest",
      level: 50,
    }),
  ],
};

const CALCS: [Pokemon, Pokemon, string[], string[], Field][] = [
  [
    TEAM.Primarina,
    OPPMONS.Charizard[0],
    ["Hyper Voice"],
    ["Air Slash", "Overheat", "Heat Wave"],
    new Field({ weather: "Sun", gameType: "Doubles" }),
  ],
  [
    (() => {
      TEAM.Rillaboom.teraType = "Water";
      return TEAM.Rillaboom;
    })(),
    OPPMONS.Charizard[0],
    ["Wood Hammer"],
    ["Air Slash", "Overheat", "Heat Wave"],
    new Field({ weather: "Sun", gameType: "Doubles" }),
  ],
  [
    (() => {
      TEAM.Archaludon.boosts = {
        hp: 0,
        atk: 0,
        def: 0,
        spa: 1,
        spd: 0,
        spe: 0,
      };
      return TEAM.Archaludon;
    })(),
    OPPMONS.Dragonite[0],
    ["Draco Meteor"],
    ["Scale Shot"],
    new Field({ gameType: "Doubles" }),
  ],
  [
    TEAM.Dragonite,
    OPPMONS.Archaludon[0],
    ["Scale Shot"],
    ["Dragon Pulse, Electro Shot, Draco Meteor"],
    new Field({ gameType: "Doubles" }),
  ],
];

export function teamCalcs() {
  CALCS.forEach((calc) => {
    calc[2].forEach((moveName) => {
      let move = new Move(9, moveName, { hits: 4 });
      const result = calculate(9, calc[0], calc[1], move, calc[4]);
      console.log("=>", result.fullDesc());
    });
    calc[3].forEach((moveName) => {
      let move = new Move(9, moveName, { hits: 5 });
      const result = calculate(9, calc[1], calc[0], move, calc[4]);
      console.log("<=", result.fullDesc());
    });
    console.log();
  });
}
