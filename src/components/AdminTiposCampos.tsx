import { useCallback, useEffect, useState } from 'react';
import { api, mensagemErro } from '../lib/api';
import type { CampoPadrao, EstadoCampo, Setor, TipoTicket } from '../lib/types';
import { nomeSetor, PRIORIDADE_ROTULO } from '../lib/format';
import Modal from './Modal';

const ESTADOS: { v: EstadoCampo; r: string }[] = [
  { v: 'oculto', r: 'Oculto' }, { v: 'opcional', r: 'Opcional' }, { v: 'obrigatorio', r: 'Obrigatório' },
];
const horasUteis = (h: number) => (h >= 10 && h % 10 === 0 ? `${h / 10} dia${h / 10 > 1 ? 's' : ''} útil${h / 10 > 1 ? 'eis' : ''}` : `${h} h úteis`);

/** Cadastro de tipos de chamado (código, público, categoria, setor, prioridade, prazos, próxima ação, checklist e campos). */
export function AdminTipos({ setores }: { setores: Setor[] }) {
  const [tipos, setTipos] = useState<TipoTicket[]>([]);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState<TipoTicket | 'novo' | null>(null);
  const [inativos, setInativos] = useState(false);
  const carregar = useCallback(async () => {
    try { setTipos(await api.listarTipos(true)); setErro(''); } catch (e) { setErro(mensagemErro(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  const lista = tipos.filter((t) => inativos || t.ativo);

  return (
    <div>
      <div className="admin-cab">
        <div>
          <h1>Tipos de chamado</h1>
          <p className="muted">Prazos em <b>horário comercial</b> (seg–sex, 8h–18h). 1 dia útil = 10 h.</p>
        </div>
        <div className="linha-botoes">
          <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} /> Mostrar inativos</label>
          <button type="button" className="btn primario" onClick={() => setEditando('novo')}>+ Novo tipo</button>
        </div>
      </div>
      {erro && <p className="erro">{erro}</p>}
      <div className="tabela">
        <div className="tr th tr-tipos"><span>Cód.</span><span>Tipo</span><span>Departamento</span><span>Prioridade</span><span>Resposta</span><span>Solução</span><span>Categoria</span><span /></div>
        {lista.map((t) => (
          <div key={t.id} className={`tr tr-tipos ${t.ativo ? '' : 'inativo'}`}>
            <span><b>{t.codigo || '—'}</b></span>
            <span>{t.nome}<small className="muted">{t.publico === 'consumidor' ? 'Consumidor final' : t.publico === 'ambos' ? 'Ambos' : 'Lojista'}{(t.checklist?.length ?? 0) > 0 ? ` · checklist ${t.checklist?.length}` : ''}</small></span>
            <span>{nomeSetor(t.setor_padrao)}</span>
            <span>{PRIORIDADE_ROTULO[t.prioridade_padrao ?? 'normal']}</span>
            <span>{horasUteis(Number(t.sla_primeira_resposta_h))}</span>
            <span>{horasUteis(Number(t.sla_resolucao_h))}</span>
            <span>{t.categoria || '—'}</span>
            <span><button type="button" className="btn sm" onClick={() => setEditando(t)}>Editar</button></span>
          </div>
        ))}
      </div>
      {editando && <EditorTipo tipo={editando === 'novo' ? null : editando} setores={setores} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); void carregar(); }} />}
    </div>
  );
}

function EditorTipo({ tipo, setores, onFechar, onSalvo }: { tipo: TipoTicket | null; setores: Setor[]; onFechar: () => void; onSalvo: () => void }) {
  const [f, setF] = useState({
    codigo: tipo?.codigo ?? '', nome: tipo?.nome ?? '', publico: tipo?.publico ?? 'lojista', setor: tipo?.setor_padrao ?? 'sac',
    prioridade: tipo?.prioridade_padrao ?? 'normal', resp: String(tipo?.sla_primeira_resposta_h ?? 4), sol: String(tipo?.sla_resolucao_h ?? 40),
    categoria: tipo?.categoria ?? '', proxima: tipo?.proxima_acao ?? '', checklist: (tipo?.checklist ?? []).join('\n'), ativo: tipo?.ativo ?? true,
  });
  const [campos, setCampos] = useState<Record<string, EstadoCampo>>(tipo?.campos ?? {});
  const [padrao, setPadrao] = useState<CampoPadrao[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    api.listarCampos(null).then((r) => setPadrao(r.padrao)).catch(() => {});
    api.listarCategorias().then(setCats).catch(() => {});
  }, []);
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });

  async function salvar() {
    setSalvando(true); setErro('');
    try {
      await api.adminSalvarTipo({
        id: tipo?.id ?? null, nome: f.nome.trim(), setor_padrao: f.setor, sla_primeira_resposta_h: Number(f.resp), sla_resolucao_h: Number(f.sol),
        ativo: f.ativo, codigo: f.codigo.trim(), publico: f.publico, categoria: f.categoria || null, prioridade_padrao: f.prioridade,
        proxima_acao: f.proxima, checklist: f.checklist.split('\n').map((x) => x.trim()).filter(Boolean), campos,
      });
      onSalvo();
    } catch (e) { setErro(mensagemErro(e)); } finally { setSalvando(false); }
  }

  return (
    <Modal titulo={tipo ? `Editar ${tipo.codigo ?? ''} ${tipo.nome}` : 'Novo tipo de chamado'} onFechar={onFechar}>
      <div className="grid2">
        <label>Código<input value={f.codigo} onChange={(e) => set('codigo', e.target.value)} placeholder="T10" /></label>
        <label>Público
          <select value={f.publico} onChange={(e) => set('publico', e.target.value)}>
            <option value="lojista">Lojista (PJ)</option><option value="consumidor">Consumidor final</option><option value="ambos">Ambos</option>
          </select>
        </label>
      </div>
      <label>Nome *<input value={f.nome} onChange={(e) => set('nome', e.target.value)} /></label>
      <div className="grid2">
        <label>Departamento
          <select value={f.setor} onChange={(e) => set('setor', e.target.value)}>{setores.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
        </label>
        <label>Prioridade
          <select value={f.prioridade} onChange={(e) => set('prioridade', e.target.value)}>{Object.entries(PRIORIDADE_ROTULO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label>Resposta (horas úteis)<input type="number" min={0.5} step={0.5} value={f.resp} onChange={(e) => set('resp', e.target.value)} /></label>
        <label>Solução (horas úteis · 10 = 1 dia)<input type="number" min={1} step={1} value={f.sol} onChange={(e) => set('sol', e.target.value)} /></label>
      </div>
      <label>Categoria
        <select value={f.categoria} onChange={(e) => set('categoria', e.target.value)}><option value="">—</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </label>
      <label>Próxima ação padrão<input value={f.proxima} onChange={(e) => set('proxima', e.target.value)} placeholder="Ex.: Definir a solução com a transportadora" /></label>
      <label>Checklist padrão (um item por linha)<textarea rows={4} value={f.checklist} onChange={(e) => set('checklist', e.target.value)} placeholder={'Foto das caixas\nCanhoto com ressalva'} /></label>
      <details className="det-bloco">
        <summary className="det-tit">Campos deste tipo (sobrescreve o padrão)</summary>
        {padrao.map((c) => (
          <div key={c.chave} className="campo-cfg">
            <span>{c.rotulo}</span>
            <select value={campos[c.chave] ?? ''} onChange={(e) => {
              const n = { ...campos }; if (e.target.value) n[c.chave] = e.target.value as EstadoCampo; else delete n[c.chave]; setCampos(n);
            }}>
              <option value="">Padrão ({ESTADOS.find((x) => x.v === c.estado_padrao)?.r})</option>
              {ESTADOS.filter((x) => !(c.fixo && x.v === 'oculto')).map((x) => <option key={x.v} value={x.v}>{x.r}</option>)}
            </select>
          </div>
        ))}
      </details>
      <label className="check"><input type="checkbox" checked={f.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Ativo</label>
      {erro && <p className="erro">{erro}</p>}
      <div className="linha-botoes">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn primario" disabled={salvando || f.nome.trim().length < 2} onClick={() => void salvar()}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </Modal>
  );
}

/** Configurador global: quais campos aparecem e quais são obrigatórios (na abertura ou só ao fechar). */
export function AdminCampos() {
  const [campos, setCampos] = useState<CampoPadrao[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [novaCat, setNovaCat] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const carregar = useCallback(async () => {
    try { setCampos((await api.listarCampos(null)).padrao); setCats(await api.listarCategorias()); setErro(''); } catch (e) { setErro(mensagemErro(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function salvar(c: CampoPadrao, mud: Partial<CampoPadrao>) {
    setErro(''); setOk('');
    try { await api.salvarCampo({ chave: c.chave, ...mud }); setOk(`"${c.rotulo}" salvo.`); await carregar(); } catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <div>
      <div className="admin-cab">
        <div>
          <h1>Configurador de campos</h1>
          <p className="muted">Padrão para todos os chamados. Cada tipo pode sobrescrever em <b>Tipos de chamado → Editar → Campos deste tipo</b>.</p>
        </div>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {ok && <p className="ok">{ok}</p>}
      <div className="tabela">
        <div className="tr th tr-campos"><span>Campo</span><span>Situação</span><span>Exigir só ao fechar</span></div>
        {campos.map((c) => (
          <div key={c.chave} className="tr tr-campos">
            <span>{c.rotulo}{c.fixo && <small className="muted">sempre visível</small>}</span>
            <span>
              <select value={c.estado_padrao} onChange={(e) => void salvar(c, { estado_padrao: e.target.value as EstadoCampo })}>
                {ESTADOS.filter((x) => !(c.fixo && x.v === 'oculto')).map((x) => <option key={x.v} value={x.v}>{x.r}</option>)}
              </select>
            </span>
            <span>
              <label className="check" style={{ margin: 0 }}>
                <input type="checkbox" checked={c.so_ao_fechar} disabled={c.estado_padrao !== 'obrigatorio'} onChange={(e) => void salvar(c, { so_ao_fechar: e.target.checked })} />
                {c.so_ao_fechar ? 'Sim (não trava a abertura)' : 'Não (exige já na abertura)'}
              </label>
            </span>
          </div>
        ))}
      </div>
      <h2 style={{ marginTop: 24 }}>Categorias</h2>
      <div className="chips" style={{ margin: '8px 0' }}>{cats.map((c) => <span key={c} className="tag cinza">{c}</span>)}</div>
      <div className="linha-botoes esq">
        <input style={{ maxWidth: 260 }} placeholder="Nova categoria" value={novaCat} onChange={(e) => setNovaCat(e.target.value)} />
        <button type="button" className="btn sm" disabled={novaCat.trim().length < 2}
          onClick={async () => { try { await api.salvarCategoria(novaCat.trim()); setNovaCat(''); await carregar(); } catch (e) { setErro(mensagemErro(e)); } }}>Adicionar</button>
      </div>
    </div>
  );
}
