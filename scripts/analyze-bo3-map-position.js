const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const IN_FILE = path.join(DATA_DIR, "bo3-2025-2026-map-position-raw.json");
const OUT_JSON = path.join(DATA_DIR, "bo3-2025-2026-map-position-analysis.json");
const OUT_MD = path.join(DATA_DIR, "bo3-2025-2026-map-position-analysis.md");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function variance(values) {
  if (values.length < 2) return null;
  const avg = mean(values);
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
}

function std(values) {
  const v = variance(values);
  return v === null ? null : Math.sqrt(v);
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * abs);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-abs * abs);
  return sign * y;
}

function normalCdf(x) {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function pNormalTwoSided(z) {
  return 2 * (1 - normalCdf(Math.abs(z)));
}

function welchTest(aValues, bValues) {
  if (aValues.length < 2 || bValues.length < 2) return { nA: aValues.length, nB: bValues.length, diff: null, p: null, ci: { low: null, high: null } };
  const ma = mean(aValues);
  const mb = mean(bValues);
  const va = variance(aValues);
  const vb = variance(bValues);
  const se = Math.sqrt(va / aValues.length + vb / bValues.length);
  const diff = ma - mb;
  const z = diff / se;
  const half = 1.96 * se;
  return { nA: aValues.length, nB: bValues.length, diff, p: pNormalTwoSided(z), ci: { low: diff - half, high: diff + half } };
}

function pairedTest(pairs) {
  const diffs = pairs.map(([a, b]) => a - b).filter(Number.isFinite);
  if (diffs.length < 2) return { n: diffs.length, diff: null, p: null, ci: { low: null, high: null } };
  const avg = mean(diffs);
  const se = std(diffs) / Math.sqrt(diffs.length);
  const z = avg / se;
  const half = 1.96 * se;
  return { n: diffs.length, diff: avg, p: pNormalTwoSided(z), ci: { low: avg - half, high: avg + half } };
}

function groupBy(items, getKey) {
  const out = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

function seriesKey(game) {
  if (game.seriesKey) return game.seriesKey;
  return [game.season, game.league, game.tournament, game.week, game.matchupKey].join("||");
}

function annotateGames(raw) {
  const seriesByKey = new Map(raw.series.map((series) => [series.key, series]));
  return raw.games.map((game) => {
    const key = seriesKey(game);
    const series = seriesByKey.get(key);
    return {
      ...game,
      seriesKey: key,
      seriesLength: game.seriesLength || series?.maxMap || game.mapNumber,
      isDecisiveMap: game.seriesLength ? game.mapNumber === game.seriesLength : (series ? game.mapNumber === series.maxMap : false),
      scoreSamples: series?.scoreSamples || game.scoreSamples || [],
    };
  });
}

function r(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function fmt(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "--";
}

function pct(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "--";
}

function pFmt(value) {
  if (!Number.isFinite(value)) return "--";
  if (value < 0.001) return "<0.001";
  return value.toFixed(3);
}

function positionTable(games) {
  const allMean = mean(games.map((game) => game.totalKills));
  const seriesMeans = new Map([...groupBy(games, (game) => game.seriesKey).entries()].map(([key, group]) => [key, mean(group.map((game) => game.totalKills))]));
  const table = {};
  for (let map = 1; map <= 3; map += 1) {
    const rows = games.filter((game) => game.mapNumber === map);
    const kills = rows.map((game) => game.totalKills);
    const centered = rows.map((game) => game.totalKills - (seriesMeans.get(game.seriesKey) ?? game.totalKills));
    table[map] = {
      games: rows.length,
      mean: r(mean(kills)),
      median: r(median(kills)),
      std: r(std(kills)),
      aboveMean: rows.length ? r(rows.filter((game) => game.totalKills > allMean).length / rows.length, 4) : null,
      centeredEffect: r(mean(centered)),
      decisiveGames: rows.filter((game) => game.isDecisiveMap).length,
    };
  }
  return { allMean: r(allMean), table };
}

function fullThreeComparison(games) {
  const series = [...groupBy(games, (game) => game.seriesKey).values()].filter((group) => {
    const maps = new Set(group.map((game) => game.mapNumber));
    return maps.has(1) && maps.has(2) && maps.has(3);
  });
  const rows = {};
  for (let map = 1; map <= 3; map += 1) {
    const values = [];
    const centered = [];
    for (const group of series) {
      const byMap = Object.fromEntries(group.map((game) => [game.mapNumber, game]));
      const seriesMean = mean(group.map((game) => game.totalKills));
      values.push(byMap[map].totalKills);
      centered.push(byMap[map].totalKills - seriesMean);
    }
    rows[map] = {
      games: values.length,
      mean: r(mean(values)),
      median: r(median(values)),
      std: r(std(values)),
      centeredEffect: r(mean(centered)),
    };
  }
  const pairs = {
    "2vs1": pairedTest(series.map((group) => {
      const byMap = Object.fromEntries(group.map((game) => [game.mapNumber, game.totalKills]));
      return [byMap[2], byMap[1]];
    })),
    "3vs1": pairedTest(series.map((group) => {
      const byMap = Object.fromEntries(group.map((game) => [game.mapNumber, game.totalKills]));
      return [byMap[3], byMap[1]];
    })),
    "3vs2": pairedTest(series.map((group) => {
      const byMap = Object.fromEntries(group.map((game) => [game.mapNumber, game.totalKills]));
      return [byMap[3], byMap[2]];
    })),
  };
  return { series: series.length, rows, pairs };
}

function contextComparison(games) {
  const decisive = games.filter((game) => game.isDecisiveMap).map((game) => game.totalKills);
  const nonDecisive = games.filter((game) => !game.isDecisiveMap).map((game) => game.totalKills);
  const map2Decisive = games.filter((game) => game.mapNumber === 2 && game.isDecisiveMap).map((game) => game.totalKills);
  const map2Non = games.filter((game) => game.mapNumber === 2 && !game.isDecisiveMap).map((game) => game.totalKills);
  return {
    decisiveMean: r(mean(decisive)),
    nonDecisiveMean: r(mean(nonDecisive)),
    decisiveVsNon: welchTest(decisive, nonDecisive),
    map2DecisiveMean: r(mean(map2Decisive)),
    map2NonDecisiveMean: r(mean(map2Non)),
    map2DecisiveVsNon: welchTest(map2Decisive, map2Non),
  };
}

function trendLabel(effect) {
  if (!Number.isFinite(effect)) return "sem amostra";
  if (effect >= 1.25) return "OVER";
  if (effect >= 0.6) return "OVER leve";
  if (effect <= -1.25) return "UNDER";
  if (effect <= -0.6) return "UNDER leve";
  return "NEUTRO";
}

function buildScope(games) {
  const positions = positionTable(games);
  return {
    series: groupBy(games, (game) => game.seriesKey).size,
    games: games.length,
    mean: positions.allMean,
    positions: positions.table,
    fullThree: fullThreeComparison(games),
    tests: {
      map2vs1: welchTest(games.filter((game) => game.mapNumber === 2).map((game) => game.totalKills), games.filter((game) => game.mapNumber === 1).map((game) => game.totalKills)),
      map3vs1: welchTest(games.filter((game) => game.mapNumber === 3).map((game) => game.totalKills), games.filter((game) => game.mapNumber === 1).map((game) => game.totalKills)),
      map3vs2: welchTest(games.filter((game) => game.mapNumber === 3).map((game) => game.totalKills), games.filter((game) => game.mapNumber === 2).map((game) => game.totalKills)),
    },
    context: contextComparison(games),
  };
}

function tablePositionsMd(positions) {
  const lines = [];
  lines.push("| Mapa | Jogos | Media | Mediana | Desv.Pad | > media MD3 | Efeito dentro da serie | Decisivos | Tendencia |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  for (let map = 1; map <= 3; map += 1) {
    const row = positions[map];
    lines.push(`| ${map} | ${row.games} | ${fmt(row.mean)} | ${fmt(row.median)} | ${fmt(row.std)} | ${pct(row.aboveMean)} | ${fmt(row.centeredEffect)} | ${row.decisiveGames} | ${trendLabel(row.centeredEffect)} |`);
  }
  return lines.join("\n");
}

function tableFullThreeMd(fullThree) {
  const lines = [];
  lines.push(`Series que chegaram ao mapa 3: ${fullThree.series}`);
  lines.push("");
  lines.push("| Mapa | Media | Mediana | Efeito dentro da serie | Tendencia |");
  lines.push("|---:|---:|---:|---:|---|");
  for (let map = 1; map <= 3; map += 1) {
    const row = fullThree.rows[map];
    lines.push(`| ${map} | ${fmt(row.mean)} | ${fmt(row.median)} | ${fmt(row.centeredEffect)} | ${trendLabel(row.centeredEffect)} |`);
  }
  lines.push("");
  lines.push("| Comparacao pareada | Dif. media | p | IC95 |");
  lines.push("|---|---:|---:|---:|");
  for (const [key, label] of [["2vs1", "Mapa 2 - mapa 1"], ["3vs1", "Mapa 3 - mapa 1"], ["3vs2", "Mapa 3 - mapa 2"]]) {
    const test = fullThree.pairs[key];
    lines.push(`| ${label} | ${fmt(test.diff)} | ${pFmt(test.p)} | ${fmt(test.ci.low)} a ${fmt(test.ci.high)} |`);
  }
  return lines.join("\n");
}

function scopeSummaryMd(scopes) {
  const lines = [];
  lines.push("| Escopo | Series | Mapas | Media | M1 | M2 | M3 | M2-M1 p | M3-M2 p | Leitura |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const [name, item] of Object.entries(scopes)) {
    const p = item.fullThree.pairs["3vs2"].p;
    const read = `${trendLabel(item.positions[1].centeredEffect)} / ${trendLabel(item.positions[2].centeredEffect)} / ${trendLabel(item.positions[3].centeredEffect)}`;
    lines.push(`| ${name} | ${item.series} | ${item.games} | ${fmt(item.mean)} | ${fmt(item.positions[1].mean)} | ${fmt(item.positions[2].mean)} | ${fmt(item.positions[3].mean)} | ${pFmt(item.tests.map2vs1.p)} | ${pFmt(p)} | ${read} |`);
  }
  return lines.join("\n");
}

function buildConclusion(report) {
  const overall = report.overall;
  const ft = overall.fullThree;
  const m1 = overall.positions[1];
  const m2 = overall.positions[2];
  const m3 = overall.positions[3];
  const lines = [];
  lines.push(`Na base MD3 2025-2026, mapa 1 ficou levemente under, mapa 2 foi o mapa mais alto, e mapa 3 apareceu under nas series que chegaram ao terceiro mapa.`);
  lines.push(`Todos os MD3: M1 ${fmt(m1.mean)}, M2 ${fmt(m2.mean)}, M3 ${fmt(m3.mean)}. Efeito dentro da serie: M1 ${fmt(m1.centeredEffect)}, M2 ${fmt(m2.centeredEffect)}, M3 ${fmt(m3.centeredEffect)}.`);
  lines.push(`Nas series 2-1, que sao a comparacao mais limpa para mapa 3, o mapa 3 teve efeito interno de ${fmt(ft.rows[3].centeredEffect)} kills e ficou ${fmt(ft.pairs["3vs2"].diff)} kills acima do mapa 2, p=${pFmt(ft.pairs["3vs2"].p)}.`);
  lines.push(`Mapa decisivo nao e automaticamente under: decisivos tiveram media ${fmt(overall.context.decisiveMean)} contra ${fmt(overall.context.nonDecisiveMean)} dos nao decisivos, p=${pFmt(overall.context.decisiveVsNon.p)}.`);
  return lines.join("\n\n");
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Analise MD3 2025-2026: Posicao Do Mapa E Total De Kills");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push(`Fonte: GOL.gg team matchlist. MD3 confirmado por placar de serie 2-0 ou 2-1. Amostra: ${report.overall.series} series, ${report.overall.games} mapas.`);
  lines.push("");
  lines.push("## Conclusao Direta");
  lines.push("");
  lines.push(buildConclusion(report));
  lines.push("");
  lines.push("## Todos Os MD3");
  lines.push("");
  lines.push(`Media geral MD3: ${fmt(report.overall.mean)} kills.`);
  lines.push("");
  lines.push(tablePositionsMd(report.overall.positions));
  lines.push("");
  lines.push("## Apenas Series Que Chegaram Ao Mapa 3");
  lines.push("");
  lines.push(tableFullThreeMd(report.overall.fullThree));
  lines.push("");
  lines.push("## Contexto Decisivo");
  lines.push("");
  lines.push("| Comparacao | Media A | Media B | Dif. | p | IC95 |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  lines.push(`| Decisivo vs nao decisivo | ${fmt(report.overall.context.decisiveMean)} | ${fmt(report.overall.context.nonDecisiveMean)} | ${fmt(report.overall.context.decisiveVsNon.diff)} | ${pFmt(report.overall.context.decisiveVsNon.p)} | ${fmt(report.overall.context.decisiveVsNon.ci.low)} a ${fmt(report.overall.context.decisiveVsNon.ci.high)} |`);
  lines.push(`| Mapa 2 decisivo 2-0 vs mapa 2 nao decisivo 1-1 | ${fmt(report.overall.context.map2DecisiveMean)} | ${fmt(report.overall.context.map2NonDecisiveMean)} | ${fmt(report.overall.context.map2DecisiveVsNon.diff)} | ${pFmt(report.overall.context.map2DecisiveVsNon.p)} | ${fmt(report.overall.context.map2DecisiveVsNon.ci.low)} a ${fmt(report.overall.context.map2DecisiveVsNon.ci.high)} |`);
  lines.push("");
  lines.push("## Por Temporada");
  lines.push("");
  lines.push(scopeSummaryMd(report.bySeason));
  lines.push("");
  lines.push("## Por Liga");
  lines.push("");
  lines.push(scopeSummaryMd(report.byLeague));
  lines.push("");
  lines.push("## Detalhe Por Liga");
  lines.push("");
  for (const [league, scope] of Object.entries(report.byLeague).sort()) {
    lines.push(`### ${league}`);
    lines.push("");
    lines.push(tablePositionsMd(scope.positions));
    lines.push("");
  }
  lines.push("## Recomendacao Para O Modelo");
  lines.push("");
  lines.push("Para MD3, a feature de mapa parece util como contexto leve: mapa 1 tende under leve, mapa 2 tende over leve, e mapa 3 tende under quando a serie chega a 1-1. Eu testaria como ajuste pequeno separado de Bo5, com shrink por liga e sem misturar mapa 3 de MD3 com mapa 3 de Bo5.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const raw = readJson(IN_FILE);
  const games = annotateGames(raw);
  const bySeason = Object.fromEntries([...groupBy(games, (game) => String(game.seasonYear)).entries()].map(([key, group]) => [key, buildScope(group)]));
  const byLeague = Object.fromEntries([...groupBy(games, (game) => game.league).entries()].map(([key, group]) => [key, buildScope(group)]));
  const report = {
    createdAt: new Date().toISOString(),
    sourceMeta: raw.meta,
    overall: buildScope(games),
    bySeason,
    byLeague,
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(OUT_MD, buildMarkdown(report), "utf8");
  console.log(JSON.stringify({
    series: report.overall.series,
    games: report.overall.games,
    mean: report.overall.mean,
    positions: report.overall.positions,
    fullThree: report.overall.fullThree.rows,
    paired: report.overall.fullThree.pairs,
  }, null, 2));
}

if (require.main === module) main();
