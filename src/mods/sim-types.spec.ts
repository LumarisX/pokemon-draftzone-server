import { ActiveMove, Move, Pokemon } from "./sim-types";

type IsAny<T> = 0 extends 1 & T ? true : false;

const move: IsAny<Move> = false;
const activeMove: IsAny<ActiveMove> = false;
const pokemon: IsAny<Pokemon> = false;

const shape: Pick<ActiveMove, "id" | "hit" | "basePower"> = {
  id: "tackle" as ActiveMove["id"],
  hit: 1,
  basePower: 40,
};

describe("sim type shims", () => {
  it("resolve to real @pkmn/sim types rather than any", () => {
    expect([move, activeMove, pokemon]).toEqual([false, false, false]);
    expect(shape.basePower).toBe(40);
  });
});
