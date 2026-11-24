import { useEffect, useState } from 'react';
import { api, mensagemErro } from '../lib/api';
import type { MacroTicket, TicketCompleto } from '../lib/types';
import Modal from './Modal';

interface Props {
  ticket: TicketCompleto;
  onFechar: () => void;
  onAplicar: (texto: string, avisoAcoes: string | null) => void;
}

export default function MacrosModal({ ticket, onFechar, onAplicar }: Props) {
  const [lista, setLista] = useState<MacroTicket[]>([]);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLista(await api.listarMacros({ setor: ticket.setor_id, tipo_id: ticket.tipo_id ?? undefined }));
      } catch (e) {
        setErro(mensagemErro(e));
      } finally {
        setCarregando(false);
      }
    })();
  }, [ticket.setor_id, ticket.tipo_id]);

  const filtradas = lista.filter((m) => !busca || m.titulo.toLowerCase().includes(busca.toLowerCase()));

  async function escolher(m: MacroTicket) {
    try {
      const r = await api.aplicarMacro(m.id, ticket.id, true);
      let aviso: string | null = null;
      if (r.acoes_aplicadas && r.acoes) aviso = `Macro aplicou ações no ticket: ${JSON.stringify(r.acoes)}`;
      onAplicar(r.texto, aviso);
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return (
    <Modal titulo="Respostas prontas" onFechar={onFechar}>
      <input className="busca" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
      {erro && <p className="erro">{erro}</p>}
      {carregando && <p className="muted">Carregando…</p>}
      <ul className="lista-macros">
        {filtradas.map((m) => (
          <li key={m.id}>
            <button type="button" className="macro-btn" onClick={() => void escolher(m)}>
              <strong>{m.titulo}</strong>
              <span className="pequeno muted trunc">{m.corpo.slice(0, 80)}…</span>
            </button>
          </li>
        ))}
        {!carregando && filtradas.length === 0 && <li className="muted">Nenhuma macro.</li>}
      </ul>
    </Modal>
  );
}