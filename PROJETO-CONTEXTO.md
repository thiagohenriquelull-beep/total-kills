# Total Kills — Contexto do Projeto

> **Para a IA que está lendo isto (Claude, Codex ou outra):** este documento é a memória de um trabalho longo de análise e desenvolvimento de um modelo de previsão de over/under de kills em partidas profissionais de League of Legends. Foi escrito para que você reconstrua o contexto sem refazer debates já encerrados nem repetir erros já cometidos. Leia inteiro antes de propor mudanças. As seções de "becos sem saída" e "princípios" valem tanto quanto as descobertas — elas existem para impedir retrabalho.

---

## 0. O que é o projeto

Um aplicativo ("predictor") que estima o total de kills de um mapa de LoL e identifica valor de aposta (over/under) contra a linha de uma casa de apostas. O usuário aposta ao vivo, vendo a linha real e atualizando-a no app conforme ela muda; o modelo recalcula o EV contra a linha atual.

O modelo prevê kills a partir de médias históricas por time (com shrinkage), ajuste por liga, e ajuste de draft (efeito dos campeões pickados por role). Quando há EV positivo suficiente contra a linha, recomenda over ou under.

---

## 1. Estado atual do modelo (no momento desta escrita)

- **Dataset:** 1368 mapas, temporada S16 inteira, em `games.js` / `games.json`. Ligas: LPL (314), LCK (200), LCK CL (315), LEC (232), LCS (141), CBLOL (166).
- **Range de patch:** 16.1 → 16.11. LEC e LCK CL ainda em 16.10; LCS e CBLOL já em 16.11; resto em 16.10.
- **Limiar de EV padrão:** 5% (`DEFAULT_BET_POLICY.minEv = 0.05`). Não foi alterado — ver seção de becos sem saída sobre por que não baixamos.
- **Viés do modelo:** residual de −0.3 a −0.6 kills (subestimação leve) em quase todas as ligas; LCS levemente sobre-estima (+0.32). **Bem calibrado, sem viés explorável.** (Ver seção 4 — isto contradiz números antigos que eram falsos.)
- **sigma do modelo:** ~8.3 kills, calibrado (RMSE 8.06 no pick 8, std(z)=0.98). O erro de contagem de kills é genuíno e grande; o que torna o modelo útil é a acurácia *direcional*, não a precisão da contagem.

---

## 2. Descobertas validadas (use estas)

### 2.1 Timing do draft — quando apostar
O draft chega em ordem (pick a pick). A recomendação ganha confiabilidade conforme os picks entram:
- **Pick 3-4 ou antes:** ruído. Não apostar (acerto ~52%, abaixo do break-even de 55.6% a odd 1.80; em jogos que oscilam, ROI −40%).
- **Pick 5:** primeiro sinal confiável.
- **Pick 6-8:** zona de entrada boa.
- **Pick 8:** ponto ótimo. Esperar até o pick 10 não agrega (diferença de ROI ~0.1pp).
- **Pick 8 + EV ≥ 10%:** sinal mais forte do sistema (historicamente 19/19 acertos, quase sempre OVER).

Roles com mais peso na previsão por pick: **SUP > JUNGLE > ADC > MID > TOP**. Os dois primeiros picks do Red side (R1, R2 = picks 2 e 3 do draft) são os que mais "viram" a recomendação — por isso não apostar antes deles.

### 2.2 draftConfidence
Métrica interna (`model-core.js`) = `clamp(countConfidence * sampleConfidence, 0.1, 1)`, onde `countConfidence = sqrt(picks_preenchidos/10)` e `sampleConfidence = shrink(média de amostras dos campeões, 10)`. Escala o ajuste de draft e o porta (gate): se < 0.55, o draft é ignorado. 5 picks ≈ 0.71 de confiança por contagem.

### 2.3 Champs sinalizadores
Campeões que mais empurram a previsão. **IMPORTANTE:** estes deltas JÁ estão embutidos no EV do modelo — são lembrete visual para reconhecimento ao vivo, NÃO devem ser somados manualmente ao EV.
- **OVER:** Nautilus (SUP, n=199, +0.43), Vi (JG, n=278, +0.36), Neeko (SUP), Seraphine (SUP), Leona (SUP). SUP domina o sinal de over.
- **UNDER:** Milio (SUP, n=148, −0.65 — o mais forte do dataset), Dr. Mundo (JG, n=63, 79.4% hit — melhor hit rate), Nami (SUP), Naafiri (JG). JG domina o sinal de under.
- Champs com n < 30 (Yuumi 23, Maokai 24, Sejuani 31) devem ter flag de "amostra pequena".

### 2.4 Under > Over (com ressalva importante)
O modelo é direcionalmente melhor no under que no over. MAS: parte do que parecia vantagem do under pré-game vinha de um suposto viés de superestimativa que **acabou se revelando inexistente** (ver 4.1). O under continua levemente melhor, mas sem o reforço extra que se acreditava ter. Não apostar under pré-game com confiança inflada.

