import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type {
  AbrirTicketResult,
  AplicarMacroResult,
  Atendente,
  ConversaItem,
  DetalheConversa,
  FiltrosTicket,
  HistoricoEvento,
  IaResposta,
  IaSugestaoHist,
  MacroTicket,
  Mensagem,
  Perfil,
  Setor,
  TagItem,
  TicketCompleto,
  TicketLinha,
  TipoTicket,
  ViewItem,
} from './types';

const ERROS: Record<string, string> = {
  acesso_negado: 'Você não tem permissão para isso.',
  ticket_fechado: 'O ticket está fechado. Reabra antes de continuar.',
  ticket_mesclado: 'Este ticket foi mesclado e não pode ser reaberto.',
  ticket_ja_fechado: 'Este ticket já está fechado.',
  ticket_nao_esta_fechado: 'Este ticket não está fechado.',
  ticket_antigo: 'Só dá para reabrir o ticket mais recente da conversa.',
  solucao_obrigatoria: 'Descreva a solução (mínimo 3 caracteres).',
  setor_invalido: 'Setor inválido.',
  atendente_invalido: 'Atendente inválido.',
  atendente_fora_do_setor: 'Esse atendente não pertence ao setor do ticket.',
  texto_obrigatorio: 'Escreva um texto.',
  texto_longo: 'Texto longo demais (máximo 4096 caracteres).',
  conversa_invalida: 'Conversa inválida.',
  precisa_template: 'Fora da janela de 24h: só é possível responder com template (ainda não disponível).',
  sem_contato: 'O cliente não tem contato de WhatsApp cadastrado.',
  canal_invalido: 'Canal inválido para envio.',
  graph_api: 'Falha no envio pela Meta (WhatsApp). Tente de novo em instantes.',
  nao_configurado: 'O envio ainda não está configurado no servidor.',
  tipo_nao_suportado: 'Tipo de arquivo não aceito pelo WhatsApp. Use foto (JPG/PNG), PDF, Excel, Word, áudio ou vídeo MP4.',
  arquivo_grande: 'Arquivo grande demais (foto até 5 MB; demais até 16 MB).',
  arquivo_obrigatorio: 'Escolha um arquivo.',
  legenda_longa: 'Legenda longa demais (máximo 1024 caracteres).',
  midia_expirada: 'Este arquivo não está mais disponível na Meta (mais de 30 dias).',
  midia_grande: 'Arquivo grande demais para guardar (acima de 25 MB).',
  midia_erro: 'Não foi possível baixar o arquivo. Tente de novo.',
  sessao_expirada: 'Sua sessão expirou. Entre de novo.',
  limite: 'Muitas chamadas seguidas. Aguarde um minuto.',
  ia_indisponivel: 'A IA não respondeu agora. Tente de novo.',
  acao_invalida: 'Ação inválida.',
  ticket_invalido: 'Ticket não encontrado.',
  sugestao_inexistente: 'Sugestão não encontrada.',
  canal_invalido_ticket: 'Canal inválido.',
  assunto_obrigatorio: 'Informe um assunto (mínimo 3 caracteres).',
  prioridade_invalida: 'Prioridade inválida.',
  tipo_invalido: 'Tipo de ticket inválido.',
  cliente_nao_encontrado: 'Cliente não encontrado.',
  telefone_invalido: 'Telefone inválido.',
  whatsapp_obrigatorio: 'Informe o WhatsApp do cliente.',
  email_obrigatorio: 'Informe o e-mail do cliente.',
  cliente_obrigatorio: 'Informe dados do cliente.',
  contato_de_outro_cliente: 'Este contato pertence a outro cliente.',
  ja_existe_ticket_aberto: 'Já existe um ticket aberto para este cliente.',
  status_invalido: 'Status inválido.',
};

export function mensagemErro(e: unknown): string {
  const raw = typeof e === 'string' ? e : (e as { message?: string })?.message ?? '';
  if (raw.includes('ja_existe_ticket_aberto')) {
    const m = raw.match(/SAC-\d{4}-\d+/);
    return m ? `Já existe ticket aberto: ${m[0]}` : ERROS.ja_existe_ticket_aberto;
  }
  for (const k of Object.keys(ERROS)) if (raw.startsWith(k) || raw.includes(k)) return ERROS[k];
  return raw ? `Erro: ${raw}` : 'Erro inesperado.';
}

