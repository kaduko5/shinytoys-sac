import { useCallback, useEffect, useState } from 'react';
import { api, mensagemErro } from '../lib/api';
import type { FiltrosTicket, Indicadores } from '../lib/types';
import { brl } from '../lib/format';

const CARDS: { k: keyof Indicadores; r: string; cor?: string; card?: string }[] = [
  { k: 'abertas', r: 'Abertas', card: 'abertas' },
  { k: 'vencidas', r: 'Vencidas', cor: 'vermelho', card: 'vencidas' },
  { k: 'aguardando', r: 'Aguardando terceiro', cor: 'laranja', card: 'aguardando' },
  { k: 'hoje', r: 'Próxima ação hoje', card: 'hoje' },
  { k: 'sem_prazo', r: 'Sem prazo ou responsável', cor: 'vermelho', card: 'sem_prazo' },
  { k: 'resolvidas_mes', r: 'Resolvidas no mês', cor: 'verde', card: 'resolvidas_mes' },
];

const kBRL = (n: number) => (n >= 1000 ? `R$ ${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(n));

/** Faixa de indicadores no topo da Inbox. Clicar filtra a lista; clicar de novo limpa. */
export default function Cards({ card, onCard, versao }: {
  card: string | null; onCard: (c: string | null) => void; versao: number; filtros?: () => FiltrosTicket;
}) {
  const [ind, setInd] = useState<Indicadores | null>(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try { setInd(await api.indicadores()); setErro(''); } catch (e) { setErro(mensagemErro(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar, versao]);
  useEffect(() => { const t = setInterval(carregar, 60000); return () => clearInterval(t); }, [carregar]);

  return (
    <div className="cards-faixa">
      {CARDS.map((c) => (
        <button key={c.k} type="button" className={`card-ind ${card === c.card ? 'on' : ''} ${c.cor ?? ''}`}
          onClick={() => onCard(card === c.card ? null : c.card!)} title={card === c.card ? 'Clique para limpar o filtro' : 'Filtrar a lista'}>
          <b>{ind ? Number(ind[c.k] ?? 0) : '–'}</b><span>{c.r}</span>
        </button>
      ))}
      <div className="card-ind fixo">
        <b>{ind?.tempo_medio_dias != null ? String(ind.tempo_medio_dias).replace('.', ',') : '–'}<small> dias</small></b>
        <span>Tempo médio de solução · 90d</span>
      </div>
      <div className="card-ind fixo vermelho">
        <b>{ind ? kBRL(Number(ind.prejuizo_aberto)) : '–'}</b>
        <span>Prejuízo em aberto · {ind ? kBRL(Number(ind.prejuizo_ano)) : '–'} no ano</span>
      </div>
      <div className="cards-acoes">
        {card && <button type="button" className="btn sm ghost" onClick={() => onCard(null)}>Limpar filtro</button>}
        {erro && <small className="erro">{erro}</small>}
      </div>
    </div>
  );
}
