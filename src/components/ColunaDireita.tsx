import { useState } from 'react';
import type { CopilotoApi } from './Copiloto';
import Copiloto from './Copiloto';
import PainelCliente from './PainelCliente';
import PainelTicket from './PainelTicket';
import type { DetalheConversa, Perfil, Setor, TicketCompleto, TipoTicket } from '../lib/types';

interface Props {
  det: DetalheConversa;
  nome: string;
  tipos: TipoTicket[];
  setores: Setor[];
  perfil: Perfil;
  onTicketAtualizado: () => void;
  onTransferir: (setor: string, motivo: string) => void;
  onAplicarClassificacao: (tipoId: string | null, prioridade: string | null, setor: string | null) => void;
  onNotaInterna: (texto: string) => Promise<void>;
  copilotoRef: React.MutableRefObject<CopilotoApi>;
}

export default function ColunaDireita({
  det, nome, tipos, setores, perfil, onTicketAtualizado, onTransferir, onAplicarClassificacao, onNotaInterna, copilotoRef,
}: Props) {
  const [aba, setAba] = useState<'cliente' | 'copiloto'>('cliente');
  const ticket = det.ticket_atual as TicketCompleto | null;

  return (
    <aside className="painel coluna-dir">
      {ticket && (
        <PainelTicket ticket={ticket} tipos={tipos} setores={setores} perfil={perfil} onAtualizado={onTicketAtualizado} />
      )}
      <div className="abas-painel">
        <button type="button" className={aba === 'cliente' ? 'ativo' : ''} onClick={() => setAba('cliente')}>Cliente</button>
        <button type="button" className={aba === 'copiloto' ? 'ativo' : ''} onClick={() => setAba('copiloto')}>Copiloto</button>
      </div>
      {aba === 'cliente' ? (
        <PainelCliente det={det} nome={nome} embutido />
      ) : (
        <Copiloto
          ticket={ticket}
          conversaId={det.conversa.id}
          tipos={tipos}
          setores={setores}
          perfil={perfil}
          onTransferir={onTransferir}
          onAplicarClassificacao={onAplicarClassificacao}
          onNotaInterna={onNotaInterna}
          copilotoRef={copilotoRef}
        />
      )}
    </aside>
  );
}