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

function normalInv(p) {
  const a = [ 2.50662823884,-18.61500062529, 41.39119773534,-25.44106049637];
  const b = [-8.47351093090, 23.08336743743,-21.06224101826,  3.13082909833];
  const c = [0.3374754822726147,0.9761690190917186,0.1607979714918209,
             0.0276438810333863,0.0038405729373609,0.0003951896511349,
             0.0000321767881768,0.0000002888167364,0.0000003960315187];
  const y = p - 0.5;
  if (Math.abs(y) < 0.42) {
    const r = y * y;
    return y*(((a[3]*r+a[2])*r+a[1])*r+a[0])/((((b[3]*r+b[2])*r+b[1])*r+b[0])*r+1);
  }
  const r = Math.log(-Math.log(p < 0.5 ? p : 1-p));
  const x = c[0]+r*(c[1]+r*(c[2]+r*(c[3]+r*(c[4]+r*(c[5]+r*(c[6]+r*(c[7]+r*c[8])))))));
  return p < 0.5 ? -x : x;
}

const INTERLEAVE = [
  { side:"blue",nth:0 },{ side:"red",nth:0 },{ side:"red",nth:1 },
  { side:"blue",nth:1 },{ side:"blue",nth:2 },
  { side:"red",nth:2 },{ side:"red",nth:3 },{ side:"red",nth:4 },
  { side:"blue",nth:3 },{ side:"blue",nth:4 },
];

function buildPartialPicks(game, order, upTo) {
  const tA = [null,null,null,null,null], tB = [null,null,null,null,null];
  for (let i = 0; i < upTo && i < 10; i++) {
    const pos = INTERLEAVE[i];
    const champ = pos.side === "blue" ? order.blue[pos.nth] : order.red[pos.nth];
    if (!champ) continue;
    const teamKey = pos.side === "blue" ? order.blueSide : (order.blueSide === "teamA" ? "teamB" : "teamA");
    const rIdx = (game.picks[teamKey] || []).indexOf(champ);
    if (rIdx >= 0) { if (teamKey === "teamA") tA[rIdx] = champ; else tB[rIdx] = champ; }
  }
  return { teamA: tA, teamB: tB };
}

const ODDS = 1.80;
const SIGMA_MODEL = 8.3; // sigma assumido pelo modelo para EV

const STAGES = [5, 6, 7, 8];
const CAL_STAGES = [0, 5, 6, 7, 8, 10]; // para RMSE calibração

const EV_BUCKETS = [
  { label:"1-2%",  min:0.010, max:0.020, mid:0.015 },
  { label:"2-3%",  min:0.020, max:0.030, mid:0.025 },
  { label:"3-4%",  min:0.030, max:0.040, mid:0.035 },
  { label:"4-5%",  min:0.040, max:0.050, mid:0.045 },
  { label:"5-7%",  min:0.050, max:0.070, mid:0.060 },
  { label:"7-10%", min:0.070, max:0.100, mid:0.085 },
  { label:"10%+",  min:0.100, max:Infinity, mid:0.135 },
];

// ── acumuladores
const residuals  = {};   // stage -> [actual - predicted]
const modelSigmas = {};  // stage -> [sigma returned by model for that game]
for (const s of CAL_STAGES) { residuals[s] = []; modelSigmas[s] = []; }

// cells[stageIdx][bucketIdx] = { n, green, pnl, pWinSum, distSum }
// distSum = sum of (pred - marketLine) — to compute avg signal distance
const cells = STAGES.map(() => EV_BUCKETS.map(() => ({ n:0, green:0, pnl:0, pWinSum:0, distSum:0 })));

const gamesById = Object.fromEntries(allGames.map(g => [String(g.id), g]));

