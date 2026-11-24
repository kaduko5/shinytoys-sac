import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api, DRY_RUN, enviar, mensagemErro } from '../lib/api';
import type { ConversaItem, DetalheConversa, Mensagem, Perfil, Setor } from '../lib/types';
import { chaveDia, hora, nomeSetor, restante, separadorDia, STATUS_TICKET, telefone } from '../lib/format';
import PainelCliente from './PainelCliente';
import Modal from './Modal';

interface Props {
  conversaId: string;
  item: ConversaItem | null;
  perfil: Perfil;
  setores: Setor[];
  versao: number;
  onMudou: () => void;
}

type Acao = null | 'transferir' | 'fechar' | 'reabrir';

export default function Conversa({ conversaId, perfil, setores, versao, onMudou }: Props) {
  const [det, setDet] = useState<DetalheConversa | null>(null);
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [texto, setTexto] = useState('');
  const [modoNota, setModoNota] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [acao, setAcao] = useState<Acao>(null);
  const [temMais, setTemMais] = useState(false);
  const [, tick] = useState(0);
  const fimRef = useRef<HTMLDivElement>(null);
  const rolarFim = useRef(true);

  const carregarDetalhe = useCallback(async () => {
    try { setDet(await api.detalhe(conversaId)); } catch (e) { setErro(mensagemErro(e)); }
  }, [conversaId]);

  // carga inicial + marcar lida
  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      try {
        const [d, m] = await Promise.all([api.detalhe(conversaId), api.mensagens(conversaId)]);
        if (!vivo) return;
        setDet(d); setMsgs(m ?? []); setTemMais((m ?? []).length >= 100);
        rolarFim.current = true;
        api.marcarLida(conversaId).then(onMudou).catch(() => {});
      } catch (e) {
        if (vivo) setErro(mensagemErro(e));
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversaId]);

  // ticket/conversa mudou (Realtime da lista) → atualiza cabeçalho e painel
  useEffect(() => { if (versao > 0) carregarDetalhe(); }, [versao, carregarDetalhe]);

  // Realtime das mensagens desta conversa
  useEffect(() => {
    const ch = supabase
      .channel(`sac-conversa-${conversaId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'sac', table: 'mensagens', filter: `conversa_id=eq.${conversaId}` }, () => {
        // recarrega via RPC para ter atendente_nome/protocolo
        api.mensagens(conversaId).then((m) => { rolarFim.current = true; setMsgs(m ?? []); }).catch(() => {});
        api.marcarLida(conversaId).catch(() => {});
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'sac', table: 'mensagens', filter: `conversa_id=eq.${conversaId}` }, (p) => {
        const n = p.new as Partial<Mensagem> & { id: string };
        setMsgs((lista) => lista.map((x) => (x.id === n.id ? { ...x, status: n.status ?? x.status } : x)));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversaId]);

  // contagem regressiva da janela
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (rolarFim.current) { fimRef.current?.scrollIntoView({ block: 'end' }); rolarFim.current = false; }
  }, [msgs]);

  async function carregarAnteriores() {
    if (!msgs.length) return;
    const antigas = await api.mensagens(conversaId, msgs[0].enviado_em);
    setTemMais((antigas ?? []).length >= 100);
    setMsgs((m) => [...(antigas ?? []).filter((a) => !m.some((x) => x.id === a.id)), ...m]);
  }

  async function executar(fn: () => Promise<unknown>, ok?: string) {
    setErro(''); setAviso('');
    try { await fn(); if (ok) setAviso(ok); await carregarDetalhe(); onMudou(); return true; }
    catch (e) { setErro(mensagemErro(e)); return false; }
  }

  const ticket = det?.ticket_atual ?? null;
  const fechado = ticket?.status === 'fechado';
  const janelaAberta = Boolean(det?.janela_aberta) && (!det?.janela_expira_em || new Date(det.janela_expira_em).getTime() > Date.now());
  const meu = ticket?.atribuido_a === perfil.id;
  const lider = perfil.papel === 'admin' || perfil.papel === 'supervisor';
  const contatoWa = det?.contatos.find((c) => c.tipo === 'whatsapp');
  const nome = det?.cliente?.razao_social || det?.cliente?.nome_fantasia || contatoWa?.nome_perfil || telefone(contatoWa?.valor) || 'Cliente';

  async function enviarResposta() {
    const t = texto.trim();
    if (!t) return;
    setEnviando(true); setErro(''); setAviso('');
    try {
      if (modoNota) {
        await api.nota(conversaId, t);
        setTexto('');
        const m = await api.mensagens(conversaId); rolarFim.current = true; setMsgs(m ?? []);
      } else {
        const r = await enviar(conversaId, t);
        if (r.dry_run) setAviso('Modo teste: checagem OK, nada foi enviado ao cliente.');
        else setTexto('');
        if (!r.dry_run) { const m = await api.mensagens(conversaId); rolarFim.current = true; setMsgs(m ?? []); }
      }
    } catch (e) {
      setErro(mensagemErro(e));
      if ((e as Error).message === 'precisa_template') carregarDetalhe();
      if ((e as Error).message === 'sessao_expirada') supabase.auth.signOut();
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) return <section className="conversa"><p className="muted pad">Carregando conversa…</p></section>;
  if (!det) return <section className="conversa"><p className="erro pad">{erro || 'Conversa não encontrada.'}</p></section>;

  let ultimoDia = '';

  return (
    <>
      <section className="conversa">
        <header className="conv-topo">
          <div className="conv-l1">
            <div>
              <h2>{nome}</h2>
              <div className="conv-sub">
                <span className="tag verde">WhatsApp</span>
                <span>{telefone(contatoWa?.valor)}</span>
              </div>
            </div>
            <div className="conv-protocolo">
              <small>Protocolo</small>
              <strong>{ticket?.protocolo ?? '—'}</strong>
              {ticket && <span className={`tag status-${ticket.status}`}>{STATUS_TICKET[ticket.status] ?? ticket.status}</span>}
            </div>
          </div>
          {ticket && (
            <div className="conv-acoes">
              <span className="atrib">
                Atribuída a: <b>{ticket.atribuido_nome || 'ninguém'}</b> ({nomeSetor(ticket.setor_id)})
              </span>
              {!fechado && !ticket.atribuido_a && (
                <button className="btn sm" onClick={() => executar(() => api.atribuir(ticket.id, perfil.id), 'Conversa assumida.')}>Assumir</button>
              )}
              {!fechado && ticket.atribuido_a && !meu && lider && (
                <button className="btn sm" onClick={() => executar(() => api.atribuir(ticket.id, perfil.id), 'Conversa assumida.')}>Assumir</button>
              )}
              {!fechado && ticket.atribuido_a && (meu || lider) && (
                <button className="btn sm ghost" onClick={() => executar(() => api.atribuir(ticket.id, null), 'Conversa liberada.')}>Soltar</button>
              )}
              {!fechado && <button className="btn sm laranja" onClick={() => setAcao('transferir')}>Transferir setor</button>}
              {!fechado && <button className="btn sm escuro" onClick={() => setAcao('fechar')}>Fechar</button>}
              {fechado && <button className="btn sm primario" onClick={() => setAcao('reabrir')}>Reabrir</button>}
            </div>
          )}
          <div className="faixa-info">Todos os atendentes respondem pelo mesmo número +55 11 97246-5529 · Sac ShinyToys</div>
        </header>

        <div className="fio">
          {temMais && <button className="btn sm ghost centro-x" onClick={carregarAnteriores}>Carregar mensagens anteriores</button>}
          {msgs.length === 0 && <p className="muted pad">Nenhuma mensagem ainda.</p>}
          {msgs.map((m) => {
            const d = chaveDia(m.enviado_em);
            const sep = d !== ultimoDia ? <div className="dia" key={`d-${m.id}`}><span>{separadorDia(m.enviado_em)}</span></div> : null;
            ultimoDia = d;
            if (m.tipo === 'evento' || m.direcao === 'sistema' && m.tipo !== 'nota_interna')
              return [sep, <div key={m.id} className="evento"><span>{m.corpo_texto} · {hora(m.enviado_em)}</span></div>];
            if (m.tipo === 'nota_interna')
              return [sep, (
                <div key={m.id} className="nota">
                  <div className="nota-cab">📝 Nota interna · {m.atendente_nome || m.enviado_por || 'atendente'} · {hora(m.enviado_em)}</div>
                  <div className="quebra">{m.corpo_texto}</div>
                </div>
              )];
            const saida = m.direcao === 'saida';
            return [sep, (
              <div key={m.id} className={`msg ${saida ? 'saida' : 'entrada'}`}>
                <div className="bolha quebra">
                  {m.tipo !== 'text' && <span className="tipo-midia">[{m.tipo}] </span>}
                  {m.corpo_texto}
                </div>
                <div className="meta">
                  <span className={saida ? 'tag escuro-claro' : 'tag verde'}>{saida ? 'Saiu por WhatsApp' : 'Entrou por WhatsApp'}</span>
                  {saida && (m.atendente_nome || m.enviado_por) && <span>{m.atendente_nome || m.enviado_por}</span>}
                  <span>{hora(m.enviado_em)}</span>
                  {saida && <StatusEnvio s={m.status} />}
                </div>
              </div>
            )];
          })}
          <div ref={fimRef} />
        </div>

        <footer className="compositor">
          {erro && <p className="erro">{erro}</p>}
          {aviso && <p className="ok">{aviso}</p>}
          {fechado ? (
            <div className="bloqueio">
              <span>Ticket fechado{ticket?.solucao ? ` · Solução: ${ticket.solucao}` : ''}.</span>
              <button className="btn sm primario" onClick={() => setAcao('reabrir')}>Reabrir</button>
            </div>
          ) : (
            <>
              <div className="compositor-topo">
                <div className="seg">
                  <button className={!modoNota ? 'ativo' : ''} onClick={() => setModoNota(false)}>Responder via WhatsApp</button>
                  <button className={modoNota ? 'ativo nota-on' : ''} onClick={() => setModoNota(true)}>Nota interna</button>
                </div>
                {!modoNota && (janelaAberta ? (
                  <span className="janela ok-j">Janela de 24h: faltam {restante(det.janela_expira_em)}</span>
                ) : (
                  <span className="janela fora">Fora da janela de 24h · precisa template</span>
                ))}
              </div>
              {!modoNota && !janelaAberta ? (
                <div className="bloqueio">
                  <span>O cliente não escreve há mais de 24h. O WhatsApp só permite responder com <b>mensagem de template</b>, que ainda não está disponível nesta versão.</span>
                </div>
              ) : (
                <div className={`caixa ${modoNota ? 'caixa-nota' : ''}`}>
                  <textarea
                    placeholder={modoNota ? 'Nota interna (não vai para o cliente)…' : 'Escreva a resposta… ela sai pelo número compartilhado Sac ShinyToys'}
                    value={texto}
                    maxLength={4096}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarResposta(); }}
                  />
                  <div className="caixa-rodape">
                    <small className="muted">{modoNota ? 'Visível só para a equipe.' : DRY_RUN ? 'Modo teste: nada é enviado ao cliente.' : 'Ctrl+Enter para enviar.'}</small>
                    <button className={`btn ${modoNota ? 'amarelo' : 'verde'}`} disabled={enviando || !texto.trim()} onClick={enviarResposta}>
                      {enviando ? 'Enviando…' : modoNota ? 'Salvar nota' : DRY_RUN ? 'Testar envio' : 'Enviar'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </footer>
      </section>

      <PainelCliente det={det} nome={nome} />

      {acao === 'transferir' && ticket && (
        <ModalTransferir
          setores={setores.filter((s) => s.id !== ticket.setor_id)}
          onCancelar={() => setAcao(null)}
          onConfirmar={async (setor, motivo) => { if (await executar(() => api.transferir(ticket.id, setor, motivo), `Transferida para ${nomeSetor(setor)}.`)) setAcao(null); }}
        />
      )}
      {acao === 'fechar' && ticket && (
        <ModalTexto
          titulo={`Fechar ${ticket.protocolo}`}
          rotulo="Solução (obrigatória)"
          minimo={3}
          botao="Fechar ticket"
          onCancelar={() => setAcao(null)}
          onConfirmar={async (t) => { if (await executar(() => api.fechar(ticket.id, t), 'Ticket fechado.')) setAcao(null); }}
        />
      )}
      {acao === 'reabrir' && ticket && (
        <ModalTexto
          titulo={`Reabrir ${ticket.protocolo}`}
          rotulo="Motivo (opcional)"
          minimo={0}
          botao="Reabrir"
          onCancelar={() => setAcao(null)}
          onConfirmar={async (t) => { if (await executar(() => api.reabrir(ticket.id, t), 'Ticket reaberto.')) setAcao(null); }}
        />
      )}
    </>
  );
}

function StatusEnvio({ s }: { s: string | null }) {
  if (s === 'failed') return <span className="st falhou">✕ falhou</span>;
  if (s === 'read') return <span className="st lida" title="Lida">✓✓ lida</span>;
  if (s === 'delivered') return <span className="st" title="Entregue">✓✓</span>;
  if (s === 'sent') return <span className="st" title="Enviada">✓</span>;
  return <span className="st" title="Enviando">⏱</span>;
}

function ModalTransferir({ setores, onCancelar, onConfirmar }: { setores: Setor[]; onCancelar: () => void; onConfirmar: (s: string, m: string) => void }) {
  const [setor, setSetor] = useState(setores[0]?.id ?? '');
  const [motivo, setMotivo] = useState('');
  return (
    <Modal titulo="Transferir setor" onFechar={onCancelar}>
      <label>Para o setor
        <select value={setor} onChange={(e) => setSetor(e.target.value)}>
          {setores.map((s) => <option key={s.id} value={s.id}>{s.nome || nomeSetor(s.id)}</option>)}
        </select>
      </label>
      <label>Motivo
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente pediu 2ª via de boleto" />
      </label>
      <p className="muted pequeno">O ticket fica sem dono e volta para "Aberto" no setor escolhido.</p>
      <div className="linha-botoes">
        <button className="btn ghost" onClick={onCancelar}>Cancelar</button>
        <button className="btn primario" disabled={!setor} onClick={() => onConfirmar(setor, motivo)}>Transferir</button>
      </div>
    </Modal>
  );
}

function ModalTexto({ titulo, rotulo, minimo, botao, onCancelar, onConfirmar }: { titulo: string; rotulo: string; minimo: number; botao: string; onCancelar: () => void; onConfirmar: (t: string) => void }) {
  const [t, setT] = useState('');
  return (
    <Modal titulo={titulo} onFechar={onCancelar}>
      <label>{rotulo}
        <textarea autoFocus value={t} onChange={(e) => setT(e.target.value)} />
      </label>
      <div className="linha-botoes">
        <button className="btn ghost" onClick={onCancelar}>Cancelar</button>
        <button className="btn primario" disabled={t.trim().length < minimo} onClick={() => onConfirmar(t.trim())}>{botao}</button>
      </div>
    </Modal>
  );
}
