"use strict";
const fs = require("fs");

const gamesText = fs.readFileSync(__dirname + "/../data/games.js", "utf8");
const mockWindow = {};
(function (window) { eval(gamesText); })(mockWindow); // eslint-disable-line no-eval
const allGames = mockWindow.GOL_GAMES_DATA.games;
const pickOrders = JSON.parse(fs.readFileSync(__dirname + "/../data/pick-orders.json", "utf8"));
const Model = require("../model-core.js");
const ROLES = Model.ROLES;

const cleanGames = allGames.filter(
  (g) => Model.TARGET_LEAGUES.includes(g.league) && Number.isFinite(g.totalKills)
);
const model = Model.buildModel(cleanGames);

function normalCdf(z) {
  const abs = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * abs);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const pdf = Math.exp(-0.5 * abs * abs) / Math.sqrt(2 * Math.PI);
  const cdf = 1 - pdf * poly;
  return z >= 0 ? cdf : 1 - cdf;
}

const INTERLEAVE = [
  { side: "blue", nth: 0 }, { side: "red", nth: 0 }, { side: "red", nth: 1 },
  { side: "blue", nth: 1 }, { side: "blue", nth: 2 },
  { side: "red", nth: 2 }, { side: "red", nth: 3 }, { side: "red", nth: 4 },
  { side: "blue", nth: 3 }, { side: "blue", nth: 4 },
];

function buildPartial(game, order, upTo) {
  const tA = [null,null,null,null,null], tB = [null,null,null,null,null];
  for (let i = 0; i < upTo && i < 10; i++) {
    const pos = INTERLEAVE[i];
    const champ = pos.side === "blue" ? order.blue[pos.nth] : order.red[pos.nth];
    if (!champ) continue;
    const teamKey = pos.side === "blue" ? order.blueSide : (order.blueSide === "teamA" ? "teamB" : "teamA");
    const roleIdx = (game.picks[teamKey] || []).indexOf(champ);
    if (roleIdx >= 0) { if (teamKey === "teamA") tA[roleIdx] = champ; else tB[roleIdx] = champ; }
  }
  return { teamA: tA, teamB: tB };
}

const gamesById = Object.fromEntries(allGames.map((g) => [String(g.id), g]));

// ── coleta os jogos com EV ≥ 10% no pick 8
const premiumGames = [];

for (const id of Object.keys(pickOrders)) {
  const order = pickOrders[id];
  const game = gamesById[id];
  if (!game || !Number.isFinite(game.totalKills)) continue;

  const pre = model.predict(
    { ...game, picks: { teamA: [null,null,null,null,null], teamB: [null,null,null,null,null] } }, false
  );
  const marketLine = Model.fairLine(pre.prediction);
  const sigma = pre.sigma || 8.3;
  const actualSide = game.totalKills > marketLine ? "over" : "under";

  const pp8 = buildPartial(game, order, 8);
  const res8 = model.predict({ ...game, picks: pp8 }, true);
  const pred8 = res8.prediction;

  const pOver  = 1 - normalCdf((marketLine - pred8) / sigma);
  const pUnder = normalCdf((marketLine - pred8) / sigma);
  const evOver  = pOver  * 1.80 - 1;
  const evUnder = pUnder * 1.80 - 1;
  const bestEv   = Math.max(evOver, evUnder);
  const bestSide = evOver >= evUnder ? "over" : "under";

  if (bestEv < 0.10) continue;

  // picks já revelados no pick 8: B1 B2 B3 (blue) + R1 R2 R3 R4 R5 (red) — picks 9 e 10 são B4 B5
  const revealedAt8 = new Set();
  for (let i = 0; i < 8; i++) {
    const pos = INTERLEAVE[i];
    const champ = pos.side === "blue" ? order.blue[pos.nth] : order.red[pos.nth];
    if (champ) revealedAt8.add(champ);
  }

  // extrai JG e SUP do jogo completo, marca se já revelado no pick 8
  const roles = {};
  for (const teamKey of ["teamA", "teamB"]) {
    (game.picks[teamKey] || []).forEach((champ, idx) => {
      if (champ) roles[ROLES[idx]] = { champ, revealed: revealedAt8.has(champ) };
    });
  }

  premiumGames.push({
    id, game: game.game, league: game.league, date: game.date,
    marketLine, pred8: pred8.toFixed(2), bestEv, bestSide, actualSide,
    correct: bestSide === actualSide,
    jg: roles["JUNGLE"] || null,
    sup: roles["SUP"] || null,
    order,
  });
}

