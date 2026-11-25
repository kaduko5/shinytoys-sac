import { useCallback, useEffect, useState } from 'react';
import BuscaCliente from './BuscaCliente';
import { api, mensagemErro, protocoloDeErro } from '../lib/api';
import type { Atendente, CampoEfetivo, ClienteBusca, Perfil, Setor, TipoTicket } from '../lib/types';
import { nomeSetor } from '../lib/format';
import Modal from './Modal';

interface Props {
  perfil: Perfil;
  setores: Setor[];
  tipos: TipoTicket[];
  onFechar: () => void;
  onAberto: (conversaId: string) => void;
}

type Canal = 'whatsapp' | 'telefone' | 'email' | 'interno';

export default function NovoTicket({ perfil, setores, tipos, onFechar, onAberto }: Props) {
  const [canal, setCanal] = useState<Canal>('whatsapp');
  const [nome, setNome] = useState('');
  const [wa, setWa] = useState('');
  const [tel, setTel] = useState('');
  const [email, setEmail] = useState('');
  const [assunto, setAssunto] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipoId, setTipoId] = useState('');
  const [setorId, setSetorId] = useState('sac');
  const [prioridade, setPrioridade] = useState('normal');
  const [tagsTxt, setTagsTxt] = useState('');
  const [atribuir, setAtribuir] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [protoExistente, setProtoExistente] = useState<string | null>(null);
  const [publico, setPublico] = useState<'lojista' | 'consumidor'>('lojista');
  const [cliente, setCliente] = useState<ClienteBusca | null>(null);
  const [buscaCli, setBuscaCli] = useState(false);
  const [campos, setCampos] = useState<Record<string, CampoEfetivo>>({});
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [cats, setCats] = useState<string[]>([]);
  const [atendentes, setAtendentes] = useState<Atendente[]>([]);
  const [responsavel, setResponsavel] = useState('');

  const tipoSel = tipos.find((t) => t.id === tipoId);
  const tiposPub = tipos.filter((t) => t.ativo && t.codigo && (t.publico === publico || t.publico === 'ambos'));

  useEffect(() => {
    if (tipoSel) { setSetorId(tipoSel.setor_padrao); if (tipoSel.prioridade_padrao) setPrioridade(tipoSel.prioridade_padrao); }
  }, [tipoSel]);
  useEffect(() => { api.listarCampos(tipoId || null).then((r) => setCampos(r.efetivos)).catch(() => {}); }, [tipoId]);
  useEffect(() => { api.listarCategorias().then(setCats).catch(() => {}); }, []);
  useEffect(() => { api.listarAtendentes(setorId).then((l) => setAtendentes(l.filter((a) => a.ativo))).catch(() => {}); }, [setorId]);
  useEffect(() => { if (tipoSel && tipoSel.publico !== publico && tipoSel.publico !== 'ambos') setTipoId(''); }, [publico, tipoSel]);

  const ve = (k: string) => (campos[k]?.estado ?? 'opcional') !== 'oculto';
  const obAbrir = (k: string) => campos[k]?.estado === 'obrigatorio' && !campos[k]?.so_ao_fechar;
  const rot = (k: string, padrao: string) => `${campos[k]?.rotulo ?? padrao}${obAbrir(k) ? ' *' : ''}`;
  const respFinal = atribuir ? perfil.id : responsavel;

  const enviar = useCallback(async () => {
    setErro('');
    setProtoExistente(null);
    setSalvando(true);
    try {
      const tags = tagsTxt.split(',').map((t) => t.trim()).filter(Boolean);
      const body: Record<string, unknown> = {
        p_canal: canal,
        p_assunto: assunto.trim(),
        p_descricao: descricao.trim() || null,
        p_tipo_id: tipoId || null,
        p_setor_id: setorId,
        p_prioridade: prioridade,
        p_tags: tags.length ? tags : null,
        p_atribuir_a_mim: atribuir,
        p_nome: nome.trim() || null,
        p_publico: publico,
        p_cliente_id: cliente?.origem === 'sac' ? cliente.id : null,
        p_portal_chave: cliente?.origem === 'portal' ? cliente.id : null,
      };
      const campos: Record<string, unknown> = {};
      for (const k of ['categoria', 'pedido', 'nf', 'transportadora', 'prazo', 'proxima_acao', 'vendedor']) if (extra[k]?.trim()) campos[k] = extra[k].trim();
      if (!atribuir && responsavel) campos.atribuido_a = responsavel;
      if (Object.keys(campos).length) body.p_campos = campos;
      if (canal === 'whatsapp') {
        const v = wa.trim() || tel.trim();
        if (v) body.p_wa_id = v;
      }
      if (canal === 'telefone') body.p_telefone = tel.trim();
      if (canal === 'email') body.p_email = email.trim();
      const r = await api.abrirTicket(body);
      onAberto(r.conversa_id);
      onFechar();
    } catch (e) {
      const proto = protocoloDeErro(e);
      if (proto) setProtoExistente(proto);
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  }, [assunto, atribuir, canal, cliente, descricao, email, extra, nome, onAberto, onFechar, prioridade, publico, responsavel, setorId, tagsTxt, tel, tipoId, wa]);

  return (
    <Modal titulo="Novo ticket" onFechar={onFechar}>
      <p className="muted pequeno aviso-criacao">Nada é enviado ao cliente — só registra o atendimento no sistema.</p>
      <div className="det-pub" style={{ marginBottom: 10 }}>
        <button type="button" className={publico === 'lojista' ? 'ativo' : ''} onClick={() => setPublico('lojista')}>Lojista (PJ) · SAC-…</button>
        <button type="button" className={publico === 'consumidor' ? 'ativo' : ''} onClick={() => setPublico('consumidor')}>Consumidor final · CF-…</button>
      </div>
      <div className="det-campo" style={{ marginBottom: 10 }}>
        <span>{rot('cliente', 'Cliente')}</span>
        {cliente ? (
          <div className="anexo-sel">
            <b>{cliente.nome || cliente.fantasia}</b>
            <small className="muted">{[cliente.cnpj, cliente.codigo && `cód. ${cliente.codigo}`, cliente.vendedor && `vend.: ${cliente.vendedor}`].filter(Boolean).join(' · ')}</small>
            <button type="button" onClick={() => setCliente(null)}>✕</button>
          </div>
        ) : (
          <button type="button" className="btn sm ghost" onClick={() => setBuscaCli(true)}>Buscar na base de clientes (nome, CNPJ, código, telefone)</button>
        )}
      </div>
      <div className="grid2">
        <label>Canal
          <select value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
            <option value="whatsapp">WhatsApp</option>
            <option value="telefone">Telefone</option>
            <option value="email">E-mail</option>
            <option value="interno">Interno</option>
          </select>
        </label>
        <label>Prioridade
          <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
            <option value="baixa">Baixa</option>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </label>
      </div>
      {canal === 'whatsapp' && (
        <label>WhatsApp / telefone
          <input value={wa || tel} onChange={(e) => { setWa(e.target.value); setTel(e.target.value); }} placeholder="11999998888" />
        </label>
      )}
      {canal === 'telefone' && (
        <label>Telefone
          <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="11999998888" />
        </label>
      )}
      {canal === 'email' && (
        <label>E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      )}
      <label>Nome do cliente
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Opcional se já existir cadastro" />
      </label>
      <label>Assunto *
        <input value={assunto} onChange={(e) => setAssunto(e.target.value)} minLength={3} />
      </label>
      <label>Descrição (nota interna)
        <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
      </label>
      <div className="grid2">
        <label>Tipo de chamado
          <select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">— escolha —</option>
            {tiposPub.map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.nome}</option>)}
          </select>
        </label>
        <label>Setor
          <select value={setorId} onChange={(e) => setSetorId(e.target.value)}>
            {setores.map((s) => <option key={s.id} value={s.id}>{s.nome || nomeSetor(s.id)}</option>)}
          </select>
        </label>
      </div>
      {tipoSel?.proxima_acao && <p className="pequeno muted">Próxima ação padrão: <b>{tipoSel.proxima_acao}</b></p>}
      {(tipoSel?.checklist?.length ?? 0) > 0 && <p className="pequeno muted">Checklist: {tipoSel?.checklist?.join(' · ')}</p>}
      <div className="grid2">
        {ve('categoria') && !tipoSel?.categoria && (
          <label>{rot('categoria', 'Categoria')}
            <select value={extra.categoria ?? ''} onChange={(e) => setExtra({ ...extra, categoria: e.target.value })}>
              <option value="">—</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        {ve('responsavel') && !atribuir && (
          <label>{rot('responsavel', 'Responsável')}
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
              <option value="">—</option>{atendentes.map((a) => <option key={a.id} value={a.id}>{a.nome || a.email}</option>)}
            </select>
          </label>
        )}
        {([['pedido', 'Pedido'], ['nf', 'NF'], ['transportadora', 'Transportadora / Armazém'], ['prazo', 'Prazo (vazio = automático)']] as const)
          .filter(([k]) => ve(k)).map(([k, r]) => (
            <label key={k}>{rot(k, r)}
              <input type={k === 'prazo' ? 'date' : 'text'} value={extra[k] ?? ''} onChange={(e) => setExtra({ ...extra, [k]: e.target.value })} />
            </label>
          ))}
      </div>
      <label>Tags (separadas por vírgula)
        <input value={tagsTxt} onChange={(e) => setTagsTxt(e.target.value)} placeholder="troca, urgente" />
      </label>
      <label className="check linha-check">
        <input type="checkbox" checked={atribuir} onChange={(e) => setAtribuir(e.target.checked)} />
        Atribuir a mim ({perfil.nome || 'eu'})
      </label>
      {buscaCli && <BuscaCliente onFechar={() => setBuscaCli(false)} onEscolher={(c) => { setCliente(c); setBuscaCli(false); }} />}
      {erro && <p className="erro">{erro}</p>}
      {protoExistente && <p className="aviso-exist">Protocolo em aberto: <strong>{protoExistente}</strong></p>}
      <div className="linha-botoes">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn primario" disabled={salvando || assunto.trim().length < 3 || (obAbrir('responsavel') && !respFinal)} onClick={enviar}>
          {salvando ? 'Criando…' : 'Criar ticket'}
        </button>
      </div>
    </Modal>
  );
}