const fs = require("fs");
const path = require("path");
const Model = require("../model-core.js");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const LEAGUES = Model.TARGET_LEAGUES;
const TESTS = 15;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function loadGames() {
  const games = [];
  for (const league of LEAGUES) games.push(...readJson(path.join(DATA_DIR, `expanded-${league}.json`)).games);
  return games;
}

function evaluate(options) {
  const games = loadGames();
  const rows = [];
  for (const league of LEAGUES) {
    const chronological = games.filter((game) => game.league === league).sort(Model.sortRecent).reverse();
    const start = chronological.length - TESTS;
    for (let index = start; index < chronological.length; index++) {
      const game = chronological[index];
      const train = chronological.slice(0, index);
      const model = Model.buildModel(train, options);
      rows.push({ actual: game.totalKills, pre: model.predict(game, false).prediction, post: model.predict(game, true).prediction });
    }
  }
  const stats = (phase) => {
    const signed = rows.map((row) => row[phase] - row.actual);
    const abs = signed.map(Math.abs);
    return {
      mae: mean(abs),
      bias: mean(signed),
      within3: abs.filter((error) => error <= 3).length / abs.length,
      within5: abs.filter((error) => error <= 5).length / abs.length,
    };
  };
  return { options, pre: stats("pre"), post: stats("post") };
}

function main() {
  const results = [];
  for (const leagueRecentWeight of [0, 0.15, 0.3, 0.45]) {
    for (const offsetWeight of [0, 0.45, 0.75]) {
      for (const globalOffsetWeight of [0, 0.45, 0.8, 1.15]) {
        for (const teamWeight of [0.15, 0.25, 0.35]) {
          for (const patchWeight of [0, 0.06]) {
            for (const draftWeight of [0, 0.2, 0.4]) {
              const options = {
                ...Model.DEFAULT_OPTIONS,
                leagueRecentWeight,
                offsetWeight,
                globalOffsetWeight,
                teamWeight,
                patchWeight,
                draftWeight,
                leagueHalfLife: 18,
                teamHalfLife: 9,
                champWeight: 1,
              };
              const result = evaluate(options);
              result.score = result.post.mae + Math.abs(result.post.bias) * 0.55 - result.post.within3 * 0.85;
              results.push(result);
            }
          }
        }
      }
    }
  }
  results.sort((a, b) => a.score - b.score);
  fs.writeFileSync(path.join(DATA_DIR, "walkforward-tuning-results.json"), JSON.stringify(results.slice(0, 40), null, 2), "utf8");
  console.log(JSON.stringify(results.slice(0, 15).map((r) => ({
    score: Number(r.score.toFixed(4)),
    preMae: Number(r.pre.mae.toFixed(3)),
    preBias: Number(r.pre.bias.toFixed(3)),
    postMae: Number(r.post.mae.toFixed(3)),
    postBias: Number(r.post.bias.toFixed(3)),
    postWithin3: Number(r.post.within3.toFixed(3)),
    postWithin5: Number(r.post.within5.toFixed(3)),
    options: {
      leagueRecentWeight: r.options.leagueRecentWeight,
      offsetWeight: r.options.offsetWeight,
      globalOffsetWeight: r.options.globalOffsetWeight,
      teamWeight: r.options.teamWeight,
      patchWeight: r.options.patchWeight,
      draftWeight: r.options.draftWeight,
    },
  })), null, 2));
}

main();
