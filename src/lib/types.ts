export type Papel = 'admin' | 'supervisor' | 'atendente';

export interface Perfil {
  id: string;
  nome: string | null;
  email: string | null;
  setores: string[];
  papel: Papel;
  ativo: boolean;
  created_at?: string;
}

export interface Setor { id: string; nome: string }

export interface ConversaItem {
  conversa_id: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  wa_id: string | null;
  nome_perfil: string | null;
  canal: string | null;
  ticket_id: string | null;
  protocolo: string | null;
  ticket_status: string | null;
  setor_id: string | null;
  atribuido_a: string | null;
  atribuido_nome: string | null;
  aberto_em: string | null;
  ultima_mensagem_em: string | null;
  ultima_previa: string | null;
  ultima_entrada_em: string | null;
  nao_lidas: number;
  janela_aberta: boolean;
  janela_expira_em: string | null;
}

export interface Mensagem {
  id: string;
  conversa_id: string;
  ticket_id: string | null;
  protocolo?: string | null;
  canal?: string | null;
  direcao: 'entrada' | 'saida' | 'sistema';
  tipo: string;
  corpo_texto: string | null;
  status: string | null;
  enviado_em: string;
  atendente_id: string | null;
  atendente_nome?: string | null;
  enviado_por?: string | null;
}

export interface TicketResumo {
  id: string;
  protocolo: string;
  status: string;
  setor_id: string;
  aberto_em: string;
  fechado_em: string | null;
  solucao: string | null;
}

export interface Contato {
  id: string;
  tipo: string;
  valor: string;
  nome_perfil: string | null;
  rotulo: string | null;
  principal: boolean;
}

export interface DetalheConversa {
  conversa: { id: string; cliente_id: string; canal_origem: string; assunto: string | null; ultima_entrada_em: string | null; ticket_atual_id: string | null };
  cliente: { id: string; razao_social: string | null; nome_fantasia: string | null; cnpj: string | null; observacoes: string | null } | null;
  contatos: Contato[];
  ticket_atual: (TicketResumo & { atribuido_a: string | null; atribuido_nome: string | null; reaberturas?: number; primeira_resposta_em?: string | null }) | null;
  tickets: TicketResumo[];
  janela_aberta: boolean;
  janela_expira_em: string | null;
}

export interface Atendente {
  id: string;
  nome: string | null;
  email: string | null;
  setores: string[];
  papel: Papel;
  ativo: boolean;
}
