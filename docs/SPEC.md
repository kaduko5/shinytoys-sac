# Inbox unificada de atendimento — Shiny Toys / Asgard

> **Atualização 24/11/2026: backend da fase 1 pronto no Supabase DADOSAI.** O contrato real (schema `sac`, RPCs, Realtime, envio `sac-enviar`, setores SAC/Financeiro/Comercial/Logística) está em **`BACKEND.md`** e prevalece sobre o SQL sugerido abaixo (§5) e sobre o “não fazer agora” do §11. O front só consome o backend.


Especificação para implementação da ferramenta de SAC / pós-venda.  
Este pacote é **só documentação e mockups**. Não configura (e o agente que for implementar não deve configurar neste momento) contas reais na Meta, no Supabase, no Gmail ou no Netlify, nem gravar segredos em arquivos.

Idioma da interface: **pt-BR**.  
Mockups de referência: `imagens/inbox.png`, `imagens/fluxo.png`, `imagens/inbox-email.png`. Protótipos HTML: `prototipo/`.

---

## 1. Visão geral e objetivo

Construir um painel de atendimento em que **vários atendentes** (setores SAC, Financeiro e Logística) trabalham numa **fila única**, com conversas de **vários canais** (no MVP, WhatsApp Business API; em seguida, e-mail; depois outros como Instagram ou chamado do portal B2B).

Pontos centrais:

- Um único número de WhatsApp, **+55 11 97246-5529**, conta **Sac ShinyToys**, compartilhado. Nenhum atendente usa WhatsApp próprio. A atribuição e a transferência acontecem **dentro da ferramenta**.
- A identidade do cliente é **unificada**: um cadastro agrega telefone, e-mail, CNPJ e o histórico de todos os canais.
- Ao abrir uma conversa, o painel **Cliente 360** mostra pedidos e status lidos do portal B2B (Supabase DADOSAI, schema `shiny`) e do ERP (schema `erp`: `status_pedidos`, `nf_itens`). O atendente **não inventa** prazo, preço, estoque ou status.
- A mensagem que entra no WhatsApp segue: Cloud API (Meta) → Edge Function `whatsapp-webhook` no Supabase DADOSAI → tabelas `sac_*` → inbox → resposta via Graph API, saindo pelo **mesmo número**.
- O e-mail do cliente entra na **mesma fila e, quando casado, no mesmo fio**, e a resposta sai pela caixa do SAC na mesma thread (`In-Reply-To` / `References`).

O front deve **casar visualmente e em padrão de produto** com o portal B2B existente (`kaduko5/shinytoys-portal`). Não afirmar aqui stacks, pastas ou tokens desse repositório: isso precisa ser conferido no código do portal no momento da implementação.

---

## 2. Telas (seguir os mockups)

Layout geral, como em `imagens/inbox.png`: barra superior + três colunas (fila, conversa, Cliente 360). Visual moderno, limpo, denso o suficiente para trabalho diário. Dados exibidos nos mockups são **fictícios** e no produto real vêm do banco.

### 2.1 Barra superior

- Marca / título da ferramenta (Shiny Toys / Asgard — atendimento).
- Identificação do WhatsApp compartilhado: **+55 11 97246-5529 · Sac ShinyToys**.
- Abas/filtros de setor: **Todos**, **SAC**, **Financeiro**, **Logística**.
- Identidade do atendente logado (nome e setor).

### 2.2 Inbox unificada (coluna esquerda)

Fila única de conversas, de todos os canais ativos.

Cada item mostra:

- Ícone e cor do canal (WhatsApp, e-mail, e, no futuro, Instagram / portal B2B).
- Nome do cliente (razão social ou nome do contato).
- Prévia da última mensagem.
- Horário (ou “Ontem” / data).
- Tag do setor e nome do atendente atribuído (ou “Sem atribuição”).
- Indicador de não lida.

