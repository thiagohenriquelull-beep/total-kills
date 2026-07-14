"use strict";
const fs   = require("fs");
const path = require("path");
const FILE = path.resolve(__dirname, "../data/games.js");

const text = fs.readFileSync(FILE, "utf8");
const data = JSON.parse(text.replace(/^window\.GOL_GAMES_DATA\s*=\s*/, "").replace(/;\s*$/, ""));

data.meta.createdAt        = new Date().toISOString();
data.meta.collectorVersion = "expanded-2026-1+lckcl-1+update-games-v1";

// Recalcula contagens por liga no meta
const counts = {};
for (const g of data.games) counts[g.league] = (counts[g.league] || 0) + 1;
for (const entry of (data.meta.leagues || [])) {
  if (counts[entry.league] !== undefined) entry.games = counts[entry.league];
}
data.meta.totalGames = data.games.length;

fs.writeFileSync(FILE, "window.GOL_GAMES_DATA = " + JSON.stringify(data, null, 2) + ";\n");
console.log("games.js meta atualizado:");
console.log("  createdAt      :", data.meta.createdAt);
console.log("  collectorVersion:", data.meta.collectorVersion);
console.log("  totalGames     :", data.meta.totalGames);
for (const e of data.meta.leagues) console.log(`  ${e.league}: ${e.games}`);
