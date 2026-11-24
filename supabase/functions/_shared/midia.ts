// Funções de mídia compartilhadas (whatsapp-webhook e sac-midia).
// Baixa a mídia recebida da Meta e guarda no bucket privado sac-midia.
import type postgres from "npm:postgres@3.4.5";

export const GRAPH = "https://graph.facebook.com/v21.0";
export const BUCKET = "sac-midia";
export const LIMITE_BYTES = 25 * 1024 * 1024;
export const TIPOS_MIDIA = ["image", "audio", "video", "document", "sticker"];

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "amr",
  "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf", "text/plain": "txt",
  "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-powerpoint": "ppt", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};
export const extDe = (mime: string) => EXT[mime.split(";")[0].trim()] ?? "bin";

const svcKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const base = () => Deno.env.get("SUPABASE_URL")!;

export async function tokenWhatsApp(sql: ReturnType<typeof postgres>): Promise<string | null> {
  const r = await sql`select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_cloud_api_token' limit 1`;
  return r.length ? (r[0].decrypted_secret as string) : null;
}

export async function storageUpload(path: string, bytes: Uint8Array, mime: string) {
  const r = await fetch(`${base()}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${svcKey()}`, apikey: svcKey(), "Content-Type": mime, "x-upsert": "true" },
    body: bytes,
  });
  if (!r.ok) throw new Error(`storage_upload ${r.status}`);
}

export async function linkAssinado(path: string, segundos = 3600): Promise<string> {
  const r = await fetch(`${base()}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${svcKey()}`, apikey: svcKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: segundos }),
  });
  if (!r.ok) throw new Error(`storage_sign ${r.status}`);
  const j = await r.json();
  return `${base()}/storage/v1${j.signedURL}`;
}

// Baixa da Meta a mídia de uma mensagem de entrada e grava no bucket. Idempotente.
export async function baixarMidiaEntrada(sql: ReturnType<typeof postgres>, mensagemId: string): Promise<string> {
  const [m] = await sql`select id, conversa_id, tipo, payload, midia_status, midia_path from sac.mensagens where id = ${mensagemId}::uuid`;
  if (!m) return "nao_encontrada";
  if (m.midia_status === "ok" && m.midia_path) return "ok";
  const bloco = m.payload?.[m.tipo] ?? {};
  const mediaId = bloco.id;
  if (!mediaId) {
    await sql`update sac.mensagens set midia_status = 'erro' where id = ${m.id}`;
    return "sem_media_id";
  }
  const token = await tokenWhatsApp(sql);
  if (!token) return "nao_configurado";

  const info = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!info.ok) {
    // mídia some da Meta depois de ~30 dias
    const st = info.status === 404 || info.status === 400 ? "expirada" : "erro";
    await sql`update sac.mensagens set midia_status = ${st} where id = ${m.id}`;
    return st;
  }
  const meta = await info.json();
  const mime = String(meta.mime_type ?? bloco.mime_type ?? "application/octet-stream").split(";")[0].trim();
  if (Number(meta.file_size ?? 0) > LIMITE_BYTES) {
    await sql`update sac.mensagens set midia_status = 'grande', midia_mime = ${mime}, midia_tamanho = ${Number(meta.file_size)} where id = ${m.id}`;
    return "grande";
  }
  const arq = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  if (!arq.ok) {
    await sql`update sac.mensagens set midia_status = 'erro' where id = ${m.id}`;
    return "erro";
  }
  const bytes = new Uint8Array(await arq.arrayBuffer());
  const path = `entrada/${m.conversa_id}/${m.id}.${extDe(mime)}`;
  await storageUpload(path, bytes, mime);
  const nome = bloco.filename ?? null;
  await sql`update sac.mensagens set midia_path = ${path}, midia_mime = ${mime}, midia_nome = ${nome},
            midia_tamanho = ${bytes.byteLength}, midia_status = 'ok' where id = ${m.id}`;
  return "ok";
}
