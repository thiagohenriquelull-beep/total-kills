"use strict";
const fs   = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

// 1. games.js
const gamesText = fs.readFileSync(path.join(ROOT, "data", "games.js"), "utf8");
const gamesData = JSON.parse(gamesText.replace(/^window\.GOL_GAMES_DATA\s*=\s*/, "").replace(/;\s*$/, ""));
console.log("── games.js ────────────────────────────────────────");
console.log("  Jogos       :", gamesData.games.length);
console.log("  createdAt   :", gamesData.meta.createdAt);
console.log("  version     :", gamesData.meta.collectorVersion);

// 2. historical-analysis.js
const haPath = path.join(ROOT, "data", "historical-analysis.js");
if (fs.existsSync(haPath)) {
  const haStat = fs.statSync(haPath);
  const haText = fs.readFileSync(haPath, "utf8");

  // Conta entradas de jogo — cada jogo tem "pred" field
  const predCount = (haText.match(/"pred"\s*:/g) || []).length;
const generatedMatch = haText.match(/"generatedAt"\s*:\s*"([^"]+)"/);
  const srcMatch  = haText.match(/"sourceGames"\s*:\s*(\d+)/);

  console.log("\n── historical-analysis.js ──────────────────────────");
  console.log("  Modificado  :", haStat.mtime.toISOString());
  console.log("  Tamanho     :", Math.round(haStat.size / 1024) + " KB");
  console.log("  Entradas (pred:):", predCount);
console.log("  generatedAt :", generatedMatch ? generatedMatch[1] : "não encontrado");
  console.log("  sourceGames :", srcMatch ? srcMatch[1] : "não encontrado");
} else {
  console.log("\n── historical-analysis.js ──────────────────────────");
  console.log("  ARQUIVO NAO EXISTE");
}

// 3. Como o app usa os dados
console.log("\n── Como o app carrega os dados ─────────────────────");
const htmlText = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const scriptTags = (htmlText.match(/<script\b[^>]*src="[^"]*"[^>]*>/g) || []);
for (const tag of scriptTags) {
  const srcMatch = tag.match(/src="([^"]+)"/);
  if (srcMatch) console.log("  <script>:", srcMatch[1]);
}

// 4. Verifica se historical-analysis.js cobre os mesmos jogos que games.js
if (fs.existsSync(haPath)) {
  const haText  = fs.readFileSync(haPath, "utf8");
  // Pega a data mais recente das previsões no historical-analysis
  const dateMatches = haText.match(/"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/g) || [];
  const dates = dateMatches.map(m => m.match(/"(\d{4}-\d{2}-\d{2})"/)[1]).sort();
  if (dates.length) {
    console.log("\n── Datas cobertas em historical-analysis.js ────────");
    console.log("  Mais antiga :", dates[0]);
    console.log("  Mais recente:", dates[dates.length - 1]);
    console.log("  Vs games.js mais recente:", gamesData.games.map(g => g.date).sort().pop());
  }
}
