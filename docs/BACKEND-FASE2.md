# BACKEND-FASE2.md — contrato das novas funções do SAC (tipos, ticket manual, recursos estilo Zendesk)

> O backend **já está aplicado** no Supabase (schema `sac`). O front só consome.
> Tudo continua igual ao `docs/BACKEND.md` da fase 1: `supabase.rpc(...)`, exige login de atendente ativo, erros em `error.message`.
> **Não** crie nem altere tabelas, migrations ou Edge Functions. Se faltar algo, descreva e peça.

## 0. O que mudou e pode afetar o front atual

**Status do ticket (novo modelo, estilo Zendesk):**

| status | rótulo sugerido | quando |
|---|---|---|
| `novo` | Novo | ticket criado e ainda sem dono nem resposta |
| `aberto` | Aberto | alguém assumiu ou respondeu; o cliente respondeu de novo |
| `pendente` | Pendente (aguardando cliente) | o atendente marca |
| `em_espera` | Em espera (aguardando interno) | o atendente marca (ex.: esperando a logística) |
| `resolvido` | Resolvido | o atendente marca. Se o cliente responder, volta a `aberto` sozinho (conta reabertura) |
| `fechado` | Fechado | `sac_fechar_ticket` (exige solução). Mensagem nova do cliente abre **outro** ticket |

- Os valores antigos `em_atendimento` e `aguardando_cliente` **deixaram de existir**. Atualize o `STATUS_TICKET` e as classes CSS `.tag.status-*`.
- `sac_listar_conversas(p_status)`:
  - `ativos` agora significa novo/aberto/pendente/em_espera (sem resolvido).
  - Novo valor `encerrados` = resolvido + fechado. Use `encerrados` na aba "Fechados".
- Ticket `resolvido` ainda aceita resposta (`sac-enviar`). Só `fechado` bloqueia.
- `sac_reabrir_ticket` agora aceita `fechado` **ou** `resolvido`.

**Colunas novas (não quebram nada):**
- `sac_listar_conversas` agora devolve também, no fim: `prioridade`, `tipo_id`, `tipo_nome`, `tags`, `assunto`, `sla_atrasado`, `sla_proximo_vencimento`.
- `sac_detalhe_conversa.ticket_atual` agora é o **ticket completo** (formato do §2). `tickets[]` ganhou `assunto`, `canal_origem`, `tipo_nome` e `prioridade`.

**Conversas de outros canais:**
- `canal` / `canal_origem` da conversa pode ser `telefone` ou `interno` (tickets abertos à mão).
- Nesses canais **não há envio por WhatsApp**: `janela_aberta=false`, e `sac-enviar` responde `canal_invalido`.
- Mostre só notas internas e ações, e esconda o campo de resposta.

## 1. Objeto "ticket completo"

Usado por `sac_detalhe_ticket`, `sac_atualizar_ticket`, `sac_definir_tipo` e `sac_detalhe_conversa.ticket_atual`:

```
id, protocolo, conversa_id, cliente_id, setor_id, status, status_rotulo, prioridade (baixa|normal|alta|urgente),
tipo_id, tipo_nome, tags[], assunto, canal_origem (whatsapp|telefone|email|interno), origem (automatico|manual),
aberto_por, aberto_por_nome, atribuido_a, atribuido_nome, atribuido_em,
aberto_em, primeira_resposta_em, resolvido_em, fechado_em, fechado_por, solucao, reaberto_em, reaberturas, mesclado_em, updated_at,
sla_primeira_resposta_vence_em, sla_resolucao_vence_em, sla_atrasado (bool), sla_proximo_vencimento,
sla_primeira_resposta_cumprido (bool|null), sla_resolucao_cumprido (bool|null),
csat {nota, comentario, canal, respondido_em} | null,
vinculos [{ticket_id, protocolo, status, tipo: relacionado|mesclado, direcao: saida|entrada}]
```

