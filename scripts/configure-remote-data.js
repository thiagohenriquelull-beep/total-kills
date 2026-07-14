"use strict";

const fs = require("fs");
const path = require("path");

const repository = String(process.argv[2] || "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  console.error("Uso: node scripts/configure-remote-data.js USUARIO/REPOSITORIO");
  process.exit(1);
}

const base = `https://raw.githubusercontent.com/${repository}/live-data`;
const output = `// Gerado por scripts/configure-remote-data.js\nwindow.GOL_REMOTE_DATA = {\n  gamesUrl: "${base}/games.json",\n  historicalUrl: "${base}/historical-analysis.json",\n};\n`;
fs.writeFileSync(path.resolve(__dirname, "..", "remote-config.js"), output, "utf8");
console.log(`Base remota configurada: ${base}`);
