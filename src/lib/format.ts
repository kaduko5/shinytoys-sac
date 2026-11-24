const TZ = 'America/Sao_Paulo';

const dia = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: TZ });

export function horaLista(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86400000);
  if (dia(d) === dia(hoje)) return d.toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  if (dia(d) === dia(ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
}

export const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

export const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export function separadorDia(iso: string): string {
  const d = new Date(iso);
  const s = d.toLocaleDateString('pt-BR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
  if (dia(d) === dia(new Date())) return `Hoje, ${d.toLocaleDateString('pt-BR', { timeZone: TZ, day: 'numeric', month: 'long' })}`;
  return s;
}

export const chaveDia = (iso: string) => dia(new Date(iso));

export function telefone(wa: string | null | undefined): string {
  if (!wa) return '';
  const m = wa.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${wa}`;
}

export function restante(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '0min';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m}min`;
}

export function atrasoDesde(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms <= 0) return 'agora';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}d`;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

export const iniciais = (n: string | null | undefined) =>
  (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export const STATUS_TICKET: Record<string, string> = {
  novo: 'Novo',
  aberto: 'Aberto',
  pendente: 'Pendente',
  em_espera: 'Em espera',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

export const STATUS_EDITAVEIS = ['aberto', 'pendente', 'em_espera', 'resolvido'] as const;

export const PRIORIDADE_ROTULO: Record<string, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const CANAL_ROTULO: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telefone: 'Telefone',
  email: 'E-mail',
  interno: 'Interno',
};

export const NOME_SETOR: Record<string, string> = {
  sac: 'SAC', financeiro: 'Financeiro', comercial: 'Comercial', logistica: 'Logística',
};
export const nomeSetor = (id: string | null | undefined) => (id ? NOME_SETOR[id] ?? id : '—');

/** vermelho | amarelo | verde | cinza */
export function corSla(ticket: {
  status: string;
  sla_atrasado?: boolean;
  sla_proximo_vencimento?: string | null;
  aberto_em?: string;
}): 'vermelho' | 'amarelo' | 'verde' | 'cinza' {
  if (ticket.status === 'resolvido' || ticket.status === 'fechado') return 'cinza';
  if (ticket.sla_atrasado) return 'vermelho';
  const alvo = ticket.sla_proximo_vencimento;
  if (!alvo || !ticket.aberto_em) return 'verde';
  const total = new Date(alvo).getTime() - new Date(ticket.aberto_em).getTime();
  const rest = new Date(alvo).getTime() - Date.now();
  if (total > 0 && rest / total < 0.25) return 'amarelo';
  return 'verde';
}

export const EVENTO_HIST: Record<string, string> = {
  criado: 'Criado',
  status: 'Status',
  setor: 'Setor',
  atribuicao: 'Atribuição',
  prioridade: 'Prioridade',
  tipo: 'Tipo',
  tags: 'Tags',
  assunto: 'Assunto',
  mesclado: 'Mesclado',
};