Há busca (cliente, pedido, protocolo) e filtros auxiliares: Todas / Não lidas / Minhas. A aba de setor da barra superior restringe a fila ao setor escolhido (em **Todos**, a fila completa).

### 2.3 Conversa (coluna central)

Cabeçalho da conversa aberta:

- Nome do cliente.
- Canal(is) envolvidos e identificador visível (telefone ou e-mail).
- Protocolo no formato `SAC-AAAA-NNNNNN` (ex.: `SAC-2026-000188`).
- **Atribuída a: [nome] ([setor])**.
- Botões **Transferir para …** nos outros setores.
- Aviso visível de que as respostas de WhatsApp saem pelo número compartilhado (e, no canal e-mail, pela caixa do SAC — ver §2.4).

O fio (thread):

- Histórico cronológico. Pode **misturar canais** no mesmo cadastro/ticket (ex.: um e-mail de 18/11 e um WhatsApp de hoje), cada mensagem com etiqueta de origem (“Entrou por e-mail”, “Saiu por WhatsApp · +55 11 97246-5529”).
- Notas de sistema (roteamento, atribuição, transferência).
- Caixa de resposta contextual ao canal da resposta: no WhatsApp, rótulo **Responder via WhatsApp (+55 11 97246-5529)**; no e-mail, o rótulo da §2.4.

Referência visual: `imagens/inbox.png` (conversa WhatsApp com histórico misto).

### 2.4 Conversa originada de e-mail

Referência: `imagens/inbox-email.png`.

Além do que vale para qualquer conversa:

- Barra de **Assunto** (e prefixo `Re:` nas respostas).
- Cabeçalho de cada mensagem: De, Para, horário.
- **Anexos** visíveis no fio, com nome e tipo; dá para baixar e (na resposta) anexar arquivos (XML, 2ª via de NF, etc.).
- Caixa de resposta rotulada **Responder por e-mail (`sac@shinyt.exemplo`)** — este endereço é **de exemplo**. O endereço real da caixa do SAC deve ser confirmado com o Carlos e ficar em variável de ambiente, nunca hardcoded no front.
- A resposta permanece na **mesma thread** de e-mail (cabeçalhos `In-Reply-To` e `References`).

### 2.5 Cliente 360 (coluna direita)

Cadastro único do cliente selecionado, com selo discreto só quando os dados forem de demonstração.

Blocos:

1. **Identificação**: razão social, CNPJ, telefone, e-mail, canais vinculados.
2. **Histórico de atendimentos / protocolos** (`SAC-AAAA-NNNNNN`), com status (Aberto, Resolvido, etc.) e resumo.
3. **Pedidos do portal** — rótulo da fonte: `Portal B2B (Supabase DADOSAI · schema shiny)`.
4. **Status e prazo** — rótulo: `ERP (erp.status_pedidos)`.
5. **Nota fiscal e itens** — rótulo: `ERP (erp.nf_itens)`.

Cada bloco de integração deve mostrar a **fonte**. Se a consulta falhar ou a coluna ainda não tiver sido conferida, exibir estado vazio/erro honesto — nunca um prazo ou status inventado.

---

## 3. Regras de negócio

- **Número único de WhatsApp.** Todas as conversas de WhatsApp entram e saem por **+55 11 97246-5529** (Sac ShinyToys). Não há um número por atendente. O roteamento é interno (setor + atribuição).
- **Setores.** `SAC`, `Financeiro`, `Logística`. Uma conversa/ticket pertence a um setor por vez. Filtros da inbox respeitam isso. Há papel de administração (visão “Todos” e gestão de atendentes), a definir com o Carlos na implementação, mas o modelo já prevê setor e perfil.
- **Atribuição.** Uma conversa pode estar sem atendente ou atribuída a um atendente do setor atual. O atendente pode assumir (“pegar”) uma conversa da fila do seu setor.
- **Transferência.** “Transferir para Financeiro / Logística / SAC” muda o setor, registra evento no fio, e opcionalmente limpa ou sugere novo responsável do setor destino. A resposta continua saindo pelo mesmo número (WhatsApp) ou pela mesma caixa (e-mail).
- **Protocolo.** Todo ticket recebe um protocolo `SAC-AAAA-NNNNNN` (ano + sequencial com zero à esquerda, ex.: `SAC-2026-000123`). É único, visível no cabeçalho e no Cliente 360, e pesquisável.
- **Ticket.** Campos obrigatórios de ciclo de vida:
  - `aberto_em`
  - `primeira_resposta_em` (preenchido na primeira mensagem de saída humana; não contar nota de sistema)
  - `fechado_em`
  - `solucao` (texto curto da solução, no fechamento)
  - `status` (sugerido: `aberto`, `pendente`, `aguardando_cliente`, `resolvido`, `fechado` — fechar o enum com o Carlos se já houver padrão interno)
