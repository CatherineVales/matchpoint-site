# Match Point — Media & Performance

Site institucional **bilíngue (PT/EN)** da Match Point — agência de tráfego pago e performance para empresas de **Construction, Real Estate, Architecture, Home Maintenance e Cleaning** no mercado americano.

## Estrutura

O site fica em `match.point/assets/`:

- `index.html` — versão **PT** (`lang="pt-BR"`, fonte da verdade)
- `en/index.html` — versão **EN** (transcriação; compartilha CSS/JS via `../`)
- `css/prehero.css` · `js/prehero.js` — estilos e comportamento compartilhados
- `images/`, `videos/` — mídia (heróis em WebP)
- `termos.html`, `privacidade.html` (+ `en/terms.html`, `en/privacy.html`) — páginas legais (provisórias, requerem revisão jurídica)
- `favicon.svg`, `robots.txt`, `sitemap.xml` + JSON-LD nas páginas — SEO

## Rodar localmente

```bash
cd match.point/assets
python -m http.server 5599
```

Abra **http://localhost:5599** (PT) ou **http://localhost:5599/en/** (EN).

## Deploy

Conteúdo 100% estático — publique o diretório `match.point/assets/` em qualquer host estático (Netlify, Vercel, Cloudflare Pages, GitHub Pages). Domínio previsto: **matchpoint.agency** (canonical, OG, sitemap e JSON-LD já apontam para ele).

Excluir do deploy público: `design_system_oficial.html` (referência interna, já com `noindex`) e os `.png`-mestre não referenciados (`images/prehero.png`, `images/founders-banner.png`).

## Stack

HTML + CSS + JavaScript vanilla, **sem framework nem dependências**. Fontes via Google Fonts (Cormorant Garamond · Outfit · Syne). Movimento tokenizado com variantes `prefers-reduced-motion`.
