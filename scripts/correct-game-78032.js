"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const JSON_PATH = path.join(ROOT, "data", "games.json");
const JS_PATH = path.join(ROOT, "data", "games.js");
const GAME_ID = "78032";

const dataset = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
const game = dataset.games.find((entry) => String(entry.id) === GAME_ID);

if (!game) throw new Error(`Jogo ${GAME_ID} nao encontrado.`);

Object.assign(game, {
  killsA: 17,
  killsB: 10,
  totalKills: 27,
  picks: {
    teamA: ["KSante", "Aatrox", "Ryze", "Caitlyn", "Karma"],
    teamB: ["Rumble", "Zaahen", "Orianna", "Ashe", "Seraphine"],
  },
});

dataset.meta = dataset.meta || {};
dataset.meta.dataCorrections = dataset.meta.dataCorrections || [];
const correction = {
  correctedAt: new Date().toISOString(),
  id: GAME_ID,
  reason: "GOL.gg game 1 page duplicated game 2 stats; corrected from Sheep Esports structured match data",
  verificationUrl: "https://www.sheepesports.com/en/all/matches/CBLOL%2F2026%20Season%2FSplit%201%20Playoffs_Round%201_1",
};
const existing = dataset.meta.dataCorrections.findIndex((entry) => String(entry.id) === GAME_ID);
if (existing >= 0) dataset.meta.dataCorrections[existing] = correction;
else dataset.meta.dataCorrections.push(correction);

const json = `${JSON.stringify(dataset, null, 2)}\n`;
fs.writeFileSync(JSON_PATH, json, "utf8");
fs.writeFileSync(JS_PATH, `window.GOL_GAMES_DATA = ${JSON.stringify(dataset, null, 2)};\n`, "utf8");

console.log(`Jogo ${GAME_ID} corrigido: LOUD 17 x 10 Vivo Keyd Stars (27 kills).`);
