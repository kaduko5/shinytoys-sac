import { useEffect, useState } from 'react';
import { api, mensagemErro } from '../lib/api';
import type { ClienteBusca } from '../lib/types';
import Modal from './Modal';

/** Busca cliente no SAC e na base do portal (nome, CNPJ, código ou telefone). */
export default function BuscaCliente({ onEscolher, onFechar }: { onEscolher: (c: ClienteBusca) => void; onFechar: () => void }) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState<ClienteBusca[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (q.trim().length < 2) { setLista([]); return; }
    const t = setTimeout(async () => {
      setCarregando(true); setErro('');
      try { setLista(await api.buscarClientes(q.trim())); } catch (e) { setErro(mensagemErro(e)); } finally { setCarregando(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <Modal titulo="Buscar cliente" onFechar={onFechar}>
      <input autoFocus placeholder="Nome, CNPJ, código ou telefone…" value={q} onChange={(e) => setQ(e.target.value)} />
      {erro && <p className="erro">{erro}</p>}
      {carregando && <p className="muted pequeno">Buscando…</p>}
      {!carregando && q.trim().length >= 2 && lista.length === 0 && <p className="muted pequeno">Nenhum cliente encontrado.</p>}
      <div className="busca-cli-lista">
        {lista.map((c) => (
          <button type="button" key={`${c.origem}-${c.id}`} className="busca-cli-item" onClick={() => onEscolher(c)}>
            <strong>{c.nome || c.fantasia || 'Sem nome'}</strong>
            <span className={`tag ${c.origem === 'portal' ? 'setor-comercial' : 'cinza'}`}>{c.origem === 'portal' ? 'Base do portal' : 'Já no SAC'}</span>
            <small className="muted">
              {[c.fantasia && c.fantasia !== c.nome ? c.fantasia : null, c.cnpj, c.codigo ? `cód. ${c.codigo}` : null, c.telefone, c.vendedor ? `vend.: ${c.vendedor}` : null]
                .filter(Boolean).join(' · ')}
            </small>
          </button>
        ))}
      </div>
    </Modal>
  );
}
