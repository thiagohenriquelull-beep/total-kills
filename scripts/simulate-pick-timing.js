"use strict";
const fs = require("fs");

// ── carrega games.js
const gamesText = fs.readFileSync(__dirname + "/../data/games.js", "utf8");
const mockWindow = {};
(function (window) { eval(gamesText); })(mockWindow); // eslint-disable-line no-eval
const allGames = mockWindow.GOL_GAMES_DATA.games;

// ── carrega pick-orders.json
const pickOrders = JSON.parse(fs.readFileSync(__dirname + "/../data/pick-orders.json", "utf8"));

// ── carrega model-core.js
const Model = require("../model-core.js");
const ROLES = Model.ROLES; // ["TOP", "JUNGLE", "MID", "ADC", "SUP"]

// ── build do modelo global (usa todos os jogos disponíveis)
const cleanGames = allGames.filter(
  (g) => Model.TARGET_LEAGUES.includes(g.league) && Number.isFinite(g.totalKills)
);
console.log("Construindo modelo com", cleanGames.length, "jogos...");
const model = Model.buildModel(cleanGames);
console.log("Modelo pronto.\n");

// ── posições de draft para cada time no formato B1 R1 R2 B2 B3 R3 R4 R5 B4 B5
// Índice no array seq[] → (time, nthPickDaqueleTime)
const DRAFT_INTERLEAVE = [
  { side: "blue", nth: 0 }, // pick 1  = B1
  { side: "red",  nth: 0 }, // pick 2  = R1
  { side: "red",  nth: 1 }, // pick 3  = R2
  { side: "blue", nth: 1 }, // pick 4  = B2
  { side: "blue", nth: 2 }, // pick 5  = B3
  { side: "red",  nth: 2 }, // pick 6  = R3
  { side: "red",  nth: 3 }, // pick 7  = R4
  { side: "red",  nth: 4 }, // pick 8  = R5
  { side: "blue", nth: 3 }, // pick 9  = B4
  { side: "blue", nth: 4 }, // pick 10 = B5
];

// ── converte champion name para índice de role usando o game.picks original
function roleIndexOfChampion(game, champion, side) {
  const arr = game.picks[side] || [];
  return arr.indexOf(champion);
}

// ── dado um game e pick order, retorna picks parciais no formato {teamA, teamB}
// stage = número de picks revelados (2, 4, 6, 8, 10)
function partialPicks(game, order, stage) {
  const tA = [null, null, null, null, null];
  const tB = [null, null, null, null, null];

  for (let i = 0; i < stage && i < 10; i++) {
    const pos = DRAFT_INTERLEAVE[i];
    const champ = pos.side === "blue" ? order.blue[pos.nth] : order.red[pos.nth];
    if (!champ) continue;

    // side do game: blueSide = "teamA" ou "teamB"
    const teamKey = pos.side === "blue" ? order.blueSide : (order.blueSide === "teamA" ? "teamB" : "teamA");
    const roleIdx = roleIndexOfChampion(game, champ, teamKey);
    if (roleIdx < 0) continue;

    if (teamKey === "teamA") tA[roleIdx] = champ;
    else tB[roleIdx] = champ;
  }

  return { teamA: tA, teamB: tB };
}

// ── calcula EV para um lado dado probabilidade e odds
function calcEv(prob, odds = 1.80) {
  return prob * odds - 1;
}

// ── resultados por estágio
const STAGES = [0, 2, 4, 6, 8, 10];
const results = Object.fromEntries(STAGES.map((s) => [s, { n: 0, correct: 0, evSum: 0, bets: 0, betCorrect: 0, flips: 0 }]));

// ── para cada jogo com pick order disponível
const gamesById = Object.fromEntries(allGames.map((g) => [String(g.id), g]));
const gameIds = Object.keys(pickOrders);
console.log("Jogos com pick order para simular:", gameIds.length);

let processed = 0;
for (const id of gameIds) {
  const order = pickOrders[id];
  const game = gamesById[id];
  if (!game || !Number.isFinite(game.totalKills)) continue;

  // linha pré-draft (referência fixa durante todo o draft)
  const pre = model.predict({ ...game, picks: { teamA: [null,null,null,null,null], teamB: [null,null,null,null,null] } }, false);
  const marketLine = Model.fairLine(pre.prediction + (model.offsets?.get(game.league)?.value || 0));

  const actualSide = game.totalKills > marketLine ? "over" : "under";

  // salva recomendação final (10 picks) para comparar flips
  let finalLean = null;

  for (const stage of STAGES) {
    const pp = partialPicks(game, order, stage);
    const partGame = { ...game, picks: { teamA: pp.teamA, teamB: pp.teamB } };
    const result = model.predict(partGame, true);

    const pred = result.prediction + (model.offsets?.get(game.league)?.value || 0);
    const lean = pred > marketLine ? "over" : pred < marketLine ? "under" : null;

    const evOver = calcEv(result.overProbability);
    const evUnder = calcEv(result.underProbability);
    const bestEv = Math.max(evOver, evUnder);
    const bestSide = evOver >= evUnder ? "over" : "under";

    const r = results[stage];
    r.n++;
    if (lean && lean === actualSide) r.correct++;

    if (bestEv >= 0.05) {
      r.bets++;
      if (bestSide === actualSide) r.betCorrect++;
      r.evSum += bestEv;
    }

    if (stage === 10) finalLean = lean;
  }

  // conta flips: comparar lean a cada stage com lean final
  if (finalLean) {
    for (const stage of STAGES.filter((s) => s < 10)) {
      const pp = partialPicks(game, order, stage);
      const partGame = { ...game, picks: { teamA: pp.teamA, teamB: pp.teamB } };
      const result = model.predict(partGame, true);
      const pred = result.prediction + (model.offsets?.get(game.league)?.value || 0);
      const lean = pred > marketLine ? "over" : pred < marketLine ? "under" : null;
      if (lean && lean !== finalLean) results[stage].flips++;
    }
  }

  processed++;
}

