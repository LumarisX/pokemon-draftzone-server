const PokedexService = require('./pokedex-service.js')

const chartMoves = { "Priority": ["accelerock", "aquajet", "bulletpunch", "extremespeed", "fakeout", "feint", "firstimpression", "iceshard", "jetpunch", "machpunch", "quickattack", "shadowsneak", "suckerpunch", "vacuumwave", "watershuriken", "zippyzap"], "Setup": ["acidarmor", "agility", "amnesia", "aromaticmist", "autotomize", "barrier", "bulkup", "calmmind", "charge", "clangoroussoul", "coaching", "coil", "cosmicpower", "cottonguard", "decorate", "defendorder", "defensecurl", "doubleteam", "dragondance", "extremeevoboost", "filletaway", "flatter", "geomancy", "growth", "harden", "honeclaws", "howl", "irondefense", "meditate", "minimize", "nastyplot", "noretreat", "quiverdance", "rockpolish", "sharpen", "shellsmash", "shelter", "shiftgear", "spicyextract", "swagger", "swordsdance", "tailglow", "victorydance", "withdraw", "workup"], "Cleric": ["floralhealing", "healingwish", "healorder", "healpulse", "junglehealing", "lifedew", "lunarblessing", "lunardance", "milkdrink", "moonlight", "morningsun", "purify", "recover", "rest", "roost", "shoreup", "slackoff", "softboiled", "strengthsap", "swallow", "synthesis", "wish", "aromatherapy", "healbell"], "Momentum": ["batonpass", "chillyreception", "flipturn", "partingshot", "revivalblessing", "shedtail", "teleport", "uturn", "voltswitch"], "Hazard Control": ["spikes", "stealthrock", "stickyweb", "defog", "rapidspin", "mortalspin", "tidyup", "toxicspikes"], "Speed Control": ["tailwind", "stickyweb", "trickroom", "bleakwindstorm", "bulldoze", "electroweb", "glaciate", "icywind"], "Support": ["reflect", "lightscreen", "auroraveil", "helpinghand", "coaching", "allyswitch", "ragepowder", "followme", "quickguard", "wideguard", "beatup", "craftyshield", "luckychant", "matblock", "mist", "safeguard"], "Status": ["darkvoid", "glare", "grasswhistle", "hypnosis", "lovelykiss", "mortalspin", "nuzzle", "poisongas", "poisonpowder", "sing", "sleeppowder", "spore", "stunspore", "thunderwave", "toxic", "toxicthread", "willowisp", "yawn"], "Disruption": ["taunt", "encore", "knockoff", "trick", "switcheroo", "corrosivegas", "imprison", "circlethrow", "dragontail", "roar", "whirlwind", "haze", "clearsmog"], "Condition": ["chillyreception", "electricterrain", "grassyterrain", "hail", "mistyterrain", "psychicterrain", "raindance", "sandstorm", "snowscape", "sunnyday", "terrainpulse", "naturepower", "weatherball", "solarbeam", "risingvoltage", "expandingforce", "grassyglide", "mistyexplosion", "hurricane", "solarblade"] }

function chart(team, gen) {
  let chartJson = {}
  for (let cat in chartMoves) {
    chartJson[cat] = {}
    for (let moveId of chartMoves[cat]) {
      let temp = []
      for (let m of team) {
        if (PokedexService.learns(m.pid, moveId, gen)) {
          temp.push(m.pid)
        }
      }
      if (temp.length > 0) {
        chartJson[cat][moveId] = temp
      }
    }
  }
  return chartJson
}


module.exports = { chart }