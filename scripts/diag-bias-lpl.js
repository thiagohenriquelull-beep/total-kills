"use strict";
/**
 * diag-bias-lpl.js — Diagnóstico: viés LPL antes vs depois dos 63 jogos novos
 *
 * Responde:
 *  1. A medição foi feita com o mesmo método?
 *  2. Quantos jogos LPL entraram na medição antes vs agora?
 *  3. O viés nos jogos ANTIGOS (sem os 63 novos) com o método atual ainda dá ~-2.29?
 *  4. Os 14 novos jogos LPL tiveram kills atipicamente altos?
 */

const fs    = require("fs");
const path  = require("path");
const Model = require("../model-core.js");

const ROOT       = path.resolve(__dirname, "..");
const GAMES_FILE = path.join(ROOT, "data", "games.js");

// ── Carrega games.js via eval com window mockado (funciona porque games.js usa window.X = Y)
const gamesText = fs.readFileSync(GAMES_FILE, "utf8");
const mockWin = {};
(function(window) { eval(gamesText); })(mockWin); // eslint-disable-line no-eval
const allGames = mockWin.GOL_GAMES_DATA.games
  .filter(g => Model.TARGET_LEAGUES.includes(g.league) && Number.isFinite(g.totalKills))
  .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

// Corte: jogos com ID >= 78842 são os "novos" (adicionados nesta semana)
const NEW_ID_THRESHOLD = 78842;
const oldGames = allGames.filter(g => Number(g.id) < NEW_ID_THRESHOLD);
const newGames = allGames.filter(g => Number(g.id) >= NEW_ID_THRESHOLD);

console.log("═══ DIAGNÓSTICO: VIÉS LPL ══════════════════════════════════════════");
console.log(`Total jogos (1368 dataset) : ${allGames.length}`);
console.log(`Jogos antigos (<78842)     : ${oldGames.length}`);
console.log(`Jogos novos   (>=78842)    : ${newGames.length}`);
console.log(`  LPL antigos             : ${oldGames.filter(g=>g.league==="LPL").length}`);
console.log(`  LPL novos               : ${newGames.filter(g=>g.league==="LPL").length}`);
console.log();

const MIN_TRAIN = 30;

/**
 * Walk-forward: para cada jogo na amostra `testSet` (já ordenada por data),
 * usa `trainSource` (todos os jogos ANTERIORES a esse jogo, em ordem) como treino.
 * Retorna array de {league, date, pred, actual, error}.
 *
 * trainSource e testSet podem ser subconjuntos diferentes para responder a Q3.
 */
function walkForward(trainSource, testSet) {
  // Merge e resorteia para garantir ordem cronológica correta no conjunto de treino
  const allSorted = [...trainSource].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  // Cria lookup de IDs do testSet
  const testIds = new Set(testSet.map(g => String(g.id)));

  const results = [];

  for (let i = 0; i < allSorted.length; i++) {
    const game = allSorted[i];
    if (!testIds.has(String(game.id))) continue;  // só avalia jogos do testSet

    const trainGames = allSorted.slice(0, i);
    if (trainGames.length < MIN_TRAIN) continue;

    let index;
    try { index = Model.buildModel(trainGames); } catch (e) { continue; }

    const gameLike = {
      league:  game.league,
      patch:   game.patch,
      teamA:   game.teamA,
      teamB:   game.teamB,
      picks:   { teamA: [], teamB: [] },
    };

    let house;
    try { house = index.houseLine(gameLike, trainGames); } catch (e) { continue; }

    const pred = house.pre?.prediction;
    if (!Number.isFinite(pred)) continue;

    results.push({
      league:   game.league,
      date:     game.date,
      id:       game.id,
      pred:     pred,
      actual:   game.totalKills,
      error:    pred - game.totalKills,  // positivo = subestimou kills (previu mais baixo)
    });
  }

  return results;
}

