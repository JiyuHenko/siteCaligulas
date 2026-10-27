# Caligulas Poker Live

Site oficial estático do Caligulas Poker Live, publicado a partir da branch `main`.

## Estrutura

- `index.html` — home
- `casa.html` — informações da casa e localização
- `agenda.html` — programação regular e arquivo de torneios
- `cps.html` — Caligulas Poker Series
- `ranking.html` — ranking público + regulamento
- `galeria.html` — galeria completa
- `eventos.html` — arquivo histórico
- `admin/` — painel administrativo do ranking
- `assets/css/styles.css` — estilos públicos compartilhados
- `assets/css/admin.css` — estilos exclusivos do painel
- `assets/js/site.js` — navegação, contatos, mapa, lightbox, animações e home
- `assets/js/api.js` — integração do ranking
- `assets/js/ranking-page.js` — renderização da página de ranking
- `assets/js/admin.js` — painel administrativo
- `config.js` — endpoints e informações públicas de contato

`premiacoes.html` e `regulamento.html` são mantidos apenas como redirecionamentos para preservar URLs antigas.

## Desenvolvimento

Não existem cópias `.min.*` versionadas. O site carrega diretamente os arquivos-fonte para evitar divergência entre código editado e código publicado.

Para visualizar localmente:

```bash
python -m http.server 4173
```

Depois abra `http://localhost:4173/`.

A Action `Caligulas site quality` executa Lighthouse mobile e desktop sem alterar ou criar commits automaticamente.

## Convite para o grupo do WhatsApp

O convite abre na primeira página pública acessada, uma vez por sessão da aba. Depois de fechar ou clicar na imagem, a navegação e os recarregamentos nessa aba não repetem o popup. Uma nova sessão exibe o convite novamente. O painel administrativo e a página 404 não exibem o convite.

- Link do grupo: `whatsappGroupUrl` em `config.js`. Deixe vazio para desativar o convite.
- Arte: `assets/img/promo/whatsapp-group.webp`, otimizada a partir da imagem original, sem cortes.
- Comportamento: `setupWhatsAppWelcome()` em `assets/js/site.js`; estilos `.whatsapp-welcome` em `assets/css/styles.css`.
- A imagem inteira abre o grupo em nova aba; o X, o fundo e a tecla Esc fecham o convite. O diálogo nativo mantém o foco de teclado no popup e impede interação com o conteúdo atrás dele.
- Se a imagem falhar ou o navegador não oferecer suporte ao diálogo, o site continua acessível. Sem acesso ao armazenamento da sessão, o convite continua funcionando, mas pode reaparecer ao trocar de página.

## Ranking 2026/27

O admin atual usa o **Apps Script v6** em `apps-script/Code.gs`. A atualização do backend precisa ocorrer antes da publicação do frontend: execute `migrateV5ToV6()` e atualize a implantação existente. O procedimento, formato dos backups e controles de edição estão em [docs/ranking-v6-backend.md](docs/ranking-v6-backend.md).

O painel permite cadastrar jogadores diretamente no mensal, corrigir pontos/presenças/desempates e torneios válidos, publicar geral e mensal separadamente ou juntos, salvar rascunho automaticamente, restaurar backups completos e reabrir a etapa atual com estorno do bônus anterior.

Para conferir as alterações localmente:

```bash
npm ci
npm test
npx playwright install chromium
npm run test:e2e
```

Os testes de navegador executam o código real do Apps Script sobre uma planilha simulada e interceptam todas as requisições externas. Não acessam o ranking publicado.

O ranking usa o site estático como frontend e um Google Apps Script + Google Sheets como backend.

A versão 2026/27 acrescenta:

- fórmula geral `(pontos × fator) + presenças + bônus`;
- bônus acumulado fora do multiplicador;
- fatores de frequência a partir de 15, 21, 27, 33, 41 e 46 presenças;
- acordos com colocação repetida no mesmo torneio;
- ranking mensal por etapas entre os domingos especiais;
- controle de 100% de presença para o bônus mensal;
- histórico v4 com estado da etapa mensal.

A implantação exige atualizar o Apps Script antes de publicar esta branch em produção. A migração é feita por `migrateV3ToV4()` e preserva os jogadores e o histórico existentes. **Não use `resetAllData()` durante a migração.**

Veja `docs/apps-script-ranking-v4.md` para o procedimento.

