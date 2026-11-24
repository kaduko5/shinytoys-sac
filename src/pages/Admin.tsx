import { useCallback, useEffect, useState } from 'react';
import { api, mensagemErro } from '../lib/api';
import type { Atendente, MacroTicket, Papel, Perfil, Setor, TipoTicket } from '../lib/types';
import { nomeSetor } from '../lib/format';

type Aba = 'atendentes' | 'tipos' | 'macros';

export default function Admin({ perfil, setores }: { perfil: Perfil; setores: Setor[] }) {
  const [aba, setAba] = useState<Aba>('atendentes');
  const podeMacros = perfil.papel === 'admin' || perfil.papel === 'supervisor';
  const soAdmin = perfil.papel === 'admin';

  return (
    <main className="admin">
      <AdminAbas aba={aba} setAba={setAba} podeMacros={podeMacros} soAdmin={soAdmin} />
      {aba === 'atendentes' && <AdminAtendentes perfil={perfil} setores={setores} />}
      {aba === 'tipos' && soAdmin && <AdminTipos setores={setores} />}
      {aba === 'tipos' && !soAdmin && <p className="erro">Só administradores.</p>}
      {aba === 'macros' && podeMacros && <AdminMacros setores={setores} />}
      {aba === 'macros' && !podeMacros && <p className="erro">Só admin ou supervisor.</p>}
    </main>
  );
}

function AdminAbas({ aba, setAba, podeMacros, soAdmin }: { aba: Aba; setAba: (a: Aba) => void; podeMacros: boolean; soAdmin: boolean }) {
  return (
    <div className="admin-abas">
      <button type="button" className={aba === 'atendentes' ? 'ativo' : ''} onClick={() => setAba('atendentes')}>Atendentes</button>
      {soAdmin && <button type="button" className={aba === 'tipos' ? 'ativo' : ''} onClick={() => setAba('tipos')}>Tipos de ticket</button>}
      {podeMacros && <button type="button" className={aba === 'macros' ? 'ativo' : ''} onClick={() => setAba('macros')}>Macros</button>}
    </div>
  );
}

function AdminAtendentes({ perfil, setores }: { perfil: Perfil; setores: Setor[] }) {
  const [lista, setLista] = useState<Atendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try { setLista(await api.listarAtendentes(null)); setErro(''); }
    catch (e) { setErro(mensagemErro(e)); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const pendentes = lista.filter((a) => !a.ativo).length;

  return (
    <>
      <div className="admin-cab">
        <div>
          <h1>Atendentes</h1>
          <p className="muted">
            Usuários são criados no Supabase (Authentication → Users). Aqui você libera o acesso, escolhe setores e papel.
            {pendentes > 0 && <b> {pendentes} aguardando liberação.</b>}
          </p>
        </div>
        <button type="button" className="btn ghost" onClick={() => void carregar()}>Atualizar</button>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {carregando && lista.length === 0 && <p className="muted">Carregando…</p>}
      <div className="tabela">
        <div className="tr th">
          <span>Nome / e-mail</span><span>Setores</span><span>Papel</span><span>Ativo</span><span />
        </div>
        {lista.map((a) => <LinhaAtendente key={a.id} a={a} setores={setores} euMesmo={a.id === perfil.id} onSalvo={carregar} />)}
      </div>
    </>
  );
}

function LinhaAtendente({ a, setores, euMesmo, onSalvo }: { a: Atendente; setores: Setor[]; euMesmo: boolean; onSalvo: () => void }) {
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
        <button type="button" className="btn sm primario" disabled={!mudou || salvando} onClick={() => void salvar()}>{salvando ? '…' : 'Salvar'}</button>
        {msg && <small className="ok">{msg}</small>}
        {erro && <small className="erro">{erro}</small>}
      </span>
    </div>
  );
}