console.log("\n====== SIMULAÇÃO: TIMING DE APOSTA NO DRAFT ======");
console.log("Jogos processados:", processed);
console.log("Linha de mercado: pré-draft (fairLine do modelo sem picks)\n");

console.log("Stage | n    | Acerto Direção | Flips (≠ final) | Bets(EV≥5%) | Hit Bets | EV médio bets");
console.log("------|------|----------------|-----------------|-------------|----------|---------------");
for (const stage of STAGES) {
  const r = results[stage];
  if (!r.n) continue;
  const hitDir = (r.correct / r.n * 100).toFixed(1) + "%";
  const flipPct = stage < 10 ? (r.flips / r.n * 100).toFixed(1) + "%" : "—";
  const hitBets = r.bets > 0 ? (r.betCorrect / r.bets * 100).toFixed(1) + "%" : "—";
  const evMed = r.bets > 0 ? "+" + (r.evSum / r.bets * 100).toFixed(1) + "%" : "—";
  const label = stage === 0 ? "PRÉ   " : `PICK${String(stage).padStart(2)} `;
  console.log(`${label} | ${String(r.n).padStart(4)} | ${hitDir.padStart(14)} | ${flipPct.padStart(15)} | ${String(r.bets).padStart(11)} | ${hitBets.padStart(8)} | ${evMed}`);
}

// ── análise de flips por role: qual é o último pick "virada-game"
console.log("\n====== QUAIS PICKS CAUSAM MAIS MUDANÇAS DE DIREÇÃO ======");
const flipsByPickNum = Array(10).fill(0);
const totalFlippable = [];

for (const id of gameIds) {
  const order = pickOrders[id];
  const game = gamesById[id];
  if (!game || !Number.isFinite(game.totalKills)) continue;

  const pre = model.predict({ ...game, picks: { teamA: [null,null,null,null,null], teamB: [null,null,null,null,null] } }, false);
  const marketLine = Model.fairLine(pre.prediction + (model.offsets?.get(game.league)?.value || 0));

  // lean após todos os 10 picks
  const full = model.predict(game, true);
  const finalLean = (full.prediction + (model.offsets?.get(game.league)?.value || 0)) > marketLine ? "over" : "under";
  totalFlippable.push(finalLean);

  let prevLean = null;
  for (let p = 1; p <= 10; p++) {
    const pp = partialPicks(game, order, p);
    const res = model.predict({ ...game, picks: pp }, true);
    const pred = res.prediction + (model.offsets?.get(game.league)?.value || 0);
    const lean = pred > marketLine ? "over" : "under";

    if (prevLean !== null && lean !== prevLean) {
      flipsByPickNum[p - 1]++;
    }
    prevLean = lean;
  }
}

console.log("Pick | Mudanças de direção nesse pick");
console.log("-----|--------------------------------");
for (let i = 0; i < 10; i++) {
  const pos = DRAFT_INTERLEAVE[i];
  const label = `Pick ${i + 1} (${pos.side === "blue" ? "Blue" : "Red "} ${["B","R"][pos.side==="blue"?0:1]}${pos.nth + 1})`;
  const bar = "█".repeat(Math.round(flipsByPickNum[i] / processed * 50));
  console.log(`${label.padEnd(22)} ${String(flipsByPickNum[i]).padStart(4)}  ${bar}`);
}

// ── papel das roles: quais roles têm maior mudança no delta quando entram
console.log("\n====== IMPACTO MÉDIO NO DELTA AO REVELAR CADA PICK ======");
const roleDeltas = Object.fromEntries(ROLES.map((r) => [r, []]));

for (const id of gameIds) {
  const order = pickOrders[id];
  const game = gamesById[id];
  if (!game || !Number.isFinite(game.totalKills)) continue;

  const pre = model.predict({ ...game, picks: { teamA: [null,null,null,null,null], teamB: [null,null,null,null,null] } }, false);
  const marketLine = Model.fairLine(pre.prediction + (model.offsets?.get(game.league)?.value || 0));

  for (let p = 0; p < 10; p++) {
    const pos = DRAFT_INTERLEAVE[p];
    const champ = pos.side === "blue" ? order.blue[pos.nth] : order.red[pos.nth];
    if (!champ) continue;
    const teamKey = pos.side === "blue" ? order.blueSide : (order.blueSide === "teamA" ? "teamB" : "teamA");
    const roleIdx = roleIndexOfChampion(game, champ, teamKey);
    if (roleIdx < 0 || !ROLES[roleIdx]) continue;
    const role = ROLES[roleIdx];

    const ppBefore = partialPicks(game, order, p);
    const ppAfter = partialPicks(game, order, p + 1);
    const resBefore = model.predict({ ...game, picks: ppBefore }, true);
    const resAfter  = model.predict({ ...game, picks: ppAfter  }, true);
    const predBefore = resBefore.prediction + (model.offsets?.get(game.league)?.value || 0);
    const predAfter  = resAfter.prediction  + (model.offsets?.get(game.league)?.value || 0);
    roleDeltas[role].push(Math.abs(predAfter - predBefore));
  }
}

for (const role of ROLES) {
  const arr = roleDeltas[role];
  if (!arr.length) continue;
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  const bar = "█".repeat(Math.round(avg * 10));
  console.log(`${role.padEnd(7)} delta médio: ${avg.toFixed(3)} kills  ${bar}`);
}

console.log("\nDone.");
