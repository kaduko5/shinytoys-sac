# Prompt para o Claude Code — fase 1 da inbox SAC (front)

Crie o repositório `shinytoys-sac` no GitHub, abra-o no Claude Code com esta pasta copiada para `docs/` (`SPEC.md`, `BACKEND.md`, `imagens/`, `prototipo/`) e cole o bloco abaixo.

---

Você vai construir o **front da fase 1** da inbox de atendimento (SAC) da Shiny Toys: WhatsApp + login de atendentes.

**O backend já está pronto no Supabase** (tabelas, RLS, RPCs, Realtime, webhook do WhatsApp e envio). Seu trabalho é **só o front**, consumindo o contrato de `docs/BACKEND.md`.

Leia antes de codar, nesta ordem:
1. `docs/BACKEND.md`: contrato **obrigatório** (RPCs, envio `sac-enviar`, Realtime, login, erros). Ele vale mais que o SPEC onde os dois divergirem (nomes de tabela, setores, schema `sac`).
2. `docs/SPEC.md`: produto, regras e critérios de aceite da fase 1 (§8 e §9). As seções de SQL e o "não fazer agora" do §11 estão desatualizados: o backend já existe.
3. `docs/imagens/inbox.png`, `docs/imagens/fluxo.png` e `docs/prototipo/inbox.html`: o visual a seguir.

**Stack:** React + Vite + TypeScript, `@supabase/supabase-js` v2, roteamento simples, CSS próprio ou Tailwind (escolha um e mantenha). Interface 100% em pt-BR, datas no fuso America/Sao_Paulo.

**Telas e funções da fase 1:**
- **Login** (e-mail + senha, "esqueci a senha"). Sem tela de cadastro. Se `sac_meu_perfil()` vier `null` ou com `ativo=false`, mostrar "acesso aguardando liberação".
- **Inbox** (3 colunas, como no mockup):
  - **Fila à esquerda:** abas de setor (Todos/SAC/Financeiro/Comercial/Logística, conforme o perfil), filtros (ativos/fechados, minhas/sem dono) e busca. Cada item mostra o ícone do WhatsApp, o nome, a prévia, a hora, o selo de não lidas, o protocolo, o setor e o dono.
  - **Conversa no centro:** bolhas de entrada e saída, status ✓/✓✓/lida, eventos e notas internas com estilo próprio. Campo de resposta via `sac-enviar`, com aviso da janela de 24h (contagem regressiva; bloqueado e "precisa template" fora dela). Botões Assumir/Soltar, Transferir setor (com motivo), Fechar (pede a solução) e Reabrir. Campo de nota interna.
  - **Painel direito "Cliente":** dados de `sac_detalhe_conversa` (nome, telefone, contatos, ticket atual, histórico de protocolos). Pedidos/NF/ERP aparecem como "em breve (fase 3)". Não inventar dados.
- **Admin** (só `papel='admin'`): lista de atendentes (`sac_listar_atendentes`), com edição de nome, setores, papel e ativo (`sac_admin_salvar_atendente`).
- **Realtime** conforme o `BACKEND.md` §6: lista e conversa atualizam sozinhas. Marcar como lida ao abrir.

**Regras inegociáveis:**
- Só a anon/publishable key e a URL do Supabase no front, via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (`.env` no `.gitignore`; crie um `.env.example` com placeholders). **Nunca** service role, token do WhatsApp, App Secret ou IDs da Meta no código.
- **Não** crie nem altere tabelas, migrations ou Edge Functions no Supabase. Se faltar algo no backend, pare e descreva o que precisa.
- Não mande mensagens reais para testar. Use `dry_run: true` no `sac-enviar` enquanto desenvolve. Envio real só quando o Carlos testar com o próprio WhatsApp.
- Não invente prazo, preço, estoque ou status.
- Deploy: **commit + push no GitHub → Netlify publica sozinho**. Inclua `netlify.toml` (build `npm run build`, publish `dist`, redirect SPA `/* /index.html 200`). **Nunca** fazer upload de zip no Netlify.

**Entregue em passos pequenos, com commit a cada passo:**
1. Scaffold, login e perfil.
2. Fila com filtros, busca e Realtime.
3. Conversa com envio (dry_run) e janela de 24h.
4. Ações: assumir, transferir, fechar, reabrir e nota.
5. Painel do cliente.
6. Tela de admin.
7. `netlify.toml` e README (como rodar e configurar as variáveis).

Comece mostrando um plano curto (arquivos e componentes) e siga.

---

Se estiver no **Claude Design** (só visual): reproduza as telas de `imagens/` e `prototipo/` como UI navegável em pt-BR, com estados de vazio, carregando, "fora da janela de 24h", ticket fechado e "acesso aguardando liberação". Ignore o backend.
