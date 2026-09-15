import { mkdirSync, writeFileSync } from "fs";
import { join, relative, sep } from "path";

const PS_RAW = "https://raw.githubusercontent.com/smogon/pokemon-showdown";

const SIM_TYPES = ["Pokemon", "ActiveMove", "Move"];

export const TABLE_TYPES = {
  pokedex: { constant: "Pokedex", type: "ModdedSpeciesDataTable" },
  "formats-data": {
    constant: "FormatsData",
    type: "ModdedSpeciesFormatsDataTable",
  },
  learnsets: { constant: "Learnsets", type: "ModdedLearnsetDataTable" },
  items: { constant: "Items", type: "ModdedItemDataTable" },
  moves: { constant: "Moves", type: "ModdedMoveDataTable" },
  abilities: { constant: "Abilities", type: "ModdedAbilityDataTable" },
} as const;

export type TableFile = keyof typeof TABLE_TYPES;

export interface VendorTarget {
  dir: string;
  path: string;
  ref: string;
  note: string;
}

type Blocks = Record<string, string>;

function stripComments(src: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += src[++i] ?? "";
      } else if (c === quote) {
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

function parseTopLevel(source: string): Blocks {
  const src = stripComments(source);
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

async function fetchTable(
  target: VendorTarget,
  file: TableFile,
): Promise<Blocks | null> {
  const url = `${PS_RAW}/${target.ref}/${target.path}/${file}.ts`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return parseTopLevel(await res.text());
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
  file: TableFile,
  entries: [string, string][],
  modsPrefix: string,
): string {
  const { constant, type } = TABLE_TYPES[file];
  const body = entries
    .map(([id, block]) => `  ${id}: ${reindent(block)},`)
    .join("\n");
  const referenced = SIM_TYPES.filter((name) =>
    new RegExp(`\\b${name}\\b`).test(body),
  );
  const shim = referenced.length
    ? `import { ${referenced.join(", ")} } from "${modsPrefix}/sim-types";\n`
    : "";
  return (
    `import { ${type} } from "@pkmn/sim";\n${shim}\n` +
    `export const ${constant}: ${type} = {\n${body}\n};\n`
  );
}

export async function vendor(
  modsRoot: string,
  outRoot: string,
  tables: readonly TableFile[],
  targets: readonly VendorTarget[],
) {
  for (const target of targets) {
    const outDir = join(outRoot, target.dir);
    mkdirSync(outDir, { recursive: true });
    const modsPrefix =
      relative(outDir, modsRoot).split(sep).join("/") || ".";

    const tableExports: string[] = [];
    const summary: string[] = [];

    for (const file of tables) {
      const blocks = await fetchTable(target, file);
      if (!blocks) {
        summary.push(`${file.padEnd(13)} absent upstream`);
        continue;
      }
      const entries = Object.entries(blocks);
      writeFileSync(
        join(outDir, `${file}.ts`),
        render(file, entries, modsPrefix),
      );
      tableExports.push(
        `export { ${TABLE_TYPES[file].constant} } from "./${file}";`,
      );
      summary.push(`${file.padEnd(13)} ${entries.length} entries`);
    }

    writeFileSync(
      join(outDir, "index.ts"),
      `import { VendoredSource } from "${modsPrefix}/ps-source";\n\n` +
        `${tableExports.join("\n")}\n\n` +
        `export const SOURCE: VendoredSource = {\n` +
        `  path: ${JSON.stringify(target.path)},\n` +
        `  ref: ${JSON.stringify(target.ref)},\n` +
        `};\n`,
    );

    console.log(`\n${target.dir.toUpperCase()}  ${target.path}`);
    console.log(`  ref:  ${target.ref}`);
    console.log(`  note: ${target.note}`);
    for (const line of summary) console.log(`  ${line}`);
  }
}
