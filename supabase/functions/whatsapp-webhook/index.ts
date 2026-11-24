// whatsapp-webhook — recebe eventos do WhatsApp Cloud API e grava no schema sac (DADOSAI)
// GET  ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...  -> devolve challenge
// POST (Meta)  -> grava mensagens recebidas / atualiza status das enviadas
// POST com header x-sac-internal-token + {"action":"log_outbound"|"set_secret"|"secret_status"|"app_secret_status",...}
// Assinatura X-Hub-Signature-256 obrigatória quando o App Secret está no Vault (ou env)
// v4: mídia recebida (foto, áudio, vídeo, documento) é baixada da Meta em segundo plano para o bucket sac-midia
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";
import { baixarMidiaEntrada, TIPOS_MIDIA } from "../_shared/midia.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 2, prepare: false, idle_timeout: 20 });

let cfgCache: { at: number; v: Record<string, string> } | null = null;
let appSecretCache: { at: number; v: string | null } | null = null;
// App Secret: env (secret da função) > Supabase Vault (nome whatsapp_app_secret)
async function getAppSecret(): Promise<string | null> {
  const env = Deno.env.get("WHATSAPP_APP_SECRET");
  if (env) return env;
  if (appSecretCache && Date.now() - appSecretCache.at < 60_000) return appSecretCache.v;
  const rows = await sql`select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_app_secret' limit 1`;
  const v = rows.length ? (rows[0].decrypted_secret as string) : null;
  appSecretCache = { at: Date.now(), v };
  return v;
}
async function cfg(): Promise<Record<string, string>> {
  if (cfgCache && Date.now() - cfgCache.at < 60_000) return cfgCache.v;
  const rows = await sql`select chave, valor from sac.config`;
  const v: Record<string, string> = {};
  for (const r of rows) v[r.chave] = r.valor;
  cfgCache = { at: Date.now(), v };
  return v;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha256(s: string) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
async function hmac256(key: string, body: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(body)));
}
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