**Como o SLA é calculado:**
- Horas **corridas**, a partir de `aberto_em`.
- A base é o SLA do tipo (sem tipo: 8h para a 1ª resposta e 48h para a resolução), multiplicada pelo fator da prioridade: urgente ×0,25, alta ×0,5, normal ×1, baixa ×2.
- Muda sozinho quando o tipo ou a prioridade mudam.
- `sla_atrasado = true` quando o ticket não está resolvido/fechado e (está sem 1ª resposta e passou do prazo da 1ª resposta) ou passou do prazo de resolução.
- **Indicador sugerido:**
  - Vermelho: atrasado.
  - Amarelo: faltam menos de 25% do prazo até `sla_proximo_vencimento`.
  - Verde: dentro do prazo.
  - Cinza: resolvido/fechado.
- A 1ª resposta é registrada no primeiro envio pelo WhatsApp. Tickets manuais de `telefone`/`interno` já nascem com a 1ª resposta preenchida.

## 2. Tipos de ticket

| RPC | Parâmetros | Retorno |
|---|---|---|
| `sac_listar_tipos` | `p_incluir_inativos?` bool (só vale para admin) | `[{id, nome, descricao, setor_padrao, sla_primeira_resposta_h, sla_resolucao_h, ordem, ativo, editavel}]` |
| `sac_admin_salvar_tipo` | `p_id` (null = novo), `p_nome`, `p_setor_padrao`, `p_sla_primeira_resposta_h`, `p_sla_resolucao_h`, `p_descricao?`, `p_ordem?`=100, `p_ativo?`=true | tipo salvo. **Só admin.** O formulário manda todos os campos (substitui). Para "excluir", use `p_ativo=false` |
| `sac_definir_tipo` | `p_ticket_id`, `p_tipo_id`, `p_transferir_setor?`=false | ticket completo. Com `true`, move para o setor padrão do tipo |

Tipos iniciais (editáveis):
- Dúvida de pedido/status
- Prazo/atraso de entrega
- Nota fiscal/2ª via
- Troca/devolução
- Produto com defeito
- Avaria no transporte
- Falta/divergência de itens
- Cobrança/boleto
- Comercial/orçamento
- Outros

## 3. Abrir ticket manual (não envia nada ao cliente)

`sac_abrir_ticket`:

| Parâmetro | Obrigatório | Observação |
|---|---|---|
| `p_canal` | sim | `whatsapp` \| `telefone` \| `email` \| `interno` |
| `p_assunto` | sim | mín. 3 caracteres |
| `p_descricao` | não | vira nota interna no fio |
| `p_tipo_id` | não | |
| `p_setor_id` | não | padrão: setor do tipo, senão `sac` |
| `p_prioridade` | não | padrão `normal` |
| `p_cliente_id` | não | cliente já existente |
| `p_wa_id` / `p_telefone` | `whatsapp` exige | só dígitos ou formatado. Número BR com 10/11 dígitos ganha o 55 |
| `p_nome` | não | nome do cliente novo |
| `p_email` | `email` exige (se não houver `p_cliente_id`) | adiciona como contato |
| `p_tags` | não | text[] |
| `p_atribuir_a_mim` | não | `true` → já nasce `aberto` com você como dono |

**Retorno:** `{ok, ticket_id, protocolo, conversa_id, cliente_id, setor_id}`. O protocolo é gerado pela mesma sequência (SAC-AAAA-NNNNNN).

**Regras:**
- Cliente: acha pelo telefone, depois pelo e-mail. Se não achar, cria um com `p_nome`. É preciso pelo menos um entre cliente, telefone, e-mail ou nome.
- `whatsapp`: usa a conversa existente daquele número.
  - Se já houver ticket não fechado nela, dá o erro `ja_existe_ticket_aberto: SAC-… está aberto…`. Mostre o link para ele.
  - O envio para o cliente continua sujeito à janela de 24h (sem template, não dá para puxar conversa).
- `telefone` / `email` / `interno`: cria uma conversa própria para o ticket.

