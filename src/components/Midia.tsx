import { useState } from 'react';
import { mensagemErro, urlMidia } from '../lib/api';
import type { Mensagem } from '../lib/types';

const TIPOS_MIDIA = ['image', 'audio', 'video', 'document', 'sticker'];
export const ehMidia = (m: Mensagem) => TIPOS_MIDIA.includes(m.tipo);

const ROTULO: Record<string, string> = { image: '📷 Foto', sticker: '🖼️ Figurinha', audio: '🎤 Áudio', video: '🎬 Vídeo', document: '📄 Documento' };

function tamanho(b?: number | null) {
  if (!b) return '';
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

/** Mostra foto/áudio/vídeo/documento de uma mensagem. Só carrega o arquivo quando o atendente clica (economiza dados). */
export default function Midia({ m }: { m: Mensagem }) {
  const [url, setUrl] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const st = m.midia_status;
  const rotulo = ROTULO[m.tipo] ?? `[${m.tipo}]`;

  if (st === 'expirada' || st === 'grande') {
    return <div className="midia midia-off">{rotulo} · {st === 'expirada' ? 'não disponível (mais de 30 dias)' : 'arquivo grande demais'}</div>;
  }

  async function abrir() {
    setCarregando(true); setErro('');
    try { setUrl((await urlMidia(m.id)).url); }
    catch (e) { setErro(mensagemErro(e)); }
    finally { setCarregando(false); }
  }

  if (!url) {
    return (
      <div className="midia">
        <button type="button" className="midia-btn" onClick={abrir} disabled={carregando}>
          {carregando ? 'Carregando…' : `${rotulo} · ${st === 'pendente' ? 'clique para baixar' : 'clique para ver'}`}
          {m.midia_nome && <small> · {m.midia_nome}</small>}
          {m.midia_tamanho ? <small> · {tamanho(m.midia_tamanho)}</small> : null}
        </button>
        {erro && <small className="erro">{erro}</small>}
      </div>
    );
  }

  const mime = m.midia_mime ?? '';
  if (m.tipo === 'image' || m.tipo === 'sticker' || mime.startsWith('image/'))
    return <a href={url} target="_blank" rel="noreferrer" className="midia"><img src={url} alt={m.midia_nome ?? 'Foto'} className="midia-img" /></a>;
  if (m.tipo === 'audio' || mime.startsWith('audio/'))
    return <div className="midia"><audio controls src={url} preload="metadata" /></div>;
  if (m.tipo === 'video' || mime.startsWith('video/'))
    return <div className="midia"><video controls src={url} className="midia-img" preload="metadata" /></div>;
  return (
    <div className="midia">
      <a href={url} target="_blank" rel="noreferrer" className="midia-btn">📄 {m.midia_nome || 'Abrir documento'} {tamanho(m.midia_tamanho)}</a>
    </div>
  );
}
