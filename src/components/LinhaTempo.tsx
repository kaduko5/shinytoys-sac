import type { HistoricoEvento } from '../lib/types';
import { dataHora, duracao, EVENTO_HIST, STATUS_TICKET } from '../lib/format';

function valor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return STATUS_TICKET[v] ?? v;
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('feitos' in o) return o.total !== undefined ? `${o.feitos}/${o.total} feitos` : `${o.feitos} feitos`;
    if ('protocolo' in o) return `${o.protocolo} · ${STATUS_TICKET[String(o.status)] ?? o.status}`;
    return JSON.stringify(o);
  }
  return String(v);
}

/** Linha do tempo do ticket: cada alteração, quem fez, e quanto tempo passou desde o passo anterior.
 *  No topo, o tempo total que o ticket ficou em cada status. */
export default function LinhaTempo({ eventos, nomes }: { eventos: HistoricoEvento[]; nomes?: Record<string, string> }) {
  if (eventos.length === 0) return <p className="muted">Sem eventos.</p>;
  const agora = new Date();

  // tempo em cada status
  const porStatus: Record<string, number> = {};
  let statusAtual: string | null = null; let desde: string | null = null;
  for (const e of eventos) {
    if (e.evento === 'criado') {
      const p = e.para as unknown as { status?: string } | null;
      statusAtual = p?.status ?? 'novo'; desde = e.criado_em;
    } else if (e.evento === 'status') {
      if (statusAtual && desde) porStatus[statusAtual] = (porStatus[statusAtual] ?? 0) + (new Date(e.criado_em).getTime() - new Date(desde).getTime());
      statusAtual = String(e.para ?? ''); desde = e.criado_em;
    }
  }
  const encerrado = statusAtual === 'fechado' || statusAtual === 'cancelado';
  if (statusAtual && desde && !encerrado) porStatus[statusAtual] = (porStatus[statusAtual] ?? 0) + (agora.getTime() - new Date(desde).getTime());
  const total = new Date(encerrado && desde ? desde : agora).getTime() - new Date(eventos[0].criado_em).getTime();

  return (
    <div className="linha-tempo">
      <div className="lt-resumo">
        <div><small className="muted">Tempo total</small><strong>{duracao(eventos[0].criado_em, new Date(new Date(eventos[0].criado_em).getTime() + total))}</strong></div>
        {Object.entries(porStatus).map(([s, ms]) => (
          <div key={s}><small className="muted">{STATUS_TICKET[s] ?? s}</small><strong>{duracao(eventos[0].criado_em, new Date(new Date(eventos[0].criado_em).getTime() + ms))}</strong></div>
        ))}
      </div>
      <ol className="lt-lista">
        {eventos.map((e, i) => {
          const ant = i > 0 ? eventos[i - 1] : null;
          const rot = EVENTO_HIST[e.evento] ?? e.evento;
          const de = e.evento === 'atribuicao' ? (nomes?.[String(e.de)] ?? valor(e.de)) : valor(e.de);
          const para = e.evento === 'atribuicao' ? (nomes?.[String(e.para)] ?? valor(e.para)) : valor(e.para);
          return (
            <li key={e.id}>
              {ant && <span className="lt-dur">+{duracao(ant.criado_em, e.criado_em)}</span>}
              <div className="lt-ev">
                <strong>{rot}</strong>
                {e.evento === 'criado' ? <span className="pequeno">{valor(e.para)}</span>
                  : <span className="pequeno">{de} → <b>{para}</b></span>}
                <span className="pequeno muted">{e.autor_nome || 'sistema'} · {dataHora(e.criado_em)}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
