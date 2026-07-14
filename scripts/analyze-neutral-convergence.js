"use strict";
const fs = require("fs");

const gamesText = fs.readFileSync(__dirname + "/../data/games.js", "utf8");
const mockWindow = {};
(function (window) { eval(gamesText); })(mockWindow); // eslint-disable-line no-eval
const allGames = mockWindow.GOL_GAMES_DATA.games;
const pickOrders = JSON.parse(fs.readFileSync(__dirname + "/../data/pick-orders.json", "utf8"));
const Model = require("../model-core.js");
const ROLES = Model.ROLES;

const cleanGames = allGames.filter(
  (g) => Model.TARGET_LEAGUES.includes(g.league) && Number.isFinite(g.totalKills)
);
const model = Model.buildModel(cleanGames);

function normalCdf(z) {
  const abs = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * abs);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * abs * abs) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

const INTERLEAVE = [
  { side: "blue", nth: 0 }, { side: "red", nth: 0 }, { side: "red", nth: 1 },
  { side: "blue", nth: 1 }, { side: "blue", nth: 2 },
  { side: "red", nth: 2 }, { side: "red", nth: 3 }, { side: "red", nth: 4 },
  { side: "blue", nth: 3 }, { side: "blue", nth: 4 },
];

function buildPartialPicks(game, order, upTo) {
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

const ODDS = 1.80;
const MIN_EV = 0.05;

function getLean(prediction, sigma, marketLine) {
  const s = sigma || 8.3;
  const pOver  = 1 - normalCdf((marketLine - prediction) / s);
  const pUnder = normalCdf((marketLine - prediction) / s);
  const evOver  = pOver  * ODDS - 1;
  const evUnder = pUnder * ODDS - 1;
  const bestEv   = Math.max(evOver, evUnder);
  const bestSide = evOver >= evUnder ? "over" : "under";
  return { lean: bestEv >= MIN_EV ? bestSide : "neutral", evOver, evUnder, bestEv };
}

const gamesById = Object.fromEntries(allGames.map((g) => [String(g.id), g]));

// ── Reconstrói trajetória pick-a-pick para cada jogo
const trajectories = [];

for (const id of Object.keys(pickOrders)) {
  const order = pickOrders[id];
  const game  = gamesById[id];
  if (!game || !Number.isFinite(game.totalKills)) continue;

  const emptyPicks = { teamA: [null,null,null,null,null], teamB: [null,null,null,null,null] };
  const preRes    = model.predict({ ...game, picks: emptyPicks }, false);
  const marketLine = Model.fairLine(preRes.prediction);
  const sigma      = preRes.sigma || 8.3;

  const steps = [];

  // Pick 0 = pré-draft
  const { lean: lean0, evOver: eo0, evUnder: eu0, bestEv: be0 } = getLean(preRes.prediction, sigma, marketLine);
  steps.push({ pick: 0, prediction: preRes.prediction, lean: lean0, evOver: eo0, evUnder: eu0, bestEv: be0, champAdded: null, roleAdded: null });

  // Picks 1–10
  for (let i = 1; i <= 10; i++) {
    const picks = buildPartialPicks(game, order, i);
    const res   = model.predict({ ...game, picks }, true);
    const { lean, evOver, evUnder, bestEv } = getLean(res.prediction, sigma, marketLine);

    const pos  = INTERLEAVE[i - 1];
    const champ = pos.side === "blue" ? order.blue[pos.nth] : order.red[pos.nth];
    let champAdded = null, roleAdded = null;
    if (champ) {
      champAdded = champ;
      const teamKey = pos.side === "blue" ? order.blueSide : (order.blueSide === "teamA" ? "teamB" : "teamA");
      const rIdx  = (game.picks[teamKey] || []).indexOf(champ);
      roleAdded   = rIdx >= 0 ? ROLES[rIdx] : "?";
    }

    steps.push({ pick: i, prediction: res.prediction, lean, evOver, evUnder, bestEv, champAdded, roleAdded });
  }

  trajectories.push({
    id, game: game.game, league: game.league, date: game.date,
    totalKills: game.totalKills, marketLine, sigma,
    actualSide: game.totalKills > marketLine ? "over" : "under",
    steps,
    finalLean: steps[10].lean,
  });
}

const N = trajectories.length;
console.log(`\nTotal de jogos com pick order: ${N}\n`);

// ═══════════════════════════════════════════════════════════════════════════
// Q1 — FREQUÊNCIA DO PADRÃO "VAI E VOLTA"
// ═══════════════════════════════════════════════════════════════════════════

const endsNeutral    = trajectories.filter(t => t.finalLean === "neutral");
const endsNonNeutral = trajectories.filter(t => t.finalLean !== "neutral");

// Passou por sinal em qualquer ponto (picks 0–9) mas pick10 é neutro
const endsNeutralWithSignal = endsNeutral.filter(t =>
  t.steps.slice(0, 10).some(s => s.lean !== "neutral")
);
// Nunca teve sinal — ficou neutro do início ao fim
const alwaysNeutral = endsNeutral.filter(t =>
  t.steps.slice(0, 10).every(s => s.lean === "neutral")
);

const pct = (n) => (n / N * 100).toFixed(1) + "%";

console.log("═".repeat(72));
console.log("Q1 — FREQUÊNCIA DO PADRÃO 'VAI E VOLTA'");
console.log("═".repeat(72));
console.log(`Jogos analisados:                        ${N}`);
console.log(`Terminam OVER/UNDER no pick 10:          ${endsNonNeutral.length}  (${pct(endsNonNeutral.length)})`);
console.log(`Terminam NEUTRO no pick 10:              ${endsNeutral.length}  (${pct(endsNeutral.length)})`);
console.log(`  ├─ Sempre neutro (sem sinal nenhum):   ${alwaysNeutral.length}  (${pct(alwaysNeutral.length)})`);
console.log(`  └─ Teve sinal intermediário (VAI/VOLTA):${endsNeutralWithSignal.length}  (${pct(endsNeutralWithSignal.length)})`);
console.log(`     como % dos que terminam neutro:     ${(endsNeutralWithSignal.length/endsNeutral.length*100).toFixed(1)}%`);

// Breakdown: só teve sinal no pré-draft (pré pick 1) vs teve sinal durante o draft
const signalOnlyPreDraft = endsNeutralWithSignal.filter(t =>
  t.steps[0].lean !== "neutral" && t.steps.slice(1, 10).every(s => s.lean === "neutral")
);
const signalDuringDraft = endsNeutralWithSignal.filter(t =>
  t.steps.slice(1, 10).some(s => s.lean !== "neutral")
);
console.log(`\n  Detalhe dos ${endsNeutralWithSignal.length} "vai e volta":`);
console.log(`    Sinal só pré-draft (pick 0), draft já neutro: ${signalOnlyPreDraft.length}`);
console.log(`    Sinal em algum pick 1-9 (durante o draft):    ${signalDuringDraft.length}`);

// ═══════════════════════════════════════════════════════════════════════════
// Q2 — CONVERGÊNCIA SUAVE vs INSTÁVEL
// ═══════════════════════════════════════════════════════════════════════════

// Oscilação = pick que muda de neutro → não-neutro (bounce back)
function classifyPattern(traj) {
  const leans = traj.steps.map(s => s.lean);
  let changes = 0;
  for (let i = 1; i < leans.length; i++) {
    if (leans[i] !== leans[i - 1]) changes++;
  }
  // Reversão = step onde lean saiu de neutro para não-neutro
  let reversions = 0;
  for (let i = 1; i < leans.length; i++) {
    if (leans[i - 1] === "neutral" && leans[i] !== "neutral") reversions++;
  }
  return { changes, reversions };
}

const smoothGames    = [];
const unstableGames  = [];

for (const traj of endsNeutralWithSignal) {
  const { changes, reversions } = classifyPattern(traj);
  traj._changes   = changes;
  traj._reversions = reversions;
  if (reversions === 0) smoothGames.push(traj);
  else                  unstableGames.push(traj);
}

console.log("\n");
console.log("═".repeat(72));
console.log("Q2 — CONVERGÊNCIA SUAVE vs INSTÁVEL");
console.log("═".repeat(72));
console.log(`Dos ${endsNeutralWithSignal.length} jogos com padrão 'vai e volta':`);
console.log(`  Convergência SUAVE  (0 reversões para não-neutro): ${smoothGames.length}  (${(smoothGames.length/endsNeutralWithSignal.length*100).toFixed(1)}%)`);
console.log(`  Padrão INSTÁVEL     (≥1 reversão para não-neutro): ${unstableGames.length}  (${(unstableGames.length/endsNeutralWithSignal.length*100).toFixed(1)}%)`);

// Distribuição do número de mudanças de lean (picks 0→10)
const changesDist = {};
for (const t of endsNeutralWithSignal) {
  const c = t._changes;
  changesDist[c] = (changesDist[c] || 0) + 1;
}
console.log("\n  Distribuição de 'mudanças de lean' na trajetória (picks 0→10):");
Object.entries(changesDist)
  .sort((a, b) => +a[0] - +b[0])
  .forEach(([c, n]) => {
    const bar = "█".repeat(Math.round(n / endsNeutralWithSignal.length * 40));
    console.log(`    ${c} mudanças: ${String(n).padStart(4)}  ${bar}`);
  });

// Distribuição de reversões nos instáveis
const revDist = {};
for (const t of unstableGames) {
  const r = t._reversions;
  revDist[r] = (revDist[r] || 0) + 1;
}
console.log("\n  Distribuição de reversões nos INSTÁVEIS:");
Object.entries(revDist)
  .sort((a, b) => +a[0] - +b[0])
  .forEach(([r, n]) => console.log(`    ${r} reversão(ões): ${n} jogos`));

// ═══════════════════════════════════════════════════════════════════════════
// Q3 — PICKS/ROLES QUE DISPARAM AS REVERSÕES (JOGOS INSTÁVEIS)
// ═══════════════════════════════════════════════════════════════ძ

console.log("\n");
console.log("═".repeat(72));
console.log("Q3 — PICKS/ROLES QUE DISPARAM REVERSÕES NOS JOGOS INSTÁVEIS");
console.log("═".repeat(72));

const revByRole    = {};
const revByPickNum = {};
const revByChamp   = {};
const confAtRev    = [];

for (const traj of unstableGames) {
  const leans = traj.steps.map(s => s.lean);
  for (let i = 1; i < leans.length; i++) {
    // Reversão: saiu de neutro para sinal
    if (leans[i - 1] === "neutral" && leans[i] !== "neutral") {
      const step  = traj.steps[i];
      const role  = step.roleAdded || "?";
      const champ = step.champAdded || "?";

      revByRole[role]    = (revByRole[role]    || 0) + 1;
      revByPickNum[i]    = (revByPickNum[i]    || 0) + 1;
      const key = `${champ} (${role})`;
      revByChamp[key]    = (revByChamp[key]    || 0) + 1;

      // draftConfidence = sqrt(picks_filled/10) como proxy simples
      confAtRev.push(Math.sqrt(i / 10));
    }
  }
}

const totalRev = Object.values(revByRole).reduce((a, b) => a + b, 0);
console.log(`\nTotal de eventos de reversão: ${totalRev}  (em ${unstableGames.length} jogos instáveis)\n`);

console.log("Reversões por ROLE (pick que causou o bounce):");
Object.entries(revByRole)
  .sort((a, b) => b[1] - a[1])
  .forEach(([role, n]) => {
    const bar = "█".repeat(Math.round(n / totalRev * 30));
    console.log(`  ${role.padEnd(8)} ${String(n).padStart(4)}  ${bar}`);
  });

console.log("\nReversões por NÚMERO DO PICK:");
Object.entries(revByPickNum)
  .sort((a, b) => +a[0] - +b[0])
  .forEach(([pick, n]) => {
    const bar = "█".repeat(Math.round(n / totalRev * 30));
    console.log(`  Pick ${pick.padStart(2)}:  ${String(n).padStart(4)}  ${bar}`);
  });

console.log("\nTop campeões que disparam reversão (min 3 ocorrências):");
const topRevChamps = Object.entries(revByChamp)
  .filter(([, n]) => n >= 3)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25);
