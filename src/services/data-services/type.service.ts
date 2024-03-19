import { ExtendedTypes, TypeId, Typechart } from "../../public/data/typechart";

const base: {
  [key in ExtendedTypes]: number;
} = {
  bug: 1,
  dark: 1,
  dragon: 1,
  electric: 1,
  fairy: 1,
  fighting: 1,
  fire: 1,
  flying: 1,
  ghost: 1,
  grass: 1,
  ground: 1,
  ice: 1,
  normal: 1,
  poison: 1,
  psychic: 1,
  rock: 1,
  steel: 1,
  water: 1,
  brn: 1,
  par: 1,
  prankster: 1,
  tox: 1,
  psn: 1,
  frz: 1,
  powder: 1,
  sandstorm: 1,
  hail: 1,
  trapped: 1,
};

export function defensive(types: TypeId[]) {
  let out = structuredClone(base);
  for (let t of types) {
    for (let type in Typechart[t].damageTaken) {
      out[type] = out[type] * def[type];
    }
  }
  return out;
}
