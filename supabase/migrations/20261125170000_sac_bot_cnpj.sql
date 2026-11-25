-- Assistente: etapa de CNPJ (antes de passar para o atendente) + texto configurável
alter table sac.tickets drop constraint if exists tickets_bot_etapa_check;
alter table sac.tickets add constraint tickets_bot_etapa_check check (bot_etapa in ('setor','tipo','email','cnpj','concluido'));
insert into sac.config (chave, valor) values
  ('bot_pergunta_cnpj', 'E qual é o CNPJ da sua loja? (só os números). Se você é consumidor final, toque em "Sou consumidor".')
on conflict (chave) do nothing;

create or replace function public.sac_admin_salvar_bot(p_config jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); k text; v text;
begin
  if me.papel <> 'admin' then raise exception 'acesso_negado: só admin' using errcode = '42501'; end if;
  for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_config,'{}')) loop
    if k not in ('bot_modo','bot_numeros_teste','bot_boas_vindas','bot_pergunta_tipo','bot_pergunta_email','bot_pergunta_cnpj','bot_final','bot_setores') then
      raise exception 'chave_invalida: %', k; end if;
    if k = 'bot_modo' and v not in ('desligado','teste','ligado') then raise exception 'modo_invalido'; end if;
    if k = 'bot_setores' then
      if jsonb_typeof(v::jsonb) <> 'array' or jsonb_array_length(v::jsonb) not between 1 and 10 then raise exception 'setores_invalidos: de 1 a 10 setores'; end if;
      if exists (select 1 from jsonb_array_elements(v::jsonb) x where not exists (select 1 from sac.setores s where s.id = x->>'id')) then raise exception 'setor_invalido'; end if;
    end if;
    if k in ('bot_boas_vindas','bot_pergunta_tipo','bot_pergunta_email','bot_pergunta_cnpj','bot_final') and length(trim(v)) < 3 then raise exception 'texto_obrigatorio'; end if;
    insert into sac.config (chave, valor, updated_at) values (k, v, now()) on conflict (chave) do update set valor = excluded.valor, updated_at = now();
  end loop;
  return public.sac_bot_config();
end $$;

-- liga um cliente do SAC ao cadastro do portal pelo CNPJ (uso interno do assistente)
create or replace function sac.vincular_por_cnpj(p_cliente uuid, p_doc text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d text := regexp_replace(coalesce(p_doc,''), '\D', '', 'g'); p public.portal_clientes; n int;
begin
  update sac.clientes set cnpj = coalesce(cnpj, d), updated_at = now() where id = p_cliente;
  if length(d) <> 14 then return jsonb_build_object('portal', false); end if;
  select count(*) into n from public.portal_clientes where not coalesce(removido,false) and regexp_replace(coalesce(cnpj,''),'\D','','g') = d;
  if n <> 1 then return jsonb_build_object('portal', false); end if;
  select * into p from public.portal_clientes where not coalesce(removido,false) and regexp_replace(coalesce(cnpj,''),'\D','','g') = d;
  if exists (select 1 from sac.clientes where portal_chave = p.chave and id <> p_cliente) then
    return jsonb_build_object('portal', true, 'ja_vinculado_a_outro', true, 'razao', p.razao);
  end if;
  update sac.clientes set razao_social = coalesce(p.razao, razao_social), nome_fantasia = coalesce(p.fantasia, nome_fantasia),
    cnpj = coalesce(p.cnpj, cnpj), codigo = coalesce(p.cod, codigo), portal_chave = p.chave, vendedor = coalesce(p.vendedor, vendedor), updated_at = now()
  where id = p_cliente;
  update sac.tickets set vendedor = coalesce(vendedor, p.vendedor) where cliente_id = p_cliente and status not in ('fechado','cancelado');
  return jsonb_build_object('portal', true, 'razao', p.razao, 'vendedor', p.vendedor);
end $$;
revoke all on function sac.vincular_por_cnpj(uuid, text) from public, anon, authenticated;
