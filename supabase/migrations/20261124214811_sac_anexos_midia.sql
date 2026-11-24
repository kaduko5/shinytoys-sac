-- aplicada no DADOSAI em 24/11/2026 (ver docs/ANEXOS-BACKEND.md)
alter table sac.mensagens
  add column if not exists midia_path text,
  add column if not exists midia_mime text,
  add column if not exists midia_nome text,
  add column if not exists midia_tamanho bigint,
  add column if not exists midia_status text check (midia_status in ('pendente','ok','erro','grande','expirada'));
update sac.mensagens set midia_status = 'pendente'
 where tipo in ('image','audio','video','document','sticker','voice') and midia_status is null;
insert into storage.buckets (id, name, public, file_size_limit)
values ('sac-midia', 'sac-midia', false, 26214400) on conflict (id) do nothing;
-- + recriação de public.sac_mensagens_conversa com as colunas midia_* (security definer, grant authenticated)
