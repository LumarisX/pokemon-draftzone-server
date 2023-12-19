

/*
function typechartWidget(team) {
  let typeRow = $("#typeRow");
  let sums = {};
  for (let t in pd.types) {
    typeRow.append($(`<td class=""><img class="" src="https://play.pokemonshowdown.com/sprites/types/${pd.types[t]}.png" alt="${pd.types[t]}" ></td>`));
    sums[pd.types[t]] = { "weaks": 0, "resists": 0, "log": 0 };
  }

  let typeData = $("#typeData");
  for (let m in team) {
    let data = '<th class="sticky left-0 bg-slate-200 border-r-4 border-slate-400">' + team[m]["name"] + '</th>';
    for (let t in pd.types) {
      let weak = team[m]["weak"][pd.types[t]];
      let theme = "";
      if (weak > 1) {
        theme = "bg-rose-400";
        sums[pd.types[t]]["weaks"]++;
        if (weak > 2) {
          theme = "bg-rose-500";
          if (weak > 4) {
            theme = "bg-rose-600";
          }
        }
      } else if (weak < 1) {
        theme = "bg-emerald-400";
        sums[pd.types[t]]["resists"]++;
        if (weak < .5) {
          theme = "bg-emerald-500";
          if (weak < .25) {
            theme = "bg-emerald-600";
          }
        }
      } else {
        theme = "text-slat"
      }
      if (weak != 0) {
        sums[pd.types[t]]["log"] -= Math.log2(weak);
      } else {
        sums[pd.types[t]]["log"] += 2;
      }
      data = data + '<td class="' + theme + '">' + weak + '</td>';
    }
    typeData.append($('<tr>' + data + '</tr>'));
  }
  let weakRow = '<th class="sticky left-0 bg-slate-300 border-r-4 border-slate-400">Weaknesses</th>';
  let resistRow = '<th class="sticky left-0 bg-slate-300 border-r-4 border-slate-400">Resistances</th>';
  let diffRow = '<th class="sticky left-0 bg-slate-300 border-r-4 border-slate-400">Difference</th>';
  let logRow = '<th class="sticky left-0 bg-slate-300 border-r-4 border-slate-400">Logarithmic</th>';
  for (let t in pd.types) {
    weakRow += '<td class="' + tcTheme(sums[pd.types[t]]["weaks"] * -1, -4, -3, -2, -1, 0) + '">' + sums[pd.types[t]]["weaks"] + '</td>';
    resistRow += '<td class="' + tcTheme(sums[pd.types[t]]["resists"], 0, 1, 2, 3, 4) + '">' + sums[pd.types[t]]["resists"] + '</td>';
    let theme = "";
    let diff = sums[pd.types[t]]["resists"] - sums[pd.types[t]]["weaks"];
    diffRow += '<td class="' + tcTheme(diff, -2, -1, 0, 1, 2) + '">' + diff + '</td>';
    logRow += '<td class="' + tcTheme(sums[pd.types[t]]["log"], -2, -1, 0, 1, 2) + '">' + Math.round(sums[pd.types[t]]["log"]) + '</td>';
  }
  $("#typeSum").append($('<tr>' + weakRow + '</tr>'));
  $("#typeSum").append($('<tr>' + resistRow + '</tr>'));
  $("#typeSum").append($('<tr>' + diffRow + '</tr>'));
  $("#typeSum").append($('<tr>' + logRow + '</tr>'));
}
*/