---

## 3. Decisões de arquitetura e operação

### 3.1 Divisão de ferramentas (crítico)
- **Codex:** tem acesso a navegador/web funcional. Faz a **coleta de dados do gol.gg**. As páginas de partida do gol.gg (`gol.gg/game/stats/[id]/page-game/`) são públicas — não precisam de login premium. Script reutilizável: `scripts/update-games.js` (detecta último ID por liga, varre a partir daí, para após N misses).
- **Claude Code (em alguns ambientes):** NÃO tem ferramenta de browser — só consegue WebFetch (requisição crua), que o gol.gg bloqueia/trava. Pode ler/editar arquivos locais, rodar node, recalcular. **Não peça a ele para coletar do gol.gg se ele não tiver Playwright/browser instalado.** Verifique antes.
- As duas ferramentas NÃO se comunicam entre si. O usuário é a ponte (copia/cola). Não existe "uma ensinar a outra" — só compartilham os arquivos do projeto no disco.

### 3.2 Cuidado com arquivos sobrescritos
Já houve incidente de `games.js` ser sobrescrito (1368 → 1346) por dois processos mexendo no mesmo arquivo. **Regra:** apenas um processo escreve no `games.js` por vez. Sempre fazer backup antes de merge/sobrescrita (padrão: `games.before-*-YYYYMMDD`). `games.json` é a fonte canônica; `games.js` pode ser regenerado a partir dele.

### 3.3 Pipeline de analytics
O app tem duas camadas que usam dados diferentes:
- **Previsões ao vivo:** lêem `games.js` direto no browser, constroem o modelo em memória. Atualizam automaticamente quando `games.js` muda.
- **Tabelas de analytics (drawer):** vêm de `historical-analysis.js`, gerado por uma cadeia: `expanded-*.json → backtest-final-rule.js → final-rule-backtest.csv → build-historical-analysis.js → historical-analysis.js`. Esta cadeia NÃO atualiza sozinha — precisa ser regenerada manualmente quando o dataset muda.

### 3.4 Atualização de dados — procedimento
1. Codex coleta jogos novos a partir da última data de cada liga → salva em arquivo separado (`jogos-novos.json`), sem mexer no `games.js` ainda.
2. Conferir: patch preenchido, sem duplicata, nomes decodificados (ver 3.5).
3. Merge no `games.js`/`games.json` com backup prévio. Validar (`node --check`, contagem, duplicatas).
4. Regenerar a cadeia de analytics se quiser as tabelas atualizadas.
5. Atualizar `createdAt` no metadata (cosmético).

### 3.5 Bug conhecido de nomes
A entidade HTML `&#039;` (apóstrofo) não era decodificada no coletor original — "Anyone's Legend" virava "Anyone s Legend", fragmentando a média do time. Sempre verificar nomes com apóstrofo/entidades HTML após coleta.


### 3.6 Fonte canônica dos dados
`data/games.json` é a fonte canônica do dataset. `data/games.js` existe para o browser carregar os jogos e pode ser regenerado a partir do JSON. Quando houver mudança de dados, a ordem correta é: atualizar/validar `games.json` primeiro, depois regenerar `games.js`. Evitar edição manual direta em `games.js`, porque isso aumenta o risco de divergência silenciosa entre os dois arquivos.

### 3.7 Coleta incremental segura
O fluxo seguro de coleta é: `scripts/collect-new-games-http.js` -> arquivo separado (`jogos-novos.json`, ou equivalente) -> validação -> backup -> merge explícito. O script `scripts/update-games.js` deve ser tratado como legado/perigoso para atualização de dataset, porque escreve direto em `games.js`; só usar se for revisado ou se a intenção for exatamente sobrescrever com controle.

A busca não deve considerar apenas "jogos depois da última data". Já encontramos buracos no meio do dataset: jogos reais não duplicados anteriores à última data registrada. Portanto, toda coleta relevante deve reportar duas classes separadas: jogos recentes novos e buracos históricos encontrados. Buracos devem ser salvos em arquivo separado antes de qualquer merge.

#### 3.7.1 Mini tutorial: coletar jogos novos sem abrir o GOL.gg premium
Este foi o método usado na coleta de 30/05/2026. Ele não depende de abrir o navegador logado nem de usar sessão premium, desde que as páginas públicas do GOL.gg continuem expondo lista de partidas e páginas de jogo.

1. Confirmar o estado local antes de coletar:
   - abrir `data/games.json` e `data/games.js`;
   - anotar contagem total por liga;
   - descobrir a última data registrada por liga, mas lembrar que também podem existir buracos antes dela.