function summarize(results, label) {
  if (!results.length) return { label, n: 0, bias: null };
  const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
  const byLeague = {};
  for (const r of results) {
    if (!byLeague[r.league]) byLeague[r.league] = [];
    byLeague[r.league].push(r.error);
  }
  const leagueBias = {};
  for (const [l, errs] of Object.entries(byLeague)) {
    leagueBias[l] = { bias: mean(errs), n: errs.length };
  }
  return { label, n: results.length, bias: mean(results.map(r => r.error)), byLeague: leagueBias };
}

// ── Cenário A: como o baseline mediu — sobre os jogos antigos, treinando nos jogos antigos
console.log("Rodando cenário A: walk-forward só sobre jogos antigos (equivalente baseline 1305)...");
const resA = walkForward(oldGames, oldGames);
const sumA = summarize(resA, "Antigo-em-antigo (baseline equiv.)");

// ── Cenário B: walk-forward sobre TODOS os 1368 jogos (o que o recalc-1368 mediu)
console.log("Rodando cenário B: walk-forward sobre todos os jogos (1368)...");
const resB = walkForward(allGames, allGames);
const sumB = summarize(resB, "Todos-em-todos (recalc-1368 equiv.)");

// ── Cenário C: avalia só os jogos NOVOS, treinando com TUDO que veio antes
console.log("Rodando cenário C: avalia só os jogos novos (treino = todos os anteriores)...");
const resC = walkForward(allGames, newGames);
const sumC = summarize(resC, "Novos avaliados com modelo completo");

console.log("\n");
console.log("═══════════════════════════════════════════════════════════════════");
console.log("PERGUNTA 1 — O método foi o mesmo?");
console.log(`  Cenário A (baseline equiv.): ${sumA.n} previsões`);
console.log(`  Cenário B (recalc-1368):     ${sumB.n} previsões`);
console.log("  Método: IDÊNTICO em ambos (walk-forward pre-draft, MIN_TRAIN=30)");
console.log("  Os números são comparáveis diretamente.");

console.log("\nPERGUNTA 2 — Jogos LPL na medição:");
const lplA = sumA.byLeague["LPL"] || { n: 0, bias: null };
const lplB = sumB.byLeague["LPL"] || { n: 0, bias: null };
const lplC = sumC.byLeague["LPL"] || { n: 0, bias: null };
console.log(`  Baseline equiv. (Cen. A):  n_LPL = ${lplA.n}, viés = ${lplA.bias?.toFixed(3) ?? "n/a"}`);
console.log(`  Recalc-1368    (Cen. B):  n_LPL = ${lplB.n}, viés = ${lplB.bias?.toFixed(3) ?? "n/a"}`);

console.log("\nPERGUNTA 3 — Viés dos jogos ANTIGOS com o método atual:");
console.log("  Liga    | Baseline reportado | Cenário A (mesmo método, jogos antigos) | Cenário B (todos) | Novos só (Cen.C)");
console.log("  --------|--------------------|-----------------------------------------|-------------------|------------------");
const reported = { LCS: -3.53, LPL: -2.29, LCK: -0.12 };
for (const liga of Model.TARGET_LEAGUES) {
  const rep = reported[liga] !== undefined ? reported[liga].toFixed(2).padStart(6) : "   n/a";
  const a   = sumA.byLeague[liga];
  const b   = sumB.byLeague[liga];
  const c   = sumC.byLeague[liga];
  const fmtA = a ? `${a.bias.toFixed(3).padStart(7)} (n=${String(a.n).padStart(3)})` : "       n/a       ";
  const fmtB = b ? `${b.bias.toFixed(3).padStart(7)} (n=${String(b.n).padStart(3)})` : "   n/a";
  const fmtC = c ? `${c.bias.toFixed(3).padStart(7)} (n=${String(c.n).padStart(3)})` : "   n/a";
  console.log(`  ${liga.padEnd(8)}| ${rep.padEnd(18)} | ${fmtA} | ${fmtB} | ${fmtC}`);
}

