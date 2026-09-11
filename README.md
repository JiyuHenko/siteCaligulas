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