function textoDe(m: any): string | null {
  switch (m.type) {
    case "text": return m.text?.body ?? null;
    case "button": return m.button?.text ?? null;
    case "interactive": return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
    case "image": case "video": case "document": case "audio": case "sticker":
      return m[m.type]?.caption ?? `[${m.type}]`;
    case "location": return `[localização] ${m.location?.latitude},${m.location?.longitude}`;
    case "reaction": return `[reação] ${m.reaction?.emoji ?? ""}`;
    default: return `[${m.type}]`;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  try {
    if (req.method === "GET") {
      const c = await cfg();
      const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? c["whatsapp_verify_token"];
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token") ?? "";
      const challenge = url.searchParams.get("hub.challenge") ?? "";
      if (mode === "subscribe" && expected && safeEq(token, expected)) {
        return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
      }
      return new Response("forbidden", { status: 403 });
    }
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

    const raw = await req.text();
    const c = await cfg();

    // Chamada interna (responder.sh) — registra mensagem enviada
    const internal = req.headers.get("x-sac-internal-token");
    if (internal) {
      if (!c["internal_token_sha256"] || !safeEq(await sha256(internal), c["internal_token_sha256"])) {
        return json({ error: "unauthorized" }, 401);
      }
      const b = JSON.parse(raw);
      if (b.action === "set_app_secret" || b.action === "set_secret") {
        // grava/atualiza um segredo permitido no Vault; nunca devolve o valor
        const nome = b.action === "set_app_secret" ? "whatsapp_app_secret" : b.name;
        const permitidos: Record<string, string> = {
          whatsapp_app_secret: "App Secret do app Meta Sac ShinyToys (assinatura do webhook)",
          whatsapp_cloud_api_token: "Token permanente (System User) do WhatsApp Cloud API - usado pela sac-enviar",
        };
        if (!permitidos[nome] || typeof b.value !== "string" || b.value.length < 16) return json({ error: "bad request" }, 400);
        const ex = await sql`select id from vault.secrets where name = ${nome} limit 1`;
        if (ex.length) await sql`select vault.update_secret(${ex[0].id}::uuid, ${b.value})`;
        else await sql`select vault.create_secret(${b.value}, ${nome}, ${permitidos[nome]})`;
        if (nome === "whatsapp_app_secret") appSecretCache = null;
        return json({ ok: true, stored: `vault:${nome}`, updated: ex.length > 0 });
      }
      if (b.action === "secret_status") {
        const rows = await sql`select name from vault.secrets where name in ('whatsapp_app_secret','whatsapp_cloud_api_token')`;
        return json({ ok: true, configured: rows.map((r: any) => r.name) });
      }
      if (b.action === "app_secret_status") {
        appSecretCache = null;
        return json({ ok: true, configured: !!(await getAppSecret()) });
      }
      if (b.action !== "log_outbound" || !b.wa_id || !b.wa_message_id) return json({ error: "bad request" }, 400);
      const [r] = await sql`select sac.wa_registrar_saida(${b.wa_id}, ${b.wa_message_id}, ${b.texto ?? null}, ${b.enviado_por ?? null}, ${sql.json(b.payload ?? {})}) as r`;
      return json({ ok: true, ...r.r });
    }

    // Assinatura da Meta (opcional: só valida se houver app secret configurado)
    const appSecret = await getAppSecret();
    let assinaturaOk: boolean | null = null;
    if (appSecret) {
      const h = req.headers.get("x-hub-signature-256") ?? "";
      const sig = h.startsWith("sha256=") ? h.slice(7).toLowerCase() : "";
      assinaturaOk = sig.length === 64 && safeEq(sig, await hmac256(appSecret, raw));
      if (!assinaturaOk) {
        console.warn("assinatura inválida");
        return new Response("invalid signature", { status: 401 });
      }
    }

    const body = JSON.parse(raw);
    await sql`insert into sac.webhook_eventos (assinatura_ok, payload) values (${assinaturaOk}, ${sql.json(body)})`;

    const resultados: unknown[] = [];
    const midias: string[] = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== "messages") continue;
        const v = change.value ?? {};
        const nomes: Record<string, string> = {};
        for (const ct of v.contacts ?? []) nomes[ct.wa_id] = ct.profile?.name ?? "";
        for (const m of v.messages ?? []) {
          const ts = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null;
          const [r] = await sql`select sac.wa_registrar_entrada(${m.from}, ${nomes[m.from] ?? null}, ${m.id}, ${m.type}, ${textoDe(m)}, ${ts}, ${sql.json(m)}) as r`;
          resultados.push(r.r);
          if (TIPOS_MIDIA.includes(m.type) && r.r?.mensagem_id) {
            await sql`update sac.mensagens set midia_status = 'pendente', midia_mime = ${m[m.type]?.mime_type ?? null},
                      midia_nome = ${m[m.type]?.filename ?? null} where id = ${r.r.mensagem_id}::uuid`;
            midias.push(r.r.mensagem_id);
          }
        }
        for (const s of v.statuses ?? []) {
          const ts = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString();
          const [r] = await sql`select sac.wa_atualizar_status(${s.id}, ${s.status}, ${ts}, ${sql.json(s)}) as r`;
          resultados.push({ status: s.status, atualizado: r.r });
        }
      }
    }
    // baixa as mídias depois de responder à Meta (se falhar, a sac-midia tenta de novo quando o atendente abrir)
    if (midias.length) {
      const tarefa = (async () => {
        for (const id of midias) {
          try { await baixarMidiaEntrada(sql, id); }
          catch (e) { console.error("midia", id, (e as Error).message); }
        }
      })();
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(tarefa);
    }
    return json({ ok: true, resultados });
  } catch (e) {
    // loga só mensagem/código (nunca parâmetros da query, que podem conter segredo)
    console.error("erro webhook", (e as any)?.code ?? "", (e as any)?.message ?? String(e));
    // 500 faz a Meta reenviar; a gravação é idempotente por wa_message_id
    return json({ error: "internal" }, 500);
  }
});
