-- Fase B: exportação para Excel (mesmos filtros da lista, até 5.000 linhas)
create or replace function public.sac_exportar_tickets(p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me sac.atendentes := sac._me();
begin
  return coalesce((select jsonb_agg(r order by r.aberto_em desc) from (
    select t.protocolo, case t.publico when 'consumidor' then 'Consumidor final' else 'Lojista' end as publico,
      coalesce(cl.razao_social, cl.nome_fantasia) as cliente, cl.cnpj, cl.codigo as cod_cliente,
      tp.codigo as tipo_cod, tp.nome as tipo, t.categoria, s.nome as departamento, sac._rotulo_status(t.status) as status,
      t.prioridade, a.nome as responsavel, t.vendedor, t.assunto as titulo, t.pedido, t.nf, t.transportadora,
      t.aberto_em, t.prazo, t.proxima_acao, t.proxima_acao_em, t.primeira_resposta_em, coalesce(t.resolvido_em, t.fechado_em) as resolvido_em,
      sac._sla_atrasado(t.status, t.primeira_resposta_em, t.sla_primeira_resposta_vence_em, t.sla_resolucao_vence_em) as atrasado,
      (select coalesce(sum(i.quantidade * coalesce(i.valor_unit,0)),0) from sac.ticket_itens i where i.ticket_id = t.id) as prejuizo,
      (select string_agg(coalesce(i.sku,'') || ' ' || coalesce(i.produto,'') || ' x' || i.quantidade || ' (' || i.divergencia || coalesce(', ' || i.fabricante,'') || ')', '; ')
         from sac.ticket_itens i where i.ticket_id = t.id) as itens,
      t.solucao, t.canal_origem as canal
    from sac.tickets t
    join sac._filtrar_tickets(me.id, coalesce(p_filtros,'{}')) f(id) on f.id = t.id
    left join sac.clientes cl on cl.id = t.cliente_id
    left join sac.tipos_ticket tp on tp.id = t.tipo_id
    left join sac.setores s on s.id = t.setor_id
    left join sac.atendentes a on a.id = t.atribuido_a
    order by t.aberto_em desc limit 5000) r), '[]'::jsonb);
end $$;
revoke all on function public.sac_exportar_tickets(jsonb) from public, anon;
grant execute on function public.sac_exportar_tickets(jsonb) to authenticated, service_role;
