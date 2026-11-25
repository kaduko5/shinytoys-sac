// Assistente automático do WhatsApp (roda no whatsapp-webhook, depois de gravar a mensagem do cliente).
// Fluxo por chamado novo: boas-vindas + setor → tipo de ocorrência → e-mail → mensagem final com protocolo.
// Para assim que um atendente responde. Modo: desligado | teste (só números da lista) | ligado.
import type postgres from "npm:postgres@3.4.5";
import { GRAPH, tokenWhatsApp } from "./midia.ts";

type Sql = ReturnType<typeof postgres>;
type Setor = { id: string; rotulo: string; descricao?: string };

const corta = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const foneChave = (s: string) => {
  let d = (s || "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(d)) d = d.slice(2);
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : "";
};
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

async function config(sql: Sql): Promise<Record<string, string>> {
  const rows = await sql`select chave, valor from sac.config where chave like 'bot\_%' or chave = 'whatsapp_phone_number_id'`;
  const c: Record<string, string> = {};
  for (const r of rows) c[r.chave] = r.valor;
  return c;
}

interface Ctx {
  ticket_id: string; protocolo: string; bot_etapa: string | null; bot_tentativas: number; status: string;
  setor_id: string; cliente_id: string; conversa_id: string; wa: string;
}

async function enviar(sql: Sql, cfg: Record<string, string>, ctx: Ctx, corpo: Record<string, unknown>, registro: string) {
  const token = await tokenWhatsApp(sql);
  if (!token || !cfg.whatsapp_phone_number_id) { console.error("bot: envio não configurado"); return; }
  const r = await fetch(`${GRAPH}/${cfg.whatsapp_phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: ctx.wa, ...corpo }),
  });
  const g = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("bot: graph erro", r.status, g?.error?.code); return; }
  const wamid = g?.messages?.[0]?.id ?? null;
  await sql`insert into sac.mensagens (conversa_id, ticket_id, canal, direcao, tipo, corpo_texto, wa_message_id, status, status_em, enviado_por, payload)
            values (${ctx.conversa_id}::uuid, ${ctx.ticket_id}::uuid, 'whatsapp', 'saida', 'text', ${registro}, ${wamid}, 'sent', now(), 'Assistente virtual', ${sql.json({ bot: true, graph: g })})`;
  await sql`update sac.conversas set last_message_at = now(), ultima_previa = left(${registro}, 140) where id = ${ctx.conversa_id}::uuid`;
}
const texto = (body: string) => ({ type: "text", text: { preview_url: false, body } });
const lista = (body: string, botao: string, rows: { id: string; title: string; description?: string }[]) => ({
  type: "interactive",
  interactive: { type: "list", body: { text: corta(body, 1024) }, action: { button: corta(botao, 20), sections: [{ title: "Opções", rows: rows.slice(0, 10).map((r) => ({ id: r.id, title: corta(r.title, 24), ...(r.description ? { description: corta(r.description, 72) } : {}) })) }] } },
});
const botoes = (body: string, bs: { id: string; title: string }[]) => ({
  type: "interactive",
  interactive: { type: "button", body: { text: corta(body, 1024) }, action: { buttons: bs.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: corta(b.title, 20) } })) } },
});
const listaTexto = (body: string, opcoes: string[]) => `${body}\n\n${opcoes.map((o, i) => `${i + 1}. ${o}`).join("\n")}`;

async function etapa(sql: Sql, ctx: Ctx, nova: string, tentativas = 0) {
  await sql`update sac.tickets set bot_etapa = ${nova}, bot_tentativas = ${tentativas} where id = ${ctx.ticket_id}::uuid`;
}
async function evento(sql: Sql, ctx: Ctx, txt: string) {
  await sql`select sac._evento(${ctx.ticket_id}::uuid, null, ${"Assistente: " + txt})`;
}

async function perguntarSetor(sql: Sql, cfg: Record<string, string>, ctx: Ctx, setores: Setor[], prefixo = "") {
  const body = (prefixo ? prefixo + "\n\n" : "") + (cfg.bot_boas_vindas || "Para qual setor é o seu atendimento?");
  await enviar(sql, cfg, ctx, lista(body, "Escolher setor", setores.map((s) => ({ id: `setor:${s.id}`, title: s.rotulo, description: s.descricao }))),
    listaTexto(body, setores.map((s) => s.rotulo)));
}
async function tiposDoSetor(sql: Sql, setor: string) {
  return await sql`select id::text, codigo, nome from sac.tipos_ticket where ativo and codigo is not null and setor_padrao = ${setor} order by ordem, nome limit 9`;
}
async function perguntarTipo(sql: Sql, cfg: Record<string, string>, ctx: Ctx, tipos: { id: string; codigo: string; nome: string }[], prefixo = "") {
  const body = (prefixo ? prefixo + "\n\n" : "") + (cfg.bot_pergunta_tipo || "O seu caso é sobre algum destes assuntos?");
  const rows = [...tipos.map((t) => ({ id: `tipo:${t.id}`, title: t.nome, description: t.nome.length > 24 ? t.nome : undefined })), { id: "tipo:outro", title: "Outro assunto" }];
  await enviar(sql, cfg, ctx, lista(body, "Ver assuntos", rows), listaTexto(body, rows.map((r) => r.title)));
}
async function perguntarEmail(sql: Sql, cfg: Record<string, string>, ctx: Ctx, prefixo = "") {
  const [ex] = await sql`select valor from sac.contatos_cliente where cliente_id = ${ctx.cliente_id}::uuid and tipo = 'email' order by created_at desc limit 1`;
  const base = (prefixo ? prefixo + "\n\n" : "") + (cfg.bot_pergunta_email || "Qual é o seu e-mail?");
  if (ex?.valor) {
    const body = `${base}\n\nTemos no cadastro: ${ex.valor}\nSe estiver certo, toque em "Manter". Se não, digite o e-mail correto.`;
    await enviar(sql, cfg, ctx, botoes(body, [{ id: "email:manter", title: "Manter" }]), body);
  } else {
    await enviar(sql, cfg, ctx, texto(base), base);
  }
}
async function finalizar(sql: Sql, cfg: Record<string, string>, ctx: Ctx) {
  const body = (cfg.bot_final || "Obrigado! Seu protocolo é {protocolo}.").replaceAll("{protocolo}", ctx.protocolo);
  await enviar(sql, cfg, ctx, texto(body), body);
  await etapa(sql, ctx, "concluido");
}

// deno-lint-ignore no-explicit-any
export async function processarBot(sql: Sql, mensagemId: string, m: any, novoTicket: boolean): Promise<void> {
  const cfg = await config(sql);
  const modo = cfg.bot_modo || "desligado";
  if (modo === "desligado") return;

  const [ctx] = await sql<Ctx[]>`
    select t.id::text ticket_id, t.protocolo, t.bot_etapa, t.bot_tentativas, t.status, t.setor_id, t.cliente_id::text, msg.conversa_id::text, cc.valor wa
      from sac.mensagens msg join sac.tickets t on t.id = msg.ticket_id
      join sac.conversas cv on cv.id = msg.conversa_id join sac.contatos_cliente cc on cc.id = cv.contato_id
     where msg.id = ${mensagemId}::uuid`;
  if (!ctx || !ctx.wa) return;
  if (modo === "teste") {
    const lista = (cfg.bot_numeros_teste || "").split(/[,;\s]+/).map(foneChave).filter(Boolean);
    if (!lista.includes(foneChave(ctx.wa))) return;
  }
  if (["fechado", "cancelado", "resolvido"].includes(ctx.status) || ctx.bot_etapa === "concluido") return;

  // atendente já respondeu? então o assistente sai de cena
  const [humano] = await sql`select 1 from sac.mensagens where ticket_id = ${ctx.ticket_id}::uuid and direcao = 'saida' and atendente_id is not null limit 1`;
  if (humano) { if (ctx.bot_etapa) await etapa(sql, ctx, "concluido"); return; }

  let setores: Setor[] = [];
  try { setores = JSON.parse(cfg.bot_setores || "[]"); } catch { setores = []; }
  if (!setores.length) return;

  // início: só em chamado novo, e só uma vez (trava contra mensagens simultâneas)
  if (!ctx.bot_etapa) {
    if (!novoTicket) return;
    const ok = await sql`update sac.tickets set bot_etapa = 'setor', bot_tentativas = 0 where id = ${ctx.ticket_id}::uuid and bot_etapa is null returning id`;
    if (!ok.length) return;
    await perguntarSetor(sql, cfg, ctx, setores);
    return;
  }

  // mensagem escrita antes da última pergunta do assistente (cliente mandou várias seguidas): ignora
  const tsCliente = m?.timestamp ? Number(m.timestamp) * 1000 : Date.now();
  const [ult] = await sql`select max(enviado_em) em from sac.mensagens where ticket_id = ${ctx.ticket_id}::uuid and enviado_por = 'Assistente virtual'`;
  if (ult?.em && tsCliente < new Date(ult.em).getTime() - 2000) return;

  const idResp: string = m?.interactive?.list_reply?.id ?? m?.interactive?.button_reply?.id ?? m?.button?.payload ?? "";
  const txt: string = m?.text?.body ?? m?.interactive?.list_reply?.title ?? m?.interactive?.button_reply?.title ?? m?.button?.text ?? "";
  const n = parseInt(txt.trim(), 10);

  if (ctx.bot_etapa === "setor") {
    let s: Setor | undefined;
    if (idResp.startsWith("setor:")) s = setores.find((x) => x.id === idResp.slice(6));
    if (!s && n >= 1 && n <= setores.length) s = setores[n - 1];
    if (!s && txt) s = setores.find((x) => norm(txt).includes(norm(x.rotulo)) || norm(x.rotulo).includes(norm(txt)) || norm(txt) === x.id);
    if (!s) {
      if (ctx.bot_tentativas < 1) { await etapa(sql, ctx, "setor", ctx.bot_tentativas + 1); await perguntarSetor(sql, cfg, ctx, setores, "Desculpe, não entendi. 🙂"); }
      else { await etapa(sql, ctx, "email"); await perguntarEmail(sql, cfg, ctx); }
      return;
    }
    if (s.id !== ctx.setor_id) await sql`update sac.tickets set setor_id = ${s.id}, updated_at = now() where id = ${ctx.ticket_id}::uuid`;
    await evento(sql, ctx, `cliente escolheu o setor ${s.rotulo}`);
    const tipos = await tiposDoSetor(sql, s.id);
    if (tipos.length) { await etapa(sql, ctx, "tipo"); await perguntarTipo(sql, cfg, ctx, tipos as never); }
    else { await etapa(sql, ctx, "email"); await perguntarEmail(sql, cfg, ctx); }
    return;
  }

  if (ctx.bot_etapa === "tipo") {
    const tipos = (await tiposDoSetor(sql, ctx.setor_id)) as unknown as { id: string; codigo: string; nome: string }[];
    let tipo: { id: string; codigo: string; nome: string } | undefined; let outro = false;
    if (idResp === "tipo:outro") outro = true;
    else if (idResp.startsWith("tipo:")) tipo = tipos.find((t) => t.id === idResp.slice(5));
    if (!tipo && !outro && n >= 1 && n <= tipos.length + 1) { if (n === tipos.length + 1) outro = true; else tipo = tipos[n - 1]; }
    if (!tipo && !outro && txt) tipo = tipos.find((t) => norm(txt) === norm(t.codigo) || norm(t.nome).includes(norm(txt)) || norm(txt).includes(norm(t.nome)));
    if (!tipo && !outro) {
      if (ctx.bot_tentativas < 1) { await etapa(sql, ctx, "tipo", ctx.bot_tentativas + 1); await perguntarTipo(sql, cfg, ctx, tipos, "Desculpe, não entendi. 🙂"); return; }
      outro = true;
    }
    if (tipo) {
      await sql`update sac.tickets set tipo_id = ${tipo.id}::uuid, updated_at = now() where id = ${ctx.ticket_id}::uuid and tipo_id is null`;
      await evento(sql, ctx, `cliente indicou ${tipo.codigo} · ${tipo.nome}`);
    } else await evento(sql, ctx, "cliente indicou outro assunto");
    await etapa(sql, ctx, "email");
    await perguntarEmail(sql, cfg, ctx);
    return;
  }

  if (ctx.bot_etapa === "email") {
    if (idResp === "email:manter") { await evento(sql, ctx, "cliente confirmou o e-mail do cadastro"); await finalizar(sql, cfg, ctx); return; }
    const em = txt.match(EMAIL)?.[0]?.toLowerCase();
    if (em) {
      await sql`insert into sac.contatos_cliente (cliente_id, tipo, valor, principal) values (${ctx.cliente_id}::uuid, 'email', ${em}, false) on conflict (tipo, valor) do nothing`;
      await evento(sql, ctx, `cliente informou o e-mail ${em}`);
      await finalizar(sql, cfg, ctx);
      return;
    }
    if (ctx.bot_tentativas < 1) {
      await etapa(sql, ctx, "email", ctx.bot_tentativas + 1);
      const b = "Não consegui identificar o e-mail. Pode digitar novamente? (ex.: nome@empresa.com.br)";
      await enviar(sql, cfg, ctx, texto(b), b);
    } else {
      await evento(sql, ctx, "cliente não informou e-mail");
      await finalizar(sql, cfg, ctx);
    }
  }
}
