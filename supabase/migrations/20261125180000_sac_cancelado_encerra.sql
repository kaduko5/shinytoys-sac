-- Chamado CANCELADO conta como encerrado: mensagem nova do cliente abre chamado novo (e o assistente roda).
create or replace function sac.wa_garantir_contexto(p_wa_id text, p_nome text)
returns table(cliente_id uuid, contato_id uuid, conversa_id uuid, ticket_id uuid, protocolo text, novo_ticket boolean)
language plpgsql security definer set search_path = '' as $$
declare v_cli uuid; v_cont uuid; v_conv uuid; v_tk uuid; v_prot text; v_novo boolean := false;
begin
  select c.id, c.cliente_id into v_cont, v_cli from sac.contatos_cliente c where c.tipo = 'whatsapp' and c.valor = p_wa_id;
  if v_cont is null then
    insert into sac.clientes (nome_fantasia) values (coalesce(nullif(p_nome,''), '+' || p_wa_id)) returning id into v_cli;
    insert into sac.contatos_cliente (cliente_id, tipo, valor, nome_perfil, principal)
      values (v_cli, 'whatsapp', p_wa_id, p_nome, true)
      on conflict (tipo, valor) do nothing returning id into v_cont;
    if v_cont is null then
      delete from sac.clientes where id = v_cli;
      select c.id, c.cliente_id into v_cont, v_cli from sac.contatos_cliente c where c.tipo='whatsapp' and c.valor=p_wa_id;
    end if;
  elsif p_nome is not null and p_nome <> '' then
    update sac.contatos_cliente set nome_perfil = p_nome where id = v_cont and nome_perfil is distinct from p_nome;
  end if;

  select cv.id into v_conv from sac.conversas cv
   where cv.cliente_id = v_cli and cv.canal_origem = 'whatsapp' and cv.contato_id = v_cont
   order by cv.last_message_at desc nulls last limit 1;
  if v_conv is null then
    insert into sac.conversas (cliente_id, canal_origem, contato_id) values (v_cli, 'whatsapp', v_cont) returning id into v_conv;
  end if;

  select t.id, t.protocolo into v_tk, v_prot from sac.tickets t
   where t.conversa_id = v_conv and t.status not in ('fechado','cancelado') order by t.aberto_em desc limit 1;
  if v_tk is null then
    v_prot := sac.proximo_protocolo();
    insert into sac.tickets (protocolo, conversa_id, cliente_id) values (v_prot, v_conv, v_cli) returning id into v_tk;
    v_novo := true;
  end if;

  return query select v_cli, v_cont, v_conv, v_tk, v_prot, v_novo;
end $$;

create or replace function sac.preparar_envio(p_user uuid, p_conversa uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a sac.atendentes; c sac.conversas; t sac.tickets; v_wa text;
begin
  select * into a from sac.atendentes where id = p_user and ativo;
  if not found then return jsonb_build_object('ok', false, 'erro', 'acesso_negado', 'mensagem', 'Atendente inexistente ou inativo'); end if;
  if not sac._pode_ver(p_user, p_conversa) then return jsonb_build_object('ok', false, 'erro', 'acesso_negado', 'mensagem', 'Sem permissão para esta conversa'); end if;
  select * into c from sac.conversas where id = p_conversa;
  if c.canal_origem <> 'whatsapp' then return jsonb_build_object('ok', false, 'erro', 'canal_invalido', 'mensagem', 'Conversa não é de WhatsApp'); end if;
  select * into t from sac.tickets where id = c.ticket_atual_id;
  if t.id is null or t.status in ('fechado','cancelado') then return jsonb_build_object('ok', false, 'erro', 'ticket_fechado', 'mensagem', 'Ticket fechado: reabra antes de responder'); end if;
  select cc.valor into v_wa from sac.contatos_cliente cc where cc.id = c.contato_id and cc.tipo = 'whatsapp';
  if v_wa is null then return jsonb_build_object('ok', false, 'erro', 'sem_contato', 'mensagem', 'Conversa sem número de WhatsApp'); end if;
  if c.ultima_entrada_em is null or c.ultima_entrada_em < now() - interval '24 hours' then
    return jsonb_build_object('ok', false, 'erro', 'precisa_template',
      'mensagem', 'Fora da janela de 24h desde a última mensagem do cliente: precisa template aprovado',
      'ultima_entrada_em', c.ultima_entrada_em);
  end if;
  return jsonb_build_object('ok', true, 'wa_id', v_wa, 'ticket_id', t.id, 'protocolo', t.protocolo,
    'atendente_id', a.id, 'atendente_nome', a.nome, 'janela_expira_em', c.ultima_entrada_em + interval '24 hours');
end $$;
