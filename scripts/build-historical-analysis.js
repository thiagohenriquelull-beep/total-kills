// Converte final-rule-backtest.csv → data/historical-analysis.js
// Campos extraídos: league, actual, line(simulada), postPrediction, evOver, evUnder, decisionSide, actualSide
"use strict";

const fs = require("fs");
const path = require("path");

const CSV_PATH = path.join(__dirname, "../data/final-rule-backtest.csv");
const OUT_PATH = path.join(__dirname, "../data/historical-analysis.js");
const JSON_OUT_PATH = path.join(__dirname, "../data/historical-analysis.json");

const text = fs.readFileSync(CSV_PATH, "utf8");
const rows = text.trim().split("\n");
const headers = rows[0].split(",");

function idx(name) {
  const i = headers.indexOf(name);
  if (i < 0) throw new Error(`Coluna não encontrada: ${name}`);
  return i;
}

const COL = {
  league: idx("league"),
  actual: idx("actual"),
  line: idx("line"),
  pred: idx("postPrediction"),
  evo: idx("evOver"),
  evu: idx("evUnder"),
  side: idx("decisionSide"),
  as: idx("actualSide"),
};

function num(s) {
  const v = parseFloat(s);
  return isFinite(v) ? v : null;
}

function round4(v) {
  return v === null ? null : Math.round(v * 10000) / 10000;
}

const games = [];
for (let i = 1; i < rows.length; i++) {
  const c = rows[i].split(",");
  const actual = num(c[COL.actual]);
  const line = num(c[COL.line]);
  const pred = num(c[COL.pred]);
  if (actual === null || line === null || pred === null) continue;

  games.push({
    l: c[COL.league].trim(),
    a: actual,
    ml: line,
    pred: round4(pred),
    evo: round4(num(c[COL.evo])),
    evu: round4(num(c[COL.evu])),
    s: c[COL.side].trim() || "",
    as: c[COL.as].trim() || "",
  });
}

// Metadados de auditoria (PROJETO-CONTEXTO.md secao 3.9): base usada na geracao
const sourceData = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/games.json"), "utf8"));

const payload = {
  generatedAt: new Date().toISOString(),
  methodology: "Walk-forward por liga (min 30 jogos treino). Linha simulada = linha justa pre-draft do modelo. Odds: 1.80/1.80.",
  sourceGames: sourceData.games.length,
  generatedFromGamesUpdatedAt: sourceData.meta?.updatedAt || sourceData.meta?.createdAt || null,
  backtestRows: rows.length - 1,
  count: games.length,
  games,
};

const output = `// Gerado por scripts/build-historical-analysis.js — nao editar manualmente
// Fonte: final-rule-backtest.csv | ${games.length} jogos | metodologia walk-forward (sem leakage)
window.GOL_HISTORICAL_ANALYSIS = ${JSON.stringify(payload)};
`;

fs.writeFileSync(OUT_PATH, output, "utf8");
fs.writeFileSync(JSON_OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
const kb = (output.length / 1024).toFixed(1);
console.log(`OK: ${OUT_PATH} + ${JSON_OUT_PATH} (${games.length} jogos, ${kb} KB)`);
