import mongoose from "mongoose";
import { MatchupModelTest } from "../../models/matchup.model.test";

// Sample documents
const document = {
  aTeam: {
    stats: {
      glimmet: {
        deaths: 1,
        brought: 1,
      },
      probopass: {
        deaths: 1,
        brought: 1,
      },
      misdreavus: {
        kills: 1,
        deaths: 1,
        brought: 1,
      },
      fezandipiti: {
        deaths: 1,
        brought: 1,
      },
      talonflame: {
        deaths: 1,
        brought: 1,
      },
      cloyster: {
        deaths: 1,
        brought: 1,
      },
    },
    score: 0,
    _id: "65cbb6ea62c19728d4000000",
    team: [],
    paste: "https://pokepast.es/8c6154c1f4cb55f8",
  },
  bTeam: {
    team: [
      {
        pid: "zarude",
        name: "Zarude",
      },
      {
        pid: "rotomheat",
        name: "Rotom-Heat",
      },
      {
        pid: "staraptor",
        name: "Staraptor",
      },
      {
        pid: "magneton",
        name: "Magneton",
      },
      {
        pid: "tatsugiri",
        name: "Tatsugiri",
      },
      {
        pid: "dachsbun",
        name: "Dachsbun",
        capt: {
          tera: ["Fighting", "Steel", "Fairy"],
        },
      },
      {
        pid: "palossand",
        name: "Palossand",
      },
      {
        pid: "poliwrath",
        name: "Poliwrath",
      },
      {
        pid: "metang",
        name: "Metang",
      },
      {
        pid: "grumpig",
        name: "Grumpig",
        capt: {
          tera: ["Ground", "Psychic", "Fairy"],
        },
      },
      {
        pid: "gabite",
        name: "Gabite",
      },
    ],
    teamName: "Twinleaf Tatsugiri",
    stats: {
      rotomheat: {
        kills: 1,
        brought: 1,
      },
      staraptor: {
        kills: 2,
        brought: 1,
      },
      magneton: {
        kills: 2,
        brought: 1,
      },
      tatsugiri: {
        brought: 1,
      },
      dachsbun: {
        brought: 1,
      },
      metang: {
        kills: 1,
        deaths: 1,
        brought: 1,
      },
    },
    score: 5,
    paste: "https://pokepast.es/d7d88b56944567e2",
  },
  stage: "Week 6",
  replay: "https://replay.pokemonshowdown.com/gen9draft-2088221396",
};

async function newDoc() {
  try {
    let doc = new MatchupModelTest(document);
    await doc.save();
    console.log("Added successfully");
  } catch (error) {
    console.error("Error:", error);
  }
}

async function convert() {
  try {
    await MatchupModelTest.updateMany(
      {},
      [
        {
          $set: {
            "aTeam.stats": {
              $map: {
                input: { $objectToArray: "$aTeam.stats" },
                as: "stat",
                in: ["$$stat.k", "$$stat.v"],
              },
            },
            "bTeam.stats": {
              $map: {
                input: { $objectToArray: "$bTeam.stats" },
                as: "stat",
                in: ["$$stat.k", "$$stat.v"],
              },
            },
          },
        },
      ],
      { multi: true }
    );
    console.log("Documents updated successfully");
  } catch (error) {
    console.error("Error:", error);
  }
}

async function start() {
  try {
    await mongoose.connect(
      "mongodb+srv://lumaris:bjbxmb6SuZ5WMlDA@draftzonedatabase.5nc6cbu.mongodb.net/draftzone"
    );
    console.log("Connected to Database");
    await convert();
  } catch (error) {
    console.error("Error:", error);
  } finally {
    mongoose.disconnect();
    console.log("Disconnected from Database");
  }
}

start();
