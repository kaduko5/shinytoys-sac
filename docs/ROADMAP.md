# Roadmap SAC Shiny Toys (atualizado 25/11/2026)

Decisões do Carlos:
- **Uma base só (Supabase DADOSAI), duas telas**: SAC (time interno) e aba Tarefas do portal (vendedores acompanham os chamados dos seus clientes).
- Protocolo: `SAC-AAAA-NNNNNN` (lojista) e `CF-AAAA-NNNNNN` (consumidor final).
- Prazos em **horário comercial seg–sex 8h–18h**.
- Novo setor: **Qualidade**.
- Controle de **produto e quantidade com defeito** por fabricante (para cobrar o fabricante).
- Envio WhatsApp em **modo teste** até o fim.

## Fase A — Tipos, campos e classificação (próxima)
1. Tipos T1–T9 (lojista) e C1–C4 (consumidor) com categoria, departamento, prioridade, prazos, próxima ação e checklist (ver `TIPOS-CHAMADO.md`).
2. **Configurador** (admin): por tipo, escolher quais campos aparecem e quais são obrigatórios na abertura/fechamento.
   Campos: Título, Departamento, Responsável, Transportadora/Armazém, NF (botão Puxar), Cliente, Pedido, Categoria, Prioridade, Status, Prazo, Vendedor, Seguidores (e-mails), Próxima ação (texto+data), Descrição, Produtos e divergência (colar lista / adicionar itens), Solução e Resolvida em.
3. Situações: aberta, andamento, aguardando, resolvida, cancelada.
4. **Itens do chamado** (SKU, produto, qtd, tipo de divergência/defeito, fabricante, valor) → base do relatório de defeitos por fabricante e do "prejuízo em aberto".
5. Tela **Novo chamado** completa + classificação obrigatória para fechar.
6. **Cliente amarrado pelo telefone/CNPJ** com a base do portal (`portal_clientes`: 933 clientes, 746 com telefone) → histórico automático.
7. **Timeline do ticket** com duração de cada etapa (quanto tempo em cada status, quem alterou o quê).

## Fase B — Painel de indicadores (cards)
Abertas · Vencidas · Aguardando terceiro · Próxima ação hoje · Sem prazo ou responsável · Resolvidas no mês · Tempo médio de solução (90d) · Prejuízo em aberto (mês/ano) · Exportar Excel.

## Fase C — Portal (vendedores)
Aba Tarefas do portal passa a ler os chamados do Supabase (só os dos clientes do vendedor). Importar as tarefas atuais da planilha.

## Fase D — Chamados por e-mail
Caixa do SAC → vira chamado no mesmo fio; resposta sai pela caixa do SAC.

## Fase E — Painel do cliente com dados reais
Pedidos do portal, status/prazo do ERP, NF e itens (hoje "Em breve").

## Fase F — Extensão do Gmail
Criar chamado direto do Gmail (depois que os campos estiverem estáveis).

## Progresso Fase A
- [x] Backend: migrations `20261125120000..150000` aplicadas no DADOSAI (setor Qualidade, campos, itens, categorias, configurador, protocolo CF, SLA horário comercial, tipos T1–T9/C1–C4, RPCs `sac_salvar_ticket`, `sac_salvar_itens`, `sac_marcar_checklist`, `sac_cancelar_ticket`, `sac_listar_campos`, `sac_admin_salvar_campo`, `sac_listar_categorias`, `sac_buscar_clientes`, `sac_vincular_cliente_portal`, `sac_abrir_ticket` com `p_publico/p_campos/p_portal_chave`).
- [x] Front: painel do ticket com campos/checklist/itens/cancelar + linha do tempo com durações
- [x] Front: Novo chamado (público, cliente do portal, campos)
- [x] Front: Admin — tipos completos + configurador de campos
- Envio WhatsApp REAL ativado em 25/11 a pedido do Carlos.

## Progresso Fase B (25/11)
- [x] Cards: abertas, vencidas, aguardando terceiro, próxima ação hoje, sem prazo/responsável, resolvidas no mês, tempo médio 90d, prejuízo em aberto/ano (`sac_indicadores`). Clique filtra a lista (`card` em `_filtrar_tickets`).
- [x] Exportar Excel (`sac_exportar_tickets`, até 5.000 linhas, mesmos filtros).
- [x] Fix: chamado cancelado conta como encerrado (mensagem nova abre chamado novo).
- [x] Assistente WhatsApp (setor → tipo → e-mail → CNPJ), modo teste com 11918520852.
