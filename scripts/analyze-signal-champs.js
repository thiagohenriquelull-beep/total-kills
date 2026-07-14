"use strict";
const fs = require("fs");

// ── carrega dados
const gamesText = fs.readFileSync(__dirname + "/../data/games.js", "utf8");
const mockWindow = {};
(function (window) { eval(gamesText); })(mockWindow); // eslint-disable-line no-eval
const allGames = mockWindow.GOL_GAMES_DATA.games;
const pickOrders = JSON.parse(fs.readFileSync(__dirname + "/../data/pick-orders.json", "utf8"));
const Model = require("../model-core.js");
const ROLES = Model.ROLES; // ["TOP","JUNGLE","MID","ADC","SUP"]

const cleanGames = allGames.filter(
  (g) => Model.TARGET_LEAGUES.includes(g.league) && Number.isFinite(g.totalKills)
);
const model = Model.buildModel(cleanGames);

// ── draft interleave
const INTERLEAVE = [
  { side: "blue", nth: 0 }, { side: "red", nth: 0 }, { side: "red", nth: 1 },
  { side: "blue", nth: 1 }, { side: "blue", nth: 2 },
  { side: "red", nth: 2 }, { side: "red", nth: 3 }, { side: "red", nth: 4 },
  { side: "blue", nth: 3 }, { side: "blue", nth: 4 },
];

function partialPicksUpTo(game, order, upTo) {
  const tA = [null, null, null, null, null];
  const tB = [null, null, null, null, null];
  for (let i = 0; i < upTo && i < 10; i++) {
    const pos = INTERLEAVE[i];
    const champ = pos.side === "blue" ? order.blue[pos.nth] : order.red[pos.nth];
    if (!champ) continue;
    const teamKey = pos.side === "blue" ? order.blueSide : (order.blueSide === "teamA" ? "teamB" : "teamA");
    const roleIdx = (game.picks[teamKey] || []).indexOf(champ);
    if (roleIdx >= 0) {
      if (teamKey === "teamA") tA[roleIdx] = champ; else tB[roleIdx] = champ;
    }
  }
  return { teamA: tA, teamB: tB };
}

// ── acumuladores por (champion, role)
// { delta: [], correct: [] }  — correct = lean pós-pick combinou com resultado real
const champData = {}; // key = "JUNGLE::Vi"

const gamesById = Object.fromEntries(allGames.map((g) => [String(g.id), g]));

for (const id of Object.keys(pickOrders)) {
  const order = pickOrders[id];
  const game = gamesById[id];
  if (!game || !Number.isFinite(game.totalKills)) continue;

  // linha de mercado pré-draft (referência fixa)
  const pre = model.predict(
    { ...game, picks: { teamA: [null,null,null,null,null], teamB: [null,null,null,null,null] } }, false
  );
  const marketLine = Model.fairLine(pre.prediction);
  const actualSide = game.totalKills > marketLine ? "over" : "under";

  // previsão após todos os 10 picks (lean final)
  const fullRes = model.predict(game, true);
  const finalLean = fullRes.prediction > marketLine ? "over" : "under";

  for (let i = 0; i < 10; i++) {
    const pos = INTERLEAVE[i];
    const champ = pos.side === "blue" ? order.blue[pos.nth] : order.red[pos.nth];
    if (!champ) continue;
    const teamKey = pos.side === "blue" ? order.blueSide : (order.blueSide === "teamA" ? "teamB" : "teamA");
    const roleIdx = (game.picks[teamKey] || []).indexOf(champ);
    if (roleIdx < 0) continue;

    const role = ROLES[roleIdx];
    // só JUNGLE e SUP
    if (role !== "JUNGLE" && role !== "SUP") continue;

    // previsão antes e depois de adicionar este pick
    const ppBefore = partialPicksUpTo(game, order, i);
    const ppAfter  = partialPicksUpTo(game, order, i + 1);
    const predBefore = model.predict({ ...game, picks: ppBefore }, true).prediction;
    const predAfter  = model.predict({ ...game, picks: ppAfter  }, true).prediction;

    const delta = predAfter - predBefore; // positivo = empurra OVER

    // lean imediato após este pick
    const pickLean = predAfter > marketLine ? "over" : "under";
    const correct = pickLean === actualSide;

    const key = `${role}::${champ}`;
    if (!champData[key]) champData[key] = { role, champion: champ, deltas: [], corrects: [] };
    champData[key].deltas.push(delta);
    champData[key].corrects.push(correct);
  }
}

