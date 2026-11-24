# BACKEND.md — contrato do backend da inbox SAC (fase 1)

> O backend **já está pronto** no Supabase DADOSAI. O front (repo `shinytoys-sac`) **só consome**: RPCs, Realtime e uma Edge Function de envio.
> **Não** crie tabelas, migrations nem functions novas sem combinar com o Carlos. **Não** use service role no front.
> Se precisar mudar o backend, descreva a mudança e peça.

## 1. Configuração do front

```
VITE_SUPABASE_URL=<SUPABASE_URL>             # Supabase > Project Settings > API > Project URL
VITE_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>   # Supabase > Project Settings > API Keys > anon / publishable
```

- As duas são públicas por natureza (vão no bundle), mas ficam **só** no `.env` local (no `.gitignore`) e nas variáveis de ambiente do Netlify. Não commitar.
- **Nunca** coloque `service_role`, o token do WhatsApp ou o App Secret no front. O front não precisa deles.
- Cliente: `@supabase/supabase-js` v2 → `createClient(url, anonKey)`.

## 2. Login (Supabase Auth)

- Login por **e-mail + senha** (`supabase.auth.signInWithPassword`). Pode ter também o fluxo "esqueci a senha" (`resetPasswordForEmail`).
- **Não há tela de cadastro.** Quem cria os usuários é o Carlos, no painel do Supabase (Authentication > Users > Add user / Invite).
- Cada usuário novo vira automaticamente um **atendente inativo e sem setor**. O admin libera depois (§4, `sac_admin_salvar_atendente`).
- `cpedro@shinyt.com.br` vira **admin** automaticamente (todos os setores) assim que o e-mail estiver confirmado.
- Depois do login, chame `sac_meu_perfil()`:
  - `null` ou `ativo=false` → mostrar "Seu acesso ainda não foi liberado pelo administrador".
  - `ativo=true` → abrir a inbox.

## 3. Modelo (somente leitura para referência)

Schema `sac` (o front **não** lê tabelas direto, exceto via Realtime):

| Tabela | O que é |
|---|---|
| `setores` | `sac`, `financeiro`, `comercial`, `logistica` |
| `atendentes` | 1:1 com `auth.users`: `nome`, `email`, `setores text[]`, `papel` (`admin`/`supervisor`/`atendente`), `ativo` |
| `clientes` / `contatos_cliente` | cadastro único; contato `whatsapp` com o wa_id (só dígitos, ex.: 5511…) |
| `conversas` | uma por contato/canal: `ticket_atual_id`, `ultima_entrada_em`, `ultima_previa`, `nao_lidas`, `last_message_at` |
| `tickets` | `protocolo` (SAC-AAAA-NNNNNN), `status`, `setor_id`, `atribuido_a`, `aberto_em`, `primeira_resposta_em`, `fechado_em`, `fechado_por`, `solucao`, `reaberturas` |
| `mensagens` | `direcao` (`entrada`/`saida`/`sistema`), `tipo` (`text`, `image`… , `nota_interna`, `evento`), `corpo_texto`, `status` (`recebida`/`sent`/`delivered`/`read`/`failed`), `enviado_em`, `atendente_id` |

**Status do ticket:** `aberto` → `em_atendimento` → (`aguardando_cliente`) → `fechado`.
- Mensagem nova do cliente num ticket fechado abre **novo ticket** (novo protocolo) automaticamente.
- Ticket novo nasce no setor `sac`, sem dono.

**Visibilidade:**
- `admin` e `supervisor` veem tudo.
- `atendente` vê só as conversas cujo ticket atual é de um dos seus setores ou está atribuído a ele.

**Janela de 24h:** texto livre só até 24h depois de `ultima_entrada_em` (a última mensagem do cliente). Fora disso o envio retorna `precisa_template`. Templates ainda não estão implementados (fase futura).

## 4. RPCs (`supabase.rpc(nome, params)`)

