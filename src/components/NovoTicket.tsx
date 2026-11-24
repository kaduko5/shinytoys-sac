import { useCallback, useEffect, useState } from 'react';
import { api, mensagemErro, protocoloDeErro } from '../lib/api';
import type { Perfil, Setor, TipoTicket } from '../lib/types';
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

  const tipoSel = tipos.find((t) => t.id === tipoId);

  useEffect(() => {
    if (tipoSel) setSetorId(tipoSel.setor_padrao);
  }, [tipoSel]);

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
      };
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
  }, [assunto, atribuir, canal, descricao, email, nome, onAberto, onFechar, prioridade, setorId, tagsTxt, tel, tipoId, wa]);

  return (
    <Modal titulo="Novo ticket" onFechar={onFechar}>
      <p className="muted pequeno aviso-criacao">Nada é enviado ao cliente — só registra o atendimento no sistema.</p>
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
        <label>Tipo
          <select value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
            <option value="">— nenhum —</option>
            {tipos.filter((t) => t.ativo).map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
        <label>Setor
          <select value={setorId} onChange={(e) => setSetorId(e.target.value)}>
            {setores.map((s) => <option key={s.id} value={s.id}>{s.nome || nomeSetor(s.id)}</option>)}
          </select>
        </label>
      </div>
      <label>Tags (separadas por vírgula)
        <input value={tagsTxt} onChange={(e) => setTagsTxt(e.target.value)} placeholder="troca, urgente" />
      </label>
      <label className="check linha-check">
        <input type="checkbox" checked={atribuir} onChange={(e) => setAtribuir(e.target.checked)} />
        Atribuir a mim ({perfil.nome || 'eu'})
      </label>
      {erro && <p className="erro">{erro}</p>}
      {protoExistente && <p className="aviso-exist">Protocolo em aberto: <strong>{protoExistente}</strong></p>}
      <div className="linha-botoes">
        <button type="button" className="btn ghost" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn primario" disabled={salvando || assunto.trim().length < 3} onClick={enviar}>
          {salvando ? 'Criando…' : 'Criar ticket'}
        </button>
      </div>
    </Modal>
  );
}