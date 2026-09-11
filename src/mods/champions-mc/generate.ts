import * as ChampionsDex from "@pkmn/mods/champions";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const PS_RAW =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions";

const OUT_DIR = __dirname;

type Blocks = Record<string, string>;

function parseTopLevel(src: string): Blocks {
  const out: Blocks = {};
  const re = /^\t(\w+):\s*\{/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src))) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let quote: string | null = null;
    let i = start;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === "\\") i++;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        quote = c;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    out[match[1]] = src.slice(start, i + 1);
  }
  return out;
}

async function fetchData(file: string): Promise<Blocks> {
  const res = await fetch(`${PS_RAW}/${file}.ts`);
  if (!res.ok) {
    throw new Error(`${file}.ts: ${res.status} ${res.statusText}`);
  }
  return parseTopLevel(await res.text());
}

function readField(block: string, field: string): string | null {
  const match = new RegExp(`${field}:\\s*"([^"]+)"`).exec(block);
  return match ? match[1] : null;
}

function reindent(block: string): string {
  return block
    .split("\n")
    .map((line, index) => {
      if (index === 0) return line;
      const depth = /^\t*/.exec(line)![0].length;
      return "  ".repeat(depth) + line.slice(depth);
    })
    .join("\n");
}

function render(
  table: string,
  type: string,
  entries: [string, string][],
): string {
  const body = entries
    .map(([id, block]) => `  ${id}: ${reindent(block)},`)
    .join("\n");
  return `import { ${type} } from "@pkmn/sim";\n\nexport const ${table}: ${type} = {\n${body}\n};\n`;
}

async function main() {
  const [upstreamFormats, upstreamLearnsets] = await Promise.all([
    fetchData("formats-data"),
    fetchData("learnsets"),
  ]);

  const baseFormats = ChampionsDex.FormatsData as Record<
    string,
    { tier?: string; isNonstandard?: string | null }
  >;
  const baseLearnsets = ChampionsDex.Learnsets as Record<string, unknown>;

  const formatsDelta = Object.entries(upstreamFormats).filter(([id, block]) => {
    const base = baseFormats[id];
    const baseTier = base?.tier ?? null;
    const baseNonstandard = base?.isNonstandard ?? null;
    return (
      baseTier !== readField(block, "tier") ||
      baseNonstandard !== readField(block, "isNonstandard")
    );
  });

  const learnsetsDelta = Object.entries(upstreamLearnsets).filter(
    ([id]) => !baseLearnsets[id],
  );

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    join(OUT_DIR, "formats-data.ts"),
    render("FormatsData", "ModdedSpeciesFormatsDataTable", formatsDelta),
  );
  writeFileSync(
    join(OUT_DIR, "learnsets.ts"),
    render("Learnsets", "ModdedLearnsetDataTable", learnsetsDelta),
  );
  writeFileSync(
    join(OUT_DIR, "index.ts"),
    `export { FormatsData } from "./formats-data";\nexport { Learnsets } from "./learnsets";\n`,
  );

  const legal = (tier: string | null) => !!tier && tier !== "Illegal";
  const newlyLegal = formatsDelta
    .filter(([id, block]) => {
      const wasLegal = legal(baseFormats[id]?.tier ?? null);
      return !wasLegal && legal(readField(block, "tier"));
    })
    .map(([id]) => id);

  console.log(`formats-data overrides: ${formatsDelta.length}`);
  console.log(`learnset overrides:     ${learnsetsDelta.length}`);
  console.log(`newly legal (${newlyLegal.length}): ${newlyLegal.join(", ")}`);
  if (!formatsDelta.length && !learnsetsDelta.length) {
    console.log("\n@pkmn/mods is current — src/mods/champions-mc can be deleted.");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