Todas exigem usuário logado **e** atendente ativo. Se não for, voltam erro `42501` / HTTP 403, com mensagem `acesso_negado…`. Os erros de regra voltam como `message` (ex.: `solucao_obrigatoria`). Mostre ao usuário uma mensagem amigável em pt-BR.

| RPC | Parâmetros | Retorno |
|---|---|---|
| `sac_meu_perfil` | — | `{id, nome, email, setores[], papel, ativo, created_at}` ou `null` (não exige ativo) |
| `sac_listar_setores` | — | `[{id, nome}]` |
| `sac_listar_atendentes` | `p_setor?` text | `[{id, nome, email, setores, papel, ativo}]` (admin vê inativos também) |
| `sac_listar_conversas` | `p_setor?` text, `p_status?` text (`ativos` = tudo menos fechado, ou um status exato), `p_busca?` text (nome, telefone, protocolo, prévia), `p_atribuicao?` (`minhas` \| `sem_dono`), `p_limite?`=50 (máx. 200), `p_offset?`=0 | `[{conversa_id, cliente_id, cliente_nome, wa_id, nome_perfil, canal, ticket_id, protocolo, ticket_status, setor_id, atribuido_a, atribuido_nome, aberto_em, ultima_mensagem_em, ultima_previa, ultima_entrada_em, nao_lidas, janela_aberta, janela_expira_em}]`, mais recente primeiro |
| `sac_detalhe_conversa` | `p_conversa_id` uuid | `{conversa, cliente, contatos[], ticket_atual (+atribuido_nome), tickets[] (histórico de protocolos do cliente), janela_aberta, janela_expira_em}` |
| `sac_mensagens_conversa` | `p_conversa_id` uuid, `p_antes?` timestamptz (paginação para trás), `p_limite?`=100 (máx. 500) | `[{id, conversa_id, ticket_id, protocolo, canal, direcao, tipo, corpo_texto, status, enviado_em, atendente_id, atendente_nome, enviado_por}]` em ordem cronológica |
| `sac_atribuir` | `p_ticket_id` uuid, `p_atendente_id?` uuid (null = soltar) | `{ok, ticket_id, atribuido_a}`. Atendente só pode **assumir** (o próprio id) ou **soltar** o próprio ticket; supervisor/admin atribuem a qualquer um do setor. |
| `sac_transferir_setor` | `p_ticket_id`, `p_setor_id`, `p_motivo?` | `{ok, ticket_id, setor_id}`; limpa o dono e volta o status pra `aberto` |
| `sac_fechar_ticket` | `p_ticket_id`, `p_solucao` (obrigatória, mín. 3 caracteres) | `{ok, ticket_id, protocolo}` |
| `sac_reabrir_ticket` | `p_ticket_id`, `p_motivo?` | `{ok, ticket_id, protocolo}` (só o ticket mais recente da conversa) |
| `sac_marcar_lida` | `p_conversa_id` | `{ok}` (zera `nao_lidas`) |
| `sac_adicionar_nota` | `p_conversa_id`, `p_texto` | `{ok, mensagem_id}`: nota interna, **não vai pro cliente** |
| `sac_admin_salvar_atendente` | `p_id` uuid, `p_nome?`, `p_setores?` text[], `p_papel?`, `p_ativo?` | atendente atualizado (só admin; admin não pode se desativar nem se rebaixar) |

Atribuir, transferir, fechar e reabrir gravam automaticamente uma linha `tipo='evento'` no fio. Notas aparecem como `tipo='nota_interna'`. Mostre os dois com estilo diferente das mensagens do cliente.

Erros comuns: `acesso_negado`, `ticket_fechado…`, `ticket_ja_fechado`, `ticket_nao_esta_fechado`, `ticket_antigo…`, `solucao_obrigatoria`, `setor_invalido`, `atendente_invalido`, `atendente_fora_do_setor…`, `texto_obrigatorio`.

