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

export type StatusTicket = 'novo' | 'aberto' | 'pendente' | 'em_espera' | 'resolvido' | 'fechado';
export type PrioridadeTicket = 'baixa' | 'normal' | 'alta' | 'urgente';
export type CanalOrigem = 'whatsapp' | 'telefone' | 'email' | 'interno';

export interface CsatTicket {
  nota: number;
  comentario: string | null;
  canal: string | null;
  respondido_em: string | null;
}

export interface VinculoTicket {
  ticket_id: string;
  protocolo: string;
  status: string;
  tipo: 'relacionado' | 'mesclado';
  direcao: 'saida' | 'entrada';
}

export interface TicketCompleto {
  id: string;
  protocolo: string;
  conversa_id: string;
  cliente_id: string | null;
  setor_id: string;
  status: StatusTicket | string;
  status_rotulo?: string;
  prioridade: PrioridadeTicket | string;
  tipo_id: string | null;
  tipo_nome: string | null;
  tags: string[];
  assunto: string | null;
  canal_origem: CanalOrigem | string | null;
  origem?: string;
  aberto_por?: string | null;
  aberto_por_nome?: string | null;
  atribuido_a: string | null;
  atribuido_nome: string | null;
  atribuido_em?: string | null;
  aberto_em: string;
  primeira_resposta_em: string | null;
  resolvido_em?: string | null;
  fechado_em: string | null;
  fechado_por?: string | null;
  solucao: string | null;
  reaberto_em?: string | null;
  reaberturas?: number;
  mesclado_em?: string | null;
  updated_at?: string;
  sla_primeira_resposta_vence_em?: string | null;
  sla_resolucao_vence_em?: string | null;
  sla_atrasado?: boolean;
  sla_proximo_vencimento?: string | null;
  sla_primeira_resposta_cumprido?: boolean | null;
  sla_resolucao_cumprido?: boolean | null;
  csat?: CsatTicket | null;
  vinculos?: VinculoTicket[];
  // Fase A
  tipo_codigo?: string | null;
  publico?: 'lojista' | 'consumidor';
  categoria?: string | null;
  transportadora?: string | null;
  nf?: string | null;
  pedido?: string | null;
  vendedor?: string | null;
  seguidores?: string[];
  proxima_acao?: string | null;
  proxima_acao_em?: string | null;
  prazo?: string | null;
  descricao?: string | null;
  checklist?: ChecklistItem[];
  itens?: ItemTicket[];
  prejuizo?: number;
  campos?: Record<string, CampoEfetivo>;
  faltando_fechar?: string[];
  cancelado_motivo?: string | null;
}

export interface ChecklistItem { item: string; feito: boolean; por?: string; em?: string }
export type Divergencia = 'defeito' | 'avaria' | 'falta' | 'sobra' | 'troca' | 'preco' | 'outro';
export interface ItemTicket {
  id?: string;
  sku: string | null;
  produto: string | null;
  quantidade: number;
  divergencia: Divergencia;
  fabricante: string | null;
  valor_unit: number | null;
  obs: string | null;
}
export type EstadoCampo = 'oculto' | 'opcional' | 'obrigatorio';
export interface CampoEfetivo { rotulo: string; ordem: number; fixo: boolean; so_ao_fechar: boolean; estado: EstadoCampo }
export interface CampoPadrao { chave: string; rotulo: string; ordem: number; estado_padrao: EstadoCampo; so_ao_fechar: boolean; fixo: boolean }
export interface ClienteBusca {
  origem: 'sac' | 'portal';
  id: string;
  nome: string | null;
  fantasia: string | null;
  cnpj: string | null;
  codigo: string | null;
  vendedor: string | null;
  telefone: string | null;
  portal_chave: string | null;
}

export interface TicketResumo {
  id: string;
  protocolo: string;
  status: string;
  setor_id: string;
  aberto_em: string;
  fechado_em: string | null;
  solucao: string | null;
  assunto?: string | null;
  canal_origem?: string | null;
  tipo_nome?: string | null;
  prioridade?: string | null;
  atribuido_a?: string | null;
  atribuido_nome?: string | null;
  reaberturas?: number;
  primeira_resposta_em?: string | null;
}

export interface TicketLinha {
  ticket_id: string;
  protocolo: string;
  conversa_id: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  contato: string | null;
  canal_origem: string | null;
  assunto: string | null;
  status: string;
  prioridade: string | null;
  tipo_id: string | null;
  tipo_nome: string | null;
  tags: string[];
  setor_id: string | null;
  atribuido_a: string | null;
  atribuido_nome: string | null;
  aberto_em: string;
  atualizado_em: string | null;
  primeira_resposta_em: string | null;
  sla_primeira_resposta_vence_em: string | null;
  sla_resolucao_vence_em: string | null;
  sla_atrasado: boolean;
  sla_proximo_vencimento: string | null;
  ultima_mensagem_em: string | null;
  ultima_previa: string | null;
  nao_lidas: number;
  janela_aberta: boolean;
  eh_ticket_atual: boolean;
  total?: number;
}

