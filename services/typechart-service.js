const PokedexService = require('./pokedex-service.js')
const TypeService = require('./type-service')

function typechart(team) {
  tc = { team: [] }
  for (let m of team) {
    tc.team.push({ pid: m.pid, weak: PokedexService.getWeak(m.pid) })
  }
  tc = summerizeType(tc)
  return tc
}

function summerizeType(tc) {
  tc.weaknesses={}
  tc.resistances={}
  tc.difference={}
  tc.differential={}
  for(let t in TypeService.base){
    tc.weaknesses[t]=0
    tc.resistances[t]=0
    tc.difference[t]=0
    tc.differential[t]=0
  }
  for (let pokemon of tc.team) {
    for (let type in pokemon.weak) {
      if(pokemon.weak[type]>1){
        tc.weaknesses[type]++
        tc.difference[type]--
      }else if(pokemon.weak[type]<1){
        tc.resistances[type]++
        tc.difference[type]++
      }
      if(pokemon.weak[type]>0){
        tc.differential[type]-=Math.log2(pokemon.weak[type])
      } else {
        tc.differential[type]+=2
      }
      
      
    }
  }
  return tc
}


module.exports = { typechart }