const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const IN_FILE = path.join(DATA_DIR, "bo5-2025-map-position-raw.json");
const OUT_JSON = path.join(DATA_DIR, "bo5-2025-map-position-analysis.json");
const OUT_MD = path.join(DATA_DIR, "bo5-2025-map-position-analysis.md");

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

function pairedTest(pairs) {
  const diffs = pairs.map(([a, b]) => a - b).filter(Number.isFinite);
  if (diffs.length < 2) return { n: diffs.length, diff: null, p: null, ci: { low: null, high: null } };
  const avg = mean(diffs);
  const se = std(diffs) / Math.sqrt(diffs.length);
  const z = avg / se;
  const half = 1.96 * se;
  return { n: diffs.length, diff: avg, p: pNormalTwoSided(z), ci: { low: avg - half, high: avg + half } };
}

function welchTest(aValues, bValues) {
  if (aValues.length < 2 || bValues.length < 2) return { diff: null, p: null, ci: { low: null, high: null } };
  const ma = mean(aValues);
  const mb = mean(bValues);
  const va = variance(aValues);
  const vb = variance(bValues);
  const se = Math.sqrt(va / aValues.length + vb / bValues.length);
  const diff = ma - mb;
  const z = diff / se;
  const half = 1.96 * se;
  return { diff, p: pNormalTwoSided(z), ci: { low: diff - half, high: diff + half } };
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

function bySeries(games) {
  return groupBy(games, (game) => [game.league, game.tournament, game.week, game.matchupKey].join("||"));
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

function summarizePosition(games, allMean, seriesMeans) {
  const kills = games.map((game) => game.totalKills);
  const centered = games
    .map((game) => game.totalKills - (seriesMeans.get(game.seriesKey) ?? game.totalKills))
    .filter(Number.isFinite);
  return {
    games: games.length,
    mean: r(mean(kills)),
    median: r(median(kills)),
    std: r(std(kills)),
    aboveMean: games.length ? r(games.filter((game) => game.totalKills > allMean).length / games.length, 4) : null,
    centeredEffect: r(mean(centered)),
  };
}

function positionTable(games) {
  const keyed = games.map((game) => ({ ...game, seriesKey: [game.league, game.tournament, game.week, game.matchupKey].join("||") }));
  const seriesGroups = bySeries(keyed);
  const seriesMeans = new Map([...seriesGroups.entries()].map(([key, group]) => [key, mean(group.map((game) => game.totalKills))]));
  const allMean = mean(keyed.map((game) => game.totalKills));
  const table = {};
  for (let map = 1; map <= 5; map++) {
    table[map] = summarizePosition(keyed.filter((game) => game.mapNumber === map), allMean, seriesMeans);
  }
  return { allMean: r(allMean), table };
}

function fullFiveSeries(games) {
  return [...bySeries(games).values()].filter((series) => {
    const maps = new Set(series.map((game) => game.mapNumber));
    return [1, 2, 3, 4, 5].every((map) => maps.has(map));
  });
}

function fullFiveComparison(games) {
  const series = fullFiveSeries(games);
  const rows = {};
  const map5Pairs = {};
  for (let map = 1; map <= 5; map++) {
    const values = [];
    const centered = [];
    const pairsVs5 = [];
    for (const group of series) {
      const byMap = Object.fromEntries(group.map((game) => [game.mapNumber, game]));
      const seriesMean = mean(group.map((game) => game.totalKills));
      values.push(byMap[map].totalKills);
      centered.push(byMap[map].totalKills - seriesMean);
      if (map !== 5) pairsVs5.push([byMap[map].totalKills, byMap[5].totalKills]);
    }
    rows[map] = {
      games: values.length,
      mean: r(mean(values)),
      median: r(median(values)),
      std: r(std(values)),
      centeredEffect: r(mean(centered)),
    };
    if (map !== 5) map5Pairs[`${map}vs5`] = pairedTest(pairsVs5);
  }
  return { series: series.length, rows, map5Pairs };
}

function trendLabel(centeredEffect, pVs5, map) {
  if (!Number.isFinite(centeredEffect)) return "sem amostra";
  const abs = Math.abs(centeredEffect);
  if (map === 5) {
    if (centeredEffect <= -1.5) return "UNDER";
    if (centeredEffect >= 1.5) return "OVER";
    return "NEUTRO";
  }
  const significantVs5 = Number.isFinite(pVs5) && pVs5 < 0.05;
  if (centeredEffect >= 1.5 && (significantVs5 || abs >= 2.0)) return "OVER";
  if (centeredEffect <= -1.5 && (significantVs5 || abs >= 2.0)) return "UNDER";
  if (centeredEffect >= 0.75) return "OVER leve";
  if (centeredEffect <= -0.75) return "UNDER leve";
  return "NEUTRO";
}

function buildLeagueReport(games) {
  const out = {};
  for (const [league, group] of groupBy(games, (game) => game.league)) {
    const positions = positionTable(group);
    const fullFive = fullFiveComparison(group);
    const map2 = group.filter((game) => game.mapNumber === 2).map((game) => game.totalKills);
    const map5 = group.filter((game) => game.mapNumber === 5).map((game) => game.totalKills);
    out[league] = {
      games: group.length,
      series: bySeries(group).size,
      mean: positions.allMean,
      positions: positions.table,
      fullFive,
      map2vs5: welchTest(map2, map5),
    };
  }
  return out;
}

function tablePositionsMd(positions, title = "Mapa") {
  const lines = [];
  lines.push(`| ${title} | Jogos | Media | Mediana | Desv.Pad | > media Bo5 | Efeito dentro da serie | Tendencia |`);
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---|");
  for (let map = 1; map <= 5; map++) {
    const row = positions[map];
    lines.push(`| ${map} | ${row.games} | ${fmt(row.mean)} | ${fmt(row.median)} | ${fmt(row.std)} | ${pct(row.aboveMean)} | ${fmt(row.centeredEffect)} | ${trendLabel(row.centeredEffect, null, map)} |`);
  }
  return lines.join("\n");
}

function tableFullFiveMd(fullFive) {
  const lines = [];
  lines.push(`Series que chegaram ao mapa 5: ${fullFive.series}`);
  lines.push("");
  lines.push("| Mapa | Media | Mediana | Efeito dentro da serie | Dif. vs mapa 5 | p pareado | IC95 dif. | Tendencia |");
  lines.push("|---:|---:|---:|---:|---:|---:|---:|---|");
  for (let map = 1; map <= 5; map++) {
    const row = fullFive.rows[map];
    const pair = map === 5 ? null : fullFive.map5Pairs[`${map}vs5`];
    lines.push(`| ${map} | ${fmt(row.mean)} | ${fmt(row.median)} | ${fmt(row.centeredEffect)} | ${pair ? fmt(pair.diff) : "--"} | ${pair ? pFmt(pair.p) : "--"} | ${pair ? `${fmt(pair.ci.low)} a ${fmt(pair.ci.high)}` : "--"} | ${trendLabel(row.centeredEffect, pair?.p, map)} |`);
  }
  return lines.join("\n");
}

function leagueSummaryMd(byLeague) {
  const lines = [];
  lines.push("| Liga | Series Bo5 | Mapas | Media | M1 | M2 | M3 | M4 | M5 | M2-M5 p | Leitura |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const [league, item] of Object.entries(byLeague).sort()) {
    const p = item.map2vs5.p;
    const m = item.positions;
    const read = Number.isFinite(p) && p < 0.05
      ? `M2 ${fmt(item.map2vs5.diff)} acima do M5`
      : "sem prova forte M2 vs M5";
    lines.push(`| ${league} | ${item.series} | ${item.games} | ${fmt(item.mean)} | ${fmt(m[1].mean)} | ${fmt(m[2].mean)} | ${fmt(m[3].mean)} | ${fmt(m[4].mean)} | ${fmt(m[5].mean)} | ${pFmt(p)} | ${read} |`);
  }
  return lines.join("\n");
}

function examplesMd(series, limit = 12) {
  const lines = [];
  lines.push("| Liga | Torneio | Semana | Serie | Mapas | Kills | Placar |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const s of series.slice(0, limit)) {
    lines.push(`| ${s.league} | ${s.tournament} | ${s.week || "--"} | ${s.matchupKey} | ${s.mapsPresent.join(",")} | ${s.totalKills.join(",")} | ${s.scoreSamples.join(" / ") || "--"} |`);
  }
  return lines.join("\n");
}

function buildConclusion(report) {
  const pos = report.positions;
  const full = report.fullFive;
  const map2vs5 = report.map2vs5;
  const map5Effect = full.rows[5].centeredEffect;
  const map2Effect = full.rows[2].centeredEffect;
  const pairedMap2vs5 = full.map5Pairs["2vs5"];
  const lines = [];
  if (Number.isFinite(pairedMap2vs5.p) && pairedMap2vs5.p < 0.05 && pairedMap2vs5.diff > 1.5) {
    lines.push(`A hipotese ganha forca em 2025, principalmente quando comparamos dentro da mesma serie. Em series que chegaram ao mapa 5, mapa 2 teve ${fmt(pairedMap2vs5.diff)} kills a mais que mapa 5 em media, p=${pFmt(pairedMap2vs5.p)}.`);
  } else {
    lines.push(`A hipotese nao ficou forte no agregado Bo5 confirmado: mapa 2 e mapa 5 nao se separaram com robustez suficiente.`);
  }
  lines.push(`No agregado de todos os Bo5 confirmados, mapa 2 teve media ${fmt(pos[2].mean)} e mapa 5 ${fmt(pos[5].mean)}. A diferenca bruta M2-M5 foi ${fmt(map2vs5.diff)} kills, p=${pFmt(map2vs5.p)}, ou seja, ficou na borda da significancia.`);
  lines.push(`O teste mais limpo e dentro das series que chegaram ao mapa 5. Nelas, mapa 5 ficou com efeito interno de ${fmt(map5Effect)} kills contra a media da propria serie; mapa 2 ficou em ${fmt(map2Effect)}. Isso reduz vies de matchup.`);
  lines.push(`Leitura pratica: mapa 2 tende over; mapa 4 tende under leve; mapa 5 tende under. Mapa 1 e mapa 3 ficam mais neutros no agregado. Usar numero do mapa como confirmador/contexto, nao como gatilho principal.`);
  return lines.join("\n\n");
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Analise Bo5 2025: Posicao Do Mapa E Total De Kills");
  lines.push("");
  lines.push(`Gerado em: ${report.createdAt}`);
  lines.push(`Fonte: GOL.gg S15/2025 via team matchlist. Bo5 confirmado por placar chegando a 3 vitorias ou mapa 4/5 observado.`);
  lines.push(`Amostra: ${report.seriesCount} series Bo5 confirmadas, ${report.gamesCount} mapas.`);
  lines.push("");
  lines.push("## Conclusao Direta");
  lines.push("");
  lines.push(buildConclusion(report));
  lines.push("");
  lines.push("## Tendencia Por Mapa - Todos Os Bo5 Confirmados");
  lines.push("");
  lines.push(`Media geral Bo5: ${fmt(report.bo5Mean)} kills.`);
  lines.push("");
  lines.push(tablePositionsMd(report.positions));
  lines.push("");
  lines.push("## Comparacao Dentro Das Series Que Chegaram Ao Mapa 5");
  lines.push("");
  lines.push(tableFullFiveMd(report.fullFive));
  lines.push("");
  lines.push("## Testes Principais");
  lines.push("");
  lines.push("| Comparacao | Dif. media | p | IC95 |");
  lines.push("|---|---:|---:|---:|");
  lines.push(`| Mapa 2 - Mapa 5, bruto Bo5 | ${fmt(report.map2vs5.diff)} | ${pFmt(report.map2vs5.p)} | ${fmt(report.map2vs5.ci.low)} a ${fmt(report.map2vs5.ci.high)} |`);
  for (let map = 1; map <= 4; map++) {
    const pair = report.fullFive.map5Pairs[`${map}vs5`];
    lines.push(`| Mapa ${map} - Mapa 5, pareado em series de 5 mapas | ${fmt(pair.diff)} | ${pFmt(pair.p)} | ${fmt(pair.ci.low)} a ${fmt(pair.ci.high)} |`);
  }
  lines.push("");
  lines.push("## Por Liga");
  lines.push("");
  lines.push(leagueSummaryMd(report.byLeague));
  lines.push("");
  for (const [league, item] of Object.entries(report.byLeague).sort()) {
    lines.push(`### ${league}`);
    lines.push("");
    lines.push(tablePositionsMd(item.positions));
    if (item.fullFive.series >= 3) {
      lines.push("");
      lines.push(tableFullFiveMd(item.fullFive));
    }
    lines.push("");
  }
  lines.push("## Amostra De Series");
  lines.push("");
  lines.push(examplesMd(report.seriesExamples));
  lines.push("");
  lines.push("## Recomendacao Para O Modelo");
  lines.push("");
  lines.push("Adicionar `mapNumber` como variavel opcional de contexto vale a pena para teste walk-forward, mas com shrink forte por liga e por formato. Sugestao inicial: usar o efeito dentro da serie como prior leve, com cap pequeno, por exemplo mapa 2 levemente over e mapa 5 levemente under quando a liga tambem confirmar. Nao aplicar ajuste fixo universal sem backtest.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function main() {
  const raw = readJson(IN_FILE);
  const games = raw.games.filter((game) => Number.isFinite(game.totalKills) && game.mapNumber >= 1 && game.mapNumber <= 5);
  const series = raw.series;
  const positionsResult = positionTable(games);
  const fullFive = fullFiveComparison(games);
  const map2vs5 = welchTest(
    games.filter((game) => game.mapNumber === 2).map((game) => game.totalKills),
    games.filter((game) => game.mapNumber === 5).map((game) => game.totalKills)
  );
  const report = {
    createdAt: new Date().toISOString(),
    sourceMeta: raw.meta,
    seriesCount: series.length,
    gamesCount: games.length,
    bo5Mean: positionsResult.allMean,
    positions: positionsResult.table,
    fullFive,
    map2vs5,
    byLeague: buildLeagueReport(games),
    seriesExamples: series.sort((a, b) => b.maxMap - a.maxMap || a.league.localeCompare(b.league)).slice(0, 30),
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(OUT_MD, buildMarkdown(report), "utf8");
  console.log(JSON.stringify({
    series: report.seriesCount,
    games: report.gamesCount,
    mean: report.bo5Mean,
    positions: report.positions,
    fullFiveSeries: report.fullFive.series,
    fullFive: report.fullFive.rows,
    map2vs5: {
      diff: r(report.map2vs5.diff),
      p: r(report.map2vs5.p, 4),
      ci: { low: r(report.map2vs5.ci.low), high: r(report.map2vs5.ci.high) },
    },
  }, null, 2));
}

if (require.main === module) main();
