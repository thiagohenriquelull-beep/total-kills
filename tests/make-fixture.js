// Gera tests/fixtures/games-fixture.json: subconjunto CONGELADO do dataset
// usado pelos golden tests. NAO re-rodar apos atualizar o dataset — o fixture
// deve permanecer identico para que os goldens continuem validos.
// So re-rode se decidir deliberadamente re-basear os testes (e recapture os goldens).
const fs = require("fs");
const path = require("path");

const data = require(path.join(__dirname, "..", "data", "games.json"));
const PER_LEAGUE = 40;

const byLeague = new Map();
for (const game of data.games) {
  if (!byLeague.has(game.league)) byLeague.set(game.league, []);
  byLeague.get(game.league).push(game);
}

const fixture = [];
for (const league of [...byLeague.keys()].sort()) {
  const games = byLeague
    .get(league)
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id))
    .slice(0, PER_LEAGUE);
  fixture.push(...games);
}

const outDir = path.join(__dirname, "fixtures");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "games-fixture.json"),
  JSON.stringify({ note: "Fixture congelado para golden tests — nao regenerar junto com o dataset.", games: fixture }, null, 1)
);
console.log(`fixture: ${fixture.length} jogos (${PER_LEAGUE} por liga, ids mais antigos)`);
