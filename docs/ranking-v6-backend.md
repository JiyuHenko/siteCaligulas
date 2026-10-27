# Ranking e painel v6 — Apps Script

O código mantido no repositório está em `apps-script/Code.gs`. Ele substitui o arquivo v5 enviado pelo administrador, usa a mesma planilha e preserva a senha e o endpoint existentes.

## Instalação em uma planilha v5

1. Guarde uma cópia da planilha e do código atual.
2. Substitua todo o conteúdo de `Code.gs` pelo novo arquivo.
3. Salve e execute **`migrateV5ToV6()`** uma vez no editor do Apps Script. A função preserva as células de `PUBLICADO`, os modificadores, a senha, os torneios e os históricos; cria um histórico anterior à migração e corrige datas/IDs nas abas auxiliares.
4. Atualize a implantação Web App existente: **Gerenciar implantações → Editar → Nova versão → Implantar**. Usar a mesma implantação mantém a URL configurada no site.
5. Confira `?action=health`: `schemaVersion` deve ser `6`.
6. Recarregue o painel atualizado, importe o JSON corrigido, confira os valores e use **Publicar tudo**. A importação no navegador prepara um rascunho; a gravação acontece na publicação.

Não execute `setupProject()`, `resetAllData()` ou `seedCurrentMonthlyFromGeneral()` na planilha preenchida. `setupProject()` serve à instalação nova. Caso a planilha ainda seja v4, execute primeiro `migrateV4ToV5()`.

A leitura da estrutura v5 já funciona com o código v6. A primeira gravação válida atualiza o marcador de schema; executar a migração explicitamente também garante que as células auxiliares antigas sejam gravadas como texto. A migração pode ser executada novamente sem somar pontos ou incrementar a versão outra vez.

## Correções e comportamento

- O Sheets pode transformar `2026-10-11` em uma célula `Date`. A v5 lia essas células com `String(date)`, produzindo IDs como `Sun Oct 11 2026 ...`. A v6 normaliza tanto células `Date` quanto essas strings antigas para `AAAA-MM-DD`, e grava datas/IDs como texto.
- **Publicar mensal** mescla somente os campos mensais dos jogadores existentes e o estado mensal. Conserva os campos gerais, nomes existentes e modificadores. Um jogador novo criado pelo mensal é cadastrado com pontuação, presenças, bônus e colocações gerais em zero.
- **Publicar geral** conserva os campos mensais e o estado da etapa. Novos jogadores criados pelo geral começam com mensal zerado.
- O número de torneios válidos pode ser corrigido manualmente. Ele não é recalculado a partir da lista de torneios. Novo torneio da etapa atual soma um; exclusão subtrai um; editar o mesmo torneio mantém a quantidade. O contador não pode ser menor que os torneios efetivamente registrados naquela etapa.
- A presença vale um ponto no mensal. O geral continua `(pontos × fator) + presenças + bônus`. Nenhum import reaplica os torneios já incluídos nos totais.
- O bônus exige presença em exatamente todos os torneios válidos. A finalização bloqueia quando alguém tem mais presenças que o contador, calcula os desempates pelas colocações e divide os dez pontos entre empatados conforme a regra anterior de arredondamento para uma casa decimal.
- **Reabrir etapa** estorna os valores exatos do bônus registrados nos beneficiários, mantém a pontuação mensal e retorna a etapa ao andamento. Se o bônus geral foi alterado manualmente e ficou insuficiente para o estorno, a operação é bloqueada com identificação do jogador. Reabrir duas vezes não desconta duas vezes.
- Etapas anteriores continuam protegidas. Alterar a etapa ativa usa a ação de avanço; restauração de backup completo pode recuperar um estado histórico de forma auditada.

## Backups e migração de arquivos

O backup completo inclui `rows`, `modifiers`, `monthlyState`, `stages` e `tournaments`, além dos campos de identificação usados pelo painel. `metadataMode: "replace"` substitui calendário e livro de torneios pelo snapshot, junto com seus totais.

O export antigo fornecido para a correção contém apenas jogadores, modificadores e estado mensal. Ele não permite reconstruir os torneios individuais. O JSON corrigido usa **`metadataMode: "preserve"`**: conserva o calendário e os torneios que estiverem no servidor, restaurando os totais e o estado mensal fornecidos no arquivo. Nesse modo, a etapa do arquivo precisa ser a mesma que está ativa no servidor. A API rejeita jogadores ausentes que ainda estejam vinculados a torneios e contador menor que os registros da etapa.

Uma etapa finalizada importada mantém os bônus já incluídos nos totais; não os concede novamente. Seus beneficiários, valores e data precisam ser coerentes com o resultado mensal. Um backup finalizado que tenha sido editado manualmente de forma incoerente precisa ser corrigido antes da importação.

Se o encerramento foi apenas marcado no rascunho, sem publicação, a exportação salva a etapa em andamento com `pendingFinalization: true`. Depois de importar e publicar esse backup, encerre novamente a etapa para calcular o bônus. Assim o arquivo não declara uma bonificação que ainda não foi concedida.

Históricos v5 completos continuam restauráveis, inclusive snapshots divididos em várias células de `HISTORICO_PARTES`. Históricos anteriores à v5 permanecem disponíveis para consulta. Novos snapshots divididos incluem a quantidade de partes para detectar arquivos incompletos.

## Contrato da API

Todas as mutações usam `token`, `baseVersion` e trava do Apps Script. Uma versão obsoleta é rejeitada com `VERSION_CONFLICT` antes de alterar os dados.

- `publish`: recebe `rows`, `modifiers`, `monthlyState` e `scope: "monthly" | "general"`. Sem `scope`, publica o conjunto integral de campos do ranking, preservando torneios e calendário.
- `importBackup`: recebe `backup: {rows, modifiers, monthlyState, metadataMode, stages?, tournaments?}`. `replace` exige as duas listas auxiliares; `preserve` usa as listas atuais.
- `reopenStage`: reabre a etapa atual finalizada e estorna seu bônus.
- `saveTournament`, `deleteTournament`, `saveStages`, `advanceStage`, `restore` e as ações de leitura mantêm os nomes e campos da v5.

Publicação, importação, restauração e alterações de torneios/calendário arquivam o estado anterior depois da validação. Se uma escrita intermediária falhar, o código tenta restaurar os dados, a versão e o horário anteriores. O Sheets não fornece transações entre abas: se a própria reversão também falhar, a API retorna `PARTIAL_WRITE` e orienta restaurar o histórico antes de continuar. Falhas de limpeza de histórico não apresentam uma publicação concluída como se tivesse falhado.

## Verificação local

Execute `node --test tests/backend.test.cjs`. Os testes executam o `Code.gs` real com mocks de Sheets, propriedades, autenticação e travas; não acessam a planilha de produção.

Cobrem datas legadas, migração, separação de publicações, novos jogadores mensais, contagem manual e por torneio, conflitos de versão, bônus/finalização/reabertura, backups completos e parciais, históricos v5 pequenos e grandes, estorno de torneios, avanço da etapa e reversão de falhas de escrita.
