"use strict";
const fs = require("fs");
const text = fs.readFileSync(__dirname + "/../data/final-rule-backtest.csv", "utf8");
const rows = text.trim().split("\n");
const h = rows[0].split(",");
const ci = (n) => h.indexOf(n);
const C = {
  league: ci("league"), actual: ci("actual"), line: ci("line"),
  pred: ci("postPrediction"), evo: ci("evOver"), evu: ci("evUnder"),
  edge: ci("edge"), op: ci("overProbability"), up: ci("underProbability"),
  side: ci("decisionSide"), reason: ci("decisionReason"), as: ci("actualSide"),
  draftDelta: ci("draftDelta"), draftConf: ci("draftConfidence"),
  draftSignal: ci("draftSignal"), draftSignalReason: ci("draftSignalReason"),
};

const games = rows.slice(1).map((r) => {
  const c = r.split(",");
  return {
    league: c[C.league].trim(),
    actual: +c[C.actual], line: +c[C.line], pred: +c[C.pred],
    evo: +c[C.evo], evu: +c[C.evu], edge: +c[C.edge],
    op: +c[C.op], up: +c[C.up],
    side: c[C.side].trim(), reason: c[C.reason].trim(), as: c[C.as].trim(),
    draftDelta: +c[C.draftDelta], draftConf: +c[C.draftConf],
    draftSignal: (c[C.draftSignal] || "").trim(),
    draftSignalReason: (c[C.draftSignalReason] || "").trim(),
  };
}).filter((g) => isFinite(g.actual) && isFinite(g.line) && isFinite(g.pred));

const MIN_EV_THRESHOLD = 0.05; // 5% — limiar real do sistema
const MIN_EDGE = 1.0;

function stats(bets, note) {
  if (!bets.length) { console.log("  " + note + ": 0 jogos"); return; }
  const greens = bets.filter((g) => (g.evo > g.evu ? "over" : "under") === g.as).length;
  const pnl = greens * 0.80 - (bets.length - greens) * 1;
  console.log("  " + note + ": n=" + bets.length + " | Hit=" + (greens / bets.length * 100).toFixed(1) + "% | ROI=" + (pnl / bets.length >= 0 ? "+" : "") + (pnl / bets.length * 100).toFixed(1) + "%");
}

// ── 1. Funil de filtragem
console.log("====== FUNIL DE FILTRAGEM (todos os 1125 jogos) ======\n");

const step0 = games;
const step1 = games.filter((g) => Math.max(g.evo, g.evu) > 0);       // EV > 0%
const step2 = games.filter((g) => Math.max(g.evo, g.evu) >= MIN_EV_THRESHOLD); // EV >= 5%
const step3 = step2.filter((g) => {
  const bestSide = g.evo > g.evu ? "over" : "under";
  const sideEdge = bestSide === "over" ? g.edge : -g.edge;
  return sideEdge >= MIN_EDGE;                                          // edge >= 1.0
});
const step4 = games.filter((g) => g.side !== "");                      // recomendados reais

console.log("Etapa 0 — todos os jogos         : " + step0.length);
console.log("Etapa 1 — EV > 0% (algum lado)  : " + step1.length + " (-" + (step0.length - step1.length) + ")");
console.log("Etapa 2 — EV >= 5% (min do sist): " + step2.length + " (-" + (step1.length - step2.length) + ")");
console.log("Etapa 3 — Edge >= 1.0 kills      : " + step3.length + " (-" + (step2.length - step3.length) + ")");
console.log("Etapa 4 — Recomendados reais CSV : " + step4.length + " (diferenca da etapa 3: " + (step3.length - step4.length) + " jogos a investigar)");

// ── 2. Por que alguns com EV>=5% e edge>=1.0 nao foram recomendados?
const etapa3Ids = new Set(step3.map((_, i) => i));
const notInStep4 = step3.filter((g) => g.side === "");

console.log("\n====== JOGOS COM EV>=5% + EDGE>=1.0 QUE NAO FORAM APOSTADOS ======");
console.log("Quantidade: " + notInStep4.length);
if (notInStep4.length > 0) {
  for (const g of notInStep4) {
    console.log("  " + g.league + " | evo=" + g.evo.toFixed(4) + " evu=" + g.evu.toFixed(4) + " edge=" + g.edge.toFixed(2) + " draftSignalReason=\"" + g.draftSignalReason + "\" reason=\"" + g.reason + "\"");
  }
}

