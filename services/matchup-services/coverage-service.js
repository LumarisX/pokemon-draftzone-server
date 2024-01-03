const PokedexService = require('../pokedex-service')
const TypechartService = require('./typechart-service')
const MoveService = require('../move-service.js')

function chart(team, oppteam, gen) {
  let out = []
  for (let m of team) {
    let pokemon = { pid: m.pid, coverage: PokedexService.getCoverage(m.pid, gen) }
    for (let category in pokemon.coverage) {
      pokemon.coverage[category].sort(function(x, y) {
        if (x.stab != y.stab) {
          if (x.stab)
            return (-1)
          return (1)
        }
        if (x.ePower < y.ePower)
          return (1)
        if (x.ePower > y.ePower)
          return (-1)
        return (0);
      })
    }
    //Update move with recommended
    bestCoverage(pokemon, TypechartService.typechart(oppteam))
    let formPokemon = {
      pid: pokemon.pid,
      coverage: {
        physical: [],
        special: []
      }
    }
    for (let category in pokemon.coverage) {
      for (let move of pokemon.coverage[category]) {
        formPokemon.coverage[category].push({
          name: MoveService.getName(move.id),
          type: move.type,
          stab: move.stab,
          recommended: move.recommended
        })
      }
    }
    out.push(formPokemon)
  }
  return out
}

function bestCoverage(team, oppTypechart) {
  let coverageMoves = team.coverage.physical.concat(team.coverage.special)
  for (let i = 4; i < coverageMoves.length && i < 5; i++) {
    let indices = []
    for (let j = i - 1; j >= 0; j--) {
      indices.push(j)
    }
    let best = {
      maxEffectiveness: 0,
      moves: []
    }
    for (let j = 0; j < choose(coverageMoves.length, i); j++) {
      let moves = []
      for (let index of indices) {
        moves.push(coverageMoves[index])
      }
      let coverageEffectiveness = teamCoverageEffectiveness(moves, oppTypechart, team.pid)
      if (coverageEffectiveness > best.maxEffectiveness) {
        best.maxEffectiveness = coverageEffectiveness
        best.moves = moves
      }
      indices[0]++
      for (let k = 1; k < i; k++) {
        if (indices[k - 1] > coverageMoves.length - k) {
          indices[k]++
          for (let l = k - 1; l >= 0; l--) {
            indices[l] = indices[l + 1] + 1
          }
        }
      }
    }
    for (let move of best.moves) {
      if (move.recommended === undefined) {
        move.recommended = []
      }
      move.recommended.push(i)
    }
  }
}

function teamCoverageEffectiveness(moveArray, oppTypechart, userMon) {
  let total = 0
  for (let pokemon of oppTypechart.team) {
    let maxValue = 0
    for (let move of moveArray) {
      //change out for damage calc eventually
      let stat = 1
      let cat = MoveService.getCategory(move.id)
      if (move.category == "physical") {
        stat = PokedexService.getBase(userMon)["atk"]
      } else {
        stat = PokedexService.getBase(userMon)["spa"]
      }
      let value = move.ePower * pokemon.weak[move.type] * stat
      if (move.stab) {
        value = value * 1.5
      }
      if (maxValue < value)
        maxValue = value
    }
    total += maxValue
  }
  return total
}

function choose(n, r) {
  let total = 1
  for (let i = n; i > n - r; i--) {
    total = total * i
  }
  for (let i = 1; i <= r; i++) {
    total = total / i
  }
  return total
}

module.exports = { chart }