if (topRevChamps.length === 0) {
  console.log("  (nenhum com ≥3 ocorrências — reversões bem distribuídas entre campeões)");
} else {
  topRevChamps.forEach(([champ, n]) => console.log(`  ${champ.padEnd(32)} ${n}`));
}

// draftConfidence nos pontos de reversão
if (confAtRev.length > 0) {
  const avgConf = confAtRev.reduce((a, b) => a + b, 0) / confAtRev.length;
  const confBuckets = { "0.00–0.32 (pick1-2)": 0, "0.32–0.55 (pick3-6)": 0, "0.55–0.77 (pick6-8)": 0, "0.77–1.0 (pick9-10)": 0 };
  for (const c of confAtRev) {
    if (c < 0.32)        confBuckets["0.00–0.32 (pick1-2)"]++;
    else if (c < 0.55)   confBuckets["0.32–0.55 (pick3-6)"]++;
    else if (c < 0.77)   confBuckets["0.55–0.77 (pick6-8)"]++;
    else                 confBuckets["0.77–1.0 (pick9-10)"]++;
  }
  console.log(`\ndraftConfidence nos pontos de reversão (média: ${avgConf.toFixed(3)}):`);
  Object.entries(confBuckets).forEach(([b, n]) =>
    console.log(`  ${b.padEnd(26)} ${String(n).padStart(4)}  ${"█".repeat(Math.round(n / confAtRev.length * 30))}`)
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Q4 — ROI DO SINAL INTERMEDIÁRIO (apostar no último sinal antes de virar neutro)
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n");
console.log("═".repeat(72));
console.log("Q4 — ROI DO SINAL INTERMEDIÁRIO (último sinal antes de virar neutro)");
console.log("═".repeat(72));

const betsByPick    = {};  // pickNum -> { n, green, pnl }
const betsByEvBucket = {};  // "5-10%" -> { n, green, pnl }
const betsByLeague  = {};
let roiN = 0, roiGreen = 0, roiPnl = 0;

// Para cada sinal_DURANTE_O_DRAFT (pick 1–9), não só o último
// mas o usuário pediu: "sinal intermediário quando estava OVER/UNDER antes de virar neutro"
// → interpretamos como: a última posição de não-neutro antes do pick 10 neutro
for (const traj of endsNeutralWithSignal) {
  // Encontra o último step não-neutro em picks 0–9
  let lastSig = null;
  for (let i = 9; i >= 0; i--) {
    if (traj.steps[i].lean !== "neutral") { lastSig = traj.steps[i]; break; }
  }
  if (!lastSig) continue;

  const betSide = lastSig.lean;
  const ev      = lastSig.bestEv;
  const correct = betSide === traj.actualSide;
  const pnl     = correct ? +0.80 : -1.00;

  roiN++; roiPnl += pnl;
  if (correct) roiGreen++;

  // Por pick number
  const p = lastSig.pick;
  if (!betsByPick[p]) betsByPick[p] = { n: 0, green: 0, pnl: 0 };
  betsByPick[p].n++; betsByPick[p].pnl += pnl;
  if (correct) betsByPick[p].green++;

  // Por faixa EV
  const evPct = ev * 100;
  const bucket = evPct < 5 ? "<5%" : evPct < 10 ? "5-10%" : evPct < 15 ? "10-15%" : "≥15%";
  if (!betsByEvBucket[bucket]) betsByEvBucket[bucket] = { n: 0, green: 0, pnl: 0 };
  betsByEvBucket[bucket].n++; betsByEvBucket[bucket].pnl += pnl;
  if (correct) betsByEvBucket[bucket].green++;

  // Por liga
  if (!betsByLeague[traj.league]) betsByLeague[traj.league] = { n: 0, green: 0, pnl: 0 };
  betsByLeague[traj.league].n++; betsByLeague[traj.league].pnl += pnl;
  if (correct) betsByLeague[traj.league].green++;
}

console.log(`\nTese: apostar no último sinal intermediário antes de pick10 neutro`);
console.log(`Total de apostas hipotéticas: ${roiN}`);
console.log(`Greens: ${roiGreen}  |  Reds: ${roiN - roiGreen}`);
console.log(`Hit rate: ${(roiGreen / roiN * 100).toFixed(1)}%`);
console.log(`P&L: ${roiPnl >= 0 ? "+" : ""}${roiPnl.toFixed(2)} u  |  ROI: ${(roiPnl / roiN * 100).toFixed(1)}%`);

console.log("\nROI por estágio do pick (onde estava o último sinal):");
console.log("  Pick | Apostas |  Hit%  |   ROI");
console.log("  " + "─".repeat(40));
Object.entries(betsByPick)
  .sort((a, b) => +a[0] - +b[0])
  .forEach(([pick, d]) => {
    const roi = (d.pnl / d.n * 100).toFixed(1);
    const hit = (d.green / d.n * 100).toFixed(1);
    const flag = +roi > 0 ? "✓" : "✗";
    console.log(`  ${("P" + pick).padEnd(5)} | ${String(d.n).padStart(7)} | ${hit.padStart(5)}% | ${roi.padStart(6)}%  ${flag}`);
  });

console.log("\nROI por faixa de EV do sinal:");
console.log("  EV bucket | Apostas |  Hit%  |   ROI");
console.log("  " + "─".repeat(44));
["<5%", "5-10%", "10-15%", "≥15%"].forEach((bucket) => {
  const d = betsByEvBucket[bucket];
  if (!d) return;
  const roi = (d.pnl / d.n * 100).toFixed(1);
  const hit = (d.green / d.n * 100).toFixed(1);
  const flag = +roi > 0 ? "✓" : "✗";
  console.log(`  ${bucket.padEnd(10)} | ${String(d.n).padStart(7)} | ${hit.padStart(5)}% | ${roi.padStart(6)}%  ${flag}`);
});

console.log("\nROI por liga:");
console.log("  Liga     | Apostas |  Hit%  |   ROI");
console.log("  " + "─".repeat(42));
Object.entries(betsByLeague)
  .sort((a, b) => b[1].pnl / b[1].n - a[1].pnl / a[1].n)
  .forEach(([league, d]) => {
    const roi = (d.pnl / d.n * 100).toFixed(1);
    const hit = (d.green / d.n * 100).toFixed(1);
    console.log(`  ${league.padEnd(9)} | ${String(d.n).padStart(7)} | ${hit.padStart(5)}% | ${roi.padStart(6)}%`);
  });

// ── BÔNUS: qual % do sinal intermediário é composto de reversões tardias (pick 7–9)?
const lateSig = endsNeutralWithSignal.filter(t => {
  for (let i = 9; i >= 7; i--) if (t.steps[i].lean !== "neutral") return true;
  return false;
});
const earlySig = endsNeutralWithSignal.filter(t => {
  const lastIdx = [...t.steps.slice(0,10)].map((s,i) => s.lean !== "neutral" ? i : -1).filter(i => i >= 0).pop() || 0;
  return lastIdx <= 6;
});
console.log("\n");
console.log("─".repeat(72));
console.log("BÔNUS — ONDE SE CONCENTRA O ÚLTIMO SINAL?");
console.log("─".repeat(72));
console.log(`  Último sinal em pick 7–9 (tardio):   ${lateSig.length}  (${(lateSig.length/endsNeutralWithSignal.length*100).toFixed(1)}%)`);
console.log(`  Último sinal em pick 0–6 (precoce):  ${earlySig.length}  (${(earlySig.length/endsNeutralWithSignal.length*100).toFixed(1)}%)`);