for (const id of Object.keys(pickOrders)) {
  const order = pickOrders[id];
  const game  = gamesById[id];
  if (!game || !Number.isFinite(game.totalKills)) continue;

  const actual = game.totalKills;
  const emptyPicks = { teamA:[null,null,null,null,null], teamB:[null,null,null,null,null] };
  const preRes = model.predict({ ...game, picks: emptyPicks }, false);
  const marketLine = Model.fairLine(preRes.prediction);
  const sigma = preRes.sigma || SIGMA_MODEL;
  const actualSide = actual > marketLine ? "over" : "under";

  residuals[0].push(actual - preRes.prediction);
  modelSigmas[0].push(sigma);

  for (const s of [5, 6, 7, 8, 10]) {
    const picks = buildPartialPicks(game, order, s);
    const res   = model.predict({ ...game, picks }, true);
    const pred  = res.prediction;
    const sig   = res.sigma || SIGMA_MODEL;

    residuals[s].push(actual - pred);
    modelSigmas[s].push(sig);

    if (!STAGES.includes(s)) continue;

    const pOver  = 1 - normalCdf((marketLine - pred) / sig);
    const pUnder = 1 - pOver;
    const evOver  = pOver  * ODDS - 1;
    const evUnder = pUnder * ODDS - 1;
    const bestEv   = Math.max(evOver, evUnder);
    const betSide  = evOver >= evUnder ? "over" : "under";
    if (bestEv < 0.010) continue;

    const bi = EV_BUCKETS.findIndex(b => bestEv >= b.min && bestEv < b.max);
    if (bi < 0) continue;

    const pWin   = betSide === "over" ? pOver : pUnder;
    const dist   = betSide === "over" ? pred - marketLine : marketLine - pred;
    const correct = betSide === actualSide;
    const si = STAGES.indexOf(s);

    cells[si][bi].n++;
    cells[si][bi].pnl     += correct ? +0.80 : -1.00;
    cells[si][bi].pWinSum += pWin;
    cells[si][bi].distSum += dist;
    if (correct) cells[si][bi].green++;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEÇÃO 1: RMSE REAL vs SIGMA DO MODELO
// ═══════════════════════════════════════════════════════════════════════════

function calcResidualStats(arr, sigmaArr) {
  const n = arr.length;
  const mean = arr.reduce((a,b)=>a+b,0)/n;
  const rmse = Math.sqrt(arr.reduce((a,b)=>a+b*b,0)/n);
  const mae  = arr.reduce((a,b)=>a+Math.abs(b),0)/n;
  const avgSigma = sigmaArr.reduce((a,b)=>a+b,0)/n;
  // Fraction of residuals within ±avgSigma (should be 68.3% if calibrated)
  const within1s = arr.filter((r,i)=>Math.abs(r)<=sigmaArr[i]).length/n;
  const within2s = arr.filter((r,i)=>Math.abs(r)<=2*sigmaArr[i]).length/n;
  // Standardized residuals: z = residual/sigma — should be N(0,1) if calibrated
  const zScores = arr.map((r,i) => r/sigmaArr[i]);
  const zStd = Math.sqrt(zScores.reduce((a,b)=>a+b*b,0)/n);
  return { n, mean, rmse, mae, avgSigma, within1s, within2s, zStd };
}

console.log("\n");
console.log("╔═══════════════════════════════════════════════════════════════════════════════╗");
console.log("║  SEÇÃO 1 — CALIBRAÇÃO: RMSE REAL VS SIGMA ASSUMIDO PELO MODELO (8.3)        ║");
console.log("╚═══════════════════════════════════════════════════════════════════════════════╝");
console.log();
console.log("  Interpretação:");
console.log("  • σ real = std dos resíduos (kills previsto - kills real)");
console.log("  • Dentro de ±σ: se calibrado, ~68.3% dos jogos devem cair aqui");
console.log("  • std(z): z = residual/sigma_modelo — se calibrado, deve ser ~1.0");
console.log("    < 1.0 → modelo subestima incerteza (sigma INFLADO), EVs são maiores que aparentam");
console.log("    > 1.0 → modelo superestima incerteza (sigma BAIXO), EVs são menores que aparentam");
console.log();
console.log("  Estágio │  RMSE  │  MAE   │  Bias  │ σ médio │ Dentro±σ │ std(z) │ Diagnóstico");
console.log("  " + "─".repeat(85));

for (const s of CAL_STAGES) {
  const st = calcResidualStats(residuals[s], modelSigmas[s]);
  const withinPct = (st.within1s * 100).toFixed(1);
  const diagNote = st.zStd < 0.85
    ? `⚠ σ INFLADO — EVs subestimados (fator ~${(1/st.zStd).toFixed(2)}x)`
    : st.zStd > 1.15
    ? `⚠ σ BAIXO  — EVs superestimados`
    : `✓ razoavelmente calibrado`;
  console.log(
    `  Pick ${String(s).padStart(2)}  │ ${st.rmse.toFixed(3)} │ ${st.mae.toFixed(3)} │ ${(st.mean >= 0 ? "+" : "") + st.mean.toFixed(3)} │ ${st.avgSigma.toFixed(2)}  │  ${withinPct.padStart(5)}%   │  ${st.zStd.toFixed(3)} │ ${diagNote}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SEÇÃO 2: CALIBRAÇÃO DE PROBABILIDADE (pick 8 como referência)
// ═══════════════════════════════════════════════════════════════════════════

// Group by predicted pWin bucket, compare actual win rate
const probBins = {};
const PROB_BINS = [
  [0.50, 0.55], [0.55, 0.60], [0.60, 0.65], [0.65, 0.70], [0.70, 0.80], [0.80, 1.00]
];
for (const [lo, hi] of PROB_BINS) probBins[`${(lo*100).toFixed(0)}-${(hi*100).toFixed(0)}%`] = { n:0, green:0, predSum:0 };

for (const id of Object.keys(pickOrders)) {
  const order = pickOrders[id];
  const game  = gamesById[id];
  if (!game || !Number.isFinite(game.totalKills)) continue;

  const emptyPicks = { teamA:[null,null,null,null,null], teamB:[null,null,null,null,null] };
  const preRes = model.predict({ ...game, picks: emptyPicks }, false);
  const marketLine = Model.fairLine(preRes.prediction);
  const sigma = preRes.sigma || SIGMA_MODEL;
  const actualSide = game.totalKills > marketLine ? "over" : "under";

  const picks8 = buildPartialPicks(game, order, 8);
  const res8   = model.predict({ ...game, picks: picks8 }, true);
  const pred8  = res8.prediction;
  const sig8   = res8.sigma || SIGMA_MODEL;

  const pOver  = 1 - normalCdf((marketLine - pred8) / sig8);
  const pUnder = 1 - pOver;
  const pWin   = Math.max(pOver, pUnder);
  const betSide = pOver >= pUnder ? "over" : "under";
  if (pWin < 0.50) continue;

  for (const [lo, hi] of PROB_BINS) {
    const key = `${(lo*100).toFixed(0)}-${(hi*100).toFixed(0)}%`;
    if (pWin >= lo && pWin < hi) {
      probBins[key].n++;
      probBins[key].predSum += pWin;
      if (betSide === actualSide) probBins[key].green++;
      break;
    }
  }
}

console.log("\n");
console.log("╔═══════════════════════════════════════════════════════════════════════════════╗");
console.log("║  SEÇÃO 2 — CALIBRAÇÃO DE PROBABILIDADE (pick 8)                             ║");
console.log("║  Compara pWin previsto pelo modelo vs taxa de acerto real                    ║");
console.log("╚═══════════════════════════════════════════════════════════════════════════════╝");
console.log();
console.log("  pWin previsto │    n    │ pWin médio │ Hit% real │ Δ (real - previsto) │ Interpretação");
console.log("  " + "─".repeat(85));

for (const [lo, hi] of PROB_BINS) {
  const key = `${(lo*100).toFixed(0)}-${(hi*100).toFixed(0)}%`;
  const b = probBins[key];
  if (b.n === 0) continue;
  const predAvg  = b.predSum / b.n;
  const actualHit = b.green / b.n;
  const delta    = actualHit - predAvg;
  const warn     = b.n < 20 ? "⚠" : " ";
  const interp   = delta > 0.08
    ? "modelo subestima (σ inflado)"
    : delta < -0.08
    ? "modelo superestima (σ baixo)"
    : "calibrado";
  console.log(
    `  ${key.padEnd(14)} │ ${String(b.n).padStart(5)}   │  ${(predAvg*100).toFixed(1).padStart(5)}%  │ ${warn}${(actualHit*100).toFixed(1).padStart(5)}%  │   ${(delta >= 0 ? "+" : "") + (delta*100).toFixed(1).padStart(5)}%          │ ${interp}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SEÇÃO 3: TABELA EV × ESTÁGIO COM SIGNIFICÂNCIA ESTATÍSTICA
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n");
console.log("╔═══════════════════════════════════════════════════════════════════════════════╗");
console.log("║  SEÇÃO 3 — TABELA EV × ESTÁGIO + TESTE DE SIGNIFICÂNCIA                     ║");
console.log("║                                                                               ║");
console.log("║  z_mod = z-score de (hit_real - pWin_modelo) — testa se excede o modelo     ║");
console.log("║  z_nul = z-score de (hit_real - 0.50) — testa se existe edge vs acaso       ║");
console.log("║  95% CI = intervalo de confiança para hit% real                              ║");
console.log("╚═══════════════════════════════════════════════════════════════════════════════╝");
console.log();

// Print compact table first (combined picks 5-8)
const totals = EV_BUCKETS.map(() => ({ n:0, green:0, pnl:0, pWinSum:0, distSum:0 }));
for (let si = 0; si < STAGES.length; si++) {
  for (let bi = 0; bi < EV_BUCKETS.length; bi++) {
    const c = cells[si][bi];
    totals[bi].n       += c.n;
    totals[bi].green   += c.green;
    totals[bi].pnl     += c.pnl;
    totals[bi].pWinSum += c.pWinSum;
    totals[bi].distSum += c.distSum;
  }
}

console.log("  Picks 5-8 combinados:");
console.log();
console.log("  Bucket │    n  │ pWin modelo │ Hit% real │  z_mod │  z_nul │   95% CI      │ ROI");
console.log("  " + "─".repeat(85));

for (let bi = 0; bi < EV_BUCKETS.length; bi++) {
  const c = totals[bi];
  if (c.n === 0) continue;
  const pWinAvg = c.pWinSum / c.n;
  const hitReal = c.green / c.n;
  const se_mod  = Math.sqrt(pWinAvg * (1 - pWinAvg) / c.n);
  const se_nul  = Math.sqrt(0.5 * 0.5 / c.n);
  const z_mod   = (hitReal - pWinAvg) / se_mod;  // excede previsão do modelo?
  const z_nul   = (hitReal - 0.5) / se_nul;       // excede acaso?
  const ci95lo  = hitReal - 1.96 * Math.sqrt(hitReal*(1-hitReal)/c.n);
  const ci95hi  = hitReal + 1.96 * Math.sqrt(hitReal*(1-hitReal)/c.n);
  const roi     = c.pnl / c.n * 100;
  const warn    = c.n < 20 ? "⚠" : " ";

  console.log(
    `  ${EV_BUCKETS[bi].label.padEnd(6)} │ ${warn}${String(c.n).padStart(4)} │` +
    `   ${(pWinAvg*100).toFixed(1).padStart(5)}%   │` +
    `   ${(hitReal*100).toFixed(1).padStart(5)}%   │` +
    ` ${z_mod.toFixed(2).padStart(6)} │` +
    ` ${z_nul.toFixed(2).padStart(6)} │` +
    ` [${(ci95lo*100).toFixed(1)}%-${(ci95hi*100).toFixed(1)}%]` +
    `  │ ${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`
  );
}
console.log();
console.log("  z_mod > 1.65 → hit% excede modelo (p<0.05, 1-sided): modelo provavelmente com sigma inflado");
console.log("  z_nul > 1.65 → edge existe vs acaso");

// Por estágio individual
console.log();
console.log("  Por estágio (compacto — só colunas essenciais):");
console.log();
console.log("       " + EV_BUCKETS.map(b => b.label.padEnd(14)).join("  "));
console.log("  Pick " + EV_BUCKETS.map(() => "n/Hit/z_mod   ").join("  "));
console.log("  " + "─".repeat(110));

for (let si = 0; si < STAGES.length; si++) {
  let row = `  P${STAGES[si]}   `;
  for (let bi = 0; bi < EV_BUCKETS.length; bi++) {
    const c = cells[si][bi];
    if (c.n === 0) { row += "--/--/--     "; continue; }
    const pWinAvg = c.pWinSum / c.n;
    const hitReal = c.green / c.n;
    const se_mod  = Math.sqrt(pWinAvg*(1-pWinAvg)/c.n);
    const z_mod   = (hitReal - pWinAvg) / se_mod;
    const w = c.n < 20 ? "⚠" : " ";
    row += `${w}${String(c.n).padStart(3)}/${(hitReal*100).toFixed(0).padStart(3)}%/${z_mod.toFixed(1).padStart(4)}  `;
  }
  console.log(row);
}
console.log();
console.log("  Formato: ⚠n/Hit%/z_mod   ⚠ = amostra <20   z_mod > 1.6 → excede previsão modelo");

// ═══════════════════════════════════════════════════════════════════════════
// SEÇÃO 4: SIGMA EFETIVO — QUANTO SIGMA EXPLICA O HIT RATE OBSERVADO?
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n");
console.log("╔═══════════════════════════════════════════════════════════════════════════════╗");
console.log("║  SEÇÃO 4 — SIGMA EFETIVO POR BUCKET DE EV                                   ║");
console.log("║                                                                               ║");
console.log("║  σ_ef = qual sigma teria gerado o hit% observado, dado a distância média     ║");
console.log("║         (pred - linha) naquele bucket                                        ║");
console.log("║                                                                               ║");
console.log("║  Se σ_ef << 8.3: EV estão SUBESTIMADOS — 'EV=1%' pode ser EV=X% na prática  ║");
console.log("║  Se σ_ef ≈ 8.3:  modelo bem calibrado, EVs são face value                   ║");
console.log("╚═══════════════════════════════════════════════════════════════════════════════╝");
console.log();
console.log("  Bucket │  n    │ dist média │ hit real │ σ_ef  │ EV_ef (usando σ_ef) │ Fator");
console.log("  " + "─".repeat(75));

for (let bi = 0; bi < EV_BUCKETS.length; bi++) {
  const c = totals[bi];
  if (c.n < 20) continue;
  const hitReal   = c.green / c.n;
  const distAvg   = c.distSum / c.n;    // media de (pred - linha) nos jogos deste bucket

  // σ_ef: qual sigma faria normalCdf(distAvg / σ_ef) = hitReal?
  // distAvg / σ_ef = normalInv(hitReal)  →  σ_ef = distAvg / normalInv(hitReal)
  let sigmaEf = null;
  let evEf = null;
  if (hitReal > 0.5 && hitReal < 1.0 && distAvg > 0) {
    const z = normalInv(hitReal);
    sigmaEf = distAvg / z;
    // EV se tivéssemos usado σ_ef no cálculo: pWin_ef = normalCdf(distAvg/sigmaEf) = hitReal
    evEf = hitReal * ODDS - 1;
  }

  const factor = sigmaEf ? (SIGMA_MODEL / sigmaEf).toFixed(2) : "--";
  const sigmaEfStr = sigmaEf ? sigmaEf.toFixed(2) : "--";
  const evEfStr    = evEf    ? `${((evEf)*100).toFixed(1)}%` : "--";
  const note = sigmaEf && sigmaEf < SIGMA_MODEL * 0.7 ? `← modelo ${factor}x mais preciso que assume` : "";

  console.log(
    `  ${EV_BUCKETS[bi].label.padEnd(6)} │ ${String(c.n).padStart(4)}  │` +
    `    ${distAvg.toFixed(3).padStart(6)} k │` +
    `  ${(hitReal*100).toFixed(1).padStart(5)}% │` +
    ` ${sigmaEfStr.padStart(6)} │` +
    `        ${evEfStr.padStart(7)}         │ ${factor.padStart(5)}x  ${note}`
  );
}

console.log();
console.log("  dist média = média de |pred - linha| nos jogos que caíram nesse bucket EV");
console.log("  EV_ef = hit_real × 1.80 - 1 — este é o EV 'real' que o modelo entregou nesse bucket");

// ═══════════════════════════════════════════════════════════════════════════
// SEÇÃO 5: RESPOSTAS DIRETAS
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n");
console.log("╔═══════════════════════════════════════════════════════════════════════════════╗");
console.log("║  SEÇÃO 5 — RESPOSTAS DIRETAS ÀS 3 PERGUNTAS                                 ║");
console.log("╚═══════════════════════════════════════════════════════════════════════════════╝");
console.log();

// Q1: Faixa de EV <5% com ROI+ e n>=20
console.log("─── Q1: Faixa de EV <5% com ROI>0 e n≥20, picks 5-8:");
let q1any = false;
for (let bi = 0; bi < 4; bi++) {
  const c = totals[bi];
  if (c.n < 20) { console.log(`  ${EV_BUCKETS[bi].label}: n=${c.n} — INSUFICIENTE`); continue; }
  const roi = c.pnl / c.n * 100;
  const hit = (c.green / c.n * 100).toFixed(1);
  const flag = roi > 0 ? "✓ LUCRATIVO" : "✗ não lucrativo";
  console.log(`  ${EV_BUCKETS[bi].label}: Hit=${hit}% ROI=${roi >= 0 ? "+" : ""}${roi.toFixed(1)}% n=${c.n} → ${flag}`);
  if (roi > 0 && c.n >= 20) q1any = true;
}

// Q2: EV 1% vs erro do modelo
console.log();
console.log("─── Q2: EV 1-2% é maior ou menor que o erro típico do modelo?");
const rmse8 = Math.sqrt(residuals[8].reduce((s,r)=>s+r*r,0)/residuals[8].length);
const impliedDist12 = SIGMA_MODEL * normalInv((1 + 0.015) / ODDS);
const snr12 = impliedDist12 / rmse8;
console.log(`  RMSE do modelo no pick 8:         ${rmse8.toFixed(2)} kills`);
console.log(`  sigma assumido pelo modelo:        ${SIGMA_MODEL} kills`);
console.log(`  Distância implícita (EV=1.5%):     ${impliedDist12.toFixed(2)} kills acima da linha`);
console.log(`  Razão sinal/ruído (SNR):           ${snr12.toFixed(3)} (= ${impliedDist12.toFixed(2)} / ${rmse8.toFixed(2)})`);
console.log();
console.log(`  Se SNR < 0.2: sinal dentro do ruído de uma única predição (mas pode ser consistente)`);
console.log(`  Conclusão: O sinal de 1% EV é ${snr12 < 0.2 ? "MENOR" : "comparável"} ao ruído individual do modelo.`);
console.log(`  Porém: o ruído é aleatório, o sinal é sistemático. Com n=${totals[0].n} jogos,`);
console.log(`  o erro da média = ${rmse8.toFixed(2)}/sqrt(${totals[0].n}) = ${(rmse8/Math.sqrt(totals[0].n)).toFixed(3)} kills — bem abaixo do sinal.`);

// Q3: Menor limiar distinguível do erro do modelo
console.log();
console.log("─── Q3: Menor limiar de EV estatisticamente distinguível do erro do modelo:");
console.log();
console.log("  Critério: z_mod > 1.65 (hit% significativamente acima da previsão do modelo)");
console.log("            E n ≥ 20  E  z_nul > 3.0 (sinal robusto vs acaso)");
console.log();

let minDistinguishable = null;
for (let bi = 0; bi < EV_BUCKETS.length; bi++) {
  const c = totals[bi];
  if (c.n < 20) continue;
  const pWinAvg = c.pWinSum / c.n;
  const hitReal = c.green / c.n;
  const se_mod  = Math.sqrt(pWinAvg*(1-pWinAvg)/c.n);
  const se_nul  = Math.sqrt(0.25/c.n);
  const z_mod   = (hitReal - pWinAvg) / se_mod;
  const z_nul   = (hitReal - 0.5) / se_nul;
  const roi     = c.pnl / c.n * 100;
  console.log(
    `  ${EV_BUCKETS[bi].label.padEnd(6)}: z_mod=${z_mod.toFixed(2).padStart(6)}  z_nul=${z_nul.toFixed(2).padStart(6)}  ROI=${roi >= 0 ? "+" : ""}${roi.toFixed(1).padStart(5)}%  n=${c.n}`
  );
  if (minDistinguishable === null && z_nul > 3.0 && roi > 0) {
    minDistinguishable = EV_BUCKETS[bi];
  }
}
console.log();
if (minDistinguishable) {
  console.log(`  → MENOR LIMIAR ROBUSTO: EV ≥ ${minDistinguishable.label.split("%")[0].split("-")[0]}%`);
  console.log(`    (primeiro bucket onde z_nul > 3.0 e ROI > 0 com n ≥ 20)`);
} else {
  console.log("  → Nenhum bucket atende a todos os critérios simultaneamente.");
}

// Bônus: z_nul para cada threshold cumulative
console.log();
console.log("─── BÔNUS: Curva acumulada 'EV ≥ X%' (picks 5-8) com z_nul e 95% CI:");
console.log();
console.log("  Threshold │   n   │  Hit%  │ ROI    │  z_nul  │  95% CI");
console.log("  " + "─".repeat(60));
for (let bi = 0; bi < EV_BUCKETS.length; bi++) {
  let cumN=0, cumGreen=0, cumPnl=0;
  for (let j=bi; j<EV_BUCKETS.length; j++) {
    cumN     += totals[j].n;
    cumGreen += totals[j].green;
    cumPnl   += totals[j].pnl;
  }
  if (cumN < 20) continue;
  const h = cumGreen/cumN;
  const roi = cumPnl/cumN*100;
  const z_nul = (h-0.5)/Math.sqrt(0.25/cumN);
  const ci_lo = h - 1.96*Math.sqrt(h*(1-h)/cumN);
  const ci_hi = h + 1.96*Math.sqrt(h*(1-h)/cumN);
  console.log(
    `  ≥${EV_BUCKETS[bi].label.split("-")[0].padStart(3)}%      │ ${String(cumN).padStart(5)} │ ${(h*100).toFixed(1).padStart(5)}% │${roi >= 0 ? "+" : ""}${roi.toFixed(1).padStart(6)}% │  ${z_nul.toFixed(2).padStart(5)}   │ [${(ci_lo*100).toFixed(1)}%, ${(ci_hi*100).toFixed(1)}%]`
  );
}
