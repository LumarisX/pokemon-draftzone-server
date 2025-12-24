import { Specie } from "@pkmn/data";

export function getBST(specie: Specie) {
  return Object.values(specie.baseStats).reduce((sum, stat) => stat + sum);
}

export function getCST(specie: Specie) {
  const baseStats = specie.baseStats;

  return Math.round(
    competativeHP(baseStats.hp) +
      competitiveAttacks(baseStats.atk, baseStats.spa) +
      competitiveDefenses(baseStats.def, baseStats.spd) +
      competitiveSpeed(baseStats.spe)
  );
}

export function competativeHP(hp: number): number {
  return hp;
}

export function competitiveAttacks(atk: number, spa: number): number {
  return parabolicStat(atk, spa, 128);
}

export function competitiveDefenses(def: number, spd: number): number {
  return parabolicStat(def, spd, -128);
}

export function competitiveSpeed(spe: number): number {
  return sigmoidStat(spe, 80, 256);
}

function parabolicStat(x: number, y: number, amplitude: number): number {
  return x + y + Math.pow(x - y, 2) / (2 * amplitude);
}

function squaredAverage(x: number, y: number): number {
  return Math.sqrt((x * x + y * y) / 2);
}

function sigmoidStat(x: number, center: number, amplitude: number): number {
  const h = 1.5 * center - amplitude / 2;
  const s = -4 / (amplitude - center);

  return (amplitude - center) / (1 + Math.exp(s * (x - center))) + h;
}
