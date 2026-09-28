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
