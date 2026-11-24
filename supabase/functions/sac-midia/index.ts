// sac-midia — anexos da inbox SAC (verify_jwt = true)
// POST JSON {acao:'url', mensagem_id}  -> link assinado (1h) da mídia; baixa da Meta na hora se ainda não estiver guardada
// POST multipart {acao:'enviar', conversa_id, legenda?, dry_run?, arquivo} -> envia anexo pelo WhatsApp
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import { baixarMidiaEntrada, extDe, GRAPH, linkAssinado, storageUpload, tokenWhatsApp } from "../_shared/midia.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 2, prepare: false, idle_timeout: 20 });
const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("SAC_ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Tipos aceitos pelo WhatsApp Cloud API para envio, com limite de tamanho
const ACEITOS: Record<string, { tipo: "image" | "audio" | "video" | "document"; max: number }> = {
  "image/jpeg": { tipo: "image", max: 5 }, "image/png": { tipo: "image", max: 5 },
  "video/mp4": { tipo: "video", max: 16 }, "video/3gpp": { tipo: "video", max: 16 },
  "audio/aac": { tipo: "audio", max: 16 }, "audio/mp4": { tipo: "audio", max: 16 }, "audio/mpeg": { tipo: "audio", max: 16 },
  "audio/amr": { tipo: "audio", max: 16 }, "audio/ogg": { tipo: "audio", max: 16 },
  "application/pdf": { tipo: "document", max: 16 }, "text/plain": { tipo: "document", max: 16 },
  "application/vnd.ms-excel": { tipo: "document", max: 16 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { tipo: "document", max: 16 },
  "application/msword": { tipo: "document", max: 16 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { tipo: "document", max: 16 },
  "application/vnd.ms-powerpoint": { tipo: "document", max: 16 },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { tipo: "document", max: 16 },
};
const PREVIA: Record<string, string> = { image: "📷 Foto", audio: "🎤 Áudio", video: "🎬 Vídeo", document: "📄 Documento" };

async function usuario(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get("SUPABASE_ANON_KEY")! },
  });
  if (!r.ok) return null;
  const u = await r.json();
  return typeof u?.id === "string" ? u.id : null;
}

async function acaoUrl(uid: string, mensagemId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(mensagemId ?? "")) return json({ ok: false, erro: "mensagem_invalida" }, 400);
  const [m] = await sql`select id, conversa_id, direcao, midia_status, midia_path, midia_mime, midia_nome from sac.mensagens where id = ${mensagemId}::uuid`;
  if (!m) return json({ ok: false, erro: "mensagem_invalida" }, 404);
  const [{ pode }] = await sql`select sac._pode_ver(${uid}::uuid, ${m.conversa_id}::uuid) as pode`;
  if (!pode) return json({ ok: false, erro: "acesso_negado" }, 403);

  let status = m.midia_status, path = m.midia_path;
  if ((status !== "ok" || !path) && m.direcao === "entrada" && status !== "grande" && status !== "expirada") {
    status = await baixarMidiaEntrada(sql, m.id);
    const [n] = await sql`select midia_path, midia_mime, midia_nome from sac.mensagens where id = ${m.id}`;
    path = n?.midia_path; m.midia_mime = n?.midia_mime; m.midia_nome = n?.midia_nome;
  }
  if (status !== "ok" || !path) return json({ ok: false, erro: `midia_${status ?? "indisponivel"}` }, 422);
  return json({ ok: true, url: await linkAssinado(path), mime: m.midia_mime, nome: m.midia_nome });
}

