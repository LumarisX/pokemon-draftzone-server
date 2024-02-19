const PokedexService = require('../pokedex-service.js')
const TypeService = require('../type-service.js')

function typechart(team) {
  for (let m of team) {
    m.weak = PokedexService.getWeak(m.pid)
  }
  tc = {"team": team}
  return tc
}

module.exports = { typechart }