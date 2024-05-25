import * as fs from "fs";
import * as path from "path";
import { Rulesets } from "../data/rulesets";
import { getWeak } from "../services/data-services/pokedex.service";
import { toID } from "@pkmn/data";
import { getLearnset } from "../services/data-services/learnset.service";

const POINTTOTAL = 160;
const baseTeam: { name: string; value: number }[] = [
  { name: "Eternatus", value: 33 }, //9.9
  { name: "Zamazenta", value: 22 }, //7.3
  { name: "Slowking", value: 13 }, //11.1
  { name: "Volcarona", value: 18 }, //9.9
  { name: "Kyurem", value: 17 }, //11.6
  { name: "Hatterene", value: 12 }, //11.2
  { name: "Kilowattrel", value: 10 }, //7.2
  { name: "Toedscruel", value: 6 }, //2.5
  { name: "Kingambit", value: 18 }, //5.6
  { name: "Cetitan", value: 9 }, //9.6
  { name: "Lumineon", value: 2 }, //4.6
];

const ruleset = Rulesets["Gen9 NatDex"];
const MULT = 5;
const weighedMult = 1.2;

interface TeamType {
  [type: string]: number;
}

interface CSVData {
  [key: string]: string;
}

const initTeamType = (): TeamType => {
  const types = [
    "Bug",
    "Dark",
    "Dragon",
    "Electric",
    "Fairy",
    "Fighting",
    "Fire",
    "Flying",
    "Ghost",
    "Grass",
    "Ground",
    "Ice",
    "Normal",
    "Poison",
    "Psychic",
    "Rock",
    "Steel",
    "Water",
  ];
  const teamType: TeamType = {};
  types.forEach((type) => (teamType[type] = 0));
  return teamType;
};

const calculateStats = (totalStats: any, dexMon: any): void => {
  totalStats.hp += dexMon.baseStats.hp;
  totalStats.atk += dexMon.baseStats.atk;
  totalStats.def += dexMon.baseStats.def;
  totalStats.spa += dexMon.baseStats.spa;
  totalStats.spd += dexMon.baseStats.spd;
  totalStats.spe += dexMon.baseStats.spe;
};

const calculateTypeWeakness = (teamType: TeamType, monWeak: any): number => {
  let orgWeak = 0;
  for (const type in teamType) {
    if (teamType.hasOwnProperty(type)) {
      const typeValue = monWeak[type] === 0 ? 0 : Math.log2(monWeak[type]);
      teamType[type] += typeValue;
      orgWeak += Math.pow(MULT, typeValue);
    }
  }
  return orgWeak;
};

const calculateAverageStats = (totalStats: any, teamLength: number) => ({
  hp: totalStats.hp / teamLength,
  atk: totalStats.atk / teamLength,
  def: totalStats.def / teamLength,
  spa: totalStats.spa / teamLength,
  spd: totalStats.spd / teamLength,
  spe: totalStats.spe / teamLength,
});

const calculateWeighedStats = (avgStat: number, avgStats: any) => ({
  hp: Math.pow(weighedMult, avgStat - avgStats.hp),
  atk: Math.pow(weighedMult, avgStat - avgStats.atk),
  def: Math.pow(weighedMult, avgStat - avgStats.def),
  spa: Math.pow(weighedMult, avgStat - avgStats.spa),
  spd: Math.pow(weighedMult, avgStat - avgStats.spd),
  spe: Math.pow(weighedMult, avgStat - avgStats.spe),
});

const calculateMaxStatWeight = (weighedStats: any) =>
  Object.values(weighedStats).reduce(
    (sum: number, value) => sum + (value as number),
    0
  );

const parseCSV = (raw: string): CSVData[] => {
  let headers: string[] | null = null;
  let data = [];
  for (let line of raw.split("\r\n")) {
    let splitLine = line.split(",");
    if (headers) {
      let lineData: { [key: string]: string } = {};
      for (let eI in splitLine) {
        if (splitLine[eI] != "") {
          lineData[headers[eI]] = splitLine[eI];
        }
      }
      data.push(lineData);
    } else {
      let isEmpty = true;
      for (let entry of splitLine) {
        if (entry != "") {
          isEmpty = false;
        }
      }
      if (!isEmpty) {
        headers = splitLine;
      }
    }
  }
  return data;
};

