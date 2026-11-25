-- Assistente automático no WhatsApp: boas-vindas + setor → tipo de ocorrência → e-mail (uma vez por chamado novo)
alter table sac.tickets
  add column if not exists bot_etapa text check (bot_etapa in ('setor','tipo','email','concluido')),
  add column if not exists bot_tentativas int not null default 0;

insert into sac.config (chave, valor) values
  ('bot_modo', 'desligado'),               -- desligado | teste | ligado
  ('bot_numeros_teste', ''),               -- números (com DDD) separados por vírgula, usados no modo teste
  ('bot_boas_vindas', 'Olá! 👋 Bem-vindo(a) ao atendimento da Shiny Toys. Para agilizar, me diga: para qual setor é o seu atendimento?'),
  ('bot_pergunta_tipo', 'Certo! O seu caso é sobre algum destes assuntos?'),
  ('bot_pergunta_email', 'Para finalizar, qual é o seu e-mail? Vamos usar para enviar informações do seu atendimento.'),
  ('bot_final', 'Obrigado! Seu protocolo é {protocolo}. Em breve um atendente vai continuar por aqui.'),
  ('bot_setores', '[{"id":"sac","rotulo":"Atendimento (SAC)","descricao":"Dúvidas, produtos, garantia, cadastro"},{"id":"comercial","rotulo":"Comercial","descricao":"Pedidos, preços, trocas e devoluções"},{"id":"financeiro","rotulo":"Financeiro","descricao":"Boletos, pagamentos e notas"},{"id":"logistica","rotulo":"Logística / entregas","descricao":"Atrasos, avarias, falta ou sobra de mercadoria"}]')
on conflict (chave) do nothing;

create or replace function public.sac_bot_config() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me();
begin
  if me.papel <> 'admin' then raise exception 'acesso_negado: só admin' using errcode = '42501'; end if;
  return (select jsonb_object_agg(chave, valor) from sac.config where chave like 'bot\_%');
end $$;

create or replace function public.sac_admin_salvar_bot(p_config jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me sac.atendentes := sac._me(); k text; v text;
begin
  if me.papel <> 'admin' then raise exception 'acesso_negado: só admin' using errcode = '42501'; end if;
  for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_config,'{}')) loop
    if k not in ('bot_modo','bot_numeros_teste','bot_boas_vindas','bot_pergunta_tipo','bot_pergunta_email','bot_final','bot_setores') then
      raise exception 'chave_invalida: %', k; end if;
    if k = 'bot_modo' and v not in ('desligado','teste','ligado') then raise exception 'modo_invalido'; end if;
    if k = 'bot_setores' then
      if jsonb_typeof(v::jsonb) <> 'array' or jsonb_array_length(v::jsonb) not between 1 and 10 then raise exception 'setores_invalidos: de 1 a 10 setores'; end if;
      if exists (select 1 from jsonb_array_elements(v::jsonb) x where not exists (select 1 from sac.setores s where s.id = x->>'id')) then raise exception 'setor_invalido'; end if;
    end if;
    if k in ('bot_boas_vindas','bot_pergunta_tipo','bot_pergunta_email','bot_final') and length(trim(v)) < 3 then raise exception 'texto_obrigatorio'; end if;
    insert into sac.config (chave, valor, updated_at) values (k, v, now()) on conflict (chave) do update set valor = excluded.valor, updated_at = now();
  end loop;
  return public.sac_bot_config();
end $$;
revoke all on function public.sac_bot_config() from public, anon;
revoke all on function public.sac_admin_salvar_bot(jsonb) from public, anon;
grant execute on function public.sac_bot_config() to authenticated, service_role;
grant execute on function public.sac_admin_salvar_bot(jsonb) to authenticated, service_role;
