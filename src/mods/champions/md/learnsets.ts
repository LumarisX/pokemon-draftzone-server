type Additions = Record<string, { learnset: Record<string, string[]> }>;

const gains = (moves: Record<string, string[]>): Additions => {
  const table: Additions = {};
  for (const [move, species] of Object.entries(moves)) {
    for (const id of species) {
      const learnset = table[id]?.learnset ?? {};
      learnset[move] = ["9M"];
      table[id] = { learnset };
    }
  }
  return table;
};

export const LearnsetAdditions: Additions = gains({
  psychup: [
    "alakazam",
    "starmie",
    "mrmime",
    "mawile",
    "altaria",
    "castform",
    "absol",
    "roserade",
    "weavile",
    "rotom",
    "rotomheat",
    "rotomwash",
    "rotomfrost",
    "rotomfan",
    "rotommow",
    "liepard",
    "musharna",
    "audino",
    "cofagrigus",
    "slurpuff",
    "drampa",
    "annihilape",
  ],
  slackoff: ["emboar"],
  roost: ["beedrill", "hydreigon"],
  tailwind: ["emolga"],
  wonderroom: ["umbreon"],
  playrough: [
    "vaporeon",
    "jolteon",
    "flareon",
    "espeon",
    "umbreon",
    "leafeon",
    "glaceon",
  ],
});
