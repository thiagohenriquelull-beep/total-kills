# Base online sem publicar novamente no Netlify

## Como funciona

- O aplicativo continua estatico no Netlify.
- A base atualizada fica na branch publica `live-data` do GitHub.
- O GitHub Actions roda diariamente as 10:17 (horario de Sao Paulo).
- So `games.json`, `historical-analysis.json` e `status.json` sao publicados nessa branch.
- O Netlify nao e conectado ao repositorio e nao recebe deploys das atualizacoes de jogos.
- Se a base online falhar, o aplicativo usa automaticamente a base local embutida.
- O historico de apostas nunca vai para o GitHub. Ele permanece no navegador e no arquivo de backup escolhido pelo usuario.

## Configuracao unica

1. Criar um repositorio publico vazio no GitHub, sem README, com nome como `total-kills`.
   - O codigo do app tambem ficara publico nesse repositorio. Ele ja e entregue publicamente pelo site estatico e nao contem apostas, senhas ou credenciais.
2. Informar ao Codex o endereco `USUARIO/REPOSITORIO`. O Codex executara:
   - `npm run configure-remote -- USUARIO/REPOSITORIO`;
   - configuracao do remote Git;
   - commit e push do projeto.
3. No GitHub, abrir `Settings > Actions > General > Workflow permissions` e selecionar `Read and write permissions`.
4. Abrir `Actions > Atualizar base ao vivo > Run workflow` para a primeira carga.
5. Fazer uma unica publicacao final da pasta completa no Netlify. Nao conectar o Netlify ao GitHub.
6. Abrir o app e confirmar que o cabecalho mostra `Base online atualizada`.

## Operacao diaria

Nenhuma acao manual e necessaria. Quando nao houver jogos novos, o workflow nao altera a branch. Quando houver, ele coleta, valida, faz merge, roda os 22 testes, recalcula analytics e troca somente os JSONs da branch `live-data`.

Tambem e possivel executar manualmente pelo botao `Run workflow` na pagina Actions do GitHub.

## Recuperacao

- Se o GitHub estiver indisponivel, a base local abre normalmente.
- Se uma coleta falhar, o workflow aborta antes de publicar.
- A branch `live-data` mantem historico de commits e permite voltar ao JSON anterior.