Erros:
- `canal_invalido`
- `assunto_obrigatorio`
- `prioridade_invalida`
- `tipo_invalido`
- `setor_invalido`
- `cliente_nao_encontrado`
- `telefone_invalido`
- `whatsapp_obrigatorio`
- `email_obrigatorio`
- `cliente_obrigatorio`
- `contato_de_outro_cliente`
- `ja_existe_ticket_aberto`

## 4. Editar ticket (lateral)

`sac_atualizar_ticket(p_ticket_id, p_tipo_id?, p_prioridade?, p_status?, p_tags?, p_assunto?, p_limpar_tipo?=false)`:
- Parâmetro null = não mexe.
- `p_status` aceita: `aberto`, `pendente`, `em_espera` ou `resolvido`. Para fechar use `sac_fechar_ticket`.
- `p_tags` **substitui** a lista. As tags são normalizadas: minúsculas, sem repetição, até 40 caracteres.
- Retorna o ticket completo.
- Mudanças de status, prioridade e tipo geram uma linha `evento` no fio.
- Erros:
  - `ticket_fechado`
  - `status_invalido`
  - `prioridade_invalida`
  - `tipo_invalido`
  - `acesso_negado`

`sac_listar_tags(p_busca?)` → `[{tag, qtd}]`, para o autocomplete.

## 5. Lista por ticket, filas e views

`sac_listar_tickets(p_filtros jsonb, p_ordem?, p_limite?=50 (máx. 200), p_offset?=0)`
- `p_ordem`: `recentes` (padrão) \| `antigos` \| `sla` (vencimento mais próximo primeiro) \| `prioridade` (urgente→baixa, depois SLA).
- `p_filtros` (todas as chaves são opcionais):

```json
{
  "status": "ativos" | "encerrados" | "pendente" | ["novo","aberto"],
  "setor": "logistica",
  "prioridade": "alta" | ["urgente","alta"],
  "tipo_id": "<uuid>",
  "tags": ["troca"],            // qualquer uma
  "atribuido": "eu" | "ninguem" | "<uuid do atendente>",
  "atrasado": true,
  "canal": "whatsapp" | "telefone" | "email" | "interno",
  "cliente_id": "<uuid>",
  "aberto_de": "2026-11-01T00:00:00-03:00", "aberto_ate": "...",
  "busca": "texto"              // protocolo, assunto, nome/razão, CNPJ, telefone, tag e texto das mensagens
}
```

- Cada linha traz:
  - Identificação: `ticket_id, protocolo, conversa_id, cliente_id, cliente_nome, contato, canal_origem, assunto`.
  - Classificação: `status, prioridade, tipo_id, tipo_nome, tags, setor_id, atribuido_a, atribuido_nome`.
  - Datas e SLA: `aberto_em, atualizado_em, primeira_resposta_em, sla_primeira_resposta_vence_em, sla_resolucao_vence_em, sla_atrasado, sla_proximo_vencimento`.
  - Conversa: `ultima_mensagem_em, ultima_previa, nao_lidas, janela_aberta, eh_ticket_atual`.
  - `total`: total sem paginação, para "1–50 de N".
- A visibilidade é a mesma da fase 1: admin/supervisor veem tudo; atendente vê seus setores e o que está atribuído a ele.
- Ao clicar num ticket, abra a conversa (`conversa_id`). Se `eh_ticket_atual=false` (ticket antigo da conversa), mostre o fio com `sac_detalhe_ticket` na lateral.

`sac_listar_views()` → `[{id, nome, filtros, ordem, sistema, compartilhada, minha, contagem}]`
- Views do sistema (`id` começa com `sys:`):
  - Minha fila
  - Não atribuídos
  - SLA atrasado
  - Urgentes e altos
  - Pendentes
  - Em espera
  - Todos ativos
  - Resolvidos e fechados
- Depois vêm as views salvas: as compartilhadas e as minhas.
- Para abrir uma view: `sac_listar_tickets(view.filtros, view.ordem)`.
- `contagem` = quantidade atual. Recarregue no Realtime de `tickets` (debounce).

