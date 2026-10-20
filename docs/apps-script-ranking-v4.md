# Apps Script — Ranking 2026/27 (v4)

Esta versão precisa ser implantada junto com o frontend da branch `feat/ranking-2026-27-monthly`.

## Antes de começar

1. Faça uma cópia do `Code.gs` atual.
2. Não execute `resetAllData()`.
3. Mantenha o mesmo `SPREADSHEET_ID` e a implantação Web App existente.

## Migração

1. Substitua o conteúdo do `Code.gs` pela versão v4 entregue junto desta atualização.
2. Salve o projeto.
3. Execute manualmente `migrateV3ToV4()` **uma única vez**.
4. Confira a aba `PUBLICADO`: os jogadores antigos devem continuar presentes e as novas colunas de bônus/ranking mensal devem existir.
5. Confira `MODIFICADORES`: os limites esperados são 15, 21, 27, 33, 41 e 46 presenças.
6. Em **Implantar → Gerenciar implantações → Editar**, selecione **Nova versão** e implante. Editando a implantação existente, a URL do Web App permanece a mesma.

## Dados mensais já existentes

A migração não inventa histórico de torneios que não existia no modelo v3. Por segurança, os novos campos mensais começam em zero.

Se todos os dados atuais de `PUBLICADO` pertencem à primeira etapa de 2026/27, a versão v4 possui o helper opcional `seedCurrentMonthlyFromGeneral()`. Antes de executá-lo, informe no código a quantidade real de torneios válidos já realizados na etapa.

Se os dados atuais misturam período anterior ou não representam exatamente a etapa mensal, não use esse helper; faça o preenchimento mensal pelos dados reais.

## Regras implementadas

- Geral: `(pontos × fator) + presenças + bônus`.
- Presença e bônus não entram no multiplicador.
- Acordos podem repetir a mesma colocação para mais de um jogador.
- Mensal: pontos de colocação + presença, sem multiplicador.
- Para concorrer ao bônus mensal, o jogador precisa ter presença em 100% dos torneios válidos da etapa.
- O bônus mensal é de 10 pontos no ranking geral e pode ser dividido em empate persistente.
- Ao iniciar a próxima etapa, o acumulado mensal é zerado sem alterar o ranking geral.
- Histórico criado pela v4 armazena também o estado da etapa mensal.