2. Rodar o coletor HTTP seguro:
   - comando padrão: `node scripts\collect-new-games-http.js`;
   - saída esperada: arquivo separado, como `jogos-novos.json`, sem alterar `games.json` nem `games.js`.
3. O coletor deve varrer as ligas configuradas, acessar as páginas de torneio/time/jogo do GOL.gg via HTTP e extrair de cada mapa:
   - liga, data, patch, times, total de kills, picks por role dos dois lados e `sourceUrl`.
4. Conferir o relatório do coletor:
   - jogos recentes novos por liga;
   - buracos históricos encontrados por liga;
   - jogo mais recente visto no GOL.gg por liga;
   - patches encontrados.
5. Validar o arquivo separado antes de qualquer merge:
   - todos com patch preenchido;
   - 5 picks por lado;
   - totalKills numérico;
   - nomes decodificados corretamente;
   - zero duplicatas contra o dataset atual.
6. Só depois disso fazer backup e merge. Nunca misturar coleta, validação e merge em uma etapa só.
7. Se o GOL.gg mudar HTML ou o parser retornar poucos jogos demais, suspeitar primeiro do parser. O bug já visto foi cortar a tabela de picks no primeiro `</table>` interno das runas; a correção foi extrair picks pelos blocos `playersInfosLine` e ícones `champion_icon rounded-circle`.

### 3.8 Checklist obrigatório pós-coleta
Antes de qualquer merge, validar:
- `patch` preenchido em todos os jogos.
- data válida e `totalKills` numérico.
- dois times preenchidos e nomes decodificados corretamente (`&#039;` -> apóstrofo real, etc.).
- 5 picks do time A e 5 picks do time B, sempre separados por role (`top`, `jungle`, `mid`, `adc`, `support`).
- `sourceUrl` presente e limpo.
- zero duplicatas por `id`.
- `node --check data/games.js` após regenerar.
- contagem por liga batendo entre `games.json`, `games.js` e metadata.

### 3.9 Recalcular analytics depois de mudar dataset
Após merge validado, recalcular a cadeia inteira antes de confiar no drawer/analytics:
1. `node scripts/expand-from-games.js`
2. `node scripts/backtest-final-rule.js`
3. `node scripts/build-historical-analysis.js`
4. `node scripts/check-state.js`

`historical-analysis.js` deve carregar metadados suficientes para auditoria: quantidade de jogos fonte (`sourceGames`), data/versão da base usada (`generatedFromGamesUpdatedAt`) e quantidade de linhas do backtest (`backtestRows`). Se esses campos não existirem, adicionar antes da próxima rodada de analytics.

### 3.10 Backtest sintético vs validação real
Backtest com linha simulada é régua de diagnóstico, não prova definitiva de ROI real. A decisão prática deve ser validada pelo registro ao vivo: linha real da casa, odd real, estágio do draft, lado apostado, EV pré-game, EV/delta de draft, resultado e P&L. O histórico real de apostas é o único out-of-sample limpo; depois que um jogo entra no dataset, ele deixa de servir como validação independente.

---

## 4. Becos sem saída — NÃO reabrir (com o porquê)

### 4.1 O VIÉS FANTASMA (o erro mais importante de entender)
Um diagnóstico inicial reportou viés de superestimativa de −1.58 geral, −2.29 (LPL), −3.53 (LCS). Isso guiou várias decisões e gerou medo de "perder o edge do under". **Era falso.** Ao medir os mesmos jogos antigos com o método atual, o viés é −0.43 (LPL) e +0.37 (LCS) — não −2.29/−3.53. Os números vieram de uma versão diferente do modelo (provavelmente pré-calibração ou com lógica de previsão diferente). **Os dois números nunca foram comparáveis.** O modelo sempre esteve bem calibrado (~−0.4 de viés residual, desprezível).
- **Lição:** antes de construir estratégia sobre um número de diagnóstico, confirmar que ele foi medido com o MESMO método que o número com que se compara. Números de fontes/versões diferentes não são comparáveis. Este único erro contaminou várias mensagens de raciocínio.

### 4.2 Baixar o limiar de EV de 5% para 1-3%
Testado. No backtest contra linha fixa, faixas de EV baixo (1-5%) parecem lucrativas. MAS: (a) o sinal é estatisticamente real apenas no agregado de 200+ apostas, não em aposta isolada (SNR de uma aposta de EV 1.5% é 0.17 — dentro do ruído); (b) há overfitting in-sample (os jogos do backtest treinaram o modelo). **Decisão:** manter 5%. Se for testar EV 3-5%, fazer SÓ nos picks 7-8, registrado como categoria separada ("teste EV 3-5%"), validando out-of-sample por 4-6 semanas antes de mudar o padrão. Nunca baixar direto para 1%.

