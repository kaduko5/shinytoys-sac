-- Fase A (parte 1): modelo — tipos completos, campos configuráveis, itens, protocolo CF, prazo em horário comercial
-- Estende o modelo da fase 2 (Cursor). Não remove nada.

-- 1) Setor Qualidade
insert into sac.setores (id, nome) values ('qualidade', 'Qualidade') on conflict (id) do nothing;

-- 2) Status novos: andamento e cancelado
alter table sac.tickets drop constraint if exists tickets_status_check;
alter table sac.tickets add constraint tickets_status_check
  check (status in ('novo','aberto','andamento','pendente','em_espera','resolvido','fechado','cancelado'));

create or replace function sac._rotulo_status(p text) returns text language sql immutable set search_path = '' as $$
  select case p when 'novo' then 'Nova' when 'aberto' then 'Aberta' when 'andamento' then 'Em andamento'
                when 'pendente' then 'Aguardando cliente' when 'em_espera' then 'Aguardando terceiro'
                when 'resolvido' then 'Resolvida' when 'fechado' then 'Fechada' when 'cancelado' then 'Cancelada' else p end;
$$;

-- 3) Campos novos do chamado
alter table sac.tickets
  add column if not exists publico text not null default 'lojista' check (publico in ('lojista','consumidor')),
  add column if not exists categoria text,
  add column if not exists transportadora text,
  add column if not exists nf text,
  add column if not exists pedido text,
  add column if not exists vendedor text,
  add column if not exists seguidores text[] not null default '{}',
  add column if not exists proxima_acao text,
  add column if not exists proxima_acao_em date,
  add column if not exists prazo date,
  add column if not exists descricao text,
  add column if not exists checklist jsonb not null default '[]'::jsonb,
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_motivo text;

-- 4) Tipos completos
alter table sac.tipos_ticket
  add column if not exists codigo text,
  add column if not exists publico text not null default 'lojista' check (publico in ('lojista','consumidor','ambos')),
  add column if not exists categoria text,
  add column if not exists prioridade_padrao text not null default 'normal' check (prioridade_padrao in ('baixa','normal','alta','urgente')),
  add column if not exists proxima_acao text,
  add column if not exists checklist jsonb not null default '[]'::jsonb,
  add column if not exists campos jsonb not null default '{}'::jsonb;
create unique index if not exists tipos_ticket_codigo_uk on sac.tipos_ticket (upper(codigo)) where codigo is not null;

-- 5) Categorias
create table if not exists sac.categorias (nome text primary key, ordem int not null default 100, ativo boolean not null default true);
insert into sac.categorias (nome, ordem) values
  ('Atraso / Prazo',10),('Avaria / Estoque',20),('Devolução / Troca',30),
  ('Falta de Mercadoria (Loja)',40),('Mercadoria a Mais (Loja)',50),('Outro',999)
on conflict (nome) do nothing;

-- 6) Configurador de campos (padrão global; cada tipo pode sobrescrever em tipos_ticket.campos)
create table if not exists sac.campos_ticket (
  chave text primary key,
  rotulo text not null,
  ordem int not null default 100,
  estado_padrao text not null default 'opcional' check (estado_padrao in ('oculto','opcional','obrigatorio')),
  so_ao_fechar boolean not null default false,   -- obrigatório só na hora de resolver/fechar
  fixo boolean not null default false            -- não pode ser ocultado
);
insert into sac.campos_ticket (chave, rotulo, ordem, estado_padrao, so_ao_fechar, fixo) values
  ('assunto','Título',10,'obrigatorio',false,true),
  ('tipo','Tipo de chamado',15,'obrigatorio',true,true),
  ('setor','Departamento',20,'obrigatorio',false,true),
  ('responsavel','Responsável',30,'obrigatorio',false,false),
  ('transportadora','Transportadora / Armazém',40,'opcional',false,false),
  ('nf','NF',50,'opcional',false,false),
  ('cliente','Cliente',60,'obrigatorio',false,false),
  ('pedido','Pedido',70,'opcional',false,false),
  ('categoria','Categoria',80,'obrigatorio',false,false),
  ('prioridade','Prioridade',90,'opcional',false,false),
  ('status','Status',100,'opcional',false,true),
  ('prazo','Prazo',110,'obrigatorio',false,false),
  ('vendedor','Vendedor',120,'opcional',false,false),
  ('seguidores','Seguidores (e-mails)',130,'opcional',false,false),
  ('proxima_acao','Próxima ação',140,'opcional',false,false),
  ('descricao','Descrição',150,'opcional',false,false),
  ('itens','Produtos e divergência',160,'opcional',false,false),
  ('solucao','Solução',170,'obrigatorio',true,false)
