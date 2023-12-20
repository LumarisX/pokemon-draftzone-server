const PokedexService = require('./pokedex-service.js')

function chart(team, gen){
  let out = []
  for(let m of team){
    out.push({pid: m.pid, coverage: PokedexService.getCoverage(m.pid, gen)})
  }
  return out 
}

module.exports = {chart}