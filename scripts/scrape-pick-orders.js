"use strict";
const fs = require("fs");
const https = require("https");

// ── carrega games.js via eval com window mockado
const gamesText = fs.readFileSync(__dirname + "/../data/games.js", "utf8");
const mockWindow = {};
(function (window) { eval(gamesText); })(mockWindow); // eslint-disable-line no-eval
const allGames = mockWindow.GOL_GAMES_DATA.games;

// ── arquivo de saída incremental
const OUT = __dirname + "/../data/pick-orders.json";
const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const done = new Set(Object.keys(existing));
console.log("Jogos já processados:", done.size, "| Total:", allGames.length);

// ── filtra apenas jogos com sourceUrl ainda não processados
const queue = allGames.filter((g) => g.sourceUrl && !done.has(String(g.id)));
console.log("Na fila:", queue.length, "jogos\n");

// ── HTTP fetch com timeout
function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 12000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
  });
}

// ── extrai picks [blue[], red[]] do HTML da página
function parsePickOrder(html) {
  // cada row de picks: col-2 (label + opcional first.png) + col-10 (ícones dos campeões)
  const ROW_RE = /class="col-2">Picks([\s\S]*?)<\/div>\s*<div class="col-10">([\s\S]*?)<\/div>\s*<\/div>/g;
  const CHAMP_RE = /alt='([^']+)'\s+src='[^']*champions_icon/g;

  const rows = [];
  let m;
  while ((m = ROW_RE.exec(html)) !== null) {
    const isBlue = m[1].includes("first.png");
    const content = m[2];
    const picks = [];
    let cm;
    while ((cm = CHAMP_RE.exec(content)) !== null) picks.push(cm[1]);
    if (picks.length === 5) rows.push({ isBlue, picks });
  }

  if (rows.length < 2) return null;

  // pode haver mais de 2 rows se a página tiver bans também — garante exactly blue + red de picks
  const blue = rows.find((r) => r.isBlue);
  const red = rows.find((r) => !r.isBlue);
  if (!blue || !red) return null;

  // ordem de draft padrão competitivo: B1 R1 R2 B2 B3 R3 R4 R5 B4 B5
  return {
    blue: blue.picks,
    red: red.picks,
    // sequência global pick 1..10
    seq: [
      blue.picks[0], red.picks[0], red.picks[1],
      blue.picks[1], blue.picks[2],
      red.picks[2], red.picks[3], red.picks[4],
      blue.picks[3], blue.picks[4],
    ],
  };
}

// ── identifica qual time (teamA/teamB) é azul/vermelho comparando conjuntos de campeões
function matchTeams(game, parsedPicks) {
  const setA = new Set(game.picks.teamA.map((c) => c.toLowerCase()));
  const setB = new Set(game.picks.teamB.map((c) => c.toLowerCase()));
  const blueSet = new Set(parsedPicks.blue.map((c) => c.toLowerCase()));

  const matchA = [...blueSet].filter((c) => setA.has(c)).length;
  const matchB = [...blueSet].filter((c) => setB.has(c)).length;

  if (matchA >= 4) return { blueSide: "teamA", redSide: "teamB" };
  if (matchB >= 4) return { blueSide: "teamB", redSide: "teamA" };
  return null; // não conseguiu casar
}

// ── loop principal
let success = 0, fail = 0, skip = 0;

async function run() {
  for (let i = 0; i < queue.length; i++) {
    const game = queue[i];
    process.stdout.write(`[${i + 1}/${queue.length}] ${game.id} ${game.game} ... `);

    try {
      const html = await fetchHtml(game.sourceUrl);
      const parsed = parsePickOrder(html);

      if (!parsed) {
        console.log("SKIP (sem picks válidos)");
        skip++;
        continue;
      }

      const teams = matchTeams(game, parsed);
      if (!teams) {
        console.log("SKIP (mismatch de campeões)");
        skip++;
        continue;
      }

      existing[game.id] = {
        id: game.id,
        game: game.game,
        league: game.league,
        date: game.date,
        blueSide: teams.blueSide,
        blue: parsed.blue,   // B1..B5 em ordem
        red: parsed.red,     // R1..R5 em ordem
        seq: parsed.seq,     // pick 1..10 intercalado
      };

      console.log("OK — " + parsed.seq.join(", "));
      success++;
    } catch (err) {
      console.log("ERRO: " + err.message);
      fail++;
    }

    // salva a cada 50 jogos (incremental) e também no último
    if ((i + 1) % 50 === 0 || i === queue.length - 1) {
      fs.writeFileSync(OUT, JSON.stringify(existing, null, 2));
      console.log(`  → salvo. OK=${success} FAIL=${fail} SKIP=${skip}`);
    }

    // throttle: 900ms entre requests para não sobrecarregar o gol.gg
    if (i < queue.length - 1) await new Promise((r) => setTimeout(r, 900));
  }

  fs.writeFileSync(OUT, JSON.stringify(existing, null, 2));
  console.log(`\nFinalizado. OK=${success} | FAIL=${fail} | SKIP=${skip}`);
  console.log("Arquivo salvo em data/pick-orders.json");
}

run().catch(console.error);
