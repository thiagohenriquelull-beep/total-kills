"use strict";
const fs = require("fs");

const gamesText = fs.readFileSync(__dirname + "/../data/games.js", "utf8");
const mockWindow = {};
(function (window) { eval(gamesText); })(mockWindow); // eslint-disable-line no-eval
const allGames = mockWindow.GOL_GAMES_DATA.games;
const pickOrders = JSON.parse(fs.readFileSync(__dirname + "/../data/pick-orders.json", "utf8"));
const Model = require("../model-core.js");

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

// Rational approximation for inverse normal CDF (Beasley-Springer-Moro)
function normalInv(p) {
  const a = [ 2.50662823884, -18.61500062529,  41.39119773534, -25.44106049637];
  const b = [-8.47351093090,  23.08336743743, -21.06224101826,   3.13082909833];
  const c = [0.3374754822726147, 0.9761690190917186, 0.1607979714918209,
             0.0276438810333863, 0.0038405729373609, 0.0003951896511349,
             0.0000321767881768, 0.0000002888167364, 0.0000003960315187];
  const y = p - 0.5;
  if (Math.abs(y) < 0.42) {
    const r = y * y;
    return y * (((a[3]*r+a[2])*r+a[1])*r+a[0]) / ((((b[3]*r+b[2])*r+b[1])*r+b[0])*r+1);
  }
  const r = Math.log(-Math.log(p < 0.5 ? p : 1 - p));
  const x = c[0]+r*(c[1]+r*(c[2]+r*(c[3]+r*(c[4]+r*(c[5]+r*(c[6]+r*(c[7]+r*c[8])))))));
  return p < 0.5 ? -x : x;
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

const ODDS  = 1.80;
const SIGMA = 8.3; // fallback

const STAGES = [5, 6, 7, 8];

const EV_BUCKETS = [
  { label: "1-2%",  min: 0.010, max: 0.020, mid: 0.015 },
  { label: "2-3%",  min: 0.020, max: 0.030, mid: 0.025 },
  { label: "3-4%",  min: 0.030, max: 0.040, mid: 0.035 },
  { label: "4-5%",  min: 0.040, max: 0.050, mid: 0.045 },
  { label: "5-7%",  min: 0.050, max: 0.070, mid: 0.060 },
  { label: "7-10%", min: 0.070, max: 0.100, mid: 0.085 },
  { label: "10%+",  min: 0.100, max: Infinity, mid: 0.130 },
];

// cells[stageIdx][bucketIdx] = { n, green, pnl, evSum }
const cells = STAGES.map(() => EV_BUCKETS.map(() => ({ n: 0, green: 0, pnl: 0, evSum: 0 })));

// Also track cumulative (any EV >= threshold, across all stages)
// and a "combined >=5 stage" aggregate
const gamesById = Object.fromEntries(allGames.map((g) => [String(g.id), g]));

let processed = 0;
for (const id of Object.keys(pickOrders)) {
  const order = pickOrders[id];
  const game  = gamesById[id];
  if (!game || !Number.isFinite(game.totalKills)) continue;
  processed++;

  const emptyPicks = { teamA: [null,null,null,null,null], teamB: [null,null,null,null,null] };
  const preRes = model.predict({ ...game, picks: emptyPicks }, false);
  const marketLine = Model.fairLine(preRes.prediction);
  const sigma = preRes.sigma || SIGMA;
  const actualSide = game.totalKills > marketLine ? "over" : "under";

  for (let si = 0; si < STAGES.length; si++) {
    const stage = STAGES[si];
    const picks = buildPartialPicks(game, order, stage);
    const res   = model.predict({ ...game, picks }, true);
    const pred  = res.prediction;

    const pOver  = 1 - normalCdf((marketLine - pred) / sigma);
    const pUnder = 1 - pOver;
    const evOver  = pOver  * ODDS - 1;
    const evUnder = pUnder * ODDS - 1;
    const bestEv   = Math.max(evOver, evUnder);
    const betSide  = evOver >= evUnder ? "over" : "under";

    if (bestEv < 0.010) continue; // below minimum tracked

    const bi = EV_BUCKETS.findIndex(b => bestEv >= b.min && bestEv < b.max);
    if (bi < 0) continue;

    const correct = betSide === actualSide;
    const pnl     = correct ? +0.80 : -1.00;
    cells[si][bi].n++;
    cells[si][bi].pnl   += pnl;
    cells[si][bi].evSum += bestEv;
    if (correct) cells[si][bi].green++;
  }
}

// ── helper formatters
function fmtN(n)    { return String(n).padStart(4); }
function fmtPct(v)  { return (v * 100).toFixed(1).padStart(5) + "%"; }
function fmtRoi(v)  { const s = (v >= 0 ? "+" : "") + v.toFixed(1); return s.padStart(6) + "%"; }
function flag(roi)  { return roi > 0 ? "✓" : roi === 0 ? "·" : "✗"; }

// ═══════════════════════════════════════════════════════════════════════════
// TABELA PRINCIPAL: Hit% e ROI por (pick stage × EV bucket)
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\nJogos processados: ${processed}\n`);
console.log("═".repeat(100));
console.log("TABELA: Hit% / ROI / n  por estágio do pick × faixa de EV");
console.log("Valores com n < 20 marcados com ⚠  (ignorar para conclusões)");
console.log("─".repeat(100));

const header = "Pick │ " + EV_BUCKETS.map(b => b.label.padEnd(18)).join(" │ ");
console.log(header);
console.log("─".repeat(100));

for (let si = 0; si < STAGES.length; si++) {
  const stage = STAGES[si];
  let row = `P${stage}   │ `;
  for (let bi = 0; bi < EV_BUCKETS.length; bi++) {
    const c = cells[si][bi];
    if (c.n === 0) {
      row += "  --/  --/  -- ".padEnd(18) + " │ ";
    } else {
      const hit = c.green / c.n;
      const roi = c.pnl / c.n * 100;
      const warn = c.n < 20 ? "⚠" : " ";
      row += `${warn}${fmtN(c.n)} ${fmtPct(hit)} ${fmtRoi(roi)}`.padEnd(18) + " │ ";
    }
  }
  console.log(row);
}

console.log("─".repeat(100));
console.log("Formato da célula: ⚠n  Hit%  ROI%   (⚠ = amostra < 20)");
console.log("Linha fixa = linha pré-draft (fairLine(preDraft)); sigma = média da liga (8.3)\n");

// ── Totais por EV bucket (todos os estágios juntos, picks 5-8)
console.log("─".repeat(100));
console.log("TOTAIS (picks 5-8 combinados):");
const totals = EV_BUCKETS.map(() => ({ n: 0, green: 0, pnl: 0 }));
for (let si = 0; si < STAGES.length; si++) {
  for (let bi = 0; bi < EV_BUCKETS.length; bi++) {
    totals[bi].n     += cells[si][bi].n;
    totals[bi].pnl   += cells[si][bi].pnl;
    totals[bi].green += cells[si][bi].green;
  }
}
let totRow = "ALL  │ ";
for (let bi = 0; bi < EV_BUCKETS.length; bi++) {
  const c = totals[bi];
  if (c.n === 0) { totRow += "  --/  --/  -- ".padEnd(18) + " │ "; continue; }
  const hit = c.green / c.n;
  const roi = c.pnl / c.n * 100;
  const warn = c.n < 20 ? "⚠" : " ";
  totRow += `${warn}${fmtN(c.n)} ${fmtPct(hit)} ${fmtRoi(roi)}`.padEnd(18) + " │ ";
}
console.log(totRow);

// ═══════════════════════════════════════════════════════════════════════════
// Q1 — existe faixa de EV <5% lucrativa com n≥20 filtrada por pick≥5?
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n");
console.log("═".repeat(100));
console.log("Q1 — EXISTE FAIXA DE EV <5% LUCRATIVA (ROI > 0, n ≥ 20) NOS PICKS 5-8?");
console.log("─".repeat(100));
const lowEvBuckets = EV_BUCKETS.slice(0, 4); // 1-2%, 2-3%, 3-4%, 4-5%
let anyProfitableLow = false;
for (let bi = 0; bi < 4; bi++) {
  let stageRows = [];
  for (let si = 0; si < STAGES.length; si++) {
    const c = cells[si][bi];
    stageRows.push({ stage: STAGES[si], ...c });
  }
  const agg = totals[bi];
  const profitable   = agg.n >= 20 && agg.pnl > 0;
  const anyHighN     = stageRows.some(r => r.n >= 20 && r.pnl > 0);
  if (profitable || anyHighN) anyProfitableLow = true;

  const roiPct = agg.n > 0 ? (agg.pnl / agg.n * 100).toFixed(1) : "--";
  const hitPct = agg.n > 0 ? (agg.green / agg.n * 100).toFixed(1) : "--";
  const verdict = agg.n < 20
    ? `n=${agg.n} INSUFICIENTE`
    : profitable
    ? `ROI ${roiPct}%  ← LUCRATIVO (n=${agg.n})`
    : `ROI ${roiPct}%  ← não lucrativo (n=${agg.n})`;
  console.log(`  ${EV_BUCKETS[bi].label.padEnd(6)} │ Hit=${hitPct}% │ ${verdict}`);
}
if (!anyProfitableLow) {
  console.log("\n  → Resposta: NÃO. Nenhuma faixa de EV <5% sobrevive ao filtro pick≥5 com ROI>0 e n≥20.");
} else {
  console.log("\n  → Resposta: SIM para as faixas marcadas. Ver Q2 e Q3 antes de concluir.");
}

// ═══════════════════════════════════════════════════════════════════════════
// Q2 — menor limiar de EV com ROI positivo e amostra confiável por estágio
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n");
console.log("═".repeat(100));
console.log("Q2 — MENOR LIMIAR DE EV COM ROI > 0 E n ≥ 20, POR ESTÁGIO");
console.log("─".repeat(100));
console.log("  (considerando buckets acumulados: 'EV ≥ X%' = todos os buckets a partir de X)");
console.log();

for (let si = 0; si < STAGES.length; si++) {
  const stage = STAGES[si];
  // Compute cumulative from each threshold downward
  let bestThreshold = null;
  for (let bi = 0; bi < EV_BUCKETS.length; bi++) {
    // Accumulate from bi upward (all bets with EV >= bucket[bi].min)
    let cumN = 0, cumGreen = 0, cumPnl = 0;
    for (let j = bi; j < EV_BUCKETS.length; j++) {
      cumN     += cells[si][j].n;
      cumGreen += cells[si][j].green;
      cumPnl   += cells[si][j].pnl;
    }
    if (cumN >= 20 && cumPnl > 0) {
      bestThreshold = { threshold: EV_BUCKETS[bi].min, n: cumN, hit: cumGreen/cumN, roi: cumPnl/cumN*100 };
      break; // first (lowest) threshold that passes both tests
    }
  }
  if (!bestThreshold) {
    console.log(`  Pick ${stage}: nenhuma combinação atinge n≥20 e ROI>0`);
  } else {
    console.log(`  Pick ${stage}: EV ≥ ${(bestThreshold.threshold*100).toFixed(0)}%  →  n=${bestThreshold.n}  Hit=${bestThreshold.hit*100 |0}%  ROI=+${bestThreshold.roi.toFixed(1)}%`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Q3 — MARGEM DE SEGURANÇA por faixa de EV
// Quanto pode mover antes de EV virar negativo?
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n");
console.log("═".repeat(100));
console.log("Q3 — MARGEM DE SEGURANÇA contra movimento da odd/linha");
console.log("═".repeat(100));
console.log();
console.log("Base: odds = 1.80, sigma = 8.3, linha pré-draft FIXA (não live)");
console.log("A linha pré-draft é a referência dos EVs acima — se a casa já moveu,");
console.log("o EV live é MENOR que o calculado aqui.");
console.log();
console.log("┌──────────┬──────────────────────────┬──────────────────────────┬────────────────────────────────────────┐");
console.log("│ EV faixa │ Margem em odds           │ Margem em probabilidade  │ Margem em linha (kills)                │");
console.log("│          │ (pode cair de 1.80 até…) │ (pWin pode errar por…)  │ (linha pode avançar X kills)           │");
console.log("├──────────┼──────────────────────────┼──────────────────────────┼────────────────────────────────────────┤");

// Theoretical break-even: pWin = 1/ODDS = 0.5556
// zBreakEven = normalInv(0.5556) ≈ 0.14 (for OVER)
const pBreakEven = 1 / ODDS; // 0.5556
const zBreakEven = normalInv(pBreakEven); // ≈ 0.14

for (const b of EV_BUCKETS) {
  const evMid = b.mid;
  const pWin  = (1 + evMid) / ODDS; // estimated win probability

  // Margin in odds: 1.80 - 1/pWin
  const marginOdds = ODDS - (1 / pWin);

  // Margin in probability: EV/ODDS (percentage points pWin can drop)
  const marginProb = evMid / ODDS;

  // Margin in kills: how much can the house line shift adversely?
  // For OVER: line can increase by X kills before EV = 0
  // zCurrent = normalInv(pWin) (z at current pWin from the over side)
  // zBreakEven = normalInv(pBreakEven) = normalInv(1/1.80)
  // kills margin = sigma * (normalInv(pWin) - normalInv(pBreakEven))
  const zCurrent     = normalInv(pWin);
  const marginKills  = SIGMA * (zCurrent - zBreakEven);

  // Odds the house can drop to
  const minOdds = (ODDS - marginOdds).toFixed(3);

  const label = b.label.padEnd(8);
  const col1  = `1.800 → ${minOdds}  (Δ ${marginOdds.toFixed(3)})`.padEnd(24);
  const col2  = `${(marginProb*100).toFixed(2)} p.p.`.padEnd(24);
  const col3  = `${marginKills.toFixed(2)} kills  (${marginKills < 0.5 ? "CRÍTICO" : marginKills < 1.0 ? "baixa" : marginKills < 2.0 ? "média" : "alta"})`;

  console.log(`│ ${label} │ ${col1} │ ${col2} │ ${col3.padEnd(38)} │`);
}
console.log("└──────────┴──────────────────────────┴──────────────────────────┴────────────────────────────────────────┘");

console.log();
console.log("Referência de movimento típico da casa durante o draft (estimativa):");
console.log("  Draft early (picks 1-4): +0.0 a +0.3 kills de ajuste de linha");
console.log("  Draft mid   (picks 5-7): +0.3 a +0.8 kills de ajuste de linha");
console.log("  Draft late  (picks 8-9): +0.5 a +1.2 kills de ajuste de linha");
console.log();
console.log("  → EV < 3%: MARGEM CRÍTICA — qualquer ajuste padrão da casa zera o edge");
console.log("  → EV 3-5%: MARGEM BAIXA  — sobrevive apenas se a casa não ajustou ainda");
console.log("  → EV ≥ 5%: MARGEM MÍNIMA — alinha com nosso threshold atual");
console.log("  → EV ≥ 7%: FOLGA REAL    — sobrevive a movimento moderado da casa");

// ─── BÔNUS: breakdown acumulado "EV ≥ X" para todas as faixas, picks 5-8 juntos
console.log("\n");
console.log("─".repeat(100));
console.log("BÔNUS — Curva acumulada: ROI de 'apostar tudo com EV ≥ X%' (picks 5-8)");
console.log("─".repeat(100));
console.log("  Threshold │   n    │  Hit%  │   ROI%  │ flag");
console.log("  " + "─".repeat(50));

// [0.010, 0.020, 0.030, 0.040, 0.050, 0.070, 0.100]
const cumulThresholds = EV_BUCKETS.map(b => b.min);
for (const thr of cumulThresholds) {
  let cumN = 0, cumGreen = 0, cumPnl = 0;
  for (let bi = 0; bi < EV_BUCKETS.length; bi++) {
    if (EV_BUCKETS[bi].min < thr) continue;
    for (let si = 0; si < STAGES.length; si++) {
      cumN     += cells[si][bi].n;
      cumGreen += cells[si][bi].green;
      cumPnl   += cells[si][bi].pnl;
    }
  }
  if (cumN === 0) { console.log(`  ≥${(thr*100).toFixed(0).padStart(3)}%      │   n/a  │   n/a  │    n/a  │`); continue; }
  const hit = (cumGreen / cumN * 100).toFixed(1);
  const roi = (cumPnl / cumN * 100).toFixed(1);
  const warn = cumN < 20 ? "⚠ n<20" : cumN < 50 ? "⚠ n<50" : "";
  const thrLabel = `≥${(thr*100).toFixed(0).padStart(3)}%`;
  console.log(`  ${thrLabel}      │ ${String(cumN).padStart(5)}  │ ${hit.padStart(5)}% │ ${(cumPnl/cumN*100 >= 0 ? "+" : "")}${roi.padStart(5)}%  │ ${warn}`);
}
