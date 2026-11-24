# Anexos (fotos, áudios, vídeos, documentos) — contrato do backend

Publicado no Supabase DADOSAI em 24/11/2026. Código em `supabase/functions/`.

## O que mudou
- `sac.mensagens` ganhou: `midia_status` (`pendente` | `ok` | `erro` | `grande` | `expirada`), `midia_mime`, `midia_nome`, `midia_tamanho`, `midia_path` (interno).
- Bucket **privado** `sac-midia` (limite 25 MB). Sem acesso direto do front: só por link assinado.
- `whatsapp-webhook` v5: mídia recebida é baixada da Meta em segundo plano e guardada em `entrada/<conversa>/<mensagem>.<ext>`.
- `sac_mensagens_conversa` agora devolve também `midia_status, midia_mime, midia_nome, midia_tamanho`.
- Nova Edge Function **`sac-midia`** (JWT obrigatório, atendente ativo).

## `sac-midia` — ver um anexo
```ts
const { data } = await supabase.functions.invoke('sac-midia', { body: { acao: 'url', mensagem_id } });
// 200 {ok:true, url, mime, nome}   -> link válido por 1h
// 422 {erro:'midia_expirada'|'midia_grande'|'midia_erro'}  (Meta guarda a mídia ~30 dias)
```
Se a mídia ainda não foi baixada, a função baixa na hora (serve de nova tentativa).

## `sac-midia` — enviar um anexo
`multipart/form-data`: `acao=enviar`, `conversa_id`, `arquivo`, `legenda?`, `dry_run=true|false`.

| Tipo | Formatos | Máx. |
|---|---|---|
| Foto | jpeg, png | 5 MB |
| Vídeo | mp4, 3gpp | 16 MB |
| Áudio | aac, mp4/m4a, mpeg/mp3, amr, ogg | 16 MB |
| Documento | pdf, txt, xls/xlsx, doc/docx, ppt/pptx | 16 MB |

Erros: `tipo_nao_suportado` (415), `arquivo_grande` (413), `precisa_template` (409), `ticket_fechado` (422) e os mesmos da `sac-enviar`.
Obs.: XML de NF não é aceito pelo WhatsApp como documento; mande o PDF (DANFE) ou compacte.

## Realtime
Quando o download termina, chega um `UPDATE` em `sac.mensagens` com `midia_status='ok'`: recarregue a mensagem ou só troque o status.