| RPC | Parâmetros | Observação |
|---|---|---|
| `sac_salvar_view` | `p_id` (null = nova), `p_nome`, `p_filtros` jsonb, `p_ordem?`, `p_compartilhada?`=false, `p_posicao?` | compartilhada só admin/supervisor. Pessoal: só o dono edita |
| `sac_excluir_view` | `p_id` | dono, ou admin/supervisor para as compartilhadas |

## 6. Macros / respostas prontas

| RPC | Parâmetros | Retorno |
|---|---|---|
| `sac_listar_macros` | `p_setor?`, `p_tipo_id?` (as do tipo vêm primeiro), `p_incluir_inativas?` | `[{id, titulo, corpo, setor_id, tipo_id, tipo_nome, acoes, ordem, ativo}]` (as gerais + as dos seus setores) |
| `sac_aplicar_macro` | `p_macro_id`, `p_ticket_id`, `p_aplicar_acoes?`=true | `{texto, acoes_aplicadas, acoes}` |
| `sac_admin_salvar_macro` | `p_id` (null = nova), `p_titulo`, `p_corpo` (máx. 4000), `p_setor_id?` (null = todos), `p_tipo_id?`, `p_acoes?`, `p_ordem?`, `p_ativo?` | só admin/supervisor. Substitui tudo. "Excluir" = `p_ativo=false` |

- `sac_aplicar_macro` devolve o texto já com as variáveis trocadas e aplica as ações. **Não envia.** O front coloca o `texto` no campo de resposta, e o atendente revisa e envia pelo `sac-enviar`.
- Variáveis:
  - `{{nome}}`
  - `{{primeiro_nome}}`
  - `{{protocolo}}`
  - `{{atendente}}` (primeiro nome)
  - `{{atendente_nome}}`
  - `{{setor}}`
  - `{{tipo}}`
  - `{{assunto}}`
- `acoes` (opcional): `{"status": "pendente|em_espera|aberto|resolvido", "prioridade": "...", "tipo_id": "<uuid>", "tags_adicionar": ["..."]}`.
- Macros iniciais: Saudação, Verificando, Encerramento.

## 7. Histórico, vínculos, mesclar, CSAT

| RPC | Parâmetros | Retorno / regra |
|---|---|---|
| `sac_detalhe_ticket` | `p_ticket_id` | ticket completo (§1) |
| `sac_historico_ticket` | `p_ticket_id` | `[{id, evento, de, para, autor_id, autor_nome, criado_em}]` |
| `sac_vincular_tickets` | `p_ticket_id`, `p_outro_ticket_id` | relacionado (precisa ver os dois) |
| `sac_desvincular_tickets` | `p_ticket_id`, `p_outro_ticket_id` | `{ok, removidos}` |
| `sac_mesclar_tickets` | `p_origem_id`, `p_destino_id`, `p_motivo?` | ver abaixo |
| `sac_registrar_csat` | `p_ticket_id`, `p_nota` 1–5, `p_comentario?`, `p_canal?`='manual' | só ticket resolvido/fechado. Registro manual (ex.: por telefone) |

- Eventos do histórico:
  - `criado`
  - `status`
  - `setor`
  - `atribuicao`
  - `prioridade`
  - `tipo`
  - `tags`
  - `assunto`
  - `mesclado`
- `autor_nome` null = sistema/webhook.
- **Mesclar:** a origem é **fechada** ("Mesclado em SAC-…"), as tags vão para o destino e os dois fios recebem um evento. As mensagens **não** mudam de lugar. A origem não pode ser reaberta (`ticket_mesclado`).
- **CSAT:** a pesquisa automática ao cliente **ainda não existe** (fica para depois, com template aprovado na Meta).

## 8. Realtime

Nada de novo para assinar. Mudanças de tipo, prioridade, tags e status chegam pelo canal de `sac.tickets` que o front já usa. Ao receber, recarregue a lista ou a view atual e o ticket aberto.