on conflict (chave) do nothing;

-- 7) Itens do chamado (produtos com defeito / divergência) — base para cobrar fabricante e para o prejuízo
create table if not exists sac.ticket_itens (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references sac.tickets(id) on delete cascade,
  sku text,
  produto text,
  quantidade numeric not null default 1 check (quantidade > 0),
  divergencia text not null default 'defeito' check (divergencia in ('defeito','avaria','falta','sobra','troca','preco','outro')),
  fabricante text,
  valor_unit numeric,
  obs text,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index if not exists ticket_itens_ticket_idx on sac.ticket_itens (ticket_id);
create index if not exists ticket_itens_fabricante_idx on sac.ticket_itens (fabricante);
alter table sac.ticket_itens enable row level security;
alter table sac.categorias enable row level security;
alter table sac.campos_ticket enable row level security;
-- sem policies: acesso só via RPC security definer (mesmo padrão do schema sac)

-- 8) Cliente amarrado à base do portal
alter table sac.clientes
  add column if not exists codigo text,
  add column if not exists portal_chave text,
  add column if not exists vendedor text;

-- 9) Protocolo por prefixo (SAC = lojista, CF = consumidor final)
alter table sac.protocolo_seq add column if not exists prefixo text not null default 'SAC';
alter table sac.protocolo_seq drop constraint if exists protocolo_seq_pkey;
alter table sac.protocolo_seq add primary key (prefixo, ano);
drop function if exists sac.proximo_protocolo();
create function sac.proximo_protocolo(p_prefixo text default 'SAC') returns text
language plpgsql security definer set search_path = '' as $$
declare v_ano int := extract(year from (now() at time zone 'America/Sao_Paulo'))::int; v_n int;
        v_p text := case when upper(coalesce(p_prefixo,'SAC')) = 'CF' then 'CF' else 'SAC' end;
begin
  insert into sac.protocolo_seq (prefixo, ano, ultimo) values (v_p, v_ano, 1)
  on conflict (prefixo, ano) do update set ultimo = sac.protocolo_seq.ultimo + 1
  returning ultimo into v_n;
  return format('%s-%s-%s', v_p, v_ano, lpad(v_n::text, 6, '0'));
end $$;
revoke all on function sac.proximo_protocolo(text) from public, anon, authenticated;

-- 10) Horário comercial: seg–sex 08h–18h (America/Sao_Paulo). Feriados ainda não considerados.
create or replace function sac.somar_horas_uteis(p_inicio timestamptz, p_horas numeric) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare t timestamp := p_inicio at time zone 'America/Sao_Paulo'; resto numeric := p_horas * 60;
        d date; ini timestamp; fim timestamp; disp numeric; i int := 0;
begin
  if p_inicio is null or p_horas is null then return null; end if;
  loop
    i := i + 1; exit when i > 1000;
    d := t::date;
    if extract(isodow from d) in (6,7) then t := (d + 1) + time '08:00'; continue; end if;
    ini := d + time '08:00'; fim := d + time '18:00';
    if t < ini then t := ini; end if;
    if t >= fim then t := (d + 1) + time '08:00'; continue; end if;
    disp := extract(epoch from (fim - t)) / 60;
    if resto <= disp then return (t + make_interval(secs => (resto * 60)::double precision)) at time zone 'America/Sao_Paulo'; end if;
    resto := resto - disp; t := (d + 1) + time '08:00';
  end loop;
  return null;
end $$;

