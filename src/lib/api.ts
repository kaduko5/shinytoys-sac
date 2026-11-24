import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Atendente, ConversaItem, DetalheConversa, Mensagem, Perfil, Setor } from './types';

const ERROS: Record<string, string> = {
  acesso_negado: 'Você não tem permissão para isso.',
  ticket_fechado: 'O ticket está fechado. Reabra antes de continuar.',
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
  sessao_expirada: 'Sua sessão expirou. Entre de novo.',
};

export function mensagemErro(e: unknown): string {
  const raw = typeof e === 'string' ? e : (e as { message?: string })?.message ?? '';
  for (const k of Object.keys(ERROS)) if (raw.startsWith(k) || raw.includes(k)) return ERROS[k];
  return raw ? `Erro: ${raw}` : 'Erro inesperado.';
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
  detalhe: (id: string) => rpc<DetalheConversa>('sac_detalhe_conversa', { p_conversa_id: id }),
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
};

// Modo teste: true = só confere, não envia ao cliente. Mude para false (VITE_SAC_ENVIO_REAL=true) quando for testar de verdade.
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
