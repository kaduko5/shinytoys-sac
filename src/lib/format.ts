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

export const iniciais = (n: string | null | undefined) =>
  (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export const STATUS_TICKET: Record<string, string> = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  aguardando_cliente: 'Aguardando cliente',
  fechado: 'Fechado',
};

export const NOME_SETOR: Record<string, string> = {
  sac: 'SAC', financeiro: 'Financeiro', comercial: 'Comercial', logistica: 'Logística',
};
export const nomeSetor = (id: string | null | undefined) => (id ? NOME_SETOR[id] ?? id : '—');
