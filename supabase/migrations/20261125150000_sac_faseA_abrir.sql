-- Fase A (parte 4): abrir chamado com público (SAC/CF), campos extras, cliente do portal e validação; status "andamento"

-- aplica campos extras num ticket (uso interno; quem chama já validou permissão)
create or replace function sac._aplicar_campos(p_ticket uuid, p_dados jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare d jsonb := coalesce(p_dados,'{}'); v_seg text[];
begin
  if d ? 'categoria' and nullif(d->>'categoria','') is not null and not exists (select 1 from sac.categorias where nome = d->>'categoria') then raise exception 'categoria_invalida'; end if;
  if d ? 'atribuido_a' and nullif(d->>'atribuido_a','') is not null and not exists (select 1 from sac.atendentes where id = (d->>'atribuido_a')::uuid and ativo) then raise exception 'atendente_invalido'; end if;
  if d ? 'seguidores' then
    select coalesce(array_agg(distinct lower(trim(x))), '{}') into v_seg from jsonb_array_elements_text(d->'seguidores') x where trim(x) <> '';
    if exists (select 1 from unnest(v_seg) e where e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'email_invalido'; end if;
  end if;
  update sac.tickets set
    categoria = case when d ? 'categoria' then coalesce(nullif(d->>'categoria',''), categoria) else categoria end,
    transportadora = case when d ? 'transportadora' then nullif(trim(d->>'transportadora'),'') else transportadora end,
    nf = case when d ? 'nf' then nullif(trim(d->>'nf'),'') else nf end,
    pedido = case when d ? 'pedido' then nullif(trim(d->>'pedido'),'') else pedido end,
    vendedor = case when d ? 'vendedor' then nullif(trim(d->>'vendedor'),'') else vendedor end,
    seguidores = case when d ? 'seguidores' then v_seg else seguidores end,
    proxima_acao = case when d ? 'proxima_acao' then coalesce(nullif(trim(d->>'proxima_acao'),''), proxima_acao) else proxima_acao end,
    proxima_acao_em = case when d ? 'proxima_acao_em' then nullif(d->>'proxima_acao_em','')::date else proxima_acao_em end,
    prazo = case when d ? 'prazo' and nullif(d->>'prazo','') is not null then (d->>'prazo')::date else prazo end,
    descricao = case when d ? 'descricao' then nullif(trim(d->>'descricao'),'') else descricao end,
    atribuido_a = case when d ? 'atribuido_a' and nullif(d->>'atribuido_a','') is not null then (d->>'atribuido_a')::uuid else atribuido_a end,
    atribuido_em = case when d ? 'atribuido_a' and nullif(d->>'atribuido_a','') is not null and atribuido_a is null then now() else atribuido_em end
  where id = p_ticket;
end $$;
revoke all on function sac._aplicar_campos(uuid, jsonb) from public, anon, authenticated;

drop function if exists public.sac_abrir_ticket(text, text, text, uuid, text, text, uuid, text, text, text, text, text[], boolean);
create function public.sac_abrir_ticket(
  p_canal text, p_assunto text, p_descricao text default null, p_tipo_id uuid default null, p_setor_id text default null,
  p_prioridade text default 'normal', p_cliente_id uuid default null, p_wa_id text default null, p_telefone text default null,
  p_nome text default null, p_email text default null, p_tags text[] default null, p_atribuir_a_mim boolean default false,
  p_publico text default null, p_campos jsonb default null, p_portal_chave text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); v_tipo sac.tipos_ticket; v_setor text; v_dig text; v_email text;
        v_cli uuid := p_cliente_id; v_cont uuid; v_cont_cli uuid; v_conv uuid; v_atual uuid; v_atual_status text; v_atual_prot text;
        v_prot text; v_tk uuid; v_prio text := coalesce(p_prioridade, 'normal'); v_pub text; v_falta text[]; v_vend text;
begin
  if p_canal not in ('whatsapp','telefone','email','interno') then raise exception 'canal_invalido: use whatsapp, telefone, email ou interno'; end if;
  if coalesce(length(trim(p_assunto)),0) < 3 then raise exception 'assunto_obrigatorio'; end if;
  if v_prio not in ('baixa','normal','alta','urgente') then raise exception 'prioridade_invalida'; end if;
  if p_tipo_id is not null then
    select * into v_tipo from sac.tipos_ticket where id = p_tipo_id and ativo;
    if v_tipo.id is null then raise exception 'tipo_invalido'; end if;
  end if;
  v_pub := coalesce(p_publico, case when v_tipo.publico in ('lojista','consumidor') then v_tipo.publico end, 'lojista');
  if v_pub not in ('lojista','consumidor') then raise exception 'publico_invalido'; end if;
  v_setor := coalesce(p_setor_id, v_tipo.setor_padrao, 'sac');
  if not exists (select 1 from sac.setores where id = v_setor) then raise exception 'setor_invalido'; end if;

  -- cliente vindo da base do portal
  if v_cli is null and nullif(p_portal_chave,'') is not null then
    v_cli := (public.sac_vincular_cliente_portal(p_portal_chave, null)->>'cliente_id')::uuid;
  end if;
  if v_cli is not null and not exists (select 1 from sac.clientes where id = v_cli) then raise exception 'cliente_nao_encontrado'; end if;

  v_dig := nullif(regexp_replace(coalesce(p_wa_id, p_telefone, ''), '\D', '', 'g'), '');
  if v_dig is not null and length(v_dig) in (10, 11) then v_dig := '55' || v_dig; end if;
  if v_dig is not null and length(v_dig) not between 12 and 15 then raise exception 'telefone_invalido'; end if;
  if p_canal = 'whatsapp' and v_dig is null then raise exception 'whatsapp_obrigatorio: informe o número do cliente'; end if;
  v_email := nullif(lower(trim(p_email)), '');
  if p_canal = 'email' and v_email is null and v_cli is null then raise exception 'email_obrigatorio'; end if;

  if v_dig is not null then
    select cc.id, cc.cliente_id into v_cont, v_cont_cli from sac.contatos_cliente cc
     where cc.valor = v_dig and cc.tipo in ('whatsapp','telefone') order by (cc.tipo = 'whatsapp') desc limit 1;
    if v_cont is not null and v_cli is not null and v_cont_cli <> v_cli then raise exception 'contato_de_outro_cliente'; end if;
    v_cli := coalesce(v_cli, v_cont_cli);
  end if;
  if v_cli is null and v_email is not null then
    select cc.cliente_id into v_cli from sac.contatos_cliente cc where cc.tipo = 'email' and cc.valor = v_email;
  end if;
  if v_cli is null then
    if v_dig is null and v_email is null and coalesce(trim(p_nome),'') = '' then raise exception 'cliente_obrigatorio: informe cliente, telefone, e-mail ou nome'; end if;
    insert into sac.clientes (nome_fantasia) values (coalesce(nullif(trim(p_nome),''), case when v_dig is not null then '+' || v_dig else v_email end))
    returning id into v_cli;
  end if;
  if v_dig is not null and v_cont is null then
    insert into sac.contatos_cliente (cliente_id, tipo, valor, nome_perfil, principal)
    values (v_cli, case when p_canal = 'whatsapp' then 'whatsapp' else 'telefone' end, v_dig, nullif(trim(p_nome),''),
            not exists (select 1 from sac.contatos_cliente where cliente_id = v_cli))
    returning id into v_cont;
  end if;
  if v_email is not null then
    insert into sac.contatos_cliente (cliente_id, tipo, valor, principal) values (v_cli, 'email', v_email, false)
    on conflict (tipo, valor) do nothing;
  end if;

  if p_canal = 'whatsapp' then
    if (select tipo from sac.contatos_cliente where id = v_cont) <> 'whatsapp' then
      update sac.contatos_cliente set tipo = 'whatsapp' where id = v_cont
        and not exists (select 1 from sac.contatos_cliente x where x.tipo = 'whatsapp' and x.valor = v_dig);
    end if;
    select c.id, c.ticket_atual_id into v_conv, v_atual from sac.conversas c
     where c.canal_origem = 'whatsapp' and c.contato_id = v_cont order by c.last_message_at desc nulls last limit 1;
    if v_atual is not null then
      select status, protocolo into v_atual_status, v_atual_prot from sac.tickets where id = v_atual;
      if v_atual_status not in ('fechado','cancelado') then
        raise exception 'ja_existe_ticket_aberto: % está aberto nesta conversa de WhatsApp', v_atual_prot;
      end if;
    end if;
    if v_conv is null then
      insert into sac.conversas (cliente_id, canal_origem, contato_id, assunto) values (v_cli, 'whatsapp', v_cont, trim(p_assunto)) returning id into v_conv;
    end if;
  else
    insert into sac.conversas (cliente_id, canal_origem, contato_id, assunto)
    values (v_cli, p_canal, v_cont, trim(p_assunto)) returning id into v_conv;
  end if;

  select vendedor into v_vend from sac.clientes where id = v_cli;
  v_prot := sac.proximo_protocolo(case when v_pub = 'consumidor' then 'CF' else 'SAC' end);
  insert into sac.tickets (protocolo, conversa_id, cliente_id, setor_id, status, tipo_id, prioridade, tags, assunto, canal_origem, origem,
                           aberto_por, atribuido_a, atribuido_em, primeira_resposta_em, publico, descricao, vendedor)
  values (v_prot, v_conv, v_cli, v_setor, case when p_atribuir_a_mim then 'aberto' else 'novo' end, p_tipo_id, v_prio,
          sac._normalizar_tags(coalesce(p_tags,'{}')), trim(p_assunto), p_canal, 'manual', me.id,
          case when p_atribuir_a_mim then me.id end, case when p_atribuir_a_mim then now() end,
          case when p_canal in ('telefone','interno') then now() end, v_pub, nullif(trim(p_descricao),''), v_vend)
  returning id into v_tk;

  if p_campos is not null then perform sac._aplicar_campos(v_tk, p_campos); end if;
  v_falta := sac._faltando(v_tk, 'abrir');
  if array_length(v_falta,1) > 0 then raise exception 'campos_obrigatorios: preencha %', array_to_string(v_falta, ', '); end if;

  insert into sac.mensagens (conversa_id, ticket_id, canal, direcao, tipo, corpo_texto, atendente_id)
  values (v_conv, v_tk, 'sistema', 'sistema', 'evento', me.nome || ' abriu o ticket ' || v_prot || ' (' || p_canal || ')', me.id);
  if coalesce(trim(p_descricao),'') <> '' then
    insert into sac.mensagens (conversa_id, ticket_id, canal, direcao, tipo, corpo_texto, atendente_id)
    values (v_conv, v_tk, 'sistema', 'sistema', 'nota_interna', trim(p_assunto) || E'\n\n' || trim(p_descricao), me.id);
  end if;
  update sac.conversas set last_message_at = now(), ultima_previa = left(trim(p_assunto), 140) where id = v_conv;

  return jsonb_build_object('ok', true, 'ticket_id', v_tk, 'protocolo', v_prot, 'conversa_id', v_conv, 'cliente_id', v_cli, 'setor_id', v_setor);
end $$;
revoke all on function public.sac_abrir_ticket(text,text,text,uuid,text,text,uuid,text,text,text,text,text[],boolean,text,jsonb,text) from public, anon;
grant execute on function public.sac_abrir_ticket(text,text,text,uuid,text,text,uuid,text,text,text,text,text[],boolean,text,jsonb,text) to authenticated, service_role;

-- status "andamento" editável na tela; cancelado bloqueia edição como fechado
create or replace function public.sac_atualizar_ticket(p_ticket_id uuid, p_tipo_id uuid default null, p_prioridade text default null,
  p_status text default null, p_tags text[] default null, p_assunto text default null, p_limpar_tipo boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); t sac.tickets; v_tipo_nome text;
begin
  select * into t from sac.tickets where id = p_ticket_id for update;
  if not found or not sac._pode_ver_ticket(me.id, t.id) then raise exception 'acesso_negado' using errcode = '42501'; end if;
  if t.status in ('fechado','cancelado') then raise exception 'ticket_fechado: reabra antes de alterar'; end if;
  if p_prioridade is not null and p_prioridade not in ('baixa','normal','alta','urgente') then raise exception 'prioridade_invalida'; end if;
  if p_status is not null and p_status not in ('aberto','andamento','pendente','em_espera','resolvido') then
    raise exception 'status_invalido: use aberto, andamento, pendente, em_espera ou resolvido (para fechar use sac_fechar_ticket)';
  end if;
  if p_tipo_id is not null then
    select nome into v_tipo_nome from sac.tipos_ticket where id = p_tipo_id and ativo;
    if v_tipo_nome is null then raise exception 'tipo_invalido'; end if;
  end if;
  update sac.tickets set
    tipo_id = case when p_limpar_tipo then null else coalesce(p_tipo_id, tipo_id) end,
    prioridade = coalesce(p_prioridade, prioridade),
    status = coalesce(p_status, status),
    resolvido_em = case when p_status = 'resolvido' and status <> 'resolvido' then now()
                        when p_status is not null and p_status <> 'resolvido' then null else resolvido_em end,
    tags = case when p_tags is null then tags else sac._normalizar_tags(p_tags) end,
    assunto = case when p_assunto is null then assunto else nullif(trim(p_assunto),'') end,
    updated_at = now()
  where id = t.id;
  if p_status is not null and p_status <> t.status then
    perform sac._evento(t.id, me.id, me.nome || ' mudou o status para ' || sac._rotulo_status(p_status)); end if;
  if p_prioridade is not null and p_prioridade <> t.prioridade then
    perform sac._evento(t.id, me.id, me.nome || ' mudou a prioridade para ' || p_prioridade); end if;
  if (p_tipo_id is not null and p_tipo_id is distinct from t.tipo_id) then
    perform sac._evento(t.id, me.id, me.nome || ' classificou como ' || v_tipo_nome); end if;
  return sac._ticket_json(t.id);
end $$;