-- 11) SLA em horário comercial + defaults vindos do tipo (categoria, público, checklist, próxima ação, prazo)
create or replace function sac.tg_ticket_sla() returns trigger language plpgsql set search_path = '' as $$
declare v_tipo sac.tipos_ticket; v_fr numeric := 8; v_res numeric := 40; v_f numeric := 1;
begin
  if new.tipo_id is not null then
    select * into v_tipo from sac.tipos_ticket where id = new.tipo_id;
    v_fr := v_tipo.sla_primeira_resposta_h; v_res := v_tipo.sla_resolucao_h;
    if tg_op = 'INSERT' or new.tipo_id is distinct from old.tipo_id then
      new.categoria := coalesce(v_tipo.categoria, new.categoria);
      if v_tipo.publico in ('lojista','consumidor') then new.publico := v_tipo.publico; end if;
      if new.checklist is null or new.checklist = '[]'::jsonb then
        new.checklist := coalesce((select jsonb_agg(jsonb_build_object('item', x, 'feito', false)) from jsonb_array_elements_text(v_tipo.checklist) x), '[]'::jsonb);
      end if;
      new.proxima_acao := coalesce(new.proxima_acao, v_tipo.proxima_acao);
      if tg_op = 'INSERT' and new.prioridade = 'normal' then new.prioridade := v_tipo.prioridade_padrao; end if;
    end if;
  else
    -- sem tipo: prioridade ajusta o prazo padrão
    v_f := case new.prioridade when 'urgente' then 0.25 when 'alta' then 0.5 when 'baixa' then 2 else 1 end;
  end if;
  new.sla_primeira_resposta_vence_em := sac.somar_horas_uteis(new.aberto_em, coalesce(v_fr, 8) * v_f);
  new.sla_resolucao_vence_em := sac.somar_horas_uteis(new.aberto_em, coalesce(v_res, 40) * v_f);
  if new.prazo is null or (tg_op = 'UPDATE' and new.tipo_id is distinct from old.tipo_id and new.prazo is not distinct from old.prazo) then
    new.prazo := (new.sla_resolucao_vence_em at time zone 'America/Sao_Paulo')::date;
  end if;
  return new;
end $$;
drop trigger if exists tickets_sla on sac.tickets;
create trigger tickets_sla before insert or update of tipo_id, prioridade, aberto_em on sac.tickets
  for each row execute function sac.tg_ticket_sla();

-- 12) Auditoria completa (linha do tempo): registra mudança de qualquer campo relevante
create or replace function sac.tg_ticket_auditoria() returns trigger language plpgsql set search_path = '' as $$
declare v_autor uuid := (select auth.uid()); c text; o jsonb; n jsonb;
  campos text[] := array['status','setor_id','atribuido_a','prioridade','tipo_id','tags','assunto','mesclado_em','publico','categoria',
    'transportadora','nf','pedido','vendedor','seguidores','proxima_acao','proxima_acao_em','prazo','descricao','solucao','cliente_id'];
begin
  if v_autor is not null and not exists (select 1 from sac.atendentes where id = v_autor) then v_autor := null; end if;
  if tg_op = 'INSERT' then
    insert into sac.ticket_eventos (ticket_id, autor_id, evento, para)
    values (new.id, v_autor, 'criado', jsonb_build_object('protocolo', new.protocolo, 'status', new.status, 'setor_id', new.setor_id,
            'tipo_id', new.tipo_id, 'prioridade', new.prioridade, 'canal_origem', new.canal_origem, 'origem', new.origem, 'publico', new.publico));
    return new;
  end if;
  o := to_jsonb(old); n := to_jsonb(new);
  foreach c in array campos loop
    if o -> c is distinct from n -> c then
      insert into sac.ticket_eventos (ticket_id, autor_id, evento, de, para)
      values (new.id, v_autor, case c when 'setor_id' then 'setor' when 'atribuido_a' then 'atribuicao' when 'tipo_id' then 'tipo'
                                       when 'mesclado_em' then 'mesclado' when 'cliente_id' then 'cliente' else c end, o -> c, n -> c);
    end if;
  end loop;
  if o -> 'checklist' is distinct from n -> 'checklist' then
    insert into sac.ticket_eventos (ticket_id, autor_id, evento, de, para)
    values (new.id, v_autor, 'checklist',
            jsonb_build_object('feitos', (select count(*) from jsonb_array_elements(o->'checklist') x where (x->>'feito')::boolean)),
            jsonb_build_object('feitos', (select count(*) from jsonb_array_elements(n->'checklist') x where (x->>'feito')::boolean),
                               'total', jsonb_array_length(n->'checklist')));
  end if;
  return new;
end $$;

-- 13) Atraso / próximo vencimento consideram cancelado como encerrado
create or replace function sac._sla_atrasado(p_status text, p_prim timestamptz, p_fr timestamptz, p_res timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_status not in ('resolvido','fechado','cancelado')
     and ((p_prim is null and p_fr is not null and now() > p_fr) or (p_res is not null and now() > p_res));
$$;
create or replace function sac._sla_proximo(p_status text, p_prim timestamptz, p_fr timestamptz, p_res timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select case when p_status in ('resolvido','fechado','cancelado') then null
              when p_prim is null then least(p_fr, p_res) else p_res end;
$$;
