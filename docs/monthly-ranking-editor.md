# Painel — Rascunho independente do ranking mensal

> Este documento registra o fluxo antigo da v5. O painel v6 permite cadastrar jogadores diretamente no mensal, editar o contador e reabrir a etapa. Consulte [ranking-v6-backend.md](ranking-v6-backend.md) para o procedimento atual e a atualização necessária do Apps Script.

## Acesso

No painel administrativo, abra a aba **Ranking mensal** (separada da aba **Etapas mensais**).

- A lista mostra todos os jogadores cadastrados, inclusive aqueles sem pontuação mensal, ordenados pela pontuação da etapa atual.
- **Editar** altera somente `monthlyPoints`, `monthlyPresences` e `monthlyFinishes` do jogador.
- **Desfazer** recupera apenas a pontuação mensal já publicada daquele jogador.
- **Salvar rascunho** grava o rascunho completo localmente no navegador.
- **Descartar alterações mensais** descarta só as edições mensais; o rascunho geral permanece.
- **Publicar mensal** publica apenas os campos mensais. O geral e seus modificadores continuam publicados como estavam.
- A aba **Ranking geral** continua responsável por criar jogadores, editar pontuação geral/fator/bônus, e finalizar a etapa.

O sistema preserva em rascunho as mudanças não publicadas da outra aba mesmo quando uma das duas é publicada. A publicação é protegida por `baseVersion` no Apps Script: se outro operador alterar os dados, a API rejeita a versão obsoleta.

## Observações importantes

- O **total mensal** é sempre `pontos por colocação + presenças` (sem multiplicador).
- A edição manual **não cria um torneio** e **não incrementa** a quantidade de torneios válidos. Para que a contagem e a elegibilidade para o bônus estejam corretas, cadastre cada torneio em **Torneios**, marcando se vale para o ranking mensal e selecionando a etapa.
- Não some os mesmos pontos manualmente e depois por torneio: isso causa duplicação. Uma correção manual sobre um evento cadastrado também pode interferir nas reversões futuras desse torneio. Prefira **editar o torneio original** quando ele estiver na lista.
- O mensal é um ranking da **etapa ativa**; ao avançar para a próxima etapa, a classificação atual é reiniciada conforme as regras vigentes.
- Edições mensais são bloqueadas após a finalização da etapa, para proteger os bônus.
- Novos jogadores devem ser criados e publicados no **Ranking geral** antes de serem editados no mensal.
- Não há alterações de schema, planilha ou Apps Script nesta mudança (usa `publish` da API v5).

## Conferências da alteração

1. Atualize mensal de jogador e veja o geral permanecer inalterado.
2. Mantenha alteração geral pendente, publique mensal e confirme que a edição geral segue pendente.
3. Mantenha alteração mensal pendente, publique geral e confirme que a edição mensal segue pendente.
4. Teste editar, desfazer, descartar, salvar rascunho, recarregar a página e publicar.
5. Confira a ordenação por pontos + presenças e os desempates.
6. Teste as quatro abas em desktop e celular.
7. Confira que a etapa finalizada bloqueia novas edições manuais.