### 4.3 Confronto direto (head-to-head) como feature
Testado duas vezes. Desvio médio do H2H vs previsão por médias individuais = 0.03 kills (zero). Redundante: as médias dos times já capturam o sinal. Instável: std intra-par de 7 kills engole qualquer desvio. E 53% dos pares têm < 5 confrontos — inaplicável onde mais se precisa. **Tentativa de usar só as "2 últimas séries" é PIOR:** teste cego walk-forward (802 obs) deu MAE 7.61 (H2H) vs 6.60 (médias) — o H2H perde em todas as 6 ligas. Em sinais de under forte do H2H, acerta só 45.5% (pior que cara-coroa). **Decisão:** H2H não entra no modelo, nem como sinal auxiliar. No máximo nota qualitativa manual em casos específicos.

### 4.4 Ir contra a casa "que exagera no H2H"
Hipótese de que a casa de apostas exagera no peso do H2H e dá pra explorar. Não testável com os dados atuais — exigiria linha REAL da casa, que não temos no dataset (tudo usou linha sintética = mediana móvel). Para "ir contra" funcionar, a casa teria que *exagerar*, não apenas considerar. **Pendente de validação com linha real coletada ao vivo.**

---

## 5. Princípios meta (valem mais que qualquer descoberta)

1. **Ceticismo com amostra pequena.** Apareceu repetidamente: faixa EV 2-3% (n=30, descartada como variância), H2H (n=2-8, descartado), faixas de EV alto com n<20 (não confiar). Toda variável/conclusão nova precisa provar (a) que adiciona algo ALÉM do que o modelo já sabe e (b) que tem amostra suficiente na hora de usar. Um caso vívido (ex: Bilibili vs WE) nunca decide — testa contra a amostra inteira.

2. **Números de fontes diferentes não são comparáveis** (ver 4.1). Sempre verificar método antes de comparar.

3. **Diagnóstico antes de implementação.** Toda ideia foi testada como diagnóstico ("não implemente, só me diga") antes de virar código. Isso evitou implementar features que vazariam ruído.

4. **Separar dataset histórico (treino) de apostas reais (validação).** Os jogos em que o usuário apostou entram no dataset depois; uma vez no treino, não são mais validação out-of-sample. A única validação limpa é o registro de apostas feito ANTES do resultado.

5. **Patch:** o usuário decide quando o acúmulo de patches justifica cortar dados antigos. NÃO sugerir isso automaticamente a cada patch — patches adjacentes (1-2 de distância) são mudança incremental e juntar tudo dá mais amostra. Só reavaliar quando o usuário sinalizar.

6. **Não fomentar excesso de confiança.** ROI de amostra pequena (ex: 40% em 18 apostas, várias da mesma série) NÃO é veredito. O número que vale é após 50-100 apostas distintas.

---

## 6. Pendências abertas (o que ainda falta validar ao vivo)

- **Pick 5 vs pick 8:** vale entrar cedo (odd mais aberta) ou esperar (mais preciso)? Só o registro ao vivo com estágio de entrada + odd real responde. Por isso o registro de apostas guarda o estágio do draft e a odd no momento.
- **Mundo A vs Mundo B:** quando a previsão fica muito abaixo da linha da casa (cenário under), a casa está errada (oportunidade) ou o modelo está errado (cilada)? Só descobre registrando previsão vs linha REAL vs resultado por 20-30 jogos.
- **Teste EV 3-5% nos picks 7-8:** validar out-of-sample se a faixa abaixo de 5% é lucrativa fora da amostra de treino.
- **Casa exagera no H2H?** (ver 4.4) — precisa de linha real acumulada.

Todas dependem do mesmo dado que falta: **registro ao vivo de previsão + linha real da casa + estágio do draft + resultado.** Esse é o ativo mais valioso a acumular daqui pra frente.

---

## 7. Features implementadas no app (registro/sinalização)

- Indicador de estágio do draft (X/10 picks, classificação cedo/zona/ótimo).
- Dois alertas de timing independentes: pick 5 ("primeiro sinal confiável") e pick 8 ("ponto ótimo"; se EV≥10%, "sinal premium").
- Registro de aposta guarda: estágio de entrada, odd no momento, lado.
- Teste paralelo EV 3-5% nos picks 7-8 (categoria separada, não recomendação automática).
- Painel de champs sinalizadores (recolhível, só os presentes no draft atual, com aviso de que o delta já está no EV, flag de amostra pequena).
- Botão de excluir aposta individual; botão de exportar histórico (JSON/CSV).
- Convenção de cores: financeiro (verde=positivo, vermelho=negativo); recomendação over/under (verde=under, vermelho=over); ajuste por time segue o sinal numérico.

---

*Fim do contexto. Mantenha este documento atualizado quando decisões estruturais mudarem. Em conflito entre este documento e a memória de uma conversa, o estado real dos arquivos no disco (`games.js`, `model-core.js`) prevalece — verifique antes de assumir.*



