const PokedexService = require('./pokedex-service.js')

function typechart(team){
  let out = []
  for(let m of team){
    out.push({pid: m.pid, weak: PokedexService.getWeak(m.pid)})
    
  }
  return out 
}

module.exports = {typechart}