export function protocoloDeErro(e: unknown): string | null {
  const raw = typeof e === 'string' ? e : (e as { message?: string })?.message ?? '';
  const m = raw.match(/SAC-\d{4}-\d+/);
  return m ? m[0] : null;
}

async function rpc<T>(nome: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nome, params ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export const api = {
  meuPerfil: () => rpc<Perfil | null>('sac_meu_perfil'),
  listarSetores: () => rpc<Setor[]>('sac_listar_setores'),
  listarAtendentes: (p_setor?: string | null) => rpc<Atendente[]>('sac_listar_atendentes', { p_setor: p_setor ?? null }),
  listarConversas: (p: { setor?: string | null; status?: string | null; busca?: string | null; atribuicao?: string | null; limite?: number }) =>
    rpc<ConversaItem[]>('sac_listar_conversas', {
      p_setor: p.setor ?? null,
      p_status: p.status ?? null,
      p_busca: p.busca || null,
      p_atribuicao: p.atribuicao ?? null,
      p_limite: p.limite ?? 100,
      p_offset: 0,
    }),
  listarTickets: (filtros: FiltrosTicket, ordem?: string, limite = 50, offset = 0) =>
    rpc<TicketLinha[]>('sac_listar_tickets', {
      p_filtros: filtros,
      p_ordem: ordem ?? 'recentes',
      p_limite: limite,
      p_offset: offset,
    }),
  listarViews: () => rpc<ViewItem[]>('sac_listar_views'),
  salvarView: (p: { id?: string | null; nome: string; filtros: FiltrosTicket; ordem?: string; compartilhada?: boolean; posicao?: number }) =>
    rpc<ViewItem>('sac_salvar_view', {
      p_id: p.id ?? null,
      p_nome: p.nome,
      p_filtros: p.filtros,
      p_ordem: p.ordem ?? 'recentes',
      p_compartilhada: p.compartilhada ?? false,
      p_posicao: p.posicao ?? null,
    }),
  excluirView: (id: string) => rpc('sac_excluir_view', { p_id: id }),
  detalhe: (id: string) => rpc<DetalheConversa>('sac_detalhe_conversa', { p_conversa_id: id }),
  detalheTicket: (id: string) => rpc<TicketCompleto>('sac_detalhe_ticket', { p_ticket_id: id }),
  mensagens: (id: string, antes?: string | null) =>
    rpc<Mensagem[]>('sac_mensagens_conversa', { p_conversa_id: id, p_antes: antes ?? null, p_limite: 100 }),
  atribuir: (ticket: string, atendente: string | null) => rpc('sac_atribuir', { p_ticket_id: ticket, p_atendente_id: atendente }),
  transferir: (ticket: string, setor: string, motivo: string) =>
    rpc('sac_transferir_setor', { p_ticket_id: ticket, p_setor_id: setor, p_motivo: motivo || null }),
  fechar: (ticket: string, solucao: string) => rpc('sac_fechar_ticket', { p_ticket_id: ticket, p_solucao: solucao }),
  reabrir: (ticket: string, motivo: string) => rpc('sac_reabrir_ticket', { p_ticket_id: ticket, p_motivo: motivo || null }),
  marcarLida: (id: string) => rpc('sac_marcar_lida', { p_conversa_id: id }),
  nota: (id: string, texto: string) => rpc('sac_adicionar_nota', { p_conversa_id: id, p_texto: texto }),
  salvarAtendente: (a: { id: string; nome?: string | null; setores?: string[]; papel?: string; ativo?: boolean }) =>
    rpc<Atendente>('sac_admin_salvar_atendente', {
      p_id: a.id, p_nome: a.nome ?? null, p_setores: a.setores ?? null, p_papel: a.papel ?? null, p_ativo: a.ativo ?? null,
    }),
  listarTipos: (incluirInativos?: boolean) => rpc<TipoTicket[]>('sac_listar_tipos', { p_incluir_inativos: incluirInativos ?? false }),
  adminSalvarTipo: (p: {
    id?: string | null; nome: string; setor_padrao: string;
    sla_primeira_resposta_h: number; sla_resolucao_h: number;
    descricao?: string; ordem?: number; ativo?: boolean;
  }) => rpc<TipoTicket>('sac_admin_salvar_tipo', {
    p_id: p.id ?? null,
    p_nome: p.nome,
    p_setor_padrao: p.setor_padrao,
    p_sla_primeira_resposta_h: p.sla_primeira_resposta_h,
    p_sla_resolucao_h: p.sla_resolucao_h,
    p_descricao: p.descricao ?? null,
    p_ordem: p.ordem ?? 100,
    p_ativo: p.ativo ?? true,
  }),
  definirTipo: (ticketId: string, tipoId: string, transferirSetor?: boolean) =>
    rpc<TicketCompleto>('sac_definir_tipo', { p_ticket_id: ticketId, p_tipo_id: tipoId, p_transferir_setor: transferirSetor ?? false }),
  abrirTicket: (p: Record<string, unknown>) => rpc<AbrirTicketResult>('sac_abrir_ticket', p),
  atualizarTicket: (p: {
    ticket_id: string; tipo_id?: string | null; prioridade?: string | null; status?: string | null;
    tags?: string[] | null; assunto?: string | null; limpar_tipo?: boolean;
  }) => rpc<TicketCompleto>('sac_atualizar_ticket', {
    p_ticket_id: p.ticket_id,
    p_tipo_id: p.tipo_id ?? null,
    p_prioridade: p.prioridade ?? null,
    p_status: p.status ?? null,
    p_tags: p.tags ?? null,
    p_assunto: p.assunto ?? null,
    p_limpar_tipo: p.limpar_tipo ?? false,
  }),
  listarTags: (busca?: string) => rpc<TagItem[]>('sac_listar_tags', { p_busca: busca ?? null }),
  listarMacros: (p?: { setor?: string; tipo_id?: string; incluir_inativas?: boolean }) =>
    rpc<MacroTicket[]>('sac_listar_macros', {
      p_setor: p?.setor ?? null,
      p_tipo_id: p?.tipo_id ?? null,
      p_incluir_inativas: p?.incluir_inativas ?? false,
    }),
  aplicarMacro: (macroId: string, ticketId: string, aplicarAcoes = true) =>
    rpc<AplicarMacroResult>('sac_aplicar_macro', {
      p_macro_id: macroId,
      p_ticket_id: ticketId,
      p_aplicar_acoes: aplicarAcoes,
    }),
  adminSalvarMacro: (p: {
    id?: string | null; titulo: string; corpo: string;
    setor_id?: string | null; tipo_id?: string | null;
    acoes?: Record<string, unknown> | null; ordem?: number; ativo?: boolean;
  }) => rpc<MacroTicket>('sac_admin_salvar_macro', {
    p_id: p.id ?? null,
    p_titulo: p.titulo,
    p_corpo: p.corpo,
    p_setor_id: p.setor_id ?? null,
    p_tipo_id: p.tipo_id ?? null,
    p_acoes: p.acoes ?? null,
    p_ordem: p.ordem ?? 100,
    p_ativo: p.ativo ?? true,
  }),
  historicoTicket: (ticketId: string) => rpc<HistoricoEvento[]>('sac_historico_ticket', { p_ticket_id: ticketId }),
  vincularTickets: (a: string, b: string) => rpc('sac_vincular_tickets', { p_ticket_id: a, p_outro_ticket_id: b }),
  desvincularTickets: (a: string, b: string) => rpc('sac_desvincular_tickets', { p_ticket_id: a, p_outro_ticket_id: b }),
  mesclarTickets: (origem: string, destino: string, motivo?: string) =>
    rpc('sac_mesclar_tickets', { p_origem_id: origem, p_destino_id: destino, p_motivo: motivo ?? null }),
  registrarCsat: (ticketId: string, nota: number, comentario?: string) =>
    rpc('sac_registrar_csat', { p_ticket_id: ticketId, p_nota: nota, p_comentario: comentario ?? null, p_canal: 'manual' }),
  iaFeedback: (sugestaoId: string, resultado: 'usada' | 'descartada', textoFinal?: string, motivo?: string) =>
    rpc('sac_ia_feedback', {
      p_sugestao_id: sugestaoId,
      p_resultado: resultado,
      p_texto_final: textoFinal ?? null,
      p_motivo: motivo ?? null,
    }),
  iaHistorico: (ticketId: string, limite = 20) =>
    rpc<IaSugestaoHist[]>('sac_ia_historico', { p_ticket_id: ticketId, p_limite: limite }),
};

export const DRY_RUN = import.meta.env.VITE_SAC_ENVIO_REAL !== 'true';

export async function enviar(conversa_id: string, texto: string): Promise<{ ok: boolean; dry_run?: boolean }> {
  const { data, error } = await supabase.functions.invoke('sac-enviar', {
    body: { conversa_id, texto, dry_run: DRY_RUN },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const status = error.context.status;
      if (status === 401) throw new Error('sessao_expirada');
      let corpo: { erro?: string; mensagem?: string } = {};
      try { corpo = await error.context.json(); } catch { /* sem corpo */ }
      throw new Error(corpo.erro || corpo.mensagem || `http_${status}`);
    }
    throw error;
  }
  return data;
}

export async function ia(
  acao: 'sugerir_resposta' | 'resumir_ticket' | 'classificar',
  ticketId: string,
  instrucao?: string,
): Promise<IaResposta> {
  const { data, error } = await supabase.functions.invoke('sac-ia', {
    body: { acao, ticket_id: ticketId, instrucao: instrucao || undefined },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const status = error.context.status;
      if (status === 401) throw new Error('sessao_expirada');
      if (status === 429) throw new Error('limite');
      let corpo: { erro?: string; mensagem?: string } = {};
      try { corpo = await error.context.json(); } catch { /* sem corpo */ }
      throw new Error(corpo.erro || corpo.mensagem || (status === 502 ? 'ia_indisponivel' : `http_${status}`));
    }
    throw error;
  }
  return data as IaResposta;
}
async function erroFuncao(error: unknown): Promise<never> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context.status;
    if (status === 401) throw new Error('sessao_expirada');
    let corpo: { erro?: string; mensagem?: string } = {};
    try { corpo = await error.context.json(); } catch { /* sem corpo */ }
    throw new Error(corpo.erro || corpo.mensagem || `http_${status}`);
  }
  throw error;
}