function AdminTipos({ setores }: { setores: Setor[] }) {
  const [lista, setLista] = useState<TipoTicket[]>([]);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try { setLista(await api.listarTipos(true)); } catch (e) { setErro(mensagemErro(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <>
      <AdminCab titulo="Tipos de ticket" onAtualizar={carregar} />
      {erro && <p className="erro">{erro}</p>}
      <FormTipo setores={setores} onSalvo={carregar} />
      <div className="tabela tipos-tab">
        {lista.map((t) => <LinhaTipo key={t.id} t={t} setores={setores} onSalvo={carregar} />)}
      </div>
    </>
  );
}

function FormTipo({ setores, onSalvo }: { setores: Setor[]; onSalvo: () => void }) {
  const [nome, setNome] = useState('');
  const [setor, setSetor] = useState('sac');
  const [sla1, setSla1] = useState(8);
  const [slaR, setSlaR] = useState(48);
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setSalvando(true);
    try {
      await api.adminSalvarTipo({ nome, setor_padrao: setor, sla_primeira_resposta_h: sla1, sla_resolucao_h: slaR });
      setNome('');
      onSalvo();
    } finally { setSalvando(false); }
  }
  return (
    <FormNovoTipo onSalvar={salvar} salvando={salvando} nome={nome} setNome={setNome} setor={setor} setSetor={setSetor} setores={setores} sla1={sla1} setSla1={setSla1} slaR={slaR} setSlaR={setSlaR} />
  );
}

function FormNovoTipo(props: {
  onSalvar: () => void;
  salvando: boolean;
  nome: string;
  setNome: (v: string) => void;
  setor: string;
  setSetor: (v: string) => void;
  setores: Setor[];
  sla1: number;
  setSla1: (v: number) => void;
  slaR: number;
  setSlaR: (v: number) => void;
}) {
  const { onSalvar, salvando, nome, setNome, setor, setSetor, setores, sla1, setSla1, slaR, setSlaR } = props;
  return (
    <div className="form-inline admin-form">
      <input placeholder="Nome do tipo" value={nome} onChange={(e) => setNome(e.target.value)} />
      <select value={setor} onChange={(e) => setSetor(e.target.value)}>
        {setores.map((s) => <option key={s.id} value={s.id}>{s.nome || nomeSetor(s.id)}</option>)}
      </select>
      <input type="number" min={1} value={sla1} onChange={(e) => setSla1(Number(e.target.value))} title="SLA 1ª resposta (h)" />
      <input type="number" min={1} value={slaR} onChange={(e) => setSlaR(Number(e.target.value))} title="SLA resolução (h)" />
      <button type="button" className="btn sm primario" disabled={salvando || !nome.trim()} onClick={() => void onSalvar()}>Novo tipo</button>
    </div>
  );
}

function LinhaTipo({ t, setores, onSalvo }: { t: TipoTicket; setores: Setor[]; onSalvo: () => void }) {
  const [nome, setNome] = useState(t.nome);
  const [setor, setSetor] = useState(t.setor_padrao);
  const [sla1, setSla1] = useState(t.sla_primeira_resposta_h);
  const [slaR, setSlaR] = useState(t.sla_resolucao_h);
  const [ativo, setAtivo] = useState(t.ativo);
  const [ordem, setOrdem] = useState(t.ordem);
  return (
    <div className={`tr tipo-linha ${!ativo ? 'inativo' : ''}`}>
      <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!t.editavel} />
      <select value={setor} onChange={(e) => setSetor(e.target.value)}>
        {setores.map((s) => <option key={s.id} value={s.id}>{s.nome || nomeSetor(s.id)}</option>)}
      </select>
      <input type="number" value={sla1} onChange={(e) => setSla1(Number(e.target.value))} />
      <input type="number" value={slaR} onChange={(e) => setSlaR(Number(e.target.value))} />
      <input type="number" value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} />
      <label className="check"><input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />Ativo</label>
      <button
        type="button"
        className="btn sm"
        onClick={() => void api.adminSalvarTipo({
          id: t.id, nome, setor_padrao: setor, sla_primeira_resposta_h: sla1, sla_resolucao_h: slaR, ordem, ativo,
        }).then(onSalvo)}
      >
        Salvar
      </button>
    </div>
  );
}

function AdminMacros({ setores }: { setores: Setor[] }) {
  const [lista, setLista] = useState<MacroTicket[]>([]);
  const [tipos, setTipos] = useState<TipoTicket[]>([]);
  const carregar = useCallback(async () => {
    setLista(await api.listarMacros({ incluir_inativas: true }));
    setTipos(await api.listarTipos());
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const [titulo, setTitulo] = useState('');
  const [corpo, setCorpo] = useState('Olá {{primeiro_nome}}, protocolo {{protocolo}}…');
  const [setor, setSetor] = useState('');
  const [tipoId, setTipoId] = useState('');

  const preview = corpo
    .replace(/\{\{primeiro_nome\}\}/g, 'Maria')
    .replace(/\{\{nome\}\}/g, 'Maria Silva')
    .replace(/\{\{protocolo\}\}/g, 'SAC-2026-000123')
    .replace(/\{\{atendente\}\}/g, 'João')
    .replace(/\{\{atendente_nome\}\}/g, 'João Souza')
    .replace(/\{\{setor\}\}/g, 'SAC')
    .replace(/\{\{tipo\}\}/g, 'Dúvida')
    .replace(/\{\{assunto\}\}/g, 'Pedido atrasado');

  return (
    <>
      <AdminCab titulo="Macros / respostas prontas" onAtualizar={() => void carregar()} />
      <div className="admin-form col">
        <input placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <textarea rows={4} value={corpo} onChange={(e) => setCorpo(e.target.value)} maxLength={4000} />
        <p className="pequeno muted">Variáveis: {'{{nome}}'}, {'{{primeiro_nome}}'}, {'{{protocolo}}'}, {'{{atendente}}'}, …</p>
        <div className="form-inline">
          <select value={setor} onChange={(e) => setSetor(e.target.value)}>
            <option value="">Todos setores</option>
            {setores.map((s) => <option key={s.id} value={s.id}>{s.nome || nomeSetor(s.id)}</option>)}
          </select>
          <select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">Qualquer tipo</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <button
            type="button"
            className="btn sm primario"
            disabled={!titulo.trim() || !corpo.trim()}
            onClick={() => void api.adminSalvarMacro({
              titulo, corpo, setor_id: setor || null, tipo_id: tipoId || null,
            }).then(() => { setTitulo(''); void carregar(); })}
          >
            Nova macro
          </button>
        </div>
        <div className="preview-macro">
          <strong>Pré-visualização</strong>
          <p className="quebra">{preview}</p>
        </div>
      </div>
      <ul className="lista-macros admin">
        {lista.map((m) => (
          <li key={m.id} className={!m.ativo ? 'inativo' : ''}>
            <strong>{m.titulo}</strong>
            <span className="pequeno muted">{m.setor_id ? nomeSetor(m.setor_id) : 'Geral'}</span>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => void api.adminSalvarMacro({ id: m.id, titulo: m.titulo, corpo: m.corpo, ativo: false }).then(carregar)}
            >
              Desativar
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function AdminCab({ titulo, onAtualizar }: { titulo: string; onAtualizar: () => void }) {
  return (
    <div className="admin-cab">
      <h1>{titulo}</h1>
      <button type="button" className="btn ghost" onClick={onAtualizar}>Atualizar</button>
    </div>
  );
}