- **Janela de 24h do WhatsApp.** Responder à mensagem do cliente dentro de 24h usa mensagem de sessão (não exige template pago). Fora da janela, o envio só pode ser feito com **template** aprovado na Meta, e a UI deve impedir o envio livre, explicando o motivo e oferecendo a escolha de um template. Não assumir método de pagamento ou templates já existentes: isso fica para o Carlos configurar depois.
- **Cadastro único de cliente.** Um cliente (empresa / razão social + CNPJ quando houver) agrega vários **contatos**: telefones, e-mails, eventualmente id do portal. Mensagens novas são casadas por telefone (WhatsApp, normalizado) ou e-mail do remetente (normalizado, case-insensitive). Se não houver match, cria-se cadastro rascunho e o atendente pode vincular depois. Não duplicar o cliente porque ele escreveu de um segundo e-mail — oferecer mesclagem.
- **Não inventar dados operacionais.** Prazo, preço, estoque, status de pedido e NF só vêm das integrações de leitura ou do que o atendente registrou explicitamente. Se o dado não estiver no painel, o sistema não completa a frase com um valor chutado.
- **Escalonamento.** Reclamações graves, clientes grandes e pedidos de reembolso devem poder ser sinalizados / transferidos para o Carlos (ou fila de supervisão). Não automatizar o julgamento no MVP; oferecer ação manual “escalar”.
- **Idempotência.** Webhooks e mensagens de e-mail são processados de forma idempotente (ids externos únicos). Reentrega da Meta ou do Gmail não duplica mensagem no fio.

---

## 4. Arquitetura

Visão do fluxo: `imagens/fluxo.png`.

### 4.1 WhatsApp (entrada e saída)

1. O cliente envia WhatsApp para +55 11 97246-5529.
2. **WhatsApp Cloud API (Meta)** entrega o evento no webhook.
3. **Edge Function `whatsapp-webhook`** no projeto Supabase **DADOSAI**:
   - atende o desafio de verificação (`hub.challenge` com `WHATSAPP_VERIFY_TOKEN`);
   - valida a assinatura dos POSTs (app secret);
   - normaliza o payload, resolve o cliente, grava conversa/mensagem/ticket;
   - responde 200 rapidamente; trabalho pesado pode ir para fila interna se necessário.
4. Tabelas `sac_*` no DADOSAI.
5. O front da inbox (tempo real via Supabase Realtime, ou polling curto no MVP) mostra a conversa.
6. O atendente responde. O backend envia via Graph API:

```
POST https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages
Authorization: Bearer <WHATSAPP_CLOUD_API_TOKEN>
```

A mensagem sai pelo mesmo número. Guardar o id retornado pela Graph API em `sac_mensagens`. Tratar status de entrega/leitura se o webhook enviá-los (atualizar a mensagem, não criar outra).

**Placeholders (não usar IDs reais neste documento):**

- `WHATSAPP_PHONE_NUMBER_ID` ou `<PHONE_NUMBER_ID>`
- `WHATSAPP_WABA_ID` ou `<WABA_ID>`

