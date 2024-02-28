const pokedexService = require('../pokedex-service.js')

function speedTierChart(teams, level) {
  let tiers = [];
  for(let team in teams){
  for (let m in teams[team]) {
    tiers = tiers.concat(getSpeedTiers(teams[team][m], level, team));
  }
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
  
  let modifiers = getModifiers(tiers)
  return {"modifiers":modifiers,"tiers":tiers, "level":level};
}

function getSpeedTiers(pokemon, level, team) {
  let speedAbilities = []
  let tiers = [];
  let baseSpe = pokedexService.getBase(pokemon.pid)["spe"]
  let slow = {
    stages: [-1, 0],
    items: [
      {
        name: "None",
        multi: 1
      },
      {
        name: "Ironball",
        multi: .5
      }
    ],
    spreads: [
      {
        evs: 0,
        ivs: 0,
        nature: .9,
        stage: 0
      },
      {
        evs: 0,
        ivs: 31,
        nature: 1,
        stage: 0
      }
    ]
  }
  let fast = {
    stages: [-1, 0, 1, 2],
    conditions: [
      {
        name: "None",
        multi: 1
      },
      {
        name: "Tailwind",
        multi: 2
      },
      {
        name: "Paralyzed",
        multi: .5
      }
    ],
    items: [
      {
        name: "None",
        multi: 1
      },
      {
        name: "Scarf",
        multi: 1.5
      }
    ],
    spreads: [
      {
        evs: 252,
        ivs: 31,
        nature: 1,
        stage: 0
      },
      {
        evs: 252,
        ivs: 31,
        nature: 1.1,
        stage: 0
      }
    ]
  }
  let abilities = pokedexService.getAbilities(pokemon.pid)
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
        speedAbilities.push({ name: abilities[a], multi: 1.5 })
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
        "pokemon": pokemon,
        "team": team,
        "speed": pokedexService.getStat("spe", baseSpe, slow.spreads[s].evs, slow.spreads[s].nature, slow.spreads[s].ivs, level, stage),
        "modifiers": [slow.spreads[s].evs.evs.toString()]
      }
      if (slow.spreads[s].nature > 1) {
        baseInfo.modifiers.push("Positive")
      } else if (slow.spreads[s].nature < 1) {
        baseInfo.modifiers.push("Negative")
      }
      if (stage != 0) {
        baseInfo.modifiers.push("Stage " + stage)
      }
      tiers.push(baseInfo)
      for (let i in slow.items) {
        let iInfo = structuredClone(baseInfo)
        iInfo.speed = Math.floor(baseInfo.speed * slow.items[i].multi)
        if (slow.items[i].name != "None") {
          iInfo.modifiers.push(slow.items[i].name)
          tiers.push(iInfo)
        }
      }
    }
  }
  for (let s in fast.spreads) {
    for (let stage of fast.stages) {
      let baseInfo = {
        "pokemon": pokemon,
        "team": team,
        "speed": pokedexService.getStat("spe", baseSpe, fast.spreads[s].ev, fast.spreads[s].nature, fast.spreads[s].iv, level, stage),
        "modifiers": [fast.spreads[s].evs.toString()]
      }
      if (fast.spreads[s].nature > 1) {
        baseInfo.modifiers.push("Positive")
      } else if (fast.spreads[s].nature < 1) {
        baseInfo.modifiers.push("Negative")
      }
      if (stage != 0) {
        baseInfo.modifiers.push("Stage " + stage)
      }
      tiers.push(baseInfo)
      for (let i in fast.items) {
        let iInfo = structuredClone(baseInfo)
        iInfo.speed = Math.floor(baseInfo.speed * fast.items[i].multi)
        if (fast.items[i].name != "None") {
          iInfo.modifiers.push(fast.items[i].name)
          tiers.push(iInfo)
        }
        for (let c in fast.conditions) {
          let cInfo = structuredClone(iInfo)
          cInfo.speed = Math.floor(iInfo.speed * fast.conditions[c].multi)
          if (fast.conditions[c].name != "None") {
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

function getModifiers(tiers){
  modifiers = []
  for(let tier of tiers){
    for(let m of tier.modifiers){
      if(!modifiers.includes(m)){
        modifiers.push(m)
      }
    }
  }
  return modifiers
}

module.exports = { speedTierChart, getSpeedTiers }