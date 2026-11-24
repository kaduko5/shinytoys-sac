import { useCallback, useEffect, useState } from 'react';
import { api, ia, mensagemErro } from '../lib/api';
import type { IaResposta, IaSugestaoHist, Perfil, Setor, TicketCompleto, TipoTicket } from '../lib/types';
import { dataHora, nomeSetor, PRIORIDADE_ROTULO } from '../lib/format';

export interface CopilotoApi {
  preencherComposer: (texto: string, sugestaoId: string | null) => void;
  sugestaoAtiva: string | null;
}

interface Props {
  ticket: TicketCompleto | null;
  conversaId: string;
  tipos: TipoTicket[];
  setores: Setor[];
  perfil: Perfil;
  onTransferir: (setor: string, motivo: string) => void;
  onAplicarClassificacao: (tipoId: string | null, prioridade: string | null, setor: string | null) => void;
  onNotaInterna: (texto: string) => Promise<void>;
  copilotoRef: React.MutableRefObject<CopilotoApi>;
}

type Modo = null | 'sugerir_resposta' | 'resumir_ticket' | 'classificar';

export default function Copiloto({
  ticket, conversaId, tipos, setores, onTransferir, onAplicarClassificacao, onNotaInterna, copilotoRef,
}: Props) {
  const [instrucao, setInstrucao] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [resp, setResp] = useState<IaResposta | null>(null);
  const [modo, setModo] = useState<Modo>(null);
  const [descMotivo, setDescMotivo] = useState('');
  const [hist, setHist] = useState<IaSugestaoHist[]>([]);
  const [histAberto, setHistAberto] = useState(false);
  const [fontesAberto, setFontesAberto] = useState(false);

  const inativo = !ticket || ticket.status === 'fechado' || ticket.status === 'resolvido';

  useEffect(() => {
    setResp(null);
    setModo(null);
    setErro('');
    setInstrucao('');
  }, [conversaId]);

  const rodar = useCallback(async (acao: Modo) => {
    if (!ticket || !acao) return;
    setCarregando(true);
    setErro('');
    setModo(acao);
    try {
      const r = await ia(acao, ticket.id, instrucao.trim() || undefined);
      setResp(r);
    } catch (e) {
      setErro(mensagemErro(e));
      setResp(null);
    } finally {
      setCarregando(false);
    }
  }, [instrucao, ticket]);

  const carregarHist = useCallback(async () => {
    if (!ticket) return;
    try { setHist(await api.iaHistorico(ticket.id)); } catch { setHist([]); }
  }, [ticket]);

  useEffect(() => {
    if (histAberto) void carregarHist();
  }, [histAberto, carregarHist]);

  if (!ticket) {
    return <div className="copiloto"><p className="muted pad">Sem ticket ativo.</p></div>;
  }

  if (inativo) {
    return <div className="copiloto"><p className="muted pad">Ticket encerrado — Copiloto desabilitado.</p></div>;
  }

  const tipoNome = resp?.tipo ? tipos.find((t) => t.id === resp.tipo)?.nome ?? resp.tipo : '—';

  return (
    <div className="copiloto">
      <div className="cop-botoes">
        <button type="button" className="btn sm primario" disabled={carregando} aria-label="Sugerir resposta" onClick={() => void rodar('sugerir_resposta' as const)}>
          Sugerir resposta
        </button>
        <button type="button" className="btn sm" disabled={carregando} aria-label="Resumir ticket" onClick={() => void rodar('resumir_ticket')}>
          Resumir
        </button>
        <button type="button" className="btn sm" disabled={carregando} aria-label="Classificar ticket" onClick={() => void rodar('classificar')}>
          Classificar
        </button>
      </div>
      <label className="instr-ia">
        Instrução para a IA (opcional)
        <input maxLength={300} value={instrucao} onChange={(e) => setInstrucao(e.target.value)} placeholder="Ex.: mais formal, mais curto" />
      </label>
      {carregando && <p className="muted pad">Pensando…</p>}
      {erro && <p className="erro pad">{erro}</p>}
      {resp?.mock && resp.aviso && <div className="faixa-mock">{resp.aviso || 'Modo teste: sem IA conectada'}</div>}
      {resp?.escalar?.deve && (
        <div
          className={`badge-escalar ${resp.escalar.para === 'carlos' ? 'vermelho' : 'azul'}`}
          role="status"
        >
          {resp.escalar.para === 'carlos'
            ? `⚠ Escalar para o Carlos — ${resp.escalar.motivo ?? ''}`
            : `Encaminhar para ${nomeSetor(resp.escalar.encaminhar_setor || resp.escalar.para)} — ${resp.escalar.motivo ?? ''}`}
          {resp.escalar.encaminhar_setor && resp.escalar.para !== 'carlos' && (
            <button
              type="button"
              className="btn sm"
              onClick={() => onTransferir(resp.escalar.encaminhar_setor!, resp.escalar.motivo ?? '')}
            >
              Transferir
            </button>
          )}
        </div>
      )}
      {resp?.vinculo_erp?.encontrado === false && (
        <p className="aviso-erp">Cliente sem vínculo com o ERP — confirme CNPJ ou nº do pedido</p>
      )}
      {resp?.vinculo_erp?.metodo === 'telefone_nf' && (
        <p className="aviso-erp">Vínculo pelo telefone (confirme o CNPJ)</p>
      )}
      {resp && resp.fontes?.length > 0 && (
        <details open={fontesAberto} onToggle={(e) => setFontesAberto((e.target as HTMLDetailsElement).open)}>
          <summary>Fontes usadas ({resp.fontes.length})</summary>
          <ul className="fontes-lista">
            {resp.fontes.map((f) => <li key={f.ref}>{f.rotulo}</li>)}
          </ul>
        </details>
      )}
      {resp && modo === 'sugerir_resposta' && resp.resposta !== undefined && (
        <div className="card-ia">
          <div className="card-ia-topo">
            <span className={`chip-conf conf-${resp.confianca ?? 'media'}`}>{resp.confianca ?? 'média'}</span>
          </div>
          <p className="quebra">{resp.resposta}</p>
          {resp.precisa_verificar && resp.precisa_verificar.length > 0 && (
            <>
              <strong className="pequeno">Antes de enviar, verifique:</strong>
              <ul>{resp.precisa_verificar.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
          <div className="linha-botoes">
            <button
              type="button"
              className="btn sm verde"
              aria-label="Usar no composer"
              onClick={() => {
                copilotoRef.current.preencherComposer(resp.resposta!, resp.sugestao_id);
              }}
            >
              Usar no composer
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => {
                const m = descMotivo;
                void api.iaFeedback(resp.sugestao_id, 'descartada', undefined, m || undefined).then(() => {
                  setResp(null);
                  setDescMotivo('');
                });
              }}
            >
              Descartar
            </button>
          </div>
          <input className="motivo-desc" placeholder="Por quê? (opcional ao descartar)" value={descMotivo} onChange={(e) => setDescMotivo(e.target.value)} />
        </div>
      )}
      {resp && modo === 'resumir_ticket' && resp.resumo !== undefined && (
        <div className="card-ia">
          <p className="quebra"><strong>{resp.resumo}</strong></p>
          {resp.pontos?.length ? <ul>{resp.pontos.map((p) => <li key={p}>{p}</li>)}</ul> : null}
          {resp.pendencias?.length ? <><strong className="pequeno">Pendências</strong><ul>{resp.pendencias.map((p) => <li key={p}>{p}</li>)}</ul></> : null}
          {resp.proximo_passo && <p className="pequeno">Próximo passo: {resp.proximo_passo}</p>}
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              const texto = [resp.resumo, ...(resp.pontos ?? []), resp.proximo_passo].filter(Boolean).join('\n');
              void onNotaInterna(texto);
            }}
          >
            Copiar como nota interna
          </button>
        </div>
      )}
      {resp && modo === 'classificar' && resp.setor !== undefined && (
        <div className="card-ia">
          <dl className="dados classif">
            <dt>Setor</dt><dd>{nomeSetor(resp.setor)}</dd>
            <dt>Tipo</dt><dd>{tipoNome}</dd>
            <dt>Prioridade</dt><dd>{PRIORIDADE_ROTULO[resp.prioridade ?? ''] ?? resp.prioridade}</dd>
            <dt>Sentimento</dt><dd>{resp.sentimento}</dd>
          </dl>
          <p className="pequeno muted">{resp.motivo}</p>
          <button
            type="button"
            className="btn sm primario"
            disabled={!resp.tipo_valido_no_catalogo && !resp.setor}
            title={!resp.tipo_valido_no_catalogo ? 'Tipo sugerido não está no catálogo' : undefined}
            onClick={() => {
              if (!window.confirm('Aplicar classificação sugerida pela IA?')) return;
              onAplicarClassificacao(
                resp.tipo_valido_no_catalogo ? resp.tipo ?? null : null,
                resp.prioridade ?? null,
                resp.setor ?? null,
              );
            }}
          >
            Aplicar sugestão
          </button>
        </div>
      )}
      <details className="hist-ia" open={histAberto} onToggle={(e) => setHistAberto((e.target as HTMLDetailsElement).open)}>
        <summary>Sugestões anteriores</summary>
        {hist.length === 0 ? <p className="muted pequeno">Nenhuma.</p> : (
          <ul className="hist-ia-lista">
            {hist.map((h) => (
              <li key={h.id}>
                <span>{h.acao}</span>
                <span className="tag cinza">{h.status}</span>
                <span className="pequeno muted">{h.solicitado_por_nome ?? '—'} · {dataHora(h.criado_em)}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}