console.log("====== JOGOS PREMIUM: EV ≥ 10% NO PICK 8 ======");
console.log(`Total encontrado: ${premiumGames.length} jogos`);
const hits = premiumGames.filter((g) => g.correct).length;
console.log(`Acertos: ${hits}/${premiumGames.length} (${(hits/premiumGames.length*100).toFixed(1)}%)\n`);

// ── lista individual de jogos
console.log("Lista de jogos:");
console.log("─".repeat(90));
for (const g of premiumGames.sort((a, b) => b.bestEv - a.bestEv)) {
  const jgTag = g.jg ? `JG:${g.jg.champ}${g.jg.revealed ? "" : "*"}` : "JG:?";
  const supTag = g.sup ? `SUP:${g.sup.champ}${g.sup.revealed ? "" : "*"}` : "SUP:?";
  const ev = (g.bestEv * 100).toFixed(1) + "%";
  const res = g.correct ? "✓" : "✗";
  console.log(`${res} ${g.league.padEnd(6)} ${g.date} | EV=${ev.padStart(5)} ${g.bestSide.padEnd(5)} | ${jgTag.padEnd(22)} ${supTag.padEnd(22)} | ${g.game}`);
}

// ── frequência de JG e SUP (revelados no pick 8)
const jgCount = {}, supCount = {};
let jgRevCount = 0, supRevCount = 0;

for (const g of premiumGames) {
  if (g.jg) {
    const k = g.jg.champ;
    if (!jgCount[k]) jgCount[k] = { total: 0, revealed: 0, correct: 0 };
    jgCount[k].total++;
    if (g.jg.revealed) { jgCount[k].revealed++; jgRevCount++; }
    if (g.correct) jgCount[k].correct++;
  }
  if (g.sup) {
    const k = g.sup.champ;
    if (!supCount[k]) supCount[k] = { total: 0, revealed: 0, correct: 0 };
    supCount[k].total++;
    if (g.sup.revealed) { supCount[k].revealed++; supRevCount++; }
    if (g.correct) supCount[k].correct++;
  }
}

function printFreq(title, counts, total) {
  console.log("\n" + title);
  console.log("─".repeat(60));
  console.log("Campeão              | total | revelado pick8 | Acertos");
  console.log("─".repeat(60));
  Object.entries(counts)
    .sort((a, b) => b[1].total - a[1].total)
    .forEach(([champ, c]) => {
      console.log(
        champ.padEnd(20) + " |   " + c.total +
        "   |       " + c.revealed + "        |  " + c.correct + "/" + c.total
      );
    });
}

printFreq("▶ JUNGLE nos jogos premium", jgCount, premiumGames.length);
printFreq("▶ SUPPORT nos jogos premium", supCount, premiumGames.length);

// ── pares JG+SUP mais comuns
console.log("\n▶ PARES JG + SUP mais comuns nos jogos premium");
console.log("─".repeat(55));
const pairs = {};
for (const g of premiumGames) {
  if (!g.jg || !g.sup) continue;
  const k = `${g.jg.champ} + ${g.sup.champ}`;
  if (!pairs[k]) pairs[k] = { n: 0, correct: 0 };
  pairs[k].n++; if (g.correct) pairs[k].correct++;
}
Object.entries(pairs)
  .filter(([,v]) => v.n >= 2)
  .sort((a, b) => b[1].n - a[1].n)
  .forEach(([pair, v]) => console.log(`${pair.padEnd(35)} n=${v.n} | ${v.correct}/${v.n} acertos`));

console.log("\n* = pick ainda não revelado no pick 8 (B4 ou B5)");
