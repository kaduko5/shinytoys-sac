import { useState } from 'react';
import type { Perfil, TicketLinha, ViewItem } from '../lib/types';
import type { FiltrosView } from '../pages/Inbox';
import { atrasoDesde, CANAL_ROTULO, horaLista, nomeSetor, PRIORIDADE_ROTULO, telefone } from '../lib/format';
import { IconeWhatsApp } from './Icones';

interface Props {
  perfil: Perfil;
  views: ViewItem[];
  viewAtiva: string;
  onView: (id: string) => void;
  filtros: FiltrosView;
  onFiltros: (f: FiltrosView) => void;
  lista: TicketLinha[];
  total: number;
  offset: number;
  onPagina: (offset: number) => void;
  carregando: boolean;
  erro: string;
  aberta: string | null;
  onAbrir: (conversaId: string) => void;
  onNovoTicket: () => void;
  onSalvarView: () => void;
}

const LIMITE = 50;

export default function Fila({
  views, viewAtiva, onView, filtros, onFiltros, lista, total, offset, onPagina,
  carregando, erro, aberta, onAbrir, onNovoTicket, onSalvarView,
}: Props) {
  const [adv, setAdv] = useState(false);
  const set = (p: Partial<FiltrosView>) => onFiltros({ ...filtros, ...p });

  return (
    <aside className="fila">
      <ViewsNav views={views} ativa={viewAtiva} onView={onView} />
      <div className="fila-topo">
        <FilaConteudo
          carregando={carregando}
          erro={erro}
          lista={lista}
          total={total}
          offset={offset}
          onPagina={onPagina}
          aberta={aberta}
          onAbrir={onAbrir}
          filtros={filtros}
          set={set}
          adv={adv}
          setAdv={setAdv}
          onNovoTicket={onNovoTicket}
          onSalvarView={onSalvarView}
        />
      </div>
    </aside>
  );
}

function ViewsNav({ views, ativa, onView }: { views: ViewItem[]; ativa: string; onView: (id: string) => void }) {
  return (
    <nav className="views-nav" aria-label="Filas">
      {views.map((v) => (
        <button
          key={v.id}
          type="button"
          className={`view-btn ${ativa === v.id ? 'ativo' : ''}`}
          onClick={() => onView(v.id)}
        >
          <span className="trunc">{v.nome}</span>
          <span className="view-count">{v.contagem}</span>
        </button>
      ))}
    </nav>
  );
}

function FilaConteudo(props: {
  carregando: boolean;
  erro: string;
  lista: TicketLinha[];
  total: number;
  offset: number;
  onPagina: (o: number) => void;
  aberta: string | null;
  onAbrir: (id: string) => void;
  filtros: FiltrosView;
  set: (p: Partial<FiltrosView>) => void;
  adv: boolean;
  setAdv: (v: boolean) => void;
  onNovoTicket: () => void;
  onSalvarView: () => void;
}) {
  const { carregando, erro, lista, total, offset, onPagina, aberta, onAbrir, filtros, set, adv, setAdv, onNovoTicket, onSalvarView } = props;
  const fim = Math.min(offset + LIMITE, total);

  return (
    <>
      <FilaTitulo onNovoTicket={onNovoTicket} lista={lista} />
      <input
        className="busca"
        placeholder="Buscar protocolo, nome, tag…"
        value={filtros.busca}
        onChange={(e) => set({ busca: e.target.value })}
      />
      <div className="chips">
        <button type="button" className={adv ? 'ativo' : ''} onClick={() => setAdv(!adv)}>Filtros avançados</button>
        <button type="button" className="btn sm ghost" onClick={onSalvarView}>Salvar como view</button>
      </div>
      {adv && (
        <FiltrosAvancados filtros={filtros} set={set} />
      )}
      <div className="fila-lista">
        {erro && <p className="erro pad">{erro}</p>}
        {carregando && lista.length === 0 && <p className="muted pad">Carregando…</p>}
        {!carregando && !erro && lista.length === 0 && <p className="muted pad">Nenhum ticket com esses filtros.</p>}
        {lista.map((c) => (
          <Item key={c.ticket_id} c={c} sel={aberta === c.conversa_id} onAbrir={onAbrir} />
        ))}
      </div>
      {total > LIMITE && (
        <form className="paginacao" onSubmit={(e) => e.preventDefault()}>
          <button type="button" className="btn sm ghost" disabled={offset <= 0} onClick={() => onPagina(Math.max(0, offset - LIMITE))}>Anterior</button>
          <span className="pequeno muted">{offset + 1}–{fim} de {total}</span>
          <button type="button" className="btn sm ghost" disabled={offset + LIMITE >= total} onClick={() => onPagina(offset + LIMITE)}>Próxima</button>
        </form>
      )}
    </>
  );
}

