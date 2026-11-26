import { useEffect, useState } from 'react';
import { api, mensagemErro } from '../lib/api';
import type { CampoEfetivo, ClienteBusca, ItemTicket, TicketCompleto } from '../lib/types';
import { brl, DIVERGENCIA_ROTULO } from '../lib/format';
import BuscaCliente from './BuscaCliente';
import Modal from './Modal';

interface Props {
  ticket: TicketCompleto;
  bloqueado: boolean;
  onSalvo: (t: TicketCompleto) => void;
}

const ITEM_VAZIO: ItemTicket = { sku: '', produto: '', quantidade: 1, divergencia: 'defeito', fabricante: '', valor_unit: null, obs: '' };

/** Campos configuráveis do chamado + checklist + produtos/divergência + cancelar. */
export default function DetalhesTicket({ ticket, bloqueado, onSalvo }: Props) {
  const [erro, setErro] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [itens, setItens] = useState<ItemTicket[]>(ticket.itens ?? []);
  const [itensSujos, setItensSujos] = useState(false);
  const [colar, setColar] = useState<string | null>(null);
  const [buscaCli, setBuscaCli] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    setForm({
      categoria: ticket.categoria ?? '', prazo: ticket.prazo ?? '', transportadora: ticket.transportadora ?? '', nf: ticket.nf ?? '',
      pedido: ticket.pedido ?? '', vendedor: ticket.vendedor ?? '', seguidores: (ticket.seguidores ?? []).join(', '),
      proxima_acao: ticket.proxima_acao ?? '', proxima_acao_em: ticket.proxima_acao_em ?? '', descricao: ticket.descricao ?? '',
    });
    setItens(ticket.itens ?? []); setItensSujos(false);
  }, [ticket]);

  const campos = ticket.campos ?? {};
  const ve = (k: string) => Boolean(campos[k]) && campos[k].estado !== 'oculto';
  const ob = (k: string) => campos[k]?.estado === 'obrigatorio';
  const rot = (k: string, padrao: string) => `${campos[k]?.rotulo ?? padrao}${ob(k) ? ' *' : ''}`;

  async function salvar(dados: Record<string, unknown>) {
    setErro('');
    try { onSalvo(await api.salvarTicket(ticket.id, dados)); } catch (e) { setErro(mensagemErro(e)); }
  }
  function campoTexto(k: string, padrao: string, opts?: { tipo?: string; longo?: boolean; ph?: string }) {
    if (!ve(k)) return null;
    const original = k === 'seguidores' ? (ticket.seguidores ?? []).join(', ') : String((ticket as unknown as Record<string, unknown>)[k] ?? '');
    const onBlur = () => {
      const v = form[k] ?? '';
      if (v === original) return;
      void salvar({ [k]: k === 'seguidores' ? v.split(/[,;\s]+/).filter(Boolean) : v });
    };
    return (
      <label className="det-campo" key={k}>{rot(k, padrao)}
        {opts?.longo
          ? <textarea disabled={bloqueado} rows={3} value={form[k] ?? ''} placeholder={opts?.ph} onChange={(e) => setForm({ ...form, [k]: e.target.value })} onBlur={onBlur} />
          : <input disabled={bloqueado} type={opts?.tipo ?? 'text'} value={form[k] ?? ''} placeholder={opts?.ph} onChange={(e) => setForm({ ...form, [k]: e.target.value })} onBlur={onBlur} />}
      </label>
    );
  }

  async function escolherCliente(c: ClienteBusca) {
    setBuscaCli(false); setErro('');
    try {
      if (c.origem === 'portal') await api.vincularClientePortal(c.id, ticket.cliente_id);
      else await salvar({ cliente_id: c.id });
      onSalvo(await api.detalheTicket(ticket.id));
    } catch (e) { setErro(mensagemErro(e)); }
  }

  function colarLista(txt: string) {
    // aceita linhas "SKU<TAB ou ;>Produto<TAB ou ;>Qtd<TAB ou ;>Valor" (copiado do Excel) ou só "SKU Qtd"
    const novos: ItemTicket[] = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const p = l.split(/\t|;/).map((x) => x.trim());
      if (p.length === 1) { const m = l.match(/^(\S+)\s+(\d+(?:[.,]\d+)?)$/); if (m) return { ...ITEM_VAZIO, sku: m[1], quantidade: Number(m[2].replace(',', '.')) }; }
      const num = (s?: string) => (s ? Number(s.replace(/\./g, '').replace(',', '.')) : NaN);
      return { ...ITEM_VAZIO, sku: p[0] || '', produto: p[1] || '', quantidade: num(p[2]) > 0 ? num(p[2]) : 1, valor_unit: Number.isFinite(num(p[3])) ? num(p[3]) : null };
    });
    setItens([...itens, ...novos]); setItensSujos(true); setColar(null);
  }

  async function salvarItens() {
    setErro('');
    try { onSalvo(await api.salvarItens(ticket.id, itens)); setItensSujos(false); } catch (e) { setErro(mensagemErro(e)); }
  }
  const setItem = (i: number, k: keyof ItemTicket, v: unknown) => { const n = [...itens]; n[i] = { ...n[i], [k]: v }; setItens(n); setItensSujos(true); };
  const totalItens = itens.reduce((s, x) => s + (Number(x.quantidade) || 0) * (Number(x.valor_unit) || 0), 0);
  const falta = ticket.faltando_fechar ?? [];
  const checklist = ticket.checklist ?? [];
  const feitos = checklist.filter((c) => c.feito).length;

  return (
    <div className="detalhes-ticket">
      {erro && <p className="erro pequeno">{erro}</p>}
      {falta.length > 0 && !bloqueado && <p className="aviso-falta">Para fechar falta: <b>{falta.join(', ')}</b></p>}

      {ve('publico') && <div className="det-pub">
        {(['lojista', 'consumidor'] as const).map((p) => (
          <button key={p} type="button" disabled={bloqueado} className={ticket.publico === p ? 'ativo' : ''} onClick={() => ticket.publico !== p && void salvar({ publico: p })}>
            {p === 'lojista' ? 'Lojista (PJ)' : 'Consumidor final'}
          </button>
        ))}
      </div>}

      {ve('cliente') && (
        <div className="det-campo">
          <span>{rot('cliente', 'Cliente')}</span>
          <button type="button" className="btn sm ghost" disabled={bloqueado} onClick={() => setBuscaCli(true)}>Buscar / vincular cliente do portal</button>
        </div>
      )}
      <div className="det-grid">
        {campoTexto('prazo', 'Prazo', { tipo: 'date' })}
        {campoTexto('pedido', 'Pedido')}
        {campoTexto('nf', 'NF')}
        {campoTexto('transportadora', 'Transportadora / Armazém')}
        {campoTexto('vendedor', 'Vendedor')}
      </div>
      {ve('proxima_acao') && (
        <div className="det-grid">
          {campoTexto('proxima_acao', 'Próxima ação')}
          <label className="det-campo">Data
            <input disabled={bloqueado} type="date" value={form.proxima_acao_em ?? ''} onChange={(e) => { setForm({ ...form, proxima_acao_em: e.target.value }); void salvar({ proxima_acao_em: e.target.value }); }} />
          </label>
        </div>
      )}
      {campoTexto('seguidores', 'Seguidores (e-mails)', { ph: 'email1@…, email2@…' })}
      {campoTexto('descricao', 'Descrição', { longo: true })}

      {checklist.length > 0 && (
        <div className="det-bloco">
          <div className="det-tit">Checklist <small className="muted">{feitos}/{checklist.length}</small></div>
          {checklist.map((c, i) => (
            <label key={i} className="check det-check">
              <input type="checkbox" disabled={bloqueado} checked={c.feito}
                onChange={async (e) => { try { onSalvo(await api.marcarChecklist(ticket.id, i, e.target.checked)); } catch (er) { setErro(mensagemErro(er)); } }} />
              <span className={c.feito ? 'riscado' : ''}>{c.item}</span>
              {c.feito && c.por && <small className="muted"> · {c.por}</small>}
            </label>
          ))}
        </div>
      )}

      {ve('itens') && (
        <div className="det-bloco">
          <div className="det-tit">{rot('itens', 'Produtos e divergência')} {itens.length > 0 && <small className="muted">· prejuízo {brl(totalItens)}</small>}</div>
          {itens.length > 0 && (
            <div className="itens-tab">
              {itens.map((it, i) => (
                <div key={i} className="item-linha">
                  <input disabled={bloqueado} placeholder="SKU" value={it.sku ?? ''} onChange={(e) => setItem(i, 'sku', e.target.value)} />
                  <input disabled={bloqueado} placeholder="Produto" value={it.produto ?? ''} onChange={(e) => setItem(i, 'produto', e.target.value)} />
                  <input disabled={bloqueado} type="number" min={1} placeholder="Qtd" value={it.quantidade} onChange={(e) => setItem(i, 'quantidade', Number(e.target.value))} />
                  <select disabled={bloqueado} value={it.divergencia} onChange={(e) => setItem(i, 'divergencia', e.target.value)}>
                    {Object.entries(DIVERGENCIA_ROTULO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input disabled={bloqueado} placeholder="Fabricante" value={it.fabricante ?? ''} onChange={(e) => setItem(i, 'fabricante', e.target.value)} />
                  <input disabled={bloqueado} type="number" step="0.01" placeholder="R$ unit." value={it.valor_unit ?? ''} onChange={(e) => setItem(i, 'valor_unit', e.target.value === '' ? null : Number(e.target.value))} />
                  {!bloqueado && <button type="button" className="x-tag" onClick={() => { setItens(itens.filter((_, j) => j !== i)); setItensSujos(true); }} aria-label="Remover">×</button>}
                </div>
              ))}
            </div>
          )}
          {!bloqueado && (
            <div className="linha-botoes esq">
              <button type="button" className="btn sm ghost" onClick={() => { setItens([...itens, { ...ITEM_VAZIO }]); setItensSujos(true); }}>+ Adicionar item</button>
              <button type="button" className="btn sm ghost" onClick={() => setColar('')}>Colar lista</button>
              {itensSujos && <button type="button" className="btn sm primario" onClick={() => void salvarItens()}>Salvar itens</button>}
            </div>
          )}
        </div>
      )}

      {!bloqueado && <button type="button" className="btn sm ghost largo vermelho-txt" onClick={() => setCancelar(true)}>Cancelar chamado…</button>}
      {ticket.status === 'cancelado' && ticket.cancelado_motivo && <p className="pequeno muted">Cancelado: {ticket.cancelado_motivo}</p>}

      {buscaCli && <BuscaCliente onFechar={() => setBuscaCli(false)} onEscolher={(c) => void escolherCliente(c)} />}
      {colar !== null && (
        <Modal titulo="Colar lista de produtos" onFechar={() => setColar(null)}>
          <p className="pequeno muted">Cole do Excel: uma linha por item, colunas <b>SKU · Produto · Qtd · Valor unit.</b> (ou só "SKU Qtd").</p>
          <textarea rows={8} autoFocus value={colar} onChange={(e) => setColar(e.target.value)} />
          <div className="linha-botoes">
            <button type="button" className="btn ghost" onClick={() => setColar(null)}>Cancelar</button>
            <button type="button" className="btn primario" disabled={!colar.trim()} onClick={() => colarLista(colar)}>Adicionar</button>
          </div>
        </Modal>
      )}
      {cancelar && (
        <Modal titulo={`Cancelar ${ticket.protocolo}`} onFechar={() => setCancelar(false)}>
          <label>Motivo *<textarea autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>
          <div className="linha-botoes">
            <button type="button" className="btn ghost" onClick={() => setCancelar(false)}>Voltar</button>
            <button type="button" className="btn primario" disabled={motivo.trim().length < 3}
              onClick={async () => {
                try { await api.cancelarTicket(ticket.id, motivo.trim()); setCancelar(false); onSalvo(await api.detalheTicket(ticket.id)); }
                catch (e) { setErro(mensagemErro(e)); setCancelar(false); }
              }}>Cancelar chamado</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export type { CampoEfetivo };