// ── agrega e filtra
const MIN_N = 15;
const results = Object.values(champData)
  .map(({ role, champion, deltas, corrects }) => {
    const n = deltas.length;
    const avgDelta = deltas.reduce((a, b) => a + b, 0) / n;
    const hit = corrects.filter(Boolean).length / n;
    return { role, champion, n, avgDelta, hit };
  })
  .filter((r) => r.n >= MIN_N);

// ── separar JUNGLE e SUP, split OVER/UNDER, ordenar por |avgDelta|
function topN(arr, role, direction, n = 12) {
  return arr
    .filter((r) => r.role === role && (direction === "over" ? r.avgDelta > 0 : r.avgDelta < 0))
    .sort((a, b) => Math.abs(b.avgDelta) - Math.abs(a.avgDelta))
    .slice(0, n);
}

function printTable(title, rows, direction) {
  console.log("\n" + title);
  console.log("─".repeat(62));
  console.log("Campeão              | n   | Δ kills | Hit% lean pós-pick");
  console.log("─".repeat(62));
  for (const r of rows) {
    const sign = direction === "over" ? "+" : "";
    console.log(
      r.champion.padEnd(20) + " | " +
      String(r.n).padStart(3) + " | " +
      (sign + r.avgDelta.toFixed(3)).padStart(7) + " | " +
      (r.hit * 100).toFixed(1) + "%"
    );
  }
  if (!rows.length) console.log("  (nenhum com n≥" + MIN_N + ")");
}

console.log("====== CAMPEÕES SINALIZADORES: JUNGLE e SUPPORT ======");
console.log("Filtro: n ≥ " + MIN_N + " jogos | 1.252 jogos analisados");
console.log("Δ kills = variação média na previsão ao revelar o pick");
console.log("Hit%   = taxa de acerto do modelo na direção pós-pick\n");

printTable("▲ JUNGLE — empurra OVER", topN(results, "JUNGLE", "over"), "over");
printTable("▼ JUNGLE — empurra UNDER", topN(results, "JUNGLE", "under"), "under");
printTable("▲ SUPPORT — empurra OVER", topN(results, "SUP", "over"), "over");
printTable("▼ SUPPORT — empurra UNDER", topN(results, "SUP", "under"), "under");

// ── resumo consolidado: top 5 sinalizadores de cada direção (ambas roles)
console.log("\n\n====== TOP 10 SINALIZADORES ABSOLUTOS (JUNGLE + SUP) ======");
const allOver = results.filter((r) => r.avgDelta > 0).sort((a, b) => b.avgDelta - a.avgDelta).slice(0, 10);
const allUnder = results.filter((r) => r.avgDelta < 0).sort((a, b) => a.avgDelta - b.avgDelta).slice(0, 10);

console.log("\n▲ OVER — maiores sinalizadores");
console.log("─".repeat(62));
console.log("Campeão              | Role    | n   | Δ kills | Hit%");
console.log("─".repeat(62));
for (const r of allOver) {
  console.log(
    r.champion.padEnd(20) + " | " +
    r.role.padEnd(6) + "  | " +
    String(r.n).padStart(3) + " | +" +
    r.avgDelta.toFixed(3).padStart(6) + " | " +
    (r.hit * 100).toFixed(1) + "%"
  );
}
console.log("\n▼ UNDER — maiores sinalizadores");
console.log("─".repeat(62));
console.log("Campeão              | Role    | n   | Δ kills | Hit%");
console.log("─".repeat(62));
for (const r of allUnder) {
  console.log(
    r.champion.padEnd(20) + " | " +
    r.role.padEnd(6) + "  | " +
    String(r.n).padStart(3) + " |  " +
    r.avgDelta.toFixed(3).padStart(6) + " | " +
    (r.hit * 100).toFixed(1) + "%"
  );
}