const calculateWeakness = async (
  ruleset: any,
  teamType: TeamType,
  monId: string,
  orgWeak: number
) => {
  const weak = getWeak(ruleset, toID(monId));
  let totalWeak = 0;
  for (const type in teamType) {
    if (teamType.hasOwnProperty(type)) {
      totalWeak += Math.pow(
        MULT,
        teamType[type] + (weak[type] === 0 ? 0 : Math.log2(weak[type]))
      );
    }
  }
  return totalWeak;
};

async function recommendedMon(
  team: { name: string; value: number }[],
  csv: CSVData[]
) {
  let remainingPoint = POINTTOTAL;
  let orgWeak = 0;
  const totalStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const teamType = initTeamType();
  for (const mon of team) {
    const dexMon = ruleset.gen.dex.species.get(mon.name);
    if (dexMon) {
      const monWeak = getWeak(ruleset, dexMon.id);
      remainingPoint -= mon.value;
      calculateStats(totalStats, dexMon);
      orgWeak += calculateTypeWeakness(teamType, monWeak);
    }
  }

  const avgStats = calculateAverageStats(totalStats, team.length);
  const avgStat =
    Object.values(avgStats).reduce((sum, stat) => sum + stat, 0) / 6;
  const weighedStats = calculateWeighedStats(avgStat, avgStats);
  const maxStatWeight = calculateMaxStatWeight(weighedStats);

  const list = [];
  for (const data of csv) {
    if (
      data["Drafted"] == "0" &&
      data["Point"] &&
      data["Point"] != "ban" &&
      +data["Point"] <= remainingPoint
    ) {
      const mon = ruleset.gen.dex.species.get(data["Pokémon"]);
      if (mon) {
        const learnset = await getLearnset(ruleset, mon.id);
        if (true) {
          const totalWeak = await calculateWeakness(
            ruleset,
            teamType,
            mon.id,
            orgWeak
          );
          const statValue =
            ((mon.baseStats.hp > avgStats.hp ? weighedStats.hp : 0) +
              (mon.baseStats.atk > avgStats.atk ? weighedStats.atk : 0) +
              (mon.baseStats.def > avgStats.def ? weighedStats.def : 0) +
              (mon.baseStats.spa > avgStats.spa ? weighedStats.spa : 0) +
              (mon.baseStats.spd > avgStats.spd ? weighedStats.spd : 0) +
              (mon.baseStats.spe > avgStats.spe ? weighedStats.spe : 0)) /
            maxStatWeight;

          const typeValue = orgWeak / totalWeak;

          list.push({
            pid: mon.id,
            typeValue,
            statValue,
            bst: Object.values(mon.baseStats).reduce(
              (sum: number, value) => sum + (value as number),
              0
            ),
            totalValue: statValue * typeValue,
            points: +data["Point"],
          });
        }
      }
    }
  }

  return (
    list
      // .sort((x, y) => y.totalValue - x.totalValue)
      .sort((x, y) => y.typeValue - x.typeValue)
      // .sort((x, y) => y.bst - x.bst)

      .slice(0, 1)
      .reverse()
  );
}

async function getTradeIdeas(csv: CSVData[]) {
  for (let i in baseTeam) {
    console.log(baseTeam[i]);
    console.log(
      await recommendedMon(
        [...baseTeam.slice(0, +i), ...baseTeam.slice(+i + 1)],
        csv
      )
    );
  }
}

export async function recommendedTest() {
  const csvFilePath = path.join(
    __dirname,
    "./Beast Ball Main S12  - Index.csv"
  );

  fs.readFile(csvFilePath, "utf8", async (err, data) => {
    if (err) {
      console.error("Error reading the file:", err);
      return;
    }
    const csv = parseCSV(data);

    await getTradeIdeas(csv);
  });
}

export async function generateTeam() {
  const csvFilePath = path.join(
    __dirname,
    "./Beast Ball Main S12  - Index.csv"
  );

  fs.readFile(csvFilePath, "utf8", async (err, data) => {
    if (err) {
      console.error("Error reading the file:", err);
      return;
    }
    const csv = parseCSV(data);

    const TEAMSIZE = 6;

    let counters = [];

    // for(let i=0; i<TEAMSIZE; i++){
    //   for(let mon in )
    // }
  });
}
