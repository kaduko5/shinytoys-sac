-- Fase A (parte 2): tipos do Carlos (T1–T9 lojista, C1–C4 consumidor). SLA em horas ÚTEIS (dia útil = 10h, 8h–18h).
-- Os 10 tipos genéricos anteriores ficam inativos (não são apagados).
update sac.tipos_ticket set ativo = false, updated_at = now() where codigo is null;

insert into sac.tipos_ticket (codigo, nome, publico, setor_padrao, prioridade_padrao, sla_primeira_resposta_h, sla_resolucao_h, categoria, ordem, proxima_acao, checklist) values
 ('T1','Avaria na entrega','lojista','logistica','alta',4,30,'Avaria / Estoque',10,'Definir a solução com a transportadora',
   '["Foto das caixas","Canhoto com ressalva","Laudo da transportadora","Definição da solução"]'),
 ('T2','Divergência de preço / NF','lojista','comercial','normal',4,20,'Outro',20,null,'[]'),
 ('T3','Faltou mercadoria','lojista','logistica','alta',4,50,'Falta de Mercadoria (Loja)',30,null,'[]'),
 ('T4','Mercadoria a mais','lojista','logistica','baixa',8,50,'Mercadoria a Mais (Loja)',40,null,'[]'),
 ('T5','Defeito de fabricação','lojista','qualidade','normal',4,70,'Avaria / Estoque',50,null,'[]'),
 ('T6','Troca / devolução','lojista','comercial','normal',4,70,'Devolução / Troca',60,null,'[]'),
 ('T7','Boleto / financeiro','lojista','financeiro','normal',4,20,'Outro',70,null,'[]'),
 ('T8','Cadastro / acesso ao portal','lojista','sac','baixa',4,10,'Outro',80,null,'[]'),
 ('T9','Pedido em atraso','lojista','logistica','alta',2,10,'Atraso / Prazo',90,null,'[]'),
 ('C1','Defeito / garantia','consumidor','sac','normal',2,70,'Avaria / Estoque',110,null,'[]'),
 ('C2','Faltou peça / chegou quebrado','consumidor','sac','normal',2,50,'Avaria / Estoque',120,null,'[]'),
 ('C3','Montagem / manual','consumidor','sac','baixa',2,10,'Outro',130,null,'[]'),
 ('C4','Onde comprar','consumidor','sac','baixa',2,10,'Outro',140,null,'[]')
on conflict do nothing;
