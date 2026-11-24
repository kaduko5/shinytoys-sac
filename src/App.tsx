import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configOk, supabase } from './lib/supabase';
import { api, mensagemErro } from './lib/api';
import type { Perfil, Setor } from './lib/types';
import Login from './pages/Login';
import NovaSenha from './pages/NovaSenha';
import Inbox from './pages/Inbox';
import Admin from './pages/Admin';
import TopBar from './components/TopBar';

type Rota = 'inbox' | 'admin';
const rotaAtual = (): Rota => (window.location.pathname.startsWith('/admin') ? 'admin' : 'inbox');

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [carregandoSessao, setCarregandoSessao] = useState(true);
  const [recuperacao, setRecuperacao] = useState(false);
  const [perfil, setPerfil] = useState<Perfil | null | undefined>(undefined);
  const [erroPerfil, setErroPerfil] = useState('');
  const [setores, setSetores] = useState<Setor[]>([]);
  const [rota, setRota] = useState<Rota>(rotaAtual());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCarregandoSessao(false);
    });
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperacao(true);
      setSession(s);
    });
    const onPop = () => setRota(rotaAtual());
    window.addEventListener('popstate', onPop);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const carregarPerfil = useCallback(async () => {
    setErroPerfil('');
    try {
      const p = await api.meuPerfil();
      setPerfil(p);
      if (p?.ativo) setSetores(await api.listarSetores());
    } catch (e) {
      setErroPerfil(mensagemErro(e));
      setPerfil(null);
    }
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (uid) carregarPerfil();
    else setPerfil(undefined);
  }, [uid, carregarPerfil]);

  const navegar = (r: Rota) => {
    window.history.pushState({}, '', r === 'admin' ? '/admin' : '/');
    setRota(r);
  };

  if (!configOk)
    return (
      <div className="centro">
        <div className="cartao">
          <h1>Configuração pendente</h1>
          <p>Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (arquivo <code>.env</code> ou variáveis do Netlify).</p>
        </div>
      </div>
    );

  if (carregandoSessao) return <div className="centro muted">Carregando…</div>;
  if (recuperacao && session) return <NovaSenha onPronto={() => setRecuperacao(false)} />;
  if (!session) return <Login />;
  if (perfil === undefined) return <div className="centro muted">Carregando perfil…</div>;

  if (!perfil || !perfil.ativo)
    return (
      <div className="centro">
        <div className="cartao">
          <div className="logo-s">S</div>
          <h1>Acesso aguardando liberação</h1>
          <p>Seu acesso ainda não foi liberado pelo administrador.</p>
          {erroPerfil && <p className="erro">{erroPerfil}</p>}
          <p className="muted">Conta: {session.user.email}</p>
          <div className="linha-botoes">
            <button className="btn" onClick={carregarPerfil}>Verificar de novo</button>
            <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
          </div>
        </div>
      </div>
    );

  const setoresVisiveis =
    perfil.papel === 'atendente' ? setores.filter((s) => perfil.setores.includes(s.id)) : setores;

  return (
    <div className="app">
      <TopBar perfil={perfil} rota={rota} onNavegar={navegar} />
      {rota === 'admin' && perfil.papel === 'admin' ? (
        <Admin perfil={perfil} setores={setores} />
      ) : (
        <Inbox perfil={perfil} setores={setoresVisiveis} todosSetores={setores} />
      )}
    </div>
  );
}
