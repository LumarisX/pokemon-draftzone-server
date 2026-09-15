import { join } from "path";
import { TableFile, vendor, VendorTarget } from "../ps-vendor";

const MODS_ROOT = join(__dirname, "..");

const MASTER = "aa6d5f0856d24679be8f5df167d1b528c2dcbd71";

const REGMA_FINAL = "81c39fb3facd0c82bc6753295b2b079190fa3e6f";

const TABLES: TableFile[] = ["formats-data", "learnsets", "items", "moves"];

const REGULATIONS: VendorTarget[] = [
  {
    dir: "mc",
    path: "data/mods/champions",
    ref: MASTER,
    note: "head regulation; upstream keeps it in data/mods/champions",
  },
  {
    dir: "mb",
    path: "data/mods/championsregmb",
    ref: MASTER,
    note: "upstream expresses M-B as a delta over the head regulation",
  },
  {
    dir: "ma",
    path: "data/mods/championsregma",
    ref: REGMA_FINAL,
    note: "removed upstream when M-C landed; pinned to its final commit",
  },
];

async function main() {
  await vendor(MODS_ROOT, __dirname, TABLES, REGULATIONS);
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
