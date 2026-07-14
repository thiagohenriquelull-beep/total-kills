"use strict";
/**
 * expand-from-games.js
 * Regenera os expanded-{liga}.json a partir do games.js (fonte de verdade).
 * NÃO toca em games.js — só lê.
 */

const fs   = require("fs");
const path = require("path");

const ROOT       = path.resolve(__dirname, "..");
const GAMES_FILE = path.join(ROOT, "data", "games.js");
const DATA_DIR   = path.join(ROOT, "data");

const LEAGUES = ["LCK", "LCKCL", "LPL", "CBLOL", "LEC", "LCS"];

// Carrega games.js
const gamesText = fs.readFileSync(GAMES_FILE, "utf8");
const mockWin = {};
(function(window) { eval(gamesText); })(mockWin); // eslint-disable-line no-eval
const sourceData = mockWin.GOL_GAMES_DATA;
const allGames   = sourceData.games.filter(g => Number.isFinite(g.totalKills));

console.log(`Fonte: games.js — ${allGames.length} jogos`);

for (const league of LEAGUES) {
  const leagueGames = allGames.filter(g => g.league === league);

  // Reconstrói o meta no mesmo formato dos expanded-*.json originais
  const meta = {
    source:           sourceData.meta.source || "GOL logged session",
    createdAt:        new Date().toISOString(),
    collectorVersion: "expand-from-games-v1",
    league,
    season:           "S16",
    seasonYear:       2026,
    candidates:       leagueGames.length,
    target:           leagueGames.length,
    complete:         true,
    games:            leagueGames.length,
    modelExcludes:    ["duration", "side", "bans"],
  };

  const outFile = path.join(DATA_DIR, `expanded-${league}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ meta, games: leagueGames }, null, 2), "utf8");
  console.log(`  expanded-${league}.json → ${leagueGames.length} jogos`);
}

console.log("Done.");
