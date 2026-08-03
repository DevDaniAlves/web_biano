# web_biano

Front BIANO / Calangus — React + Vite (loja, gestor, atendimento WhatsApp).

## Setup

```bash
copy .env.example .env
npm install
npm run dev
```

- Painel: http://localhost:5173  

Em desenvolvimento, o Vite faz proxy de `/api` e `/uploads` para `http://localhost:3333` (repositório **api_biano**).

## Produção

```bash
# .env
VITE_API_URL=https://sua-api.exemplo.com

npm run build
```

Sirva a pasta `dist/` (Netlify, Vercel, nginx, etc.).
