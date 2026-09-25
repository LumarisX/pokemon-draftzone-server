import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  MAX_GAMES_PER_MATCHUP,
  MAX_POKEMON_PER_SIDE,
  PokemonResultDto,
  SubmitMatchupReportDto,
} from "./stage.dto";

function game(overrides: Record<string, unknown> = {}) {
  return {
    winner: "side1",
    team1: {
      score: 1,
      pokemon: {
        pikachu: {
          status: "survived",
          kills: { direct: 2, indirect: 0, teammate: 0 },
        },
      },
    },
    team2: { score: 0, pokemon: { mewtwo: { status: "fainted" } } },
    ...overrides,
  };
}

async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(SubmitMatchupReportDto, body);
  const errors = await validate(dto, { whitelist: true });
  return { dto, errors };
}

function paths(errors: Awaited<ReturnType<typeof validate>>, prefix = ""): string[] {
  return errors.flatMap((error) => {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    return [
      ...(error.constraints ? [path] : []),
      ...paths(error.children ?? [], path),
    ];
  });
}

describe("SubmitMatchupReportDto", () => {
  it("accepts a well-formed report and turns each side's Pokémon into a Map", async () => {
    const { dto, errors } = await check({
      matches: [game({ link: " https://replay.pokemonshowdown.com/gen9-1 " })],
    });

    expect(errors).toEqual([]);
    const pokemon = dto.matches[0].team1.pokemon;
    expect(pokemon).toBeInstanceOf(Map);
    expect(pokemon.get("pikachu")).toBeInstanceOf(PokemonResultDto);
    expect(pokemon.get("pikachu")?.kills?.direct).toBe(2);
    expect(dto.matches[0].link).toBe(
      "https://replay.pokemonshowdown.com/gen9-1",
    );
  });

  it("treats a blank replay link as no link", async () => {
    const { dto, errors } = await check({ matches: [game({ link: "   " })] });

    expect(errors).toEqual([]);
    expect(dto.matches[0].link).toBeUndefined();
  });

  it.each([
    ["an unknown status", { status: "exploded" }],
    ["a missing status", { kills: { direct: 1 } }],
    ["negative kills", { status: "fainted", kills: { direct: -1 } }],
    ["fractional kills", { status: "fainted", kills: { indirect: 1.5 } }],
    ["absurd kills", { status: "survived", kills: { direct: 999 } }],
    ["string kills", { status: "survived", kills: { teammate: "2" } }],
  ])("rejects %s", async (_, stats) => {
    const { errors } = await check({
      matches: [
        game({
          team2: { score: 0, pokemon: { mewtwo: stats } },
        }),
      ],
    });

    expect(paths(errors).some((path) => path.startsWith("matches.0.team2.pokemon.mewtwo"))).toBe(true);
  });

  it("drops Pokémon sent with a null status, as the old client did", async () => {
    const { dto, errors } = await check({
      matches: [
        game({
          team2: {
            score: 0,
            pokemon: { mewtwo: { status: "fainted" }, mew: { status: null } },
          },
        }),
      ],
    });

    expect(errors).toEqual([]);
    expect([...dto.matches[0].team2.pokemon.keys()]).toEqual(["mewtwo"]);
  });

  it("rejects a Pokémon map that is not an object", async () => {
    const { errors } = await check({
      matches: [game({ team2: { score: 0, pokemon: ["mewtwo"] } })],
    });

    expect(paths(errors)).toContain("matches.0.team2.pokemon");
  });

  it("caps the Pokémon on a side", async () => {
    const pokemon = Object.fromEntries(
      Array.from({ length: MAX_POKEMON_PER_SIDE + 1 }, (_, i) => [
        `mon${i}`,
        { status: "brought" },
      ]),
    );
    const { errors } = await check({
      matches: [game({ team2: { score: 0, pokemon } })],
    });

    expect(paths(errors)).toContain("matches.0.team2.pokemon");
  });

  it("caps the number of games", async () => {
    const { errors } = await check({
      matches: Array.from({ length: MAX_GAMES_PER_MATCHUP + 1 }, () => game()),
    });

    expect(paths(errors)).toContain("matches");
  });

  it.each([
    ["an http link", "http://replay.pokemonshowdown.com/gen9-1"],
    ["a javascript link", "javascript:alert(1)"],
    ["text that is not a link", "game 1 replay"],
  ])("rejects %s", async (_, link) => {
    const { errors } = await check({ matches: [game({ link })] });

    expect(paths(errors)).toContain("matches.0.link");
  });

  it("rejects negative and fractional scores", async () => {
    const { errors } = await check({
      score: { team1: -1, team2: 0.5 },
      matches: [game({ team1: { score: -2, pokemon: {} } })],
    });

    expect(paths(errors)).toEqual(
      expect.arrayContaining([
        "score.team1",
        "score.team2",
        "matches.0.team1.score",
      ]),
    );
  });

  it("strips unknown fields from each Pokémon's stats", async () => {
    const { dto, errors } = await check({
      matches: [
        game({
          team2: {
            score: 0,
            pokemon: { mewtwo: { status: "fainted", owner: "auth0|someone" } },
          },
        }),
      ],
    });

    expect(errors).toEqual([]);
    expect(dto.matches[0].team2.pokemon.get("mewtwo")).not.toHaveProperty(
      "owner",
    );
  });
});