Os valores reais ficam só em secrets / env do ambiente de deploy, fornecidos pelo Carlos de forma segura — nunca commitados e nunca impressos neste pacote.

### 4.2 Canal de e-mail (entrada e saída)

Objetivo: ler os e-mails que os clientes mandam para a **caixa do SAC** e fazer as respostas saírem dessa mesma caixa, na mesma thread, aparecendo na inbox unificada.

**Origem da caixa.** Preferência: caixa do SAC no **Google Workspace**, via **Gmail API**, com OAuth da conta/serviço autorizada (escopos mínimos de leitura e envio). Recepção:

- Preferencial: **push** com Gmail `users.watch` + **Pub/Sub**, e a Edge Function / worker processa o histórico a partir do `historyId`.
- Alternativa: **polling** periódico (`history.list` ou busca de não lidos).
- Alternativa se a API ainda não estiver disponível: **IMAP** (leitura) + envio SMTP / Gmail API. Documentar a escolha no código.

**Processamento de um e-mail recebido:**

1. Ler Message-ID, In-Reply-To, References, assunto, de, para, cc, texto/HTML (guardar texto puro para o fio; HTML sanitizado se for exibir), anexos (storage, com limite de tamanho a definir).
2. **Casar o remetente** com `sac_contatos_cliente` (e-mail). Se a mensagem for resposta (`In-Reply-To` / `References` / assunto `Re:`) a uma conversa já existente, anexar a esse fio mesmo que o remetente seja um contato novo do mesmo cliente.
3. Se casar com cliente que já tem ticket **aberto**, preferir anexar a esse ticket (ou oferecer vínculo). Se não casar, criar cliente rascunho + nova conversa/ticket, setor inicial sugerido (ex.: Financeiro se o assunto/caixa indicar cobrança; senão SAC).
4. Gravar em `sac_mensagens` com `canal = 'email'`, direção `entrada`, e ids externos (Gmail id, Message-ID RFC).
5. A conversa aparece na **mesma fila**, com ícone de e-mail.

**Resposta:**

- Enviar da caixa do SAC, com `In-Reply-To` e `References` corretos, assunto `Re: …` quando couber, e os anexos escolhidos.
- Gravar a saída na mesma conversa.
- O endereço visível na UI vem de env (no mockup: `sac@shinyt.exemplo`, só exemplo).

Não implementar, neste pacote, o OAuth em produção. A fase 2 descreve o desenho; a ligação da conta é um passo posterior, com o Carlos, por fluxo seguro de credenciais.

### 4.3 Front e hospedagem

- Interface web autenticada (atendentes). Autenticação alinhada ao que o portal já usar, **depois de conferir** o repo `kaduko5/shinytoys-portal` — não inventar um segundo login se já houver padrão.
- Deploy do front: **commit + push no GitHub**; o **Netlify publica sozinho**. **Nunca** enviar zip direto no Netlify. Ver §10.

### 4.4 O que fica fora do núcleo (por enquanto)

Instagram, chat do portal B2B e bots automáticos de resposta podem ser desenhados como canais extras na mesma fila, mas não fazem parte das fases 1 e 2.

---

## 5. Modelo de dados SQL sugerido

Schema sugerido: `sac` no projeto DADOSAI (ou `public`, se for o padrão já usado — conferir antes de criar). Nomes de tabela abaixo são a proposta; ajustar prefixos se o DADOSAI já tiver convenção.

IDs: `uuid` como PK, salvo sequencial do protocolo. Timestamps em `timestamptz`, timezone de exibição `America/Sao_Paulo`.

