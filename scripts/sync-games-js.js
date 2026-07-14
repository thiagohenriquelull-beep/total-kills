"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const jsonPath = path.join(root, "data", "games.json");
const jsPath = path.join(root, "data", "games.js");
const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

if (!Array.isArray(data.games)) throw new Error("data/games.json sem array games");
fs.writeFileSync(jsPath, `window.GOL_GAMES_DATA = ${JSON.stringify(data, null, 2)};\n`, "utf8");
console.log(`games.js sincronizado com games.json: ${data.games.length} jogos.`);