const cacheUrl = new Map<string, { url: string; ate: number }>();

/** Link temporário (1h) para ver/baixar o anexo de uma mensagem. */
export async function urlMidia(mensagem_id: string): Promise<{ url: string; mime: string | null; nome: string | null }> {
  const c = cacheUrl.get(mensagem_id);
  if (c && c.ate > Date.now()) return { url: c.url, mime: null, nome: null };
  const { data, error } = await supabase.functions.invoke('sac-midia', { body: { acao: 'url', mensagem_id } });
  if (error) await erroFuncao(error);
  cacheUrl.set(mensagem_id, { url: data.url, ate: Date.now() + 50 * 60 * 1000 });
  return data;
}

/** Envia um anexo pelo WhatsApp (respeita o modo teste). */
export async function enviarAnexo(conversa_id: string, arquivo: File, legenda: string): Promise<{ ok: boolean; dry_run?: boolean }> {
  const fd = new FormData();
  fd.append('acao', 'enviar');
  fd.append('conversa_id', conversa_id);
  fd.append('legenda', legenda);
  fd.append('dry_run', DRY_RUN ? 'true' : 'false');
  fd.append('arquivo', arquivo, arquivo.name);
  const { data, error } = await supabase.functions.invoke('sac-midia', { body: fd });
  if (error) await erroFuncao(error);
  return data;
}

export const ANEXO_ACEITOS = '.jpg,.jpeg,.png,.pdf,.txt,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.mp3,.m4a,.aac,.ogg,.amr,.mp4,.3gp,image/jpeg,image/png,application/pdf,audio/*,video/mp4';
