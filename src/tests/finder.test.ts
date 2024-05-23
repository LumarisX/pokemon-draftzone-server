import * as fs from "fs";
import * as path from "path";
import { Rulesets } from "../data/rulesets";
import { getLearnset } from "../services/data-services/learnset.service";
import { getWeak } from "../services/data-services/pokedex.service";

let POINTTOTAL = 160;
let team: { name: string; value: number }[] = [
  { name: "Eternatus", value: 33 },
  { name: "Zamazenta", value: 22 },
  { name: "Slowking", value: 13 },
  { name: "Volcarona", value: 18 },
  { name: "Kyurem", value: 17 },
  { name: "Hatterene", value: 12 },
  { name: "Kilowattrel", value: 10 },
  { name: "Toedscruel", value: 6 },
  { name: "Kingambit", value: 18 },
  { name: "Beartic", value: 6 },
];

// let team: { name: string; value: number }[] = [
//   { name: "Tyrantrum", value: 15 },
//   { name: "Registeel", value: 15 },
//   { name: "Frosmoth", value: 7 },
//   { name: "Spidops", value: 3 },
//   { name: "Lanturn", value: 10 },
//   { name: "Chimecho", value: 3 },
//   { name: "Emboar", value: 14 },
//   { name: "Whimsicott", value: 12 },
//   { name: "Bibarel", value: 5 },
//   { name: "Mantine", value: 10 },
//   { name: "Sandslash", value: 6 },
// ];

// let team: { name: string; value: number }[] = [
//   { name: "Tyrantrum", value: 15 },
//   { name: "Registeel", value: 15 },
//   { name: "Frosmoth", value: 7 },
//   { name: "Spidops", value: 3 },
//   { name: "Tentacruel", value: 14 },
//   { name: "Chimecho", value: 3 },
//   { name: "Dubwool", value: 5 },
//   { name: "Whimsicott", value: 12 },
//   { name: "Bibarel", value: 5 },
//   { name: "Mantine", value: 10 },
//   { name: "Sandslash", value: 6 },
// ];

const ruleset = Rulesets["Gen9 NatDex"];

interface TeamType {
  [type: string]: number;
}

export async function recommendedTest() {
  const teamType: TeamType = {
    Bug: 0,
    Dark: 0,
    Dragon: 0,
    Electric: 0,
    Fairy: 0,
    Fighting: 0,
    Fire: 0,
    Flying: 0,
    Ghost: 0,
    Grass: 0,
    Ground: 0,
    Ice: 0,
    Normal: 0,
    Poison: 0,
    Psychic: 0,
    Rock: 0,
    Steel: 0,
    Water: 0,
  };

  const csvFilePath = path.join(
    __dirname,
    "./Beast Ball Main S12  - Index.csv"
  );
  // const csvFilePath = path.join(__dirname, "./Park Ball Main S12 - Index.csv");
  fs.readFile(csvFilePath, "utf8", async (err, data) => {
    if (err) {
      console.error("Error reading the file:", err);
      return;
    }
    let csv: { [key: string]: string }[] = parseCSV(data);
    const MULT = 5;
    let orgWeak = 0;
    let totalStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    let remainingPoint = POINTTOTAL;
    for (const mon of team) {
      let dexMon = ruleset.gen.dex.species.get(mon.name);
      if (dexMon) {
        const monWeak = getWeak(ruleset, dexMon.id);
        remainingPoint -= mon.value;
        console.log(mon.name);
        totalStats.hp += dexMon.baseStats.hp;
        totalStats.atk += dexMon.baseStats.atk;
        totalStats.spa += dexMon.baseStats.spa;
        totalStats.def += dexMon.baseStats.def;
        totalStats.spd += dexMon.baseStats.spd;
        totalStats.spe += dexMon.baseStats.spe;

        for (const type in teamType) {
          if (teamType.hasOwnProperty(type)) {
            let typeValue = monWeak[type] === 0 ? 0 : Math.log2(monWeak[type]);
            teamType[type] += typeValue;
            orgWeak += Math.pow(MULT, typeValue);
          }
        }
      }
    }

    const avgStats = {
      hp: totalStats.hp / team.length,
      atk: totalStats.atk / team.length,
      def: totalStats.def / team.length,
      spa: totalStats.spa / team.length,
      spd: totalStats.spd / team.length,
      spe: totalStats.spe / team.length,
    };

    const avgStat =
      (avgStats.hp +
        avgStats.atk +
        avgStats.def +
        avgStats.spa +
        avgStats.spd +
        avgStats.spe) /
      6;
    let weighedMult = 1.2;
    const weighedStats = {
      hp: Math.pow(weighedMult, avgStat - avgStats.hp),
      atk: Math.pow(weighedMult, avgStat - avgStats.atk),
      def: Math.pow(weighedMult, avgStat - avgStats.def),
      spa: Math.pow(weighedMult, avgStat - avgStats.spa),
      spd: Math.pow(weighedMult, avgStat - avgStats.spd),
      spe: Math.pow(weighedMult, avgStat - avgStats.spe),
    };
    const maxStatWeight = Object.values(weighedStats).reduce(
      (sum, value) => sum + value,
      0
    );

    let list = [];
    for (let data of csv) {
      if (
        data["Drafted"] == "0" &&
        data["Point"] &&
        data["Point"] != "ban" &&
        +data["Point"] <= remainingPoint
      ) {
        let mon = ruleset.gen.dex.species.get(data["Pokémon"]);
        if (mon) {
          let learnset = await getLearnset(ruleset, mon.id);
          if (true) {
            let weak = getWeak(ruleset, mon.id);
            let totalWeak = 0;
            for (const type in teamType) {
              if (teamType.hasOwnProperty(type)) {
                totalWeak += Math.pow(
                  MULT,
                  teamType[type] +
                    (weak[type] === 0 ? 0 : Math.log2(weak[type]))
                );
              }
            }
            let statValue =
              ((mon.baseStats.hp > avgStats.hp ? weighedStats.hp : 0) +
                (mon.baseStats.atk > avgStats.atk ? weighedStats.atk : 0) +
                (mon.baseStats.def > avgStats.def ? weighedStats.def : 0) +
                (mon.baseStats.spa > avgStats.spa ? weighedStats.spa : 0) +
                (mon.baseStats.spd > avgStats.spd ? weighedStats.spd : 0) +
                (mon.baseStats.spe > avgStats.spe ? weighedStats.spe : 0)) /
              maxStatWeight;

            let typeValue = orgWeak / totalWeak;

            list.push({
              pid: mon.id,
              typeValue: typeValue,
              statValue: statValue,
              totalValue: statValue * typeValue,
              points: +data["Point"],
            });
          }
        }
      }
    }

    list = list
      .sort((x, y) => {
        if (x.totalValue < y.totalValue) return 1;
        if (y.totalValue < x.totalValue) return -1;
        if (x.statValue < y.statValue) return 1;
        if (y.statValue < x.statValue) return -1;
        return 0;
      })
      // .sort((x, y) => {
      //   if (x.typeValue < y.typeValue) return 1;
      //   if (y.typeValue < x.typeValue) return -1;
      //   if (x.statValue < y.statValue) return 1;
      //   if (y.statValue < x.statValue) return -1;
      //   return 0;
      // })
      .slice(0, 20)
      .reverse();
    console.log(list);
    console.log(remainingPoint);
  });
}

function parseCSV(raw: string) {
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
}