// ── 3. Os 148 com EV 0-5%: o que aconteceria se apostasse?
const ev0a5 = step1.filter((g) => Math.max(g.evo, g.evu) < MIN_EV_THRESHOLD);
console.log("\n====== SE APOSTASSE OS 148 JOGOS COM EV 0-5% ======");
stats(ev0a5, "Hit/ROI se apostasse tudo");
const evBands = [
  { l: "EV 0-1%", min: 0, max: 0.01 },
  { l: "EV 1-2%", min: 0.01, max: 0.02 },
  { l: "EV 2-3%", min: 0.02, max: 0.03 },
  { l: "EV 3-4%", min: 0.03, max: 0.04 },
  { l: "EV 4-5%", min: 0.04, max: 0.05 },
];
for (const b of evBands) {
  const sub = ev0a5.filter((g) => Math.max(g.evo, g.evu) >= b.min && Math.max(g.evo, g.evu) < b.max);
  stats(sub, b.l);
}

// ── 4. O papel do edge — quantos com EV>=5% reprovam por edge?
console.log("\n====== FILTRAGEM POR EDGE (dos 64 com EV>=5%) ======");
const edgeDist = {};
for (const g of step2) {
  const bestSide = g.evo > g.evu ? "over" : "under";
  const sideEdge = bestSide === "over" ? g.edge : -g.edge;
  const bucket = sideEdge < 0 ? "edge <0 (contra)" : sideEdge < 0.5 ? "edge 0-0.5" : sideEdge < 1.0 ? "edge 0.5-1.0" : sideEdge < 2.0 ? "edge 1.0-2.0" : "edge >2.0";
  if (!edgeDist[bucket]) edgeDist[bucket] = [];
  edgeDist[bucket].push(g);
}
for (const [k, bets] of Object.entries(edgeDist).sort((a, b) => {
  const order = ["edge <0 (contra)", "edge 0-0.5", "edge 0.5-1.0", "edge 1.0-2.0", "edge >2.0"];
  return order.indexOf(a[0]) - order.indexOf(b[0]);
})) {
  stats(bets, k);
}

// ── 5. O papel dos bloqueios de liga
console.log("\n====== BLOQUEIOS DE LIGA (draftSignalReason) ======");
console.log("Impacto nos jogos com EV>=5%:");
const signalReasons = {};
for (const g of step2) {
  const k = g.draftSignalReason || "(vazio)";
  signalReasons[k] = (signalReasons[k] || 0) + 1;
}
for (const [r, n] of Object.entries(signalReasons).sort((a, b) => b[1] - a[1])) {
  const bets = step2.filter((g) => (g.draftSignalReason || "(vazio)") === r);
  const greens = bets.filter((g) => (g.evo > g.evu ? "over" : "under") === g.as).length;
  const pnl = greens * 0.80 - (bets.length - greens) * 1;
  const roi = (pnl / bets.length * 100).toFixed(1);
  console.log('  "' + r + '": n=' + n + " | Hit=" + (greens / bets.length * 100).toFixed(1) + "% | ROI=" + (pnl >= 0 ? "+" : "") + roi + "%");
}

// ── 6. Resumo dos critérios como funil visual
console.log("\n====== RESUMO: FILTROS EM CASCATA ======");
console.log("1. EV minimo 5%       : elimina " + (step0.length - step2.length) + " jogos (" + ((step0.length - step2.length)/step0.length*100).toFixed(0) + "% do total)");
console.log("   - EV < 0%   : " + (step0.length - step1.length) + " jogos");
console.log("   - EV 0-5%   : " + ev0a5.length + " jogos");
console.log("2. Edge >= 1.0        : elimina " + (step2.length - step3.length) + " jogos dos " + step2.length + " com EV>=5%");
console.log("3. Bloqueio de liga   : elimina " + (step3.length - step4.length) + " jogos adicionais");
console.log("=> Resultado final    : " + step4.length + " apostas recomendadas de " + step0.length + " totais (" + (step4.length/step0.length*100).toFixed(1) + "%)");
