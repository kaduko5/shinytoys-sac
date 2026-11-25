-- Fase B: indicadores (cards) + filtro por card na lista; status "andamento"/"cancelado" nos grupos ativos/encerrados
create or replace function sac._hoje() returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- condição de cada card (t = linha de sac.tickets)
create or replace function sac._no_card(t sac.tickets, p_card text) returns boolean
language sql stable set search_path = '' as $$
  select case p_card
    when 'abertas' then t.status not in ('resolvido','fechado','cancelado')
    when 'vencidas' then t.status not in ('resolvido','fechado','cancelado')
         and (t.prazo < sac._hoje() or sac._sla_atrasado(t.status, t.primeira_resposta_em, t.sla_primeira_resposta_vence_em, t.sla_resolucao_vence_em))
    when 'aguardando' then t.status = 'em_espera'
    when 'hoje' then t.status not in ('resolvido','fechado','cancelado') and t.proxima_acao_em <= sac._hoje()
    when 'sem_prazo' then t.status not in ('resolvido','fechado','cancelado') and (t.prazo is null or t.atribuido_a is null)
    when 'resolvidas_mes' then t.status in ('resolvido','fechado')
         and coalesce(t.resolvido_em, t.fechado_em) >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
    else true end;
$$;

create or replace function sac._filtrar_tickets(p_user uuid, f jsonb) returns setof uuid
language plpgsql stable security definer set search_path = '' as $$
declare me sac.atendentes; v_status text[]; v_prio text[]; v_tags text[]; v_busca text; v_dig text; v_atr text; v_atr_uuid uuid; v_card text;
begin
  select * into me from sac.atendentes where id = p_user and ativo;
  if not found then return; end if;
  f := coalesce(f, '{}'::jsonb);
  v_status := sac._jarr(f->'status');
  if v_status = array['ativos'] then v_status := array['novo','aberto','andamento','pendente','em_espera'];
  elsif v_status = array['encerrados'] then v_status := array['resolvido','fechado','cancelado']; end if;
  v_prio := sac._jarr(f->'prioridade');
  v_tags := sac._normalizar_tags(sac._jarr(f->'tags'));
  v_busca := nullif(trim(f->>'busca'), '');
  v_dig := regexp_replace(coalesce(v_busca,''), '\D', '', 'g');
  v_atr := f->>'atribuido';
  v_card := nullif(f->>'card','');
  if v_card is not null and v_card not in ('abertas','vencidas','aguardando','hoje','sem_prazo','resolvidas_mes') then raise exception 'filtro_invalido: card'; end if;
  if v_atr ~ '^[0-9a-fA-F-]{36}$' then v_atr_uuid := v_atr::uuid;
  elsif v_atr is not null and v_atr not in ('eu','ninguem') then raise exception 'filtro_invalido: atribuido'; end if;
  return query
  select t.id from sac.tickets t
  left join sac.clientes cl on cl.id = t.cliente_id
  left join sac.conversas c on c.id = t.conversa_id
  left join sac.contatos_cliente cc on cc.id = c.contato_id
  where (me.papel in ('admin','supervisor') or t.setor_id = any(me.setores) or t.atribuido_a = me.id)
    and (v_card is null or sac._no_card(t, v_card))
    and (f->>'setor' is null or t.setor_id = f->>'setor')
    and (v_status is null or t.status = any(v_status))
    and (v_prio is null or t.prioridade = any(v_prio))
    and (f->>'tipo_id' is null or t.tipo_id = (f->>'tipo_id')::uuid)
    and (f->>'canal' is null or t.canal_origem = f->>'canal')
    and (f->>'cliente_id' is null or t.cliente_id = (f->>'cliente_id')::uuid)
    and (f->>'publico' is null or t.publico = f->>'publico')
    and (f->>'categoria' is null or t.categoria = f->>'categoria')
    and (cardinality(v_tags) = 0 or t.tags && v_tags)
    and (v_atr is null or (v_atr = 'eu' and t.atribuido_a = me.id) or (v_atr = 'ninguem' and t.atribuido_a is null)
         or (v_atr_uuid is not null and t.atribuido_a = v_atr_uuid))
    and (f->>'atrasado' is null or sac._sla_atrasado(t.status, t.primeira_resposta_em, t.sla_primeira_resposta_vence_em, t.sla_resolucao_vence_em) = (f->>'atrasado')::boolean)
    and (f->>'aberto_de' is null or t.aberto_em >= (f->>'aberto_de')::timestamptz)
    and (f->>'aberto_ate' is null or t.aberto_em < (f->>'aberto_ate')::timestamptz)
    and (v_busca is null
         or t.protocolo ilike '%'||v_busca||'%' or t.assunto ilike '%'||v_busca||'%'
         or cl.nome_fantasia ilike '%'||v_busca||'%' or cl.razao_social ilike '%'||v_busca||'%'
         or (v_dig <> '' and (cl.cnpj like '%'||v_dig||'%' or cc.valor like '%'||v_dig||'%'))
         or cc.nome_perfil ilike '%'||v_busca||'%'
         or t.pedido ilike '%'||v_busca||'%' or t.nf ilike '%'||v_busca||'%'
         or lower(v_busca) = any(t.tags)
         or exists (select 1 from sac.mensagens m where m.ticket_id = t.id and m.corpo_texto ilike '%'||v_busca||'%'));
end $$;

-- números dos cards (respeita o que o atendente pode ver; p_setor opcional)
create or replace function public.sac_indicadores(p_setor text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); r jsonb;
begin
  with v as (
    select t.* from sac.tickets t
    where (me.papel in ('admin','supervisor') or t.setor_id = any(me.setores) or t.atribuido_a = me.id)
      and (p_setor is null or t.setor_id = p_setor)
  ), it as (
    select i.ticket_id, sum(i.quantidade * coalesce(i.valor_unit,0)) valor from sac.ticket_itens i where i.ticket_id in (select id from v) group by 1
  )
  select jsonb_build_object(
    'abertas', count(*) filter (where sac._no_card(v, 'abertas')),
    'vencidas', count(*) filter (where sac._no_card(v, 'vencidas')),
    'aguardando', count(*) filter (where sac._no_card(v, 'aguardando')),
    'hoje', count(*) filter (where sac._no_card(v, 'hoje')),
    'sem_prazo', count(*) filter (where sac._no_card(v, 'sem_prazo')),
    'resolvidas_mes', count(*) filter (where sac._no_card(v, 'resolvidas_mes')),
    'tempo_medio_dias', round((avg(extract(epoch from (coalesce(v.resolvido_em, v.fechado_em) - v.aberto_em)) / 86400.0)
        filter (where v.status in ('resolvido','fechado') and coalesce(v.resolvido_em, v.fechado_em) >= now() - interval '90 days'))::numeric, 1),
    'prejuizo_aberto', coalesce(sum(it.valor) filter (where v.status not in ('resolvido','fechado','cancelado')), 0),
    'prejuizo_ano', coalesce(sum(it.valor) filter (where v.aberto_em >= date_trunc('year', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
                                                      and v.status <> 'cancelado'), 0),
    'atualizado_em', now())
  into r
  from v left join it on it.ticket_id = v.id;
  return r;
end $$;
revoke all on function public.sac_indicadores(text) from public, anon;
grant execute on function public.sac_indicadores(text) to authenticated, service_role;
