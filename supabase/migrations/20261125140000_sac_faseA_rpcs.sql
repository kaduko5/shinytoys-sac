-- Fase A (parte 3): RPCs — configurador de campos, salvar chamado, itens, checklist, cancelar, validação, cliente do portal

-- ===== Campos efetivos (padrão global + sobrescrita do tipo) =====
create or replace function sac._campos_efetivos(p_tipo_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(c.chave, jsonb_build_object(
           'rotulo', c.rotulo, 'ordem', c.ordem, 'fixo', c.fixo, 'so_ao_fechar', c.so_ao_fechar,
           'estado', case when c.fixo and coalesce(tp.campos->>c.chave, c.estado_padrao) = 'oculto' then 'opcional'
                          else coalesce(tp.campos->>c.chave, c.estado_padrao) end)), '{}'::jsonb)
  from sac.campos_ticket c left join sac.tipos_ticket tp on tp.id = p_tipo_id;
$$;

-- campos obrigatórios que faltam (momento: 'abrir' ou 'fechar')
create or replace function sac._faltando(p_ticket uuid, p_momento text) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare t sac.tickets; cfg jsonb; k text; v jsonb; falta text[] := '{}'; vazio boolean;
begin
  select * into t from sac.tickets where id = p_ticket;
  cfg := sac._campos_efetivos(t.tipo_id);
  for k, v in select * from jsonb_each(cfg) loop
    continue when v->>'estado' <> 'obrigatorio';
    continue when p_momento = 'abrir' and (v->>'so_ao_fechar')::boolean;
    vazio := case k
      when 'assunto' then coalesce(trim(t.assunto),'') = ''
      when 'tipo' then t.tipo_id is null
      when 'setor' then t.setor_id is null
      when 'responsavel' then t.atribuido_a is null
      when 'transportadora' then coalesce(trim(t.transportadora),'') = ''
      when 'nf' then coalesce(trim(t.nf),'') = ''
      when 'cliente' then t.cliente_id is null
      when 'pedido' then coalesce(trim(t.pedido),'') = ''
      when 'categoria' then coalesce(trim(t.categoria),'') = ''
      when 'prioridade' then t.prioridade is null
      when 'prazo' then t.prazo is null
      when 'vendedor' then coalesce(trim(t.vendedor),'') = ''
      when 'seguidores' then coalesce(array_length(t.seguidores,1),0) = 0
      when 'proxima_acao' then coalesce(trim(t.proxima_acao),'') = ''
      when 'descricao' then coalesce(trim(t.descricao),'') = ''
      when 'itens' then not exists (select 1 from sac.ticket_itens i where i.ticket_id = t.id)
      when 'solucao' then coalesce(trim(t.solucao),'') = ''
      else false end;
    if vazio then falta := falta || (v->>'rotulo'); end if;
  end loop;
  return falta;
end $$;

-- ===== Tipos =====
drop function if exists public.sac_listar_tipos(boolean);
create function public.sac_listar_tipos(p_incluir_inativos boolean default false)
returns table(id uuid, codigo text, nome text, descricao text, publico text, categoria text, setor_padrao text, prioridade_padrao text,
              sla_primeira_resposta_h numeric, sla_resolucao_h numeric, proxima_acao text, checklist jsonb, campos jsonb,
              ordem integer, ativo boolean, editavel boolean)
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me();
begin
  return query select t.id, t.codigo, t.nome, t.descricao, t.publico, t.categoria, t.setor_padrao, t.prioridade_padrao,
      t.sla_primeira_resposta_h, t.sla_resolucao_h, t.proxima_acao, t.checklist, t.campos, t.ordem, t.ativo, t.editavel
    from sac.tipos_ticket t where t.ativo or (p_incluir_inativos and me.papel = 'admin') order by t.ordem, t.nome;
end $$;

