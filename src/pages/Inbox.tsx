import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api, mensagemErro } from '../lib/api';
import type { ConversaItem, Perfil, Setor } from '../lib/types';
import Fila from '../components/Fila';
import Conversa from '../components/Conversa';

export interface Filtros {
  setor: string | null; // null = Todos
  status: 'ativos' | 'fechado';
  atribuicao: 'todas' | 'minhas' | 'sem_dono';
  busca: string;
}

interface Props { perfil: Perfil; setores: Setor[]; todosSetores: Setor[] }

export default function Inbox({ perfil, setores, todosSetores }: Props) {
  const [filtros, setFiltros] = useState<Filtros>({ setor: null, status: 'ativos', atribuicao: 'todas', busca: '' });
  const [lista, setLista] = useState<ConversaItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [versao, setVersao] = useState(0); // incrementa quando tickets/conversas mudam (Realtime)

  const filtrosRef = useRef(filtros);
  filtrosRef.current = filtros;

  const recarregar = useCallback(async () => {
    const f = filtrosRef.current;
    try {
      const dados = await api.listarConversas({
        setor: f.setor,
        status: f.status,
        busca: f.busca.trim(),
        atribuicao: f.atribuicao === 'todas' ? null : f.atribuicao,
      });
      setLista(dados ?? []);
      setErro('');
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  // recarrega ao mudar filtros (busca com debounce)
  useEffect(() => {
    setCarregando(true);
    const t = setTimeout(recarregar, filtros.busca ? 350 : 0);
    return () => clearTimeout(t);
  }, [filtros, recarregar]);

  // Realtime: conversas e tickets → recarrega lista (debounce 300ms)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const gatilho = () => {
      clearTimeout(t);
      t = setTimeout(() => { recarregar(); setVersao((v) => v + 1); }, 300);
    };
    const ch = supabase
      .channel('sac-inbox')
      .on('postgres_changes', { event: '*', schema: 'sac', table: 'conversas' }, gatilho)
      .on('postgres_changes', { event: '*', schema: 'sac', table: 'tickets' }, gatilho)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [recarregar]);

  const item = lista.find((c) => c.conversa_id === aberta) ?? null;

  return (
    <main className="inbox">
      <Fila
        perfil={perfil}
        setores={setores}
        filtros={filtros}
        onFiltros={setFiltros}
        lista={lista}
        carregando={carregando}
        erro={erro}
        aberta={aberta}
        onAbrir={setAberta}
      />
      {aberta ? (
        <Conversa
          key={aberta}
          conversaId={aberta}
          item={item}
          perfil={perfil}
          setores={todosSetores}
          versao={versao}
          onMudou={recarregar}
        />
      ) : (
        <section className="vazio-central">
          <div>
            <h2>Selecione uma conversa</h2>
            <p className="muted">As mensagens que chegam no WhatsApp do SAC aparecem na fila à esquerda.</p>
          </div>
        </section>
      )}
    </main>
  );
}
