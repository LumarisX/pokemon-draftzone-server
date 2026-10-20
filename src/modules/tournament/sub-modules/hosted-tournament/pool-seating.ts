import { randomInt } from "crypto";

export function shuffled<T>(
  items: readonly T[],
  random: (max: number) => number = randomInt,
): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = random(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function spreadAcrossPools<T, P>(
  items: readonly T[],
  pools: readonly { pool: P; size: number }[],
): { item: T; pool: P }[] {
  if (!pools.length) return [];
  const sizes = pools.map((entry) => entry.size);
  return items.map((item) => {
    let target = 0;
    for (let index = 1; index < sizes.length; index += 1)
      if (sizes[index] < sizes[target]) target = index;
    sizes[target] += 1;
    return { item, pool: pools[target].pool };
  });
}
