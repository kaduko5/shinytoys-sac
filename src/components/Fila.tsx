import type { ConversaItem, Perfil, Setor } from '../lib/types';
import type { Filtros } from '../pages/Inbox';
import { horaLista, nomeSetor, telefone } from '../lib/format';
import { IconeWhatsApp } from './Icones';

interface Props {
  perfil: Perfil;
  setores: Setor[];
  filtros: Filtros;
  onFiltros: (f: Filtros) => void;
  lista: ConversaItem[];
  carregando: boolean;
  erro: string;
  aberta: string | null;
  onAbrir: (id: string) => void;
}

export default function Fila({ setores, filtros, onFiltros, lista, carregando, erro, aberta, onAbrir }: Props) {
  const set = (p: Partial<Filtros>) => onFiltros({ ...filtros, ...p });
  return (
    <aside className="fila">
      <div className="fila-topo">
        <div className="abas-setor">
          <button className={filtros.setor === null ? 'ativo' : ''} onClick={() => set({ setor: null })}>Todos</button>
          {setores.map((s) => (
            <button key={s.id} className={filtros.setor === s.id ? 'ativo' : ''} onClick={() => set({ setor: s.id })}>
              {s.nome || nomeSetor(s.id)}
            </button>
          ))}
        </div>
        <div className="fila-titulo">
          <strong>Inbox unificada</strong>
          <small>{lista.length} conversa{lista.length === 1 ? '' : 's'}</small>
        </div>
        <input
          className="busca"
          placeholder="Buscar nome, telefone, protocolo…"
          value={filtros.busca}
          onChange={(e) => set({ busca: e.target.value })}
        />
        <div className="chips">
          <button className={filtros.status === 'ativos' ? 'ativo' : ''} onClick={() => set({ status: 'ativos' })}>Ativos</button>
          <button className={filtros.status === 'fechado' ? 'ativo' : ''} onClick={() => set({ status: 'fechado' })}>Fechados</button>
          <span className="sep" />
          <button className={filtros.atribuicao === 'todas' ? 'ativo' : ''} onClick={() => set({ atribuicao: 'todas' })}>Todas</button>
          <button className={filtros.atribuicao === 'minhas' ? 'ativo' : ''} onClick={() => set({ atribuicao: 'minhas' })}>Minhas</button>
          <button className={filtros.atribuicao === 'sem_dono' ? 'ativo' : ''} onClick={() => set({ atribuicao: 'sem_dono' })}>Sem dono</button>
        </div>
      </div>
      <div className="fila-lista">
        {erro && <p className="erro pad">{erro}</p>}
        {carregando && lista.length === 0 && <p className="muted pad">Carregando…</p>}
        {!carregando && !erro && lista.length === 0 && <p className="muted pad">Nenhuma conversa com esses filtros.</p>}
        {lista.map((c) => {
          const nome = c.cliente_nome || c.nome_perfil || telefone(c.wa_id) || 'Sem nome';
          return (
            <button key={c.conversa_id} className={`item ${aberta === c.conversa_id ? 'sel' : ''}`} onClick={() => onAbrir(c.conversa_id)}>
              <span className="canal wa"><IconeWhatsApp /></span>
              <span className="item-corpo">
                <span className="item-l1">
                  <strong className="trunc">{nome}</strong>
                  <small>{horaLista(c.ultima_mensagem_em)}</small>
                </span>
                <span className="item-l2">
                  <span className="trunc muted">{c.ultima_previa || '—'}</span>
                  {c.nao_lidas > 0 && <span className="badge">{c.nao_lidas}</span>}
                </span>
                <span className="item-l3">
                  {c.protocolo && <span className="tag cinza">{c.protocolo}</span>}
                  <span className={`tag setor-${c.setor_id ?? 'x'}`}>{nomeSetor(c.setor_id)}</span>
                  <span className="tag cinza">{c.atribuido_nome || 'Sem dono'}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
