const pokedexService = require('../pokedex-service.js')

function speedTierChart(team, level) {
  let tiers = [];
  for (let m in team) {
    tiers = tiers.concat(getSpeedTiers(team[m].pid, level));
  }

  let speAsc = 1;
  tiers.sort(function (x, y) {
    if (x["speed"] < y["speed"]) {
      return (1 * speAsc);
    }
    if (x["speed"] > y["speed"]) {
      return (-1 * speAsc);
    }
    return (0);
  });
  return tiers;
}

function getSpeedTiers(pokemonId, level) {
  let speedAbilities = []
  let tiers = [];
  let baseSpe = pokedexService.getBase(pokemonId)["spe"]
  let pokemonName = pokedexService.getName(pokemonId)
  let slow = {
    stages: [-1, 0],
    items: [
      {
        name: "none",
        multi: 1
      },
      {
        name: "ironball",
        multi: .5
      }
    ],
    spreads: [
      {
        evs: 0,
        ivs: 0,
        nature: .9,
        stage: 0,
        name: "min-"
      },
      {
        evs: 0,
        ivs: 31,
        nature: 1,
        stage: 0,
        name: "base"
      }
    ]
  }
  let fast = {
    stages: [-1, 0, 1, 2],
    conditions: [
      {
        name: "none",
        multi: 1
      },
      {
        name: "tailwind",
        multi: 2
      },
      {
        name: "paralyzed",
        multi: .5
      }
    ],
    items: [
      {
        name: "none",
        multi: 1
      },
      {
        name: "scarf",
        multi: 1.5
      }
    ],
    spreads: [
      {
        evs: 252,
        ivs: 31,
        nature: 1,
        stage: 0,
        name: "max"
      },
      {
        evs: 252,
        ivs: 31,
        nature: 1.1,
        stage: 0,
        name: "max+"
      }
    ]
  }
  let abilities = pokedexService.getAbilities(pokemonId)
  for (let a in abilities) {
    switch (abilities[a]) {
      case "Chlorophyll":
      case "Sand Rush":
      case "Slush Rush":
      case "Swift Swim":
      case "Unburden":
      case "Surge Surfer":
        speedAbilities.push({ name: abilities[a], multi: 2 })
        break;
      case "Quick Feet":
      case "Quark Drive":
      case "Protosynthesis":
        speedAbilities.push({ name: abilities[a], multi: 2 })
        break;
      case "Speed Boost":
        fast.stages.push(3, 4, 5, 6)
        break;
      case "Steam Engine":
        fast.stages.push(6)
        break;
    }
  }
  for (let s in slow.spreads) {
    for (let stage of slow.stages) {
      let baseInfo = {
        "name": pokemonName,
        "speed": pokedexService.getStat("spe", baseSpe, slow.spreads[s].ev, slow.spreads[s].nature, slow.spreads[s].iv, level, stage),
        "modifiers": [slow.spreads[s].name]
      }
      if (stage < 0) {
        baseInfo.modifiers.push("Stage " + stage)
      }
      tiers.push(baseInfo)
      for (let i in slow.items) {
        let iInfo = structuredClone(baseInfo)
        iInfo.speed = Math.floor(baseInfo.speed * slow.items[i].multi)
        if (slow.items[i].name != "none") {
          iInfo.modifiers.push(slow.items[i].name)
          tiers.push(iInfo)
        }
      }
    }
  }
  for (let s in fast.spreads) {
    for (let stage of fast.stages) {
      let baseInfo = {
        "name": pokemonName,
        "speed": pokedexService.getStat("spe", baseSpe, fast.spreads[s].ev, fast.spreads[s].nature, fast.spreads[s].iv, level, stage),
        "modifiers": [fast.spreads[s].name]
      }
      if (stage != 0) {
        baseInfo.modifiers.push("Stage " + stage)
      }
      tiers.push(baseInfo)
      for (let i in fast.items) {
        let iInfo = structuredClone(baseInfo)
        iInfo.speed = Math.floor(baseInfo.speed * fast.items[i].multi)
        if (fast.items[i].name != "none") {
          iInfo.modifiers.push(fast.items[i].name)
          tiers.push(iInfo)
        }
        for (let c in fast.conditions) {
          let cInfo = structuredClone(iInfo)
          cInfo.speed = Math.floor(iInfo.speed * fast.conditions[c].multi)
          if (fast.conditions[c].name != "none") {
            cInfo.modifiers.push(fast.conditions[c].name)
            tiers.push(cInfo)
          }
          for (let a in speedAbilities) {
            let aInfo = structuredClone(cInfo)
            aInfo.speed = Math.floor(cInfo.speed * speedAbilities[a].multi)
            aInfo.modifiers.push(speedAbilities[a].name)
            tiers.push(aInfo)
          }
        }
      }
    }
  }
  return (tiers);
}

module.exports = { speedTierChart, getSpeedTiers }