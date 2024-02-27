const PokedexService = require('../pokedex-service.js')
const TypeService = require('../type-service.js')

function typechart(team) {
  let teraTypes = {}
  for (let m of team) {
    m.weak = PokedexService.getWeak(m.pid)
    if ("capt" in m && "tera" in m.capt) {
      for (let type of m.capt.tera) {
        if (!(type in teraTypes)) {
          teraTypes[type] = (TypeService.defensive([type]))
        }
      }
    }
  }
  tc = { "team": team, "teraTypes": teraTypes }
  return tc
}

module.exports = { typechart }