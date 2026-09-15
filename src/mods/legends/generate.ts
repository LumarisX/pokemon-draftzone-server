import { join } from "path";
import { TableFile, vendor, VendorTarget } from "../ps-vendor";

const MODS_ROOT = join(__dirname, "..");

const MASTER = "aa6d5f0856d24679be8f5df167d1b528c2dcbd71";

const TABLES: TableFile[] = ["pokedex", "formats-data", "learnsets"];

const TARGETS: VendorTarget[] = [
  {
    dir: "za",
    path: "data/mods/gen9legends",
    ref: MASTER,
    note: "Legends Z-A; inherits gen 9 for everything it does not override",
  },
];

async function main() {
  await vendor(MODS_ROOT, __dirname, TABLES, TARGETS);
  console.log(
    "\nRegenerated. Run `npx jest --runInBand src/core/data/rulesets` to " +
      "review the legality diff before committing.",
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