## 5. Envio de resposta — Edge Function `sac-enviar`

```ts
const { data, error } = await supabase.functions.invoke('sac-enviar', {
  body: { conversa_id, texto, dry_run: false },
});
```

- Precisa estar logado (o JWT vai automático pelo supabase-js). A função confere o atendente, a permissão, o ticket e a janela de 24h, envia pela Graph API (número oficial do SAC) e grava a saída com o atendente.
- O token do WhatsApp fica no servidor (Supabase Vault). O front nunca vê.
- `dry_run: true` faz toda a checagem **sem enviar**. Use para testes.

| HTTP | Corpo | Significado / UI |
|---|---|---|
| 200 | `{ok:true, wa_message_id, mensagem_id, protocolo}` | enviada (o Realtime traz a linha) |
| 200 | `{ok:true, dry_run:true, …}` | checagem ok, nada enviado |
| 400 | `{erro:'texto_obrigatorio'\|'texto_longo'\|'conversa_invalida'}` | validação (máx. 4096 caracteres) |
| 401 | — | sessão expirada → relogar |
| 403 | `{erro:'acesso_negado'}` | sem permissão |
| 409 | `{erro:'precisa_template', mensagem}` | **fora da janela de 24h**: bloquear o campo e mostrar "precisa template" |
| 422 | `{erro:'ticket_fechado'\|'sem_contato'\|'canal_invalido'}` | reabrir o ticket antes |
| 502/503 | `{erro:'graph_api'\|'nao_configurado', mensagem}` | falha na Meta / servidor |

Com `supabase.functions.invoke`, respostas não-2xx chegam em `error` (`FunctionsHttpError`). Leia o corpo com `await error.context.json()`.

Na UI:
- Use `janela_aberta` / `janela_expira_em` (das RPCs) para já desabilitar o campo e mostrar a contagem regressiva.
- Ticket `fechado` → mostrar o botão "Reabrir" em vez do campo.

## 6. Realtime

As tabelas `sac.mensagens`, `sac.conversas` e `sac.tickets` estão na publicação `supabase_realtime`, com RLS. Cada atendente só recebe eventos do que pode ver.

```ts
const ch = supabase.channel('sac-inbox')
  .on('postgres_changes', { event: '*', schema: 'sac', table: 'conversas' }, () => recarregarLista())
  .on('postgres_changes', { event: '*', schema: 'sac', table: 'tickets' },   () => recarregarLista())
  .on('postgres_changes', { event: 'INSERT', schema: 'sac', table: 'mensagens',
        filter: `conversa_id=eq.${conversaAberta}` }, (p) => anexarMensagem(p.new))
  .on('postgres_changes', { event: 'UPDATE', schema: 'sac', table: 'mensagens',
        filter: `conversa_id=eq.${conversaAberta}` }, (p) => atualizarStatus(p.new)) // ✓ ✓✓ lida
  .subscribe();
```

- Assine depois do login (a sessão é usada automaticamente).
- Trate o payload como **gatilho**: para lista e nomes, recarregue via RPC (o payload não traz `cliente_nome`, `atribuido_nome` etc.).
- Debounce de ~300 ms ao recarregar a lista.
- Ao abrir uma conversa, chame `sac_marcar_lida`.

## 7. O que já existe e não é do front

- `whatsapp-webhook` (Edge Function): recebe as mensagens da Meta e valida a assinatura (`X-Hub-Signature-256`). Grava sem duplicar, cria cliente, conversa e ticket no primeiro contato e atualiza os status de entrega.
- Protocolo `SAC-AAAA-NNNNNN` gerado no banco.
- Mídia (imagem, áudio, documento) por enquanto chega só como texto `[image]` / legenda. Download e exibição ficam para a fase seguinte.
- E-mail é a fase 2. Cliente 360 com `shiny`/`erp` é a fase 3.