```sql
-- Setores e atendentes
create table sac_setores (
  id text primary key,              -- 'sac' | 'financeiro' | 'logistica'
  nome text not null
);

create table sac_atendentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                     -- auth.users, quando houver
  nome text not null,
  email text not null unique,
  setor_id text not null references sac_setores(id),
  papel text not null default 'atendente',  -- 'atendente' | 'supervisao' | 'admin'
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cadastro único
create table sac_clientes (
  id uuid primary key default gen_random_uuid(),
  razao_social text,
  nome_fantasia text,
  cnpj text,                        -- só dígitos, unique quando não nulo
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sac_contatos_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references sac_clientes(id),
  tipo text not null,               -- 'telefone' | 'email' | 'portal' | 'instagram'
  valor text not null,              -- telefone em E.164; e-mail em minúsculas
  rotulo text,                      -- 'financeiro', 'compras', etc.
  principal boolean not null default false,
  unique (tipo, valor)
);

-- Conversas e tickets
create table sac_conversas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references sac_clientes(id),
  canal_origem text not null,       -- 'whatsapp' | 'email' | 'portal' | 'instagram'
  assunto text,                     -- especialmente e-mail
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table sac_tickets (
  id uuid primary key default gen_random_uuid(),
  protocolo text not null unique,   -- SAC-AAAA-NNNNNN
  conversa_id uuid not null references sac_conversas(id),
  cliente_id uuid not null references sac_clientes(id),
  setor_id text not null references sac_setores(id),
  status text not null default 'aberto',
  aberto_em timestamptz not null default now(),
  primeira_resposta_em timestamptz,
  fechado_em timestamptz,
  solucao text,
  created_at timestamptz not null default now()
);

create table sac_atribuicoes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references sac_tickets(id),
  atendente_id uuid references sac_atendentes(id), -- null = fila do setor, sem dono
  setor_id text not null references sac_setores(id),
  inicio_em timestamptz not null default now(),
  fim_em timestamptz,
  motivo text                        -- 'assumiu' | 'transferencia' | 'escalado' | ...
);

create table sac_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references sac_conversas(id),
  ticket_id uuid references sac_tickets(id),
  canal text not null,              -- 'whatsapp' | 'email' | 'sistema'
  direcao text not null,            -- 'entrada' | 'saida' | 'sistema'
  atendente_id uuid references sac_atendentes(id),
  corpo_texto text,
  corpo_html text,
  assunto text,
  enviado_em timestamptz not null default now(),
  -- ids externos (idempotência e correlação)
  wa_message_id text unique,
  email_rfc_id text unique,         -- Message-ID
  email_in_reply_to text,
  email_references text,
  gmail_message_id text unique,
  gmail_thread_id text,
  meta text,                        -- json (payload resumido, status de entrega, etc.)
  created_at timestamptz not null default now()
);

create table sac_anexos (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references sac_mensagens(id),
  nome_arquivo text not null,
  mime_type text,
  tamanho_bytes integer,
  storage_path text not null
);
```

Índices sugeridos: `sac_mensagens (conversa_id, enviado_em)`, `sac_tickets (setor_id, status, aberto_em)`, `sac_contatos_cliente (valor)`, `sac_tickets (protocolo)`, `sac_conversas (cliente_id, last_message_at desc)`.

Geração do protocolo (ideia): sequência anual (tabela `sac_protocolo_seq(ano, ultimo)`) ou `nextval` por ano, formatando `SAC-2026-000123`. Evitar corrida de concorrência (transação / unique no protocolo).

### 5.1 RLS por setor

Ativar RLS em `sac_conversas`, `sac_mensagens`, `sac_tickets`, `sac_atribuicoes`, `sac_anexos` (e leitura de clientes ligados a esses tickets).

Regras sugeridas (ajustar aos claims do JWT / tabela `sac_atendentes`):

- Atendente vê tickets (e mensagens/conversas ligadas) cujo **setor atual** é o seu, ou que lhe estejam atribuídos.
- Papel `supervisao` / `admin` vê todos os setores (filtro “Todos”).
- Insert/update de mensagem de saída só pelo atendente autenticado (ou service role nas functions).
- Edge Functions usam service role com cuidado, nunca exposta no front.
- Leituras do portal/ERP no Cliente 360: via function ou views de **somente leitura**, com o mesmo recorte de cliente da conversa aberta. Não abrir o schema `erp` inteiro para o papel de atendente no client-side.

