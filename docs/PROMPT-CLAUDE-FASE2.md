# Prompt para o Claude Code — fase 2 da inbox SAC (tipos, novo ticket, recursos estilo Zendesk)

Copie `BACKEND-FASE2.md` para `docs/` no repo `shinytoys-sac` e cole o bloco abaixo no Claude Code.

---

Vamos evoluir a inbox do SAC (repo atual, React + Vite + TS + supabase-js). **O backend já está pronto no Supabase.** Seu trabalho é só o front.

Leia antes de codar:
1. `docs/BACKEND-FASE2.md`: contrato **obrigatório** das funções novas e do que mudou (status novos, colunas novas, filtros).
2. `docs/BACKEND.md`: contrato da fase 1, que continua valendo.
3. O código atual (`src/lib/api.ts`, `src/lib/types.ts`, `src/lib/format.ts`, `src/pages/Inbox.tsx`, `src/components/*`). Mantenha os padrões: chamadas pelo `api`, `mensagemErro`, CSS em `styles.css` e textos em pt-BR.

**Primeiro, ajustes de compatibilidade (commit separado):**
- Status novos em `STATUS_TICKET` e no CSS `.tag.status-*`: `novo`, `aberto`, `pendente`, `em_espera`, `resolvido`, `fechado`. Remova `em_atendimento` e `aguardando_cliente`.
- Aba "Fechados" da fila → `p_status: 'encerrados'`.
- Ticket `resolvido` continua aceitando resposta. Só `fechado` bloqueia o campo. "Reabrir" aparece para fechado **e** resolvido (menos para os mesclados).
- Conversas de canal `telefone`/`interno`: sem campo de resposta do WhatsApp, só nota interna e ações.
- Tipos novos em `types.ts` (ticket completo, tipos, macros, views) e mensagens de erro novas em `ERROS`.

**Funcionalidades (um commit por item):**
1. **Botão "Novo ticket"** (topo da fila): modal com:
   - Canal (WhatsApp/Telefone/E-mail/Interno).
   - Cliente: telefone/WhatsApp, nome e e-mail.
   - Assunto e descrição.
   - Tipo (o setor se preenche pelo tipo e pode ser trocado), prioridade e tags.
   - "Atribuir a mim".
   - Chama `sac_abrir_ticket` e abre a conversa criada.
   - Se vier `ja_existe_ticket_aberto`, mostre o protocolo e um botão "Abrir ticket existente".
   - Deixe claro que **nada é enviado ao cliente**.
2. **Lateral do ticket** (painel direito, acima dos dados do cliente):
   - Seletores de status, prioridade e tipo (`sac_atualizar_ticket` / `sac_definir_tipo`). Ao trocar o tipo, perguntar "mover para o setor X?".
   - Tags com autocomplete (`sac_listar_tags`).
   - Assunto editável.
   - Bloco SLA com 1ª resposta e resolução: prazo, contagem e cor (vermelho/amarelo/verde/cinza, conforme o BACKEND-FASE2 §1).
   - Vínculos (vincular por protocolo, desvincular, mesclar com confirmação).
   - CSAT: mostra a nota se houver e permite registrar manualmente em ticket resolvido/fechado.
   - Botão "Histórico" (`sac_historico_ticket`) em lista do tipo auditoria.
3. **Macros no composer:**
   - Botão "Respostas prontas" com busca (`sac_listar_macros`, priorizando o tipo do ticket).
   - Ao escolher, chama `sac_aplicar_macro` e coloca o `texto` no campo, **sem enviar**.
   - Mostra um aviso quando a macro aplicou ações (status/tags).
4. **Filas/views na barra lateral esquerda:**
   - Lista de `sac_listar_views` com contagem (Minha fila, Não atribuídos, SLA atrasado, Urgentes, Pendentes, Em espera, Todos ativos, Resolvidos e as views salvas).
   - Ao clicar, a lista usa `sac_listar_tickets(filtros, ordem)`, com paginação pelo `total`.
   - Filtros avançados (status, setor, tipo, prioridade, tags, dono, atrasado, canal, período, busca) e "Salvar como view" (compartilhada só para admin/supervisor).
   - As abas de setor atuais podem virar views. Mantenha a busca.
5. **Indicadores na lista:**
   - Selo de prioridade (urgente vermelho, alta laranja).
   - Ponto/relógio de SLA (atrasado em vermelho com "venceu há X").
   - Nome do tipo e até 2 tags.
6. **Admin** (só admin, na tela atual de atendentes, em abas):
   - **Tipos de ticket:** CRUD com nome, setor padrão, SLA de 1ª resposta e de resolução em horas, ordem e ativo (`sac_admin_salvar_tipo`).
   - **Macros:** CRUD para admin/supervisor, com título, corpo, setor, tipo, ações e ativa, mais a ajuda das variáveis `{{primeiro_nome}}`, `{{protocolo}}` etc. (`sac_admin_salvar_macro`).
   - Pré-visualização da macro com dados de exemplo.

**Realtime:** continue escutando `sac.tickets`, `sac.conversas` e `sac.mensagens`. Ao mudar, recarregue a view atual e as contagens (debounce de ~300 ms) e o ticket aberto.

**Regras inegociáveis:**
- **Não** crie nem altere tabelas, migrations ou Edge Functions no Supabase. Se faltar algo, pare e descreva o que precisa.
- Só a URL e a anon key no front (já configuradas). Nada de service role, token do WhatsApp ou IDs da Meta no código.
- Não mande mensagem real para testar. Use o modo teste (`dry_run`) que já existe. Macros e "Novo ticket" **nunca** enviam nada.
- Não invente prazo, preço, estoque ou status.
- Deploy: **commit + push no GitHub → Netlify publica sozinho**. Nunca upload de zip no Netlify.

Comece listando o plano curto (arquivos e componentes que vai criar ou alterar) e siga em passos pequenos, com commit a cada um.

---

Se estiver no **Claude Design** (só visual): desenhe a fila com views na lateral, a lista com selos de prioridade e SLA, o modal "Novo ticket", a lateral do ticket (status, prioridade, tipo, tags, SLA, vínculos, CSAT), o seletor de respostas prontas no composer e as telas de admin de tipos e macros. Tudo em pt-BR.
