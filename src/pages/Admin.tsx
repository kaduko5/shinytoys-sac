import { useCallback, useEffect, useState } from 'react';
import { api, mensagemErro } from '../lib/api';
import type { Atendente, Papel, Perfil, Setor } from '../lib/types';
import { nomeSetor } from '../lib/format';

export default function Admin({ perfil, setores }: { perfil: Perfil; setores: Setor[] }) {
  const [lista, setLista] = useState<Atendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setLista(await api.listarAtendentes(null)); setErro(''); }
    catch (e) { setErro(mensagemErro(e)); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const pendentes = lista.filter((a) => !a.ativo).length;

  return (
    <main className="admin">
      <div className="admin-cab">
        <div>
          <h1>Atendentes</h1>
          <p className="muted">
            Usuários são criados no Supabase (Authentication → Users). Aqui você libera o acesso, escolhe setores e papel.
            {pendentes > 0 && <b> {pendentes} aguardando liberação.</b>}
          </p>
        </div>
        <button className="btn ghost" onClick={carregar}>Atualizar</button>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {carregando && lista.length === 0 && <p className="muted">Carregando…</p>}
      <div className="tabela">
        <div className="tr th">
          <span>Nome / e-mail</span><span>Setores</span><span>Papel</span><span>Ativo</span><span />
        </div>
        {lista.map((a) => <Linha key={a.id} a={a} setores={setores} euMesmo={a.id === perfil.id} onSalvo={carregar} />)}
      </div>
    </main>
  );
}

function Linha({ a, setores, euMesmo, onSalvo }: { a: Atendente; setores: Setor[]; euMesmo: boolean; onSalvo: () => void }) {
  const [nome, setNome] = useState(a.nome ?? '');
  const [sets, setSets] = useState<string[]>(a.setores ?? []);
  const [papel, setPapel] = useState<Papel>(a.papel);
  const [ativo, setAtivo] = useState(a.ativo);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');

  const mudou = nome !== (a.nome ?? '') || papel !== a.papel || ativo !== a.ativo ||
    [...sets].sort().join() !== [...(a.setores ?? [])].sort().join();

  async function salvar() {
    setSalvando(true); setErro(''); setMsg('');
    try {
      await api.salvarAtendente({ id: a.id, nome, setores: sets, papel, ativo });
      setMsg('Salvo.');
      onSalvo();
    } catch (e) { setErro(mensagemErro(e)); }
    finally { setSalvando(false); }
  }

  return (
    <div className={`tr ${!a.ativo ? 'inativo' : ''}`}>
      <span>
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" />
        <small className="muted">{a.email}{euMesmo ? ' (você)' : ''}</small>
      </span>
      <span className="setores-check">
        {setores.map((s) => (
          <label key={s.id} className="check">
            <input type="checkbox" checked={sets.includes(s.id)}
              onChange={(e) => setSets(e.target.checked ? [...sets, s.id] : sets.filter((x) => x !== s.id))} />
            {s.nome || nomeSetor(s.id)}
          </label>
        ))}
      </span>
      <span>
        <select value={papel} disabled={euMesmo} onChange={(e) => setPapel(e.target.value as Papel)}>
          <option value="atendente">Atendente</option>
          <option value="supervisor">Supervisor</option>
          <option value="admin">Admin</option>
        </select>
      </span>
      <span>
        <label className="check">
          <input type="checkbox" checked={ativo} disabled={euMesmo} onChange={(e) => setAtivo(e.target.checked)} />
          {ativo ? 'Sim' : 'Não'}
        </label>
      </span>
      <span>
        <button className="btn sm primario" disabled={!mudou || salvando} onClick={salvar}>{salvando ? '…' : 'Salvar'}</button>
        {msg && <small className="ok">{msg}</small>}
        {erro && <small className="erro">{erro}</small>}
      </span>
    </div>
  );
}