Detalhar as policies no código; o importante é: **um atendente de Logística não lista a fila do Financeiro**, a menos que tenha perfil amplo ou a conversa tenha sido transferida para o setor dele.

---

## 6. Integrações de leitura — Cliente 360

Somente leitura. Não gravar de volta no ERP/portal neste projeto, salvo se o Carlos pedir depois.

| Bloco na UI | Fonte declarada | Observação |
|---|---|---|
| Pedidos do portal | Supabase DADOSAI, schema `shiny` | Pedidos do cliente no portal B2B (número, data, valor, situação). |
| Status e prazo | `erp.status_pedidos` | Status do pedido e prazo de faturamento/entrega. |
| NF e itens | `erp.nf_itens` | Nota fiscal e itens ligados ao pedido. |

**Os nomes de colunas, chaves (CNPJ, código do cliente, número do pedido) e o relacionamento entre `shiny` e `erp` PRECISAM ser conferidos no banco DADOSAI antes de escrever as queries.** Não assumir `pedido_id`, `prazo`, `valor` etc. como nomes definitivos. Se a coluna não existir ou o join for incerto, o implementador lista o que encontrou e deixa o bloco em estado “fonte não mapeada” — não inventa o mapeamento.

Ligação típica (a confirmar): CNPJ / código do cliente do cadastro SAC → pedidos em `shiny` → status em `erp.status_pedidos` → itens em `erp.nf_itens`.

Cache curto é opcional; a verdade é a do banco. Erro de consulta deve aparecer no painel, não como dado falso.

---

## 7. Segredos e variáveis de ambiente

Nenhum valor secreto entra neste pacote, no git do front, nem em issue/chat. Só nomes de variáveis. Exemplos:

```
# WhatsApp Cloud API
WHATSAPP_CLOUD_API_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=          # validação da assinatura do webhook
WHATSAPP_PHONE_NUMBER_ID=     # placeholder <PHONE_NUMBER_ID>
WHATSAPP_WABA_ID=             # placeholder <WABA_ID>
WHATSAPP_GRAPH_API_VERSION=v21.0

# Supabase DADOSAI
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # só no backend / Edge Function

# E-mail (Gmail API / Workspace) — valores e endereço real a confirmar
GMAIL_SAC_ADDRESS=            # no mockup: sac@shinyt.exemplo (exemplo)
GMAIL_OAUTH_CLIENT_ID=
GMAIL_OAUTH_CLIENT_SECRET=
GMAIL_OAUTH_REFRESH_TOKEN=
GMAIL_PUBSUB_TOPIC=           # se usar push
# ou, se IMAP/SMTP for a via escolhida:
IMAP_HOST=
IMAP_USER=
IMAP_PASSWORD=
SMTP_HOST=
SMTP_USER=
SMTP_PASSWORD=
```

O token permanente da Meta (usuário do sistema) e as credenciais Gmail são coletados com o Carlos por canal seguro (não colar no chat, não escrever em arquivo no repositório).

---

## 8. Fases de entrega

### Fase 1 — MVP WhatsApp (implementar primeiro)

- Tabelas `sac_*` essenciais, RLS, protocolos, atendentes e setores.
- Edge Function `whatsapp-webhook` (verificação + recebimento + gravação idempotente).
- Envio pela Graph API (`/<PHONE_NUMBER_ID>/messages`) pelo número compartilhado.
- Inbox unificada + conversa + atribuição + transferência entre os três setores.
- Respeito à janela de 24h (bloquear envio livre fora dela; gancho para templates).
- Cadastro mínimo de cliente casado por telefone.
- Autenticação dos atendentes.
- Front no visual dos mockups, publicado pelo fluxo GitHub → Netlify (§10).
- Cliente 360 nesta fase pode ter só o cadastro + histórico de protocolos (os blocos portal/ERP podem aparecer como “em breve” ou leitura já, se o mapeamento do banco estiver conferido).

