# Prompt para o Claude Code — Painel "Copiloto" (IA) na inbox do SAC

> Cole tudo abaixo no Claude Code, na raiz do repositório `shinytoys-sac`. Antes, copie o `IA-BACKEND.md` para `docs/`.

---

Você vai adicionar o **Copiloto de IA** na inbox do SAC (React + Vite + TypeScript + supabase-js). O backend já está pronto e publicado. O contrato está em `docs/IA-BACKEND.md`: leia esse arquivo inteiro antes de começar.

## Regra de ouro
- A IA **só sugere**. Nada é enviado ao cliente sem o atendente clicar no botão **Enviar** que já existe (função `enviar()` em `src/lib/api.ts`, que chama `sac-enviar`).
- Nunca envie automaticamente. Nunca chame `sac-enviar` a partir do Copiloto.

## Antes de codar
1. Leia `src/lib/api.ts`, `src/lib/types.ts`, `src/components/Conversa.tsx`, `src/components/PainelCliente.tsx` e `src/styles.css`.
2. Siga o padrão do projeto: helpers em `api.ts`, mensagens de erro em `ERROS`, CSS em `styles.css` e nenhuma biblioteca nova.

## 1. API (`src/lib/api.ts` e `src/lib/types.ts`)
- Crie os tipos `IaAcao`, `IaEscalar`, `IaFonte`, `IaResposta`, `IaSugestaoHist` conforme o contrato.
- `ia(acao, ticketId, instrucao?)` chama `supabase.functions.invoke('sac-ia', { body: { acao, ticket_id, instrucao } })`.
  - Trate os erros como a função `enviar()` já faz (FunctionsHttpError → `corpo.erro`).
- Adicione os erros em `ERROS`:
  - `limite`: "Muitas chamadas seguidas. Aguarde um minuto."
  - `ia_indisponivel`: "A IA não respondeu agora. Tente de novo."
  - `acao_invalida`: "Ação inválida."
  - `ticket_invalido`: "Ticket não encontrado."
  - `sugestao_inexistente`: "Sugestão não encontrada."
- Crie também:
  - `iaFeedback(sugestaoId, resultado: 'usada'|'descartada', textoFinal?, motivo?)` → RPC `sac_ia_feedback`;
  - `iaHistorico(ticketId)` → RPC `sac_ia_historico`.

## 2. Painel lateral "Copiloto" (`src/components/Copiloto.tsx`)
- Fica na coluna da direita, junto com o `PainelCliente`.
- Use abas no topo da coluna: **Cliente** | **Copiloto**.
- Mantenha o mesmo visual do resto (cards, cores, `.muted`, `.pequeno`).
- Três botões no topo:
  - **Sugerir resposta**;
  - **Resumir**;
  - **Classificar**.
- Campo opcional "Instrução para a IA" (1 linha, até 300 caracteres). Ex.: "mais formal", "mais curto".
- Enquanto carrega: desabilite os botões e mostre "Pensando…" (pode levar de 3 a 8 s).
- Se `mock === true`: mostre uma faixa amarela com o texto de `aviso` ("Modo teste: sem IA conectada").
- **Badge de escalonamento** (sempre que `escalar.deve`):
  - vermelho se `para === 'carlos'`: "⚠ Escalar para o Carlos — {motivo}";
  - azul se for um setor: "Encaminhar para {Financeiro|Logística|Comercial|SAC} — {motivo}".
  - No caso de setor, ofereça o botão **Transferir** (usa o fluxo de transferência que já existe, com o motivo pré-preenchido).
  - A IA nunca transfere sozinha.
- **Fontes**: lista pequena e recolhível "Fontes usadas" com os `rotulo` de `fontes`.
- Se `vinculo_erp.encontrado === false`: mostre "Cliente sem vínculo com o ERP — confirme CNPJ ou nº do pedido".
- Se `vinculo_erp.metodo === 'telefone_nf'`: mostre "Vínculo pelo telefone (confirme o CNPJ)".

### Sugerir resposta
- Mostre a sugestão num card.
- Se houver itens em `precisa_verificar`, liste-os com o título "Antes de enviar, verifique:".
- Mostre a confiança como chip: alta/média/baixa.
- Botões do card:
  - **Usar no composer**: coloca o texto no textarea da conversa (o mesmo estado `texto`/`setTexto` de `Conversa.tsx`) e foca nele. O atendente pode editar à vontade. **Não envia.** Guarde o `sugestao_id` em um estado `sugestaoAtiva` na `Conversa`.
  - **Descartar**: abre um mini campo opcional "Por quê?" e chama `iaFeedback(id, 'descartada', undefined, motivo)`; o card some.
- Quando o atendente clicar em **Enviar** e o envio der certo:
  - se havia `sugestaoAtiva`, chame `iaFeedback(sugestaoAtiva, 'usada', textoEnviado)` sem bloquear a tela (se falhar, ignore);
  - limpe `sugestaoAtiva`.
  - O banco decide sozinho se ficou "aceita" ou "editada".
- Se o atendente apagar todo o texto do composer, limpe `sugestaoAtiva`.

### Resumir
- Card com o `resumo`, a lista de `pontos`, as `pendencias` e o `proximo_passo`.
- Botão **Copiar como nota interna**: chama `api.nota(conversaId, textoDoResumo)` (nota interna, não vai ao cliente).

### Classificar
- Mostre setor, tipo (nome do tipo vindo do catálogo de tipos de ticket já carregado no front; se não achar, mostre o id), prioridade, sentimento e motivo.
- Botão **Aplicar sugestão**:
  - usa as ações que o módulo de tickets já tem (alterar tipo/prioridade, transferir setor);
  - pede confirmação antes;
  - se alguma ação não existir no front, deixe o botão desabilitado com a dica "em breve".

### Histórico
- No rodapé do painel, item recolhível "Sugestões anteriores" (`iaHistorico`).
- Cada linha mostra: ação, status (gerada/aceita/editada/descartada), quem pediu e a hora em BRT.

## 3. Detalhes
- O Copiloto usa o `ticket_atual` da conversa aberta. Sem ticket, ou com o ticket fechado/resolvido, mostre "Sem ticket ativo" e desabilite os botões.
- Ao trocar de conversa, limpe o estado do Copiloto.
- Tudo em pt-BR. Horários em America/Sao_Paulo.
- Acessibilidade: botões com `aria-label`; o badge de escalonamento com `role="status"`.
- Nada de chave, token ou segredo no front. Só `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, como já é hoje.

## 4. Teste manual (antes do commit)
1. `npm run build` sem erros.
2. Abra uma conversa e clique em **Sugerir resposta**:
   - aparece o card (em modo mock, com a faixa amarela);
   - **Usar no composer** preenche o textarea e **não envia**.
3. Descartar → o card some.
4. Resumir → **Copiar como nota interna** cria a nota.
5. Classificar mostra os campos. Aplicar só acontece depois da confirmação.

## 5. Deploy
- Commit + push na `main`. O Netlify publica sozinho.
- Mensagem do commit: `feat: painel Copiloto (IA) na inbox`.