console.log("\nPERGUNTA 4 — Kills dos novos jogos LPL vs histórico:");
const lplNew  = newGames.filter(g => g.league === "LPL");
const lplHist = oldGames.filter(g => g.league === "LPL");
const mean = arr => arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : null;
const std  = arr => {
  if (arr.length < 2) return null;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length);
};
const mNew  = mean(lplNew.map(g=>g.totalKills));
const mHist = mean(lplHist.map(g=>g.totalKills));
const sHist = std(lplHist.map(g=>g.totalKills));
const z = (mNew && mHist && sHist) ? (mNew - mHist) / (sHist / Math.sqrt(lplNew.length)) : null;
console.log(`  Histórico LPL (${lplHist.length} jogos): média = ${mHist?.toFixed(2)} kills, std = ${sHist?.toFixed(2)}`);
console.log(`  Novos LPL     (${lplNew.length} jogos): média = ${mNew?.toFixed(2)} kills`);
console.log(`  Diferença: ${(mNew-mHist).toFixed(2)} kills acima do histórico`);
console.log(`  z-score: ${z?.toFixed(2)} — ${Math.abs(z)>2 ? "ATÍPICO (|z|>2)" : Math.abs(z)>1.5 ? "acima da variância normal" : "dentro do normal"}`);
console.log("\n  Partidas (nova semana LPL):");
for (const g of lplNew.sort((a,b)=>b.totalKills-a.totalKills)) {
  const flag = g.totalKills > mHist + sHist ? " ← alto" : g.totalKills > mHist ? "" : " ← baixo";
  console.log(`    ${g.date} | ${g.teamA} vs ${g.teamB} | ${g.totalKills}k${flag}`);
}

// Proporção de jogos acima da média histórica nos novos vs antigos
const lplHistK  = lplHist.map(g=>g.totalKills);
const lplNewK   = lplNew.map(g=>g.totalKills);
const pctAbove = (arr) => arr.filter(k=>k>mHist).length/arr.length;
console.log(`\n  % jogos acima da média histórica (${mHist?.toFixed(1)}k):`);
console.log(`    Histórico: ${(pctAbove(lplHistK)*100).toFixed(1)}% (esperado ~50%)`);
console.log(`    Novos:     ${(pctAbove(lplNewK)*100).toFixed(1)}%`);

console.log("\n═══════════════════════════════════════════════════════════════════");
console.log("VEREDICTO AUTOMÁTICO:");
if (lplA.n > 0 && lplB.n > 0) {
  const biasOldMethod = lplA.bias;
  const biasAllMethod = lplB.bias;
  const biasNewOnly   = lplC.bias;
  console.log(`  Viés nos jogos antigos (mesmo método): ${biasOldMethod?.toFixed(3)}`);
  console.log(`  Viés no dataset completo:              ${biasAllMethod?.toFixed(3)}`);
  if (biasNewOnly !== null) console.log(`  Viés nos jogos novos (vs modelo antigo): ${biasNewOnly?.toFixed(3)}`);
  const methodChange = Math.abs((biasOldMethod ?? 0) - (lplA.bias ?? 0));
  console.log(`\n  A queda no viés é real ou artefato?`);
  if (biasOldMethod !== null && Math.abs(biasOldMethod - (-2.29)) > 0.5) {
    console.log("  → ARTEFATO DE MEDIÇÃO: viés nos jogos antigos com método atual difere do baseline.");
    console.log("    Os dois números não eram comparáveis.");
  } else if (z && Math.abs(z) > 2) {
    console.log("  → VARIÂNCIA AMOSTRAL: os 14 novos jogos LPL foram atipicamente altos (z>2).");
    console.log("    A queda no viés reflete semanas específicas de playoffs, não mudança de meta.");
  } else {
    console.log("  → QUEDA REAL: método consistente, kills novos dentro do normal, meta possivelmente mudou.");
  }
}
