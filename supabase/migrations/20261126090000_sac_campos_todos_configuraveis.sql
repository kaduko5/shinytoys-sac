-- Configurador: todos os campos podem ser ocultados; Tipo e Categoria viram um campo só (categoria vem do tipo)
delete from sac.campos_ticket where chave = 'categoria';
update sac.tipos_ticket set campos = campos - 'categoria' where campos ? 'categoria';
insert into sac.campos_ticket (chave, rotulo, ordem, estado_padrao, so_ao_fechar, fixo) values
  ('publico', 'Lojista / Consumidor', 12, 'opcional', false, false),
  ('tags', 'Tags', 165, 'opcional', false, false)
on conflict (chave) do nothing;
update sac.campos_ticket set fixo = false;
update sac.campos_ticket set rotulo = 'Tipo de chamado' where chave = 'tipo';