async function acaoEnviar(uid: string, form: FormData) {
  const conversaId = String(form.get("conversa_id") ?? "");
  const legenda = String(form.get("legenda") ?? "").trim();
  const dryRun = String(form.get("dry_run") ?? "") === "true";
  const arquivo = form.get("arquivo");
  if (!/^[0-9a-f-]{36}$/i.test(conversaId)) return json({ ok: false, erro: "conversa_invalida" }, 400);
  if (!(arquivo instanceof File)) return json({ ok: false, erro: "arquivo_obrigatorio" }, 400);
  if (legenda.length > 1024) return json({ ok: false, erro: "legenda_longa" }, 400);

  const mime = (arquivo.type || "application/octet-stream").split(";")[0].trim();
  const regra = ACEITOS[mime];
  if (!regra) return json({ ok: false, erro: "tipo_nao_suportado", mime }, 415);
  if (arquivo.size > regra.max * 1024 * 1024) return json({ ok: false, erro: "arquivo_grande", max_mb: regra.max }, 413);

  const [{ r: prep }] = await sql`select sac.preparar_envio(${uid}::uuid, ${conversaId}::uuid) as r`;
  if (!prep?.ok) {
    const status = prep?.erro === "acesso_negado" ? 403 : prep?.erro === "precisa_template" ? 409 : 422;
    return json(prep ?? { ok: false, erro: "desconhecido" }, status);
  }
  const [cfgRow] = await sql`select valor from sac.config where chave = 'whatsapp_phone_number_id'`;
  const token = await tokenWhatsApp(sql);
  if (!cfgRow?.valor || !token) return json({ ok: false, erro: "nao_configurado" }, 503);

  if (dryRun) return json({ ok: true, dry_run: true, tipo: regra.tipo, protocolo: prep.protocolo });

  // 1) sobe a mídia para a Meta
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", mime);
  fd.append("file", arquivo, arquivo.name || `arquivo.${extDe(mime)}`);
  const up = await fetch(`${GRAPH}/${cfgRow.valor}/media`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
  const upJ = await up.json().catch(() => ({}));
  if (!up.ok || !upJ?.id) {
    console.error("graph media erro", up.status, upJ?.error?.code);
    return json({ ok: false, erro: "graph_api", mensagem: upJ?.error?.message ?? "Falha ao subir o arquivo" }, 502);
  }
  // 2) envia a mensagem
  const bloco: Record<string, unknown> = { id: upJ.id };
  if (legenda && regra.tipo !== "audio") bloco.caption = legenda;
  if (regra.tipo === "document") bloco.filename = arquivo.name || `documento.${extDe(mime)}`;
  const resp = await fetch(`${GRAPH}/${cfgRow.valor}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: prep.wa_id, type: regra.tipo, [regra.tipo]: bloco }),
  });
  const g = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const code = g?.error?.code;
    console.error("graph erro", resp.status, code);
    if (code === 131047) return json({ ok: false, erro: "precisa_template" }, 409);
    return json({ ok: false, erro: "graph_api", mensagem: g?.error?.message ?? "Falha no envio" }, 502);
  }
  const wamid = g?.messages?.[0]?.id;
  const texto = legenda ? `${PREVIA[regra.tipo]} · ${legenda}` : PREVIA[regra.tipo];
  const [{ r: reg }] = await sql`select sac.wa_registrar_saida(${prep.wa_id}, ${wamid}, ${texto}, ${prep.atendente_nome}, ${sql.json(g)}, ${uid}::uuid) as r`;
  // 3) guarda uma cópia no bucket e marca a mensagem como mídia
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const path = `saida/${conversaId}/${reg.mensagem_id}.${extDe(mime)}`;
  let st = "ok";
  try { await storageUpload(path, bytes, mime); } catch (e) { st = "erro"; console.error("storage", (e as Error).message); }
  await sql`update sac.mensagens set tipo = ${regra.tipo}, corpo_texto = ${legenda || null},
            midia_path = ${st === "ok" ? path : null}, midia_mime = ${mime}, midia_nome = ${arquivo.name || null},
            midia_tamanho = ${arquivo.size}, midia_status = ${st} where id = ${reg.mensagem_id}::uuid`;
  return json({ ok: true, wa_message_id: wamid, ...reg });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);
  try {
    const uid = await usuario(req);
    if (!uid) return json({ ok: false, erro: "nao_autenticado" }, 401);
    const [ativo] = await sql`select 1 from sac.atendentes where id = ${uid}::uuid and ativo`;
    if (!ativo) return json({ ok: false, erro: "acesso_negado" }, 403);

    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      if (form.get("acao") === "enviar") return await acaoEnviar(uid, form);
      return json({ ok: false, erro: "acao_invalida" }, 400);
    }
    const b = await req.json().catch(() => ({}));
    if (b?.acao === "url") return await acaoUrl(uid, b.mensagem_id);
    return json({ ok: false, erro: "acao_invalida" }, 400);
  } catch (e) {
    console.error("erro sac-midia", (e as any)?.code ?? "", (e as any)?.message ?? String(e));
    return json({ ok: false, erro: "interno" }, 500);
  }
});