export interface FiltrosTicket {
  status?: string | string[];
  setor?: string;
  prioridade?: string | string[];
  tipo_id?: string;
  tags?: string[];
  atribuido?: string;
  atrasado?: boolean;
  canal?: string;
  cliente_id?: string;
  aberto_de?: string;
  aberto_ate?: string;
  busca?: string;
  card?: string;
  publico?: string;
  categoria?: string;
}

export interface Indicadores {
  abertas: number; vencidas: number; aguardando: number; hoje: number; sem_prazo: number; resolvidas_mes: number;
  tempo_medio_dias: number | null; prejuizo_aberto: number; prejuizo_ano: number; atualizado_em: string;
}

export interface ViewItem {
  id: string;
  nome: string;
  filtros: FiltrosTicket;
  ordem: string | null;
  sistema: boolean;
  compartilhada: boolean;
  minha: boolean;
  contagem: number;
}

export interface TipoTicket {
  id: string;
  codigo?: string | null;
  publico?: 'lojista' | 'consumidor' | 'ambos';
  categoria?: string | null;
  prioridade_padrao?: string;
  proxima_acao?: string | null;
  checklist?: string[];
  campos?: Record<string, EstadoCampo>;
  nome: string;
  descricao: string | null;
  setor_padrao: string;
  sla_primeira_resposta_h: number;
  sla_resolucao_h: number;
  ordem: number;
  ativo: boolean;
  editavel: boolean;
}

export interface MacroTicket {
  id: string;
  titulo: string;
  corpo: string;
  setor_id: string | null;
  tipo_id: string | null;
  tipo_nome: string | null;
  acoes: Record<string, unknown> | null;
  ordem: number;
  ativo: boolean;
}

export interface TagItem {
  tag: string;
  qtd: number;
}

export interface HistoricoEvento {
  id: string;
  evento: string;
  de: unknown;
  para: unknown;
  autor_id: string | null;
  autor_nome: string | null;
  criado_em: string;
}

export interface AbrirTicketResult {
  ok: boolean;
  ticket_id: string;
  protocolo: string;
  conversa_id: string;
  cliente_id: string;
  setor_id: string;
}

export interface AplicarMacroResult {
  texto: string;
  acoes_aplicadas: boolean;
  acoes: Record<string, unknown> | null;
}

/** @deprecated use TicketLinha — kept for transitional listarConversas */
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
  prioridade?: string | null;
  tipo_id?: string | null;
  tipo_nome?: string | null;
  tags?: string[];
  assunto?: string | null;
  sla_atrasado?: boolean;
  sla_proximo_vencimento?: string | null;
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
  midia_status?: 'pendente' | 'ok' | 'erro' | 'grande' | 'expirada' | null;
  midia_mime?: string | null;
  midia_nome?: string | null;
  midia_tamanho?: number | null;
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
  ticket_atual: TicketCompleto | null;
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

/* IA Copiloto */
export interface IaEscalar {
  deve: boolean;
  para: string | null;
  encaminhar_setor: string | null;
  motivo: string | null;
  gatilhos?: string[];
}

export interface IaFonte {
  ref: string;
  rotulo: string;
}

export interface IaVinculoErp {
  encontrado: boolean;
  metodo: string | null;
  cliente_grande?: boolean;
}

export interface IaAcao {
  sugerir_resposta?: { resposta: string; precisa_verificar: string[]; confianca: 'alta' | 'media' | 'baixa' };
  resumir_ticket?: { resumo: string; pontos: string[]; pendencias: string[]; proximo_passo: string };
  classificar?: {
    setor: string;
    tipo: string;
    tipo_valido_no_catalogo: boolean;
    prioridade: PrioridadeTicket;
    sentimento: string;
    motivo: string;
    catalogo_tipos: string;
  };
}

export interface IaResposta {
  ok: boolean;
  sugestao_id: string;
  acao: 'sugerir_resposta' | 'resumir_ticket' | 'classificar';
  mock: boolean;
  aviso: string | null;
  modelo?: string;
  escalar: IaEscalar;
  fontes: IaFonte[];
  vinculo_erp: IaVinculoErp;
  uso?: Record<string, number>;
  resposta?: string;
  precisa_verificar?: string[];
  confianca?: 'alta' | 'media' | 'baixa';
  resumo?: string;
  pontos?: string[];
  pendencias?: string[];
  proximo_passo?: string;
  setor?: string;
  tipo?: string;
  tipo_valido_no_catalogo?: boolean;
  prioridade?: string;
  sentimento?: string;
  motivo?: string;
  catalogo_tipos?: string;
}

export interface IaSugestaoHist {
  id: string;
  acao: string;
  status: string;
  solicitado_por_nome?: string | null;
  criado_em: string;
}