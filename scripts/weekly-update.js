// Atualizacao semanal completa em um comando: coleta -> valida -> merge ->
// testes -> analytics. Cada etapa aborta o fluxo em caso de falha; o merge
// so acontece se a validacao passar (fluxo seguro da secao 3.7).
// Uso: node scripts/weekly-update.js          (ou: npm run update)
//      node scripts/weekly-update.js --skip-collect   (usa jogos-novos.json ja existente)
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NEW_GAMES = path.join(ROOT, "data", "jogos-novos.json");
const HOLES = path.join(ROOT, "data", "buracos-historicos.json");
const skipCollect = process.argv.includes("--skip-collect");

function run(label, args, options = {}) {
  console.log(`\n════ ${label} ════`);
  const result = spawnSync(process.execPath, args, { stdio: "inherit", cwd: ROOT, ...options });
  if (result.status !== 0) {
    console.error(`\nFALHA em "${label}" (exit ${result.status}). Atualizacao interrompida.`);
    process.exit(result.status || 1);
  }
}

// 1. Coleta (gera data/jogos-novos.json sem tocar no dataset)
if (!skipCollect) {
  run("Coleta gol.gg", [path.join(__dirname, "collect-new-games-http.js")]);
} else {
  console.log("Coleta pulada (--skip-collect); usando data/jogos-novos.json existente.");
}

// 2. Ha jogos novos?
const collected = fs.existsSync(NEW_GAMES) ? JSON.parse(fs.readFileSync(NEW_GAMES, "utf8")) : { games: [] };
if (!(collected.games || []).length) {
  console.log("\nNenhum jogo novo encontrado. Dataset ja esta atualizado.");
  if (fs.existsSync(HOLES)) {
    const holes = JSON.parse(fs.readFileSync(HOLES, "utf8"));
    console.log(`ATENCAO: ${holes.games.length} buraco(s) historico(s) em data/buracos-historicos.json — revisar e mergear manualmente se fizer sentido.`);
  }
  process.exit(0);
}
console.log(`\n${collected.games.length} jogos novos coletados.`);

// 3. Merge seguro (valida checklist 3.8, faz backup, mergeia, regenera games.js)
run("Merge seguro", [path.join(__dirname, "merge-new-games.js"), NEW_GAMES]);

// 4. Testes (golden do modelo + sanidade do dataset pos-merge)
run("Testes", ["--test", path.join(ROOT, "tests", "model-core.test.js"), path.join(ROOT, "tests", "dataset.test.js")]);

// 5. Cadeia de analytics
run("Analytics", [path.join(__dirname, "refresh-analytics.js")]);

console.log("\n════ Atualizacao semanal concluida com sucesso ════");
if (fs.existsSync(HOLES)) {
  const holes = JSON.parse(fs.readFileSync(HOLES, "utf8"));
  console.log(`ATENCAO: ${holes.games.length} buraco(s) historico(s) em data/buracos-historicos.json — revisar e mergear manualmente se fizer sentido.`);
}
console.log("Se o projeto estiver em git, considere commitar: git add -A && git commit");
