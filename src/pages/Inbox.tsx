import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api, mensagemErro } from '../lib/api';
import type { FiltrosTicket, Perfil, Setor, TicketLinha, TipoTicket, ViewItem } from '../lib/types';
import Fila from '../components/Fila';
import Conversa from '../components/Conversa';
import NovoTicket from '../components/NovoTicket';
import Cards from '../components/Cards';
import Modal from '../components/Modal';

export interface FiltrosView {
  busca: string;
  ordem: string;
  canal?: string;
  prioridade?: string;
  atrasado?: boolean;
  extra?: FiltrosTicket;
}

interface Props { perfil: Perfil; setores: Setor[]; todosSetores: Setor[] }

const LIMITE = 50;

export default function Inbox({ perfil, setores, todosSetores }: Props) {
  const [views, setViews] = useState<ViewItem[]>([]);
  const [viewAtiva, setViewAtiva] = useState('sys:minha_fila');
  const [filtros, setFiltros] = useState<FiltrosView>({ busca: '', ordem: 'recentes' });
  const [lista, setLista] = useState<TicketLinha[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [tipos, setTipos] = useState<TipoTicket[]>([]);
  const [novo, setNovo] = useState(false);
  const [salvarView, setSalvarView] = useState(false);
  const [nomeView, setNomeView] = useState('');
  const [card, setCard] = useState<string | null>(null);
  const cardRef = useRef(card);
  cardRef.current = card;

  const filtrosRef = useRef(filtros);
  filtrosRef.current = filtros;
  const viewRef = useRef(viewAtiva);
  viewRef.current = viewAtiva;
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const viewAtual = views.find((v) => v.id === viewAtiva);

  const montarFiltros = useCallback((): FiltrosTicket => {
    // com um card selecionado, o card manda (ignora o status da view para não zerar a lista)
    const base: FiltrosTicket = cardRef.current ? { card: cardRef.current } : { ...(viewAtual?.filtros ?? {}), ...(filtrosRef.current.extra ?? {}) };
    const f = filtrosRef.current;
    if (f.busca.trim()) base.busca = f.busca.trim();
    if (f.canal) base.canal = f.canal;
    if (f.prioridade) base.prioridade = f.prioridade;
    if (f.atrasado) base.atrasado = true;
    return base;
  }, [viewAtual]);

  const recarregarViews = useCallback(async () => {
    try { setViews(await api.listarViews()); } catch { /* ignore */ }
  }, []);

  const recarregar = useCallback(async () => {
    const ordem = filtrosRef.current.ordem || viewAtual?.ordem || 'recentes';
    try {
      const dados = await api.listarTickets(montarFiltros(), ordem, LIMITE, offsetRef.current);
      const rows = dados ?? [];
      setLista(rows);
      setTotal(rows[0]?.total ?? rows.length);
      setErro('');
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, [montarFiltros, viewAtual]);

  useEffect(() => {
    void api.listarTipos().then(setTipos).catch(() => {});
    void recarregarViews();
  }, [recarregarViews]);

  useEffect(() => {
    setCarregando(true);
    const t = setTimeout(recarregar, filtros.busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [filtros, viewAtiva, offset, recarregar, card]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const gatilho = () => {
      clearTimeout(t);
      t = setTimeout(() => { void recarregar(); void recarregarViews(); setVersao((v) => v + 1); }, 300);
    };
    const ch = supabase
      .channel('sac-inbox')
      .on('postgres_changes', { event: '*', schema: 'sac', table: 'conversas' }, gatilho)
      .on('postgres_changes', { event: '*', schema: 'sac', table: 'tickets' }, gatilho)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [recarregar, recarregarViews]);

  const item = lista.find((c) => c.conversa_id === aberta) ?? null;

  async function confirmarSalvarView() {
    if (!nomeView.trim()) return;
    const compartilhada = perfil.papel === 'admin' || perfil.papel === 'supervisor';
    try {
      await api.salvarView({
        nome: nomeView.trim(),
        filtros: montarFiltros(),
        ordem: filtros.ordem,
        compartilhada,
      });
      setSalvarView(false);
      setNomeView('');
      await recarregarViews();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <>
    <Cards card={card} onCard={(c) => { setCard(c); setOffset(0); }} versao={versao} filtros={montarFiltros} />
    <main className="inbox">
      <Fila
        perfil={perfil}
        views={views}
        viewAtiva={viewAtiva}
        onView={(id) => { setViewAtiva(id); setOffset(0); }}
        filtros={filtros}
        onFiltros={setFiltros}
        lista={lista}
        total={total}
        offset={offset}
        onPagina={setOffset}
        carregando={carregando}
        erro={erro}
        aberta={aberta}
        onAbrir={setAberta}
        onNovoTicket={() => setNovo(true)}
        onSalvarView={() => setSalvarView(true)}
      />
      {aberta ? (
        <Conversa
          key={aberta}
          conversaId={aberta}
          item={item}
          perfil={perfil}
          setores={todosSetores}
          tipos={tipos}
          versao={versao}
          onMudou={recarregar}
        />
      ) : (
        <section className="vazio-central">
          <div>
            <h2>Selecione um ticket</h2>
            <p className="muted">Escolha uma fila à esquerda ou crie um novo ticket.</p>
          </div>
        </section>
      )}
      {novo && (
        <NovoTicket
          perfil={perfil}
          setores={todosSetores}
          tipos={tipos}
          onFechar={() => setNovo(false)}
          onAberto={(id) => { setAberta(id); void recarregar(); }}
        />
      )}
      {salvarView && (
        <Modal titulo="Salvar como view" onFechar={() => setSalvarView(false)}>
          <label>Nome da view
            <input value={nomeView} onChange={(e) => setNomeView(e.target.value)} autoFocus />
          </label>
          <p className="muted pequeno">
            {(perfil.papel === 'admin' || perfil.papel === 'supervisor')
              ? 'Pode marcar como compartilhada ao salvar (padrão: pessoal).'
              : 'View pessoal (só você vê).'}
          </p>
          <div className="linha-botoes">
            <button type="button" className="btn ghost" onClick={() => setSalvarView(false)}>Cancelar</button>
            <button type="button" className="btn primario" disabled={!nomeView.trim()} onClick={() => void confirmarSalvarView()}>Salvar</button>
          </div>
        </Modal>
      )}
    </main>
    </>
  );
}