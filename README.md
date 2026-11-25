# Shiny Toys · Inbox SAC (fase 1)

Painel de atendimento do WhatsApp do SAC (+55 11 97246-5529). Front em React + Vite + TypeScript.

No ar: https://sacshinyt.netlify.app
O backend (tabelas, RPCs, Realtime, webhook e envio) já está no Supabase **DADOSAI**. Contrato: [`docs/BACKEND.md`](docs/BACKEND.md).

## Rodar no computador

```bash
npm install
cp .env.example .env   # preencha as 2 variáveis
npm run dev
```

## Variáveis

| Variável | Onde pegar |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → publishable (ou anon) |
| `VITE_SAC_ENVIO_REAL` | `true` = envio real ao cliente (ativado em 25/11/2026). Sem ela, o app fica em modo teste (só checagem). |

Nunca coloque service role, token do WhatsApp ou App Secret aqui.

## Deploy (Netlify)

Commit + push no GitHub → o Netlify publica sozinho (`netlify.toml` já configura build `npm run build`, pasta `dist` e redirect de SPA).
No Netlify: Site configuration → Environment variables → criar as variáveis acima.

## Supabase Auth (uma vez)

- Authentication → Sign In / Providers: desligar **Allow new users to sign up**.
- Authentication → URL Configuration: **Site URL** = endereço do Netlify (o link de "esqueci a senha" volta para ele).
- Authentication → Users → Add user: criar cada atendente. Ele entra como **inativo**; o admin libera na tela **Atendentes**.

## Telas

- **Login** (e-mail + senha, esqueci a senha). Sem cadastro.
- **Inbox**: fila com abas de setor, filtros e busca · conversa com envio, janela de 24h, assumir/soltar, transferir, fechar, reabrir e nota interna · painel do cliente.
- **Atendentes** (só admin): liberar acesso, setores e papel.

## Próximas fases

1. Anexos (fotos e áudios)
2. Modelos de mensagem (templates) para depois das 24h
3. Painel do cliente com pedidos/NF (schemas `shiny` e `erp`)
4. E-mail