function FilaTitulo({ onNovoTicket, lista }: { onNovoTicket: () => void; lista: TicketLinha[] }) {
  return (
    <div className="fila-titulo">
      <div>
        <strong>Inbox</strong>
        <small> {lista.length} nesta página</small>
      </div>
      <button type="button" className="btn sm primario" onClick={onNovoTicket}>Novo ticket</button>
    </div>
  );
}

function FiltrosAvancados({ filtros, set }: { filtros: FiltrosView; set: (p: Partial<FiltrosView>) => void }) {
  return (
    <div className="filtros-adv">
      <select value={filtros.ordem} onChange={(e) => set({ ordem: e.target.value })}>
        <option value="recentes">Mais recentes</option>
        <option value="antigos">Mais antigos</option>
        <option value="sla">SLA (vencimento)</option>
        <option value="prioridade">Prioridade</option>
      </select>
      <select value={filtros.canal ?? ''} onChange={(e) => set({ canal: e.target.value || undefined })}>
        <option value="">Todos os canais</option>
        {Object.entries(CANAL_ROTULO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={filtros.prioridade ?? ''} onChange={(e) => set({ prioridade: e.target.value || undefined })}>
        <option value="">Todas prioridades</option>
        {Object.entries(PRIORIDADE_ROTULO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <label className="check">
        <input type="checkbox" checked={!!filtros.atrasado} onChange={(e) => set({ atrasado: e.target.checked || undefined })} />
        SLA atrasado
      </label>
    </div>
  );
}

function Item({ c, sel, onAbrir }: { c: TicketLinha; sel: boolean; onAbrir: (id: string) => void }) {
  const nome = c.cliente_nome || telefone(c.contato) || 'Sem nome';
  const canal = c.canal_origem ?? 'whatsapp';
  return (
    <button type="button" className={`item ${sel ? 'sel' : ''}`} onClick={() => onAbrir(c.conversa_id)}>
      <span className={`canal ${canal === 'whatsapp' ? 'wa' : 'outro'}`}>
        {canal === 'whatsapp' ? <IconeWhatsApp /> : <span>{CANAL_ROTULO[canal]?.[0] ?? '?'}</span>}
      </span>
      <span className="item-corpo">
        <span className="item-l1">
          <strong className="trunc">{nome}</strong>
          <small>{horaLista(c.ultima_mensagem_em)}</small>
        </span>
        <span className="item-l2">
          <span className="trunc muted">{c.assunto || c.ultima_previa || '—'}</span>
          {c.nao_lidas > 0 && <span className="badge">{c.nao_lidas}</span>}
        </span>
        <span className="item-l3">
          {c.protocolo && <span className="tag cinza">{c.protocolo}</span>}
          {c.prioridade === 'urgente' && <span className="tag pri-urg">Urgente</span>}
          {c.prioridade === 'alta' && <span className="tag pri-alt">Alta</span>}
          {c.sla_atrasado && <span className="tag sla-atr" title="SLA atrasado">⏱ venceu há {atrasoDesde(c.sla_proximo_vencimento)}</span>}
          {c.tipo_nome && <span className="tag cinza">{c.tipo_nome}</span>}
          {c.tags.slice(0, 2).map((t) => <span key={t} className="tag cinza">#{t}</span>)}
          <span className={`tag setor-${c.setor_id ?? 'x'}`}>{nomeSetor(c.setor_id)}</span>
        </span>
      </span>
    </button>
  );
}