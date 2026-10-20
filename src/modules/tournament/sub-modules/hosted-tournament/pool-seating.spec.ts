import { shuffled, spreadAcrossPools } from "./pool-seating";

describe("spreadAcrossPools", () => {
  it("splits teams evenly across empty pools", () => {
    const placements = spreadAcrossPools(
      ["a", "b", "c", "d", "e"],
      [
        { pool: "one", size: 0 },
        { pool: "two", size: 0 },
      ],
    );

    const count = (pool: string) =>
      placements.filter((entry) => entry.pool === pool).length;
    expect(count("one")).toBe(3);
    expect(count("two")).toBe(2);
  });

  it("fills the emptier pool first so pools even out", () => {
    const placements = spreadAcrossPools(
      ["a", "b", "c"],
      [
        { pool: "full", size: 4 },
        { pool: "short", size: 1 },
      ],
    );

    expect(placements.map((entry) => entry.pool)).toEqual([
      "short",
      "short",
      "short",
    ]);
  });

  it("places no one when there are no pools", () => {
    expect(spreadAcrossPools(["a"], [])).toEqual([]);
  });
});

describe("shuffled", () => {
  it("keeps every item exactly once", () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect([...shuffled(items)].sort()).toEqual(items);
  });

  it("does not change the input", () => {
    const items = [1, 2, 3];
    shuffled(items, () => 0);
    expect(items).toEqual([1, 2, 3]);
  });

  it("uses the random source for every swap", () => {
    expect(shuffled(["a", "b", "c"], () => 0)).toEqual(["b", "c", "a"]);
  });
});
