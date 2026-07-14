"use strict";
const fs = require("fs");

// ── carrega dados
const gamesText = fs.readFileSync(__dirname + "/../data/games.js", "utf8");
const mockWindow = {};
(function (window) { eval(gamesText); })(mockWindow); // eslint-disable-line no-eval
const allGames = mockWindow.GOL_GAMES_DATA.games;
const pickOrders = JSON.parse(fs.readFileSync(__dirname + "/../data/pick-orders.json", "utf8"));
const Model = require("../model-core.js");
const ROLES = Model.ROLES;

// ── constrói modelo
const cleanGames = allGames.filter(
  (g) => Model.TARGET_LEAGUES.includes(g.league) && Number.isFinite(g.totalKills)
);
const model = Model.buildModel(cleanGames);

// ── normal CDF (Abramowitz & Stegun, max err 7.5e-8)
function normalCdf(z) {
  const abs = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * abs);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * abs * abs) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

// ── EV para um lado a odds 1.80
function ev(prob) { return prob * 1.80 - 1; }

// ── formato de draft: posição global → {side, nthDoTime}
const INTERLEAVE = [
  { side: "blue", nth: 0 }, { side: "red", nth: 0 }, { side: "red", nth: 1 },
  { side: "blue", nth: 1 }, { side: "blue", nth: 2 },
  { side: "red", nth: 2 }, { side: "red", nth: 3 }, { side: "red", nth: 4 },
  { side: "blue", nth: 3 }, { side: "blue", nth: 4 },
];

function partialPicks(game, order, stage) {
  const tA = [null, null, null, null, null];
  const tB = [null, null, null, null, null];
  for (let i = 0; i < stage && i < 10; i++) {
    const pos = INTERLEAVE[i];
    const champ = pos.side === "blue" ? order.blue[pos.nth] : order.red[pos.nth];
    if (!champ) continue;
    const teamKey = pos.side === "blue" ? order.blueSide : (order.blueSide === "teamA" ? "teamB" : "teamA");
    const roleIdx = (game.picks[teamKey] || []).indexOf(champ);
    if (roleIdx < 0) continue;
    if (teamKey === "teamA") tA[roleIdx] = champ; else tB[roleIdx] = champ;
  }
  return { teamA: tA, teamB: tB };
}

// ── faixas de EV
const BRACKETS = [
  { label: "EV  5-10%", min: 0.05, max: 0.10 },
  { label: "EV 10-15%", min: 0.10, max: 0.15 },
  { label: "EV 15-20%", min: 0.15, max: 0.20 },
  { label: "EV   >20%", min: 0.20, max: Infinity },
];
const STAGES = [2, 4, 6, 8, 10];

// célula de acumulação: {n, greens}
function cell() { return { n: 0, greens: 0 }; }

// table[stage][bracketIdx] = cell
const table = {};
for (const s of STAGES) {
  table[s] = {};
  for (const b of BRACKETS) table[s][b.label] = cell();
  table[s]["EV    ≥5%"] = cell(); // agregado
}

const gamesById = Object.fromEntries(allGames.map((g) => [String(g.id), g]));
let processed = 0;

for (const id of Object.keys(pickOrders)) {
  const order = pickOrders[id];
  const game = gamesById[id];
  if (!game || !Number.isFinite(game.totalKills)) continue;

  // linha de mercado = fairLine da previsão pré-draft (referência fixa)
  const pre = model.predict(
    { ...game, picks: { teamA: [null,null,null,null,null], teamB: [null,null,null,null,null] } }, false
  );
  const marketLine = Model.fairLine(pre.prediction);
  const sigma = pre.sigma || 8.3;
  const actualSide = game.totalKills > marketLine ? "over" : "under";

  for (const stage of STAGES) {
    const pp = partialPicks(game, order, stage);
    const res = model.predict({ ...game, picks: pp }, true);
    const pred = res.prediction;

    const pOver  = 1 - normalCdf((marketLine - pred) / sigma);
    const pUnder = normalCdf((marketLine - pred) / sigma);
    const evOver  = ev(pOver);
    const evUnder = ev(pUnder);
    const bestEv   = Math.max(evOver, evUnder);
    const bestSide = evOver >= evUnder ? "over" : "under";
    const correct  = bestSide === actualSide;

    for (const b of BRACKETS) {
      if (bestEv >= b.min && bestEv < b.max) {
        table[stage][b.label].n++;
        if (correct) table[stage][b.label].greens++;
      }
    }
    if (bestEv >= 0.05) {
      table[stage]["EV    ≥5%"].n++;
      if (correct) table[stage]["EV    ≥5%"].greens++;
    }
  }
  processed++;
}

// ── helper de formatação
function roi(c) {
  if (!c.n) return "—";
  const pnl = c.greens * 0.80 - (c.n - c.greens) * 1;
  const r = pnl / c.n * 100;
  return (r >= 0 ? "+" : "") + r.toFixed(1) + "%";
}
function hit(c) {
  if (!c.n) return "—";
  return (c.greens / c.n * 100).toFixed(1) + "%";
}

console.log("Jogos analisados:", processed);
console.log("Linha de mercado: fairLine(previsão pré-draft) — referência fixa durante o draft");
console.log("Odds simuladas: 1.80 / 1.80\n");

// ── tabela principal
const BRACKET_ORDER = [...BRACKETS.map((b) => b.label), "EV    ≥5%"];
const stageLabel = (s) => s === 10 ? "PICK10" : `PICK ${s} `;

console.log("Estágio  | Faixa EV  |   n  | Hit%   | ROI");
console.log("---------|-----------|------|--------|--------");
for (const stage of STAGES) {
  let first = true;
  for (const bLabel of BRACKET_ORDER) {
    const c = table[stage][bLabel];
    const stagCol = first ? stageLabel(stage) : "        ";
    const sep = bLabel === "EV    ≥5%" ? "·········|···········|······|········|········" : "";
    if (sep) console.log(sep);
    console.log(`${stagCol} | ${bLabel} | ${String(c.n).padStart(4)} | ${hit(c).padStart(6)} | ${roi(c).padStart(7)}`);
    first = false;
  }
  console.log("---------|-----------|----- |--------|--------");
}

// ── comparação de ROI por estágio dentro de cada faixa de EV (visão transposta)
console.log("\n\n====== VISÃO TRANSPOSTA: ROI por faixa de EV em cada estágio ======\n");
const headerStages = STAGES.map((s) => stageLabel(s)).join(" | ");
console.log(`Faixa EV   | ${headerStages}`);
console.log("-----------" + STAGES.map(() => "|---------").join("") + "|");

for (const bLabel of BRACKET_ORDER) {
  const sep = bLabel === "EV    ≥5%" ? "\n" : "";
  const cells = STAGES.map((s) => {
    const c = table[s][bLabel];
    return roi(c).padStart(9);
  }).join(" | ");
  process.stdout.write(sep);
  console.log(`${bLabel} | ${cells} |`);
}

// ── qual estágio tem mais jogos com EV alto?
console.log("\n\n====== VOLUME: quantos jogos têm EV ≥ 5% em cada estágio ======\n");
console.log("Faixa EV   | " + STAGES.map((s) => stageLabel(s)).join(" | ") + " |");
console.log("-----------" + STAGES.map(() => "|---------").join("") + "|");
for (const bLabel of BRACKET_ORDER) {
  const cells = STAGES.map((s) => String(table[s][bLabel].n).padStart(9)).join(" | ");
  const sep = bLabel === "EV    ≥5%" ? "\n" : "";
  process.stdout.write(sep);
  console.log(`${bLabel} | ${cells} |`);
}
