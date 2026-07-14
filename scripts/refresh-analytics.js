// Regenera a cadeia de analytics inteira, em ordem, abortando na primeira falha.
// Cadeia (PROJETO-CONTEXTO.md secao 3.9):
//   expand-from-games -> backtest-final-rule -> build-historical-analysis -> check-state
// Uso: node scripts/refresh-analytics.js  (ou: npm run refresh)
"use strict";
const { spawnSync } = require("child_process");
const path = require("path");

const STEPS = [
  "expand-from-games.js",
  "backtest-final-rule.js",
  "build-historical-analysis.js",
  "check-state.js",
];

for (const step of STEPS) {
  const file = path.join(__dirname, step);
  console.log(`\n=== ${step} ===`);
  const result = spawnSync(process.execPath, [file], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\nFALHA em ${step} (exit ${result.status}). Cadeia interrompida.`);
    process.exit(result.status || 1);
  }
}

console.log("\nCadeia de analytics regenerada com sucesso.");
