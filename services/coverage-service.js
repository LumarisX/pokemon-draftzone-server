const PokedexService = require('./pokedex-service.js')

function chart(team, gen){
  let out = []
  for(let m of team){
    out.push({pid: m.pid, coverage: PokedexService.getCoverage(m.pid, gen)})
  }
  return out 
}

/*
function coverageWidget(team) {
  let forTeam = oppTeam;
  let othTeam = myTeam;
  if (team) {
    forTeam = myTeam;
    othTeam = oppTeam;
  }
  for (let monName in forTeam) {
    let typeCoverage = ls.getCoverage(monName, gen);
    //let pcoverage = calcCoverage(monName, typeCoverage.Physical);
    //let scoverage = calcCoverage(monName, typeCoverage.Special);
    let typeSelected = {};
    let sprite = '<div class="h-full w-fit bg-red-400">' + cstr.spriteImg(monName, forTeam[monName]["shiny"], "gen5", true) + '</div>';
    let monDiv = $('<div class="h-32 max-w-64 w-full flex bg-red-400 border-red-300 border-2"></div>');
    let numDiv = $(`<div class="h-full p-2 "><div class="se p-2 h-1/2 border-2 border-slate-400 bg-emerald-400 text-md text-bold flex justify-center items-center rounded-full"></div><div class="ne p-2 h-1/2 border-2 border-slate-400 bg-rose-400 text-md text-bold flex justify-center items-center rounded-full"></div></div>`);
    let physCov = $('<div class="grid grid-cols-6 grid-rows-flex p-1 h-auto w-full items-center bg-red-300"></div>');
    for (let type in typeCoverage["Physical"]) {
      let stab = "opacity-40 ";
      if (forTeam[monName]["types"].includes(type)) {
        stab = "";
      }
      let physImg = $(`<img class="${stab}" src="https://play.pokemonshowdown.com/sprites/types/${type}.png" title="${typeCoverage["Physical"][type]["name"]}" type="${type}">`);
      physImg.on("click", function() {
        let clickType = $(this).attr("type");
        if (Object.keys(typeSelected).length < 4 && $(this).hasClass('opacity-40')) {
          monDiv.find(`[type="${clickType}"`).removeClass('opacity-40');
          typeSelected[clickType] = true;
        } else {
          monDiv.find(`[type="${clickType}"`).addClass('opacity-40');
          delete typeSelected[clickType];
        }
        updateCoverage(typeSelected, othTeam, numDiv);
      });
      physCov.append(physImg);
    }
    let physDiv = $('<div class="w-full h-1/2 text-xs bg-red-400 p-1"><img src="https://play.pokemonshowdown.com/sprites/categories/Physical.png"></div>');
    physDiv.append(physCov);

    let specCov = $('<div class="grid grid-cols-6 grid-rows-flex p-1 h-auto w-full items-center bg-red-300"></div>');
    for (let type in typeCoverage["Special"]) {
      let stab = "opacity-40 ";
      if (forTeam[monName]["types"].includes(type)) {
        stab = "";
        typeSelected[type] = true;
      }
      let specImg = $(`<img class="${stab}" src="https://play.pokemonshowdown.com/sprites/types/${type}.png" title="${typeCoverage["Special"][type]["name"]}" type="${type}">`);
      specImg.on("click", function() {
        let clickType = $(this).attr("type");
        if (Object.keys(typeSelected).length < 4 && $(this).hasClass('opacity-40')) {
          monDiv.find(`[type="${clickType}"`).removeClass('opacity-40');
          typeSelected[clickType] = true;
        } else {
          monDiv.find(`[type="${clickType}"`).addClass('opacity-40');
          delete typeSelected[clickType];
        }
        updateCoverage(typeSelected, othTeam, numDiv);
      });
      specCov.append(specImg);
    }
    let specDiv = $('<div class="w-full text-xs bg-red-400 p-1 h-1/2"><img src="https://play.pokemonshowdown.com/sprites/categories/Special.png"></div>');
    specDiv.append(specCov);
    monDiv.append($(sprite));
    let covDiv = $("<div></div>");
    covDiv.append(physDiv);
    covDiv.append(specDiv);
    monDiv.append(covDiv);
    monDiv.append(numDiv);
    updateCoverage(typeSelected, othTeam, numDiv);
    $("#coverageWidget").append(monDiv);
    $(".coverageSwitch").on("click", function() {
      $(".coverageSwitch").toggle();
    })
  }
}
*/

module.exports = {chart}