drop function if exists public.sac_admin_salvar_tipo(uuid, text, text, numeric, numeric, text, integer, boolean);
create function public.sac_admin_salvar_tipo(
  p_id uuid default null, p_nome text default null, p_setor_padrao text default null,
  p_sla_primeira_resposta_h numeric default null, p_sla_resolucao_h numeric default null, p_descricao text default null,
  p_ordem integer default null, p_ativo boolean default null, p_codigo text default null, p_publico text default null,
  p_categoria text default null, p_prioridade_padrao text default null, p_proxima_acao text default null,
  p_checklist jsonb default null, p_campos jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); v_id uuid; k text; v text;
begin
  if me.papel <> 'admin' then raise exception 'acesso_negado: só admin' using errcode = '42501'; end if;
  if p_id is null and coalesce(length(trim(p_nome)),0) < 2 then raise exception 'nome_obrigatorio'; end if;
  if p_setor_padrao is not null and not exists (select 1 from sac.setores where id = p_setor_padrao) then raise exception 'setor_invalido'; end if;
  if p_sla_primeira_resposta_h is not null and p_sla_primeira_resposta_h <= 0 then raise exception 'sla_invalido'; end if;
  if p_sla_resolucao_h is not null and p_sla_resolucao_h <= 0 then raise exception 'sla_invalido'; end if;
  if p_publico is not null and p_publico not in ('lojista','consumidor','ambos') then raise exception 'publico_invalido'; end if;
  if p_prioridade_padrao is not null and p_prioridade_padrao not in ('baixa','normal','alta','urgente') then raise exception 'prioridade_invalida'; end if;
  if p_categoria is not null and not exists (select 1 from sac.categorias where nome = p_categoria) then raise exception 'categoria_invalida'; end if;
  if p_checklist is not null and jsonb_typeof(p_checklist) <> 'array' then raise exception 'checklist_invalido'; end if;
  if p_campos is not null then
    for k, v in select key, value #>> '{}' from jsonb_each(p_campos) loop
      if not exists (select 1 from sac.campos_ticket where chave = k) then raise exception 'campo_invalido: %', k; end if;
      if v not in ('oculto','opcional','obrigatorio') then raise exception 'estado_invalido: %', k; end if;
    end loop;
  end if;
  if p_id is null then
    insert into sac.tipos_ticket (codigo, nome, descricao, publico, categoria, setor_padrao, prioridade_padrao, sla_primeira_resposta_h,
                                  sla_resolucao_h, proxima_acao, checklist, campos, ordem, ativo)
    values (nullif(upper(trim(p_codigo)),''), trim(p_nome), p_descricao, coalesce(p_publico,'lojista'), p_categoria, coalesce(p_setor_padrao,'sac'),
            coalesce(p_prioridade_padrao,'normal'), coalesce(p_sla_primeira_resposta_h,4), coalesce(p_sla_resolucao_h,40),
            nullif(trim(p_proxima_acao),''), coalesce(p_checklist,'[]'), coalesce(p_campos,'{}'), coalesce(p_ordem,100), coalesce(p_ativo,true))
    returning id into v_id;
  else
    update sac.tipos_ticket set
      codigo = case when p_codigo is null then codigo else nullif(upper(trim(p_codigo)),'') end,
      nome = coalesce(nullif(trim(p_nome),''), nome),
      descricao = coalesce(p_descricao, descricao), publico = coalesce(p_publico, publico), categoria = coalesce(p_categoria, categoria),
      setor_padrao = coalesce(p_setor_padrao, setor_padrao), prioridade_padrao = coalesce(p_prioridade_padrao, prioridade_padrao),
      sla_primeira_resposta_h = coalesce(p_sla_primeira_resposta_h, sla_primeira_resposta_h),
      sla_resolucao_h = coalesce(p_sla_resolucao_h, sla_resolucao_h),
      proxima_acao = case when p_proxima_acao is null then proxima_acao else nullif(trim(p_proxima_acao),'') end,
      checklist = coalesce(p_checklist, checklist), campos = coalesce(p_campos, campos),
      ordem = coalesce(p_ordem, ordem), ativo = coalesce(p_ativo, ativo), updated_at = now()
    where id = p_id and editavel returning id into v_id;
    if v_id is null then raise exception 'tipo_nao_encontrado'; end if;
  end if;
  return (select to_jsonb(t) from sac.tipos_ticket t where t.id = v_id);
exception when unique_violation then raise exception 'tipo_duplicado: já existe um tipo com esse nome ou código';
end $$;

-- ===== Campos e categorias =====
create or replace function public.sac_listar_campos(p_tipo_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me();
begin
  return jsonb_build_object(
    'padrao', (select coalesce(jsonb_agg(to_jsonb(c) order by c.ordem), '[]') from sac.campos_ticket c),
    'efetivos', sac._campos_efetivos(p_tipo_id));
end $$;

create or replace function public.sac_admin_salvar_campo(p_chave text, p_rotulo text default null, p_ordem integer default null,
  p_estado_padrao text default null, p_so_ao_fechar boolean default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); c sac.campos_ticket;
begin
  if me.papel <> 'admin' then raise exception 'acesso_negado: só admin' using errcode = '42501'; end if;
  select * into c from sac.campos_ticket where chave = p_chave;
  if c.chave is null then raise exception 'campo_invalido'; end if;
  if p_estado_padrao is not null and p_estado_padrao not in ('oculto','opcional','obrigatorio') then raise exception 'estado_invalido'; end if;
  if c.fixo and p_estado_padrao = 'oculto' then raise exception 'campo_fixo: este campo não pode ser ocultado'; end if;
  update sac.campos_ticket set rotulo = coalesce(nullif(trim(p_rotulo),''), rotulo), ordem = coalesce(p_ordem, ordem),
    estado_padrao = coalesce(p_estado_padrao, estado_padrao), so_ao_fechar = coalesce(p_so_ao_fechar, so_ao_fechar)
  where chave = p_chave returning * into c;
  return to_jsonb(c);
end $$;

create or replace function public.sac_listar_categorias() returns setof text
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me();
begin return query select nome from sac.categorias where ativo order by ordem, nome; end $$;

create or replace function public.sac_admin_salvar_categoria(p_nome text, p_ordem integer default null, p_ativo boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me();
begin
  if me.papel <> 'admin' then raise exception 'acesso_negado: só admin' using errcode = '42501'; end if;
  if coalesce(length(trim(p_nome)),0) < 2 then raise exception 'nome_obrigatorio'; end if;
  insert into sac.categorias (nome, ordem, ativo) values (trim(p_nome), coalesce(p_ordem,100), coalesce(p_ativo,true))
  on conflict (nome) do update set ordem = coalesce(p_ordem, sac.categorias.ordem), ativo = coalesce(p_ativo, sac.categorias.ativo);
  return jsonb_build_object('ok', true);
end $$;

-- ===== JSON do ticket (com itens, prejuízo, campos e pendências) =====
create or replace function sac._ticket_json(p_ticket uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(t)
    || jsonb_build_object(
      'atribuido_nome', (select a.nome from sac.atendentes a where a.id = t.atribuido_a),
      'aberto_por_nome', (select a.nome from sac.atendentes a where a.id = t.aberto_por),
      'tipo_nome', (select tp.nome from sac.tipos_ticket tp where tp.id = t.tipo_id),
      'tipo_codigo', (select tp.codigo from sac.tipos_ticket tp where tp.id = t.tipo_id),
      'status_rotulo', sac._rotulo_status(t.status),
      'sla_atrasado', sac._sla_atrasado(t.status, t.primeira_resposta_em, t.sla_primeira_resposta_vence_em, t.sla_resolucao_vence_em),
      'sla_proximo_vencimento', sac._sla_proximo(t.status, t.primeira_resposta_em, t.sla_primeira_resposta_vence_em, t.sla_resolucao_vence_em),
      'sla_primeira_resposta_cumprido', case when t.primeira_resposta_em is null then null else t.primeira_resposta_em <= t.sla_primeira_resposta_vence_em end,
      'sla_resolucao_cumprido', case when coalesce(t.resolvido_em, t.fechado_em) is null then null else coalesce(t.resolvido_em, t.fechado_em) <= t.sla_resolucao_vence_em end,
      'csat', (select jsonb_build_object('nota', s.nota, 'comentario', s.comentario, 'respondido_em', s.respondido_em, 'canal', s.canal) from sac.csat s where s.ticket_id = t.id),
      'vinculos', coalesce((select jsonb_agg(jsonb_build_object('ticket_id', o.id, 'protocolo', o.protocolo, 'status', o.status, 'tipo', v.tipo,
                     'direcao', case when v.ticket_a = t.id then 'saida' else 'entrada' end) order by v.criado_em)
                   from sac.ticket_vinculos v join sac.tickets o on o.id = case when v.ticket_a = t.id then v.ticket_b else v.ticket_a end
                   where v.ticket_a = t.id or v.ticket_b = t.id), '[]'::jsonb),
      'itens', coalesce((select jsonb_agg(to_jsonb(i) - 'ticket_id' order by i.criado_em) from sac.ticket_itens i where i.ticket_id = t.id), '[]'::jsonb),
      'prejuizo', (select coalesce(sum(i.quantidade * coalesce(i.valor_unit,0)),0) from sac.ticket_itens i where i.ticket_id = t.id),
      'campos', sac._campos_efetivos(t.tipo_id),
      'faltando_fechar', to_jsonb(sac._faltando(t.id, 'fechar')))
  from sac.tickets t where t.id = p_ticket;
$$;

-- ===== Salvar campos do chamado =====
create or replace function public.sac_salvar_ticket(p_ticket_id uuid, p_dados jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); t sac.tickets; d jsonb := coalesce(p_dados,'{}'); v_seg text[];
begin
  select * into t from sac.tickets where id = p_ticket_id for update;
  if not found or not sac._pode_ver_ticket(me.id, t.id) then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if t.status in ('fechado','cancelado') then raise exception 'ticket_fechado: reabra antes de alterar'; end if;
  if d ? 'publico' and d->>'publico' not in ('lojista','consumidor') then raise exception 'publico_invalido'; end if;
  if d ? 'categoria' and nullif(d->>'categoria','') is not null and not exists (select 1 from sac.categorias where nome = d->>'categoria') then raise exception 'categoria_invalida'; end if;
  if d ? 'seguidores' then
    select coalesce(array_agg(distinct lower(trim(x))), '{}') into v_seg from jsonb_array_elements_text(d->'seguidores') x where trim(x) <> '';
    if exists (select 1 from unnest(v_seg) e where e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'email_invalido'; end if;
  end if;
  if d ? 'cliente_id' and nullif(d->>'cliente_id','') is not null and not exists (select 1 from sac.clientes where id = (d->>'cliente_id')::uuid) then
    raise exception 'cliente_nao_encontrado'; end if;
  update sac.tickets set
    assunto = case when d ? 'assunto' then nullif(trim(d->>'assunto'),'') else assunto end,
    publico = case when d ? 'publico' then d->>'publico' else publico end,
    categoria = case when d ? 'categoria' then nullif(d->>'categoria','') else categoria end,
    transportadora = case when d ? 'transportadora' then nullif(trim(d->>'transportadora'),'') else transportadora end,
    nf = case when d ? 'nf' then nullif(trim(d->>'nf'),'') else nf end,
    pedido = case when d ? 'pedido' then nullif(trim(d->>'pedido'),'') else pedido end,
    vendedor = case when d ? 'vendedor' then nullif(trim(d->>'vendedor'),'') else vendedor end,
    seguidores = case when d ? 'seguidores' then v_seg else seguidores end,
    proxima_acao = case when d ? 'proxima_acao' then nullif(trim(d->>'proxima_acao'),'') else proxima_acao end,
    proxima_acao_em = case when d ? 'proxima_acao_em' then nullif(d->>'proxima_acao_em','')::date else proxima_acao_em end,
    prazo = case when d ? 'prazo' then nullif(d->>'prazo','')::date else prazo end,
    descricao = case when d ? 'descricao' then nullif(trim(d->>'descricao'),'') else descricao end,
    cliente_id = case when d ? 'cliente_id' then coalesce(nullif(d->>'cliente_id','')::uuid, cliente_id) else cliente_id end,
    updated_at = now()
  where id = t.id;
  return sac._ticket_json(t.id);
end $$;

-- ===== Itens (produtos e divergência) — substitui a lista inteira =====
create or replace function public.sac_salvar_itens(p_ticket_id uuid, p_itens jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); t sac.tickets; x jsonb; antes int; depois int;
begin
  select * into t from sac.tickets where id = p_ticket_id for update;
  if not found or not sac._pode_ver_ticket(me.id, t.id) then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if t.status in ('fechado','cancelado') then raise exception 'ticket_fechado: reabra antes de alterar'; end if;
  if jsonb_typeof(coalesce(p_itens,'[]')) <> 'array' then raise exception 'itens_invalidos'; end if;
  select count(*) into antes from sac.ticket_itens where ticket_id = t.id;
  delete from sac.ticket_itens where ticket_id = t.id;
  for x in select * from jsonb_array_elements(coalesce(p_itens,'[]')) loop
    if coalesce(trim(x->>'sku'),'') = '' and coalesce(trim(x->>'produto'),'') = '' then continue; end if;
    insert into sac.ticket_itens (ticket_id, sku, produto, quantidade, divergencia, fabricante, valor_unit, obs, criado_por)
    values (t.id, nullif(trim(x->>'sku'),''), nullif(trim(x->>'produto'),''), coalesce(nullif(x->>'quantidade','')::numeric, 1),
            coalesce(nullif(x->>'divergencia',''),'defeito'), nullif(trim(x->>'fabricante'),''), nullif(x->>'valor_unit','')::numeric,
            nullif(trim(x->>'obs'),''), me.id);
  end loop;
  select count(*) into depois from sac.ticket_itens where ticket_id = t.id;
  insert into sac.ticket_eventos (ticket_id, autor_id, evento, de, para) values (t.id, me.id, 'itens', to_jsonb(antes), to_jsonb(depois));
  return sac._ticket_json(t.id);
end $$;

-- ===== Checklist =====
create or replace function public.sac_marcar_checklist(p_ticket_id uuid, p_indice integer, p_feito boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); t sac.tickets;
begin
  select * into t from sac.tickets where id = p_ticket_id for update;
  if not found or not sac._pode_ver_ticket(me.id, t.id) then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if t.status in ('fechado','cancelado') then raise exception 'ticket_fechado: reabra antes de alterar'; end if;
  if p_indice < 0 or p_indice >= jsonb_array_length(t.checklist) then raise exception 'item_invalido'; end if;
  update sac.tickets set checklist = jsonb_set(checklist, array[p_indice::text],
      (checklist->p_indice) || jsonb_build_object('feito', p_feito, 'por', me.nome, 'em', now())), updated_at = now()
  where id = t.id;
  return sac._ticket_json(t.id);
end $$;

-- ===== Fechar (valida obrigatórios) e cancelar =====
create or replace function public.sac_fechar_ticket(p_ticket_id uuid, p_solucao text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); t sac.tickets; v_falta text[];
begin
  select * into t from sac.tickets where id = p_ticket_id for update;
  if not found or not sac._pode_ver_ticket(me.id, t.id) then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if t.status in ('fechado','cancelado') then raise exception 'ticket_ja_fechado'; end if;
  if coalesce(length(trim(p_solucao)),0) < 3 then raise exception 'solucao_obrigatoria'; end if;
  update sac.tickets set solucao = trim(p_solucao) where id = t.id;
  v_falta := sac._faltando(t.id, 'fechar');
  if array_length(v_falta,1) > 0 then
    raise exception 'campos_obrigatorios: preencha %', array_to_string(v_falta, ', ');
  end if;
  update sac.tickets set status = 'fechado', fechado_em = now(), fechado_por = me.id, resolvido_em = coalesce(resolvido_em, now()),
         updated_at = now() where id = t.id;
  perform sac._evento(t.id, me.id, me.nome || ' fechou o ticket ' || t.protocolo);
  return jsonb_build_object('ok', true, 'ticket_id', t.id, 'protocolo', t.protocolo);
end $$;

create or replace function public.sac_cancelar_ticket(p_ticket_id uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); t sac.tickets;
begin
  select * into t from sac.tickets where id = p_ticket_id for update;
  if not found or not sac._pode_ver_ticket(me.id, t.id) then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if t.status in ('fechado','cancelado') then raise exception 'ticket_ja_fechado'; end if;
  if coalesce(length(trim(p_motivo)),0) < 3 then raise exception 'motivo_obrigatorio'; end if;
  update sac.tickets set status = 'cancelado', cancelado_em = now(), cancelado_motivo = trim(p_motivo), fechado_em = now(),
         fechado_por = me.id, updated_at = now() where id = t.id;
  perform sac._evento(t.id, me.id, me.nome || ' cancelou o ticket ' || t.protocolo || ': ' || trim(p_motivo));
  return jsonb_build_object('ok', true, 'ticket_id', t.id, 'protocolo', t.protocolo);
end $$;

-- ===== Cliente: base do portal (portal_clientes) =====
-- chave de telefone: DDD + últimos 8 dígitos (casa celular com/sem 9 e com/sem 55)
create or replace function sac.fone_chave(p text) returns text language sql immutable set search_path = '' as $$
  select case when length(d) >= 10 then substr(d, 1, 2) || right(d, 8) end
  from (select regexp_replace(regexp_replace(coalesce(p,''), '\D', '', 'g'), '^55(?=\d{10,11}$)', '') d) x;
$$;

create or replace function public.sac_buscar_clientes(p_busca text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); q text := trim(coalesce(p_busca,'')); dig text := regexp_replace(coalesce(p_busca,''), '\D', '', 'g');
begin
  if length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(r) from (
    select 'sac' as origem, c.id::text as id, coalesce(c.razao_social, c.nome_fantasia) as nome, c.nome_fantasia as fantasia, c.cnpj,
           c.codigo, c.vendedor, (select string_agg(cc.valor, ', ') from sac.contatos_cliente cc where cc.cliente_id = c.id and cc.tipo in ('whatsapp','telefone')) as telefone,
           c.portal_chave
    from sac.clientes c
    where c.razao_social ilike '%'||q||'%' or c.nome_fantasia ilike '%'||q||'%' or (length(dig) >= 4 and regexp_replace(coalesce(c.cnpj,''),'\D','','g') like dig||'%')
       or c.codigo = q or (length(dig) >= 8 and exists (select 1 from sac.contatos_cliente cc where cc.cliente_id = c.id and cc.valor like '%'||right(dig,8)))
    union all
    select 'portal', p.chave, p.razao, p.fantasia, p.cnpj, p.cod, p.vendedor, p.dados->>'fone', p.chave
    from public.portal_clientes p
    where not coalesce(p.removido,false)
      and not exists (select 1 from sac.clientes c where c.portal_chave = p.chave)
      and (p.razao ilike '%'||q||'%' or p.fantasia ilike '%'||q||'%' or p.cod = q
           or (length(dig) >= 4 and regexp_replace(coalesce(p.cnpj,''),'\D','','g') like dig||'%')
           or (length(dig) >= 8 and regexp_replace(coalesce(p.dados->>'fone',''),'\D','','g') like '%'||right(dig,8)))
    limit 20) r), '[]'::jsonb);
end $$;

-- cria (ou atualiza) o cliente do SAC a partir do cadastro do portal; com p_cliente_id, amarra um cliente existente
create or replace function public.sac_vincular_cliente_portal(p_portal_chave text, p_cliente_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); p public.portal_clientes; v_cli uuid := p_cliente_id; v_fone text; v_mail text;
begin
  select * into p from public.portal_clientes where chave = p_portal_chave and not coalesce(removido,false);
  if p.chave is null then raise exception 'cliente_nao_encontrado'; end if;
  if v_cli is null then select id into v_cli from sac.clientes where portal_chave = p.chave; end if;
  if v_cli is null then
    insert into sac.clientes (razao_social, nome_fantasia, cnpj, codigo, portal_chave, vendedor)
    values (p.razao, p.fantasia, p.cnpj, p.cod, p.chave, p.vendedor) returning id into v_cli;
  else
    update sac.clientes set razao_social = coalesce(p.razao, razao_social), nome_fantasia = coalesce(p.fantasia, nome_fantasia),
      cnpj = coalesce(p.cnpj, cnpj), codigo = coalesce(p.cod, codigo), portal_chave = p.chave, vendedor = coalesce(p.vendedor, vendedor),
      updated_at = now() where id = v_cli;
  end if;
  v_fone := nullif(regexp_replace(coalesce(p.dados->>'fone',''), '\D', '', 'g'), '');
  if v_fone is not null and length(v_fone) in (10,11) then
    insert into sac.contatos_cliente (cliente_id, tipo, valor, principal) values (v_cli, 'telefone', '55'||v_fone, false) on conflict (tipo, valor) do nothing;
  end if;
  v_mail := nullif(lower(trim(p.dados->>'email')), '');
  if v_mail is not null then
    insert into sac.contatos_cliente (cliente_id, tipo, valor, principal) values (v_cli, 'email', v_mail, false) on conflict (tipo, valor) do nothing;
  end if;
  update sac.tickets set vendedor = coalesce(vendedor, p.vendedor) where cliente_id = v_cli and status not in ('fechado','cancelado');
  return jsonb_build_object('ok', true, 'cliente_id', v_cli);
end $$;

-- vínculo automático: quando entra um contato de WhatsApp/telefone novo, procura o cliente no portal pelo telefone (só se for único)
create or replace function sac.tg_contato_vincular_portal() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_chave text; n int; p public.portal_clientes;
begin
  if new.tipo not in ('whatsapp','telefone') then return new; end if;
  if exists (select 1 from sac.clientes where id = new.cliente_id and portal_chave is not null) then return new; end if;
  select count(*), min(chave) into n, v_chave from public.portal_clientes
   where not coalesce(removido,false) and sac.fone_chave(dados->>'fone') = sac.fone_chave(new.valor);
  if n = 1 then
    select * into p from public.portal_clientes where chave = v_chave;
    if not exists (select 1 from sac.clientes where portal_chave = p.chave) then
      update sac.clientes set razao_social = coalesce(razao_social, p.razao), nome_fantasia = coalesce(p.fantasia, nome_fantasia),
        cnpj = coalesce(cnpj, p.cnpj), codigo = coalesce(codigo, p.cod), portal_chave = p.chave, vendedor = coalesce(vendedor, p.vendedor)
      where id = new.cliente_id;
    end if;
  end if;
  return new;
exception when others then return new; -- nunca bloqueia a entrada de mensagem
end $$;
drop trigger if exists contatos_vincular_portal on sac.contatos_cliente;
create trigger contatos_vincular_portal after insert on sac.contatos_cliente for each row execute function sac.tg_contato_vincular_portal();

-- permissões
do $$ declare f text; begin
  foreach f in array array['sac_listar_tipos(boolean)','sac_admin_salvar_tipo(uuid,text,text,numeric,numeric,text,integer,boolean,text,text,text,text,text,jsonb,jsonb)',
    'sac_listar_campos(uuid)','sac_admin_salvar_campo(text,text,integer,text,boolean)','sac_listar_categorias()','sac_admin_salvar_categoria(text,integer,boolean)',
    'sac_salvar_ticket(uuid,jsonb)','sac_salvar_itens(uuid,jsonb)','sac_marcar_checklist(uuid,integer,boolean)','sac_fechar_ticket(uuid,text)',
    'sac_cancelar_ticket(uuid,text)','sac_buscar_clientes(text)','sac_vincular_cliente_portal(text,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
