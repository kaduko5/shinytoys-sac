import type { DetalheConversa } from '../lib/types';
import { dataHora, iniciais, nomeSetor, STATUS_TICKET, telefone } from '../lib/format';

export default function PainelCliente({ det, nome, embutido }: { det: DetalheConversa; nome: string; embutido?: boolean }) {
  const c = det.cliente;
  const Tag = embutido ? 'div' : 'aside';
  return (
    <Tag className={embutido ? 'painel-emb' : 'painel'}>
      <section>
        <div className="rotulo-sec">CLIENTE</div>
        <div className="cli-cab">
          <div className="avatar quadrado">{iniciais(nome)}</div>
          <strong>{nome}</strong>
        </div>
        <dl className="dados">
          {c?.nome_fantasia && c.nome_fantasia !== nome && (<><dt>Fantasia</dt><dd>{c.nome_fantasia}</dd></>)}
          <dt>CNPJ</dt><dd>{c?.cnpj || <span className="muted">não informado</span>}</dd>
          {det.contatos.map((ct) => (
            <FragmentoContato key={ct.id} tipo={ct.tipo} valor={ct.valor} perfil={ct.nome_perfil} rotulo={ct.rotulo} />
          ))}
        </dl>
        {c?.observacoes && <p className="obs">{c.observacoes}</p>}
      </section>

      {det.ticket_atual && (
        <section>
          <h4>Ticket atual</h4>
          <dl className="dados">
            <dt>Protocolo</dt><dd>{det.ticket_atual.protocolo}</dd>
            <dt>Status</dt><dd>{STATUS_TICKET[det.ticket_atual.status] ?? det.ticket_atual.status}</dd>
            <dt>Setor</dt><dd>{nomeSetor(det.ticket_atual.setor_id)}</dd>
            <dt>Dono</dt><dd>{det.ticket_atual.atribuido_nome || 'Sem dono'}</dd>
            <dt>Aberto em</dt><dd>{dataHora(det.ticket_atual.aberto_em)}</dd>
            {det.ticket_atual.primeira_resposta_em && (<><dt>1ª resposta</dt><dd>{dataHora(det.ticket_atual.primeira_resposta_em)}</dd></>)}
            {!!det.ticket_atual.reaberturas && (<><dt>Reaberturas</dt><dd>{det.ticket_atual.reaberturas}</dd></>)}
          </dl>
        </section>
      )}

      <section>
        <h4>Histórico de protocolos</h4>
        {det.tickets.length === 0 && <p className="muted pequeno">Nenhum protocolo.</p>}
        {det.tickets.map((t) => (
          <div key={t.id} className="hist">
            <div className="hist-l1">
              <strong>{t.protocolo}</strong>
              <span className={`tag status-${t.status}`}>{STATUS_TICKET[t.status] ?? t.status}</span>
            </div>
            <small className="muted">
              {dataHora(t.aberto_em)} · {nomeSetor(t.setor_id)}
              {t.solucao ? ` · ${t.solucao}` : ''}
            </small>
          </div>
        ))}
      </section>

      <section className="em-breve">
        <h4>Pedidos do portal</h4>
        <p className="muted pequeno">Em breve (fase 3) · Fonte: Portal B2B (Supabase DADOSAI · schema shiny)</p>
      </section>
      <section className="em-breve">
        <h4>Status e prazo</h4>
        <p className="muted pequeno">Em breve (fase 3) · Fonte: ERP (erp.status_pedidos)</p>
      </section>
      <section className="em-breve">
        <h4>Nota fiscal e itens</h4>
        <p className="muted pequeno">Em breve (fase 3) · Fonte: ERP (erp.nf_itens)</p>
      </section>
    </Tag>
  );
}

function FragmentoContato({ tipo, valor, perfil, rotulo }: { tipo: string; valor: string; perfil: string | null; rotulo: string | null }) {
  const nomeTipo = tipo === 'whatsapp' ? 'WhatsApp' : tipo === 'email' ? 'E-mail' : tipo === 'telefone' ? 'Telefone' : tipo;
  const v = tipo === 'whatsapp' || tipo === 'telefone' ? telefone(valor) : valor;
  return (
    <>
      <dt>{nomeTipo}</dt>
      <dd>{v}{perfil ? <small className="muted"> · perfil “{perfil}”</small> : null}{rotulo ? <small className="muted"> · {rotulo}</small> : null}</dd>
    </>
  );
}