### Fase 2 — E-mail

- Ingestão da caixa do SAC (Gmail API + push/polling, ou IMAP).
- Match por e-mail e por thread (`Message-ID` / `In-Reply-To` / `References`).
- Fio com assunto, anexos e “Responder por e-mail”.
- Envio na mesma thread.
- Mesma fila e mesma regra de setores/atribuição.

### Fase 3 — Cliente 360 completo

- Leituras conferidas em `shiny` e `erp.status_pedidos` / `erp.nf_itens`.
- Blocos da coluna direita preenchidos, com rótulo de fonte, vazios/erros honestos.

### Fase 4 — Métricas

- Tempo até a primeira resposta (`primeira_resposta_em - aberto_em`).
- Volume por canal e por setor, tickets abertos/fechados, SLA básico.
- Painel simples para o Carlos; nada de número sem período e sem definição.

---

## 9. Critérios de aceite

**Fase 1**

- [ ] Mensagem de WhatsApp de teste chega à inbox e aparece no fio, com o cliente casado pelo telefone (ou rascunho criado).
- [ ] A resposta do atendente sai pelo número +55 11 97246-5529 (Sac ShinyToys), não por outro número.
- [ ] Dois atendentes de setores diferentes veem as filas corretas; transferir move a conversa e registra no fio.
- [ ] Todo ticket novo tem protocolo `SAC-AAAA-NNNNNN` único; `aberto_em` preenchido; `primeira_resposta_em` preenchido na primeira saída humana.
- [ ] Fora da janela de 24h, o envio livre é bloqueado com explicação.
- [ ] Webhook reenviado não duplica mensagem.
- [ ] Nenhum segredo no repositório; IDs de app/telefone só em env.
- [ ] Front publicado via commit+push (GitHub → Netlify), sem upload de zip no Netlify.
- [ ] Interface em pt-BR, alinhada aos mockups e, no que for conferido, ao portal existente.

**Fase 2 (quando for a vez)**

- [ ] E-mail de cliente para a caixa do SAC abre (ou se anexa a) uma conversa na mesma inbox.
- [ ] Remetente conhecido liga no cadastro único; thread de resposta fica no mesmo fio.
- [ ] “Responder por e-mail” envia da caixa do SAC com `In-Reply-To` / `References` e aparece no Gmail na mesma conversa.
- [ ] Anexos de entrada são visíveis; anexos de saída são enviados.

**Fase 3**

- [ ] Com o mapeamento conferido no banco, o Cliente 360 lista pedidos, status/prazo e NF/itens do cliente aberto, cada bloco com a fonte.
- [ ] Sem dado no banco, o bloco não inventa valor.

**Geral**

- [ ] Atendente não vê ticket de outro setor (salvo perfil amplo).
- [ ] Nada deste SPEC autoriza configurar sozinho a Meta, o Gmail ou produção: credenciais e go-live com o Carlos.

---

## 10. Regra de deploy (Carlos)

1. Trabalho em repositório Git.
2. **Commit + push no GitHub.**
3. O **Netlify publica sozinho** a partir desse repositório/branch (build já ligado).
4. **Nunca** fazer upload de zip direto no Netlify.
5. Variáveis de ambiente e segredos entram no painel do Netlify / do Supabase, não em arquivo commitado.
6. Edge Functions e migrations seguem o fluxo do projeto DADOSAI (conferir o padrão já usado no portal/repo), também via git — não “colar no dashboard” como caminho principal se já houver CLI/CI.

---

## 11. Escopo explícito deste pacote

Incluído: especificação, prompt, mockups e HTML de conceito.

Não incluído e **não fazer agora**: criar tables/functions no DADOSAI de produção, registrar webhook na Meta, conectar Gmail OAuth, publicar o site, ou gravar tokens.

Dados dos mockups (Mundo Kids, Loja Encantada, NF 88421, `sac@shinyt.exemplo`, etc.) são **de exemplo**.
