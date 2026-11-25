import { useCallback, useEffect, useState } from 'react';
import { api, mensagemErro } from '../lib/api';
import type { Perfil, Setor, TicketCompleto, TipoTicket } from '../lib/types';
import {
  corSla, dataHora, nomeSetor, PRIORIDADE_ROTULO, restante, STATUS_EDITAVEIS, STATUS_TICKET,
} from '../lib/format';
import Modal from './Modal';
import DetalhesTicket from './DetalhesTicket';
import LinhaTempo from './LinhaTempo';

interface Props {
  ticket: TicketCompleto;
  tipos: TipoTicket[];
  setores: Setor[];
  perfil: Perfil;
  onAtualizado: () => void;
}

export default function PainelTicket({ ticket, tipos, onAtualizado }: Props) { // setores/perfil reservados para permissões futuras
  const [local, setLocal] = useState(ticket);
  const [assunto, setAssunto] = useState(ticket.assunto ?? '');
  const [tagInput, setTagInput] = useState('');
  const [sugTags, setSugTags] = useState<{ tag: string; qtd: number }[]>([]);
  const [erro, setErro] = useState('');
  const [histAberto, setHistAberto] = useState(false);
  const [historico, setHistorico] = useState<Awaited<ReturnType<typeof api.historicoTicket>>>([]);
  const [vincProto, setVincProto] = useState('');
  const [modalMesclar, setModalMesclar] = useState(false);
  const [destinoMesclar, setDestinoMesclar] = useState('');
  const [csatNota, setCsatNota] = useState(5);

  useEffect(() => { setLocal(ticket); setAssunto(ticket.assunto ?? ''); }, [ticket]);

  const fechado = local.status === 'fechado' || local.status === 'cancelado';
  const mesclado = Boolean(local.mesclado_em);
  const bloqueado = fechado || mesclado;

  async function patch(p: Parameters<typeof api.atualizarTicket>[0]) {
    setErro('');
    try {
      const t = await api.atualizarTicket(p);
      setLocal(t);
      onAtualizado();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function buscarTags(q: string) {
    if (q.length < 1) { setSugTags([]); return; }
    try { setSugTags(await api.listarTags(q)); } catch { setSugTags([]); }
  }

  function addTag(tag: string) {
    const t = tag.trim().toLowerCase();
    if (!t || local.tags.includes(t)) return;
    void patch({ ticket_id: local.id, tags: [...local.tags, t] });
    setTagInput('');
    setSugTags([]);
  }

  function removeTag(tag: string) {
    void patch({ ticket_id: local.id, tags: local.tags.filter((x) => x !== tag) });
  }

  async function mudarTipo(tipoId: string) {
    const tipo = tipos.find((t) => t.id === tipoId);
    if (tipo && tipo.setor_padrao !== local.setor_id) {
      const ok = window.confirm(`Mover para o setor ${nomeSetor(tipo.setor_padrao)}?`);
      try {
        const t = await api.definirTipo(local.id, tipoId, ok);
        setLocal(t);
        onAtualizado();
      } catch (e) { setErro(mensagemErro(e)); }
    } else if (tipoId) {
      try {
        const t = await api.definirTipo(local.id, tipoId, false);
        setLocal(t);
        onAtualizado();
      } catch (e) { setErro(mensagemErro(e)); }
    }
  }

  const abrirHist = useCallback(async () => {
    setHistAberto(true);
    try { setHistorico(await api.historicoTicket(local.id)); } catch (e) { setErro(mensagemErro(e)); }
  }, [local.id]);

  const cor = corSla({ status: local.status, sla_atrasado: local.sla_atrasado, sla_proximo_vencimento: local.sla_proximo_vencimento, aberto_em: local.aberto_em });

  return (
    <section className="painel-ticket">
      <div className="rotulo-sec">TICKET</div>
      {erro && <p className="erro pequeno">{erro}</p>}
      <div className="campo-linha">
        <span className="lbl">Status</span>
        <select
          disabled={bloqueado}
          value={local.status}
          onChange={(e) => void patch({ ticket_id: local.id, status: e.target.value })}
        >
          {STATUS_EDITAVEIS.map((s) => <option key={s} value={s}>{STATUS_TICKET[s]}</option>)}
          {local.status === 'fechado' && <option value="fechado">Fechada</option>}
          {local.status === 'cancelado' && <option value="cancelado">Cancelada</option>}
          {local.status === 'novo' && <option value="novo">Nova</option>}
        </select>
      </div>
      <div className="campo-linha">
        <span className="lbl">Prioridade</span>
        <select
          disabled={bloqueado}
          value={local.prioridade}
          onChange={(e) => void patch({ ticket_id: local.id, prioridade: e.target.value })}
        >
          {Object.entries(PRIORIDADE_ROTULO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="campo-linha">
        <span className="lbl">Tipo</span>
        <select disabled={bloqueado} value={local.tipo_id ?? ''} onChange={(e) => void mudarTipo(e.target.value)}>
          <option value="">— nenhum —</option>
          {tipos.filter((t) => t.ativo && (!t.publico || t.publico === 'ambos' || !local.publico || t.publico === local.publico))
            .map((t) => <option key={t.id} value={t.id}>{t.codigo ? `${t.codigo} · ` : ''}{t.nome}</option>)}
        </select>
      </div>
      <div className="campo-linha col">
        <span className="lbl">Assunto</span>
        <input
          disabled={bloqueado}
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          onBlur={() => { if (assunto !== (local.assunto ?? '')) void patch({ ticket_id: local.id, assunto: assunto || null }); }}
        />
      </div>
      <div className="campo-linha col">
        <span className="lbl">Tags</span>
        <div className="tags-wrap">
          {local.tags.map((t) => (
            <span key={t} className="tag cinza tag-rem">
              {t}
              {!bloqueado && <button type="button" className="x-tag" onClick={() => removeTag(t)} aria-label={`Remover ${t}`}>×</button>}
            </span>
          ))}
        </div>
        {!bloqueado && (
          <TagAutocomplete
            value={tagInput}
            onChange={(v: string) => { setTagInput(v); void buscarTags(v); }}
            onAdd={addTag}
            sugestoes={sugTags}
          />
        )}
      </div>
      <DetalhesTicket ticket={local} bloqueado={bloqueado} onSalvo={(t) => { setLocal(t); onAtualizado(); }} />
      <div className={`sla-bloco sla-${cor}`}>
        <strong>SLA</strong>
        {cor === 'cinza' ? (
          <span className="pequeno muted">Encerrado</span>
        ) : local.sla_atrasado ? (
          <span className="pequeno">Atrasado · 1ª resp. {dataHora(local.sla_primeira_resposta_vence_em ?? null)} · Resolução {dataHora(local.sla_resolucao_vence_em ?? null)}</span>
        ) : (
          <span className="pequeno">
            Próximo vencimento: {restante(local.sla_proximo_vencimento ?? null)}
            {local.sla_primeira_resposta_vence_em && !local.primeira_resposta_em && ` · 1ª resp. ${restante(local.sla_primeira_resposta_vence_em)}`}
          </span>
        )}
      </div>
      {local.vinculos && local.vinculos.length > 0 && (
        <div className="vinculos">
          <span className="lbl">Vínculos</span>
          {local.vinculos.map((v) => (
            <div key={v.ticket_id} className="vinc-linha">
              <span className="tag cinza">{v.protocolo}</span>
              <span className="pequeno muted">{v.tipo}</span>
              {!bloqueado && (
                <button type="button" className="btn sm ghost" onClick={() => void api.desvincularTickets(local.id, v.ticket_id).then(onAtualizado)}>
                  Desvincular
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!bloqueado && (
        <div className="vinc-acoes">
          <input placeholder="Protocolo p/ vincular" value={vincProto} onChange={(e) => setVincProto(e.target.value)} />
          <button
            type="button"
            className="btn sm"
            disabled={!vincProto.trim()}
            onClick={async () => {
              try {
                const outros = await api.listarTickets({ busca: vincProto.trim() }, 'recentes', 5);
                const alvo = outros?.[0];
                if (alvo) await api.vincularTickets(local.id, alvo.ticket_id);
                setVincProto('');
                onAtualizado();
              } catch (e) { setErro(mensagemErro(e)); }
            }}
          >
            Vincular
          </button>
          <button type="button" className="btn sm laranja" onClick={() => setModalMesclar(true)}>Mesclar…</button>
        </div>
      )}
      {local.csat && (
        <p className="pequeno">CSAT: <strong>{local.csat.nota}/5</strong> {local.csat.comentario ? `— ${local.csat.comentario}` : ''}</p>
      )}
      {(local.status === 'resolvido' || local.status === 'fechado') && !local.csat && (
        <div className="csat-manual">
          <span className="lbl">Registrar CSAT</span>
          <div className="linha-csat">
            <select value={csatNota} onChange={(e) => setCsatNota(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button type="button" className="btn sm" onClick={() => void api.registrarCsat(local.id, csatNota).then(onAtualizado)}>Salvar</button>
          </div>
        </div>
      )}
      <button type="button" className="btn sm ghost largo" onClick={() => void abrirHist()}>Linha do tempo</button>
      {histAberto && (
        <Modal titulo={`Linha do tempo · ${local.protocolo}`} onFechar={() => setHistAberto(false)}>
          <LinhaTempo eventos={historico} />
        </Modal>
      )}
      {modalMesclar && (
        <Modal titulo="Mesclar tickets" onFechar={() => setModalMesclar(false)}>
          <p className="pequeno muted">A origem ({local.protocolo}) será fechada. As mensagens não mudam de conversa.</p>
          <label>Protocolo destino
            <input value={destinoMesclar} onChange={(e) => setDestinoMesclar(e.target.value)} />
          </label>
          <div className="linha-botoes">
            <button type="button" className="btn ghost" onClick={() => setModalMesclar(false)}>Cancelar</button>
            <button
              type="button"
              className="btn primario"
              onClick={async () => {
                const outros = await api.listarTickets({ busca: destinoMesclar.trim() }, 'recentes', 5);
                const alvo = outros?.[0];
                if (!alvo || !window.confirm(`Mesclar ${local.protocolo} em ${alvo.protocolo}?`)) return;
                await api.mesclarTickets(local.id, alvo.ticket_id);
                setModalMesclar(false);
                onAtualizado();
              }}
            >
              Confirmar mesclagem
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function TagAutocomplete({
  value, onChange, onAdd, sugestoes,
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: (t: string) => void;
  sugestoes: { tag: string; qtd: number }[];
}) {
  return (
    <div className="tag-ac">
      <input
        value={value}
        placeholder="Nova tag…"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(value); } }}
      />
      {sugestoes.length > 0 && (
        <ul className="sug-tags">
          {sugestoes.map((s) => (
            <li key={s.tag}>
              <button type="button" onClick={() => onAdd(s.tag)}>{s.tag} ({s.qtd})</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}