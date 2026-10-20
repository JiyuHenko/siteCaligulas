# Ranking 2026/27 — gestão de torneios (v5)

Esta atualização requer **frontend e Google Apps Script v5 juntos**. Não faça merge na main antes de migrar o backend.

## Migração sem apagar os dados atuais

1. Faça uma **cópia da planilha** (Arquivo → Fazer uma cópia) e salve o `Code.gs` atual.
2. Substitua o `Code.gs` pelo arquivo `Caligulas_Ranking_v5_Code.gs` entregue na conversa.
3. Salve e execute **`migrateV4ToV5()` uma única vez**.
4. Verifique que `PUBLICADO`, `HISTORICO`, `META` e `MODIFICADORES` continuam preenchidos.
5. Confira as novas abas `TORNEIOS` e `ETAPAS`. Confira também a nova aba `HISTORICO_PARTES`, usada para guardar históricos grandes em partes.
6. Edite a **implantação Web App existente** (Gerenciar implantações → Editar → Nova versão → Implantar). Não crie um endpoint diferente sem atualizar o `config.js`.
7. Verifique `?action=health` → `schemaVersion: 5`.
8. Apenas então faça merge da branch `feat/tournaments-monthly-management` na `main`.

**Nunca execute `resetAllData()` para migrar.** Evite `setupProject()` e `seedCurrentMonthlyFromGeneral()` neste fluxo.

## Novos controles no painel

**Jogadores:** mantém o editor de totais e as correções manuais. Edição manual de jogadores continua como rascunho até clicar em **Publicar ranking**.

**Torneios:** mostra eventos registrados pela v5, permite editar participantes, colocações, data, tipo, associação ao ranking geral e associação a uma etapa mensal; permite excluir eventos. Cada salvar/excluir um torneio publica a mudança **imediatamente** no Google Sheets e recalcula os totais. Bloqueia edição quando existe rascunho não publicado para evitar perda de dados.

**Etapas mensais:** permite mudar nome, data de início e fim, incluir/remover etapas não utilizadas e ativar a próxima etapa depois de finalizar e publicar a atual. Datas não podem se sobrepor. A associação de torneio a etapa é explícita e não muda silenciosamente quando o calendário é editado.

**Etapa encerrada:** é bloqueada para edições retroativas, porque o bônus mensal já pode ter sido concedido. A correção precisa de revisão operacional para evitar bônus duplicados.

## Como cadastrar um torneio já registrado no geral, mas não no mensal

Use **Torneios → Novo torneio**: informe data, tipo, participantes e colocações. **Desmarque “Aplicar ao ranking geral”** e mantenha marcado **“Aplicar ao ranking mensal”**. Escolha a etapa correta e salve.

A API somará *somente* os pontos, colocações e presenças mensais, além de incrementar o contador de torneios válidos daquela etapa; os pontos gerais já existentes permanecem intactos.

Se os pontos mensais também já foram corrigidos manualmente, não registre o evento novamente sem conciliar os valores: isso duplicaria o mensal.

## Limitações de migração

A v4 armazena apenas totais, não os torneios individuais que deram origem a eles. Por isso a v5 **não inventa eventos passados**: a aba `TORNEIOS` começa vazia. É possível recuperar eventos antigos manualmente, usando o modo `somente mensal`.

A restauração de histórico **v4** é somente leitura para preservar a integridade do livro de torneios novo. Históricos **v5** incluem torneios, etapas e a pontuação correspondente.

## Testes manuais antes de liberar produção

- Criar torneio que conta para ambos os rankings; verificar pontos, presença e contador.
- Criar torneio **somente mensal**; verificar que o geral não muda.
- Editar colocação de um evento; verificar que a pontuação anterior é substituída, não somada duas vezes.
- Desmarcar o mensal e salvar; verificar a reversão dos pontos mensais e do contador.
- Excluir torneio; verificar reversão dos lançamentos.
- Testar acordo com duas colocações iguais.
- Tentar sobrepor datas de etapas: o backend deve rejeitar.
- Finalizar/publicar etapa e testar ativação da seguinte; geral deve permanecer acumulado.
- Conferir no site público o ranking geral, o mensal e o bônus.

**Nota:** mudar datas oficiais das etapas exige alinhar também o regulamento exibido no site, se o cliente alterar o calendário oficial.
