import { useCallback, useEffect, useState } from 'react';
import { api, mensagemErro } from '../lib/api';
import type { Setor } from '../lib/types';

type SetorBot = { id: string; rotulo: string; descricao?: string };
const TEXTOS: { k: string; r: string; ajuda?: string }[] = [
  { k: 'bot_boas_vindas', r: '1. Boas-vindas + pergunta do setor' },
  { k: 'bot_pergunta_tipo', r: '2. Pergunta do tipo de ocorrência' },
  { k: 'bot_pergunta_email', r: '3. Pergunta do e-mail' },
  { k: 'bot_pergunta_cnpj', r: '4. Pergunta do CNPJ' },
  { k: 'bot_final', r: '5. Mensagem final', ajuda: 'Use {protocolo} para incluir o número do chamado.' },
];

/** Configuração do assistente automático do WhatsApp (setor → tipo → e-mail → CNPJ). */
export default function AdminBot({ setores }: { setores: Setor[] }) {
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [lista, setLista] = useState<SetorBot[]>([]);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const c = await api.botConfig();
      setCfg(c);
      try { setLista(JSON.parse(c.bot_setores || '[]')); } catch { setLista([]); }
    } catch (e) { setErro(mensagemErro(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function salvar() {
    setSalvando(true); setErro(''); setOk('');
    try {
      const novo = await api.salvarBot({ ...cfg, bot_setores: JSON.stringify(lista) });
      setCfg(novo); setOk('Configuração salva.');
    } catch (e) { setErro(mensagemErro(e)); } finally { setSalvando(false); }
  }
  const set = (k: string, v: string) => setCfg({ ...cfg, [k]: v });
  const temSetor = (id: string) => lista.some((x) => x.id === id);
  const modo = cfg.bot_modo || 'desligado';

  return (
    <div>
      <div className="admin-cab">
        <div>
          <h1>Assistente do WhatsApp</h1>
          <p className="muted">Em todo chamado novo, o assistente pergunta: <b>setor → tipo de ocorrência → e-mail → CNPJ</b> e depois passa para a equipe.
            Ele para sozinho assim que um atendente responde.</p>
        </div>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {ok && <p className="ok">{ok}</p>}

      <div className="det-bloco" style={{ maxWidth: 760, marginBottom: 16 }}>
        <div className="det-tit">Situação</div>
        <div className="det-pub">
          {([['desligado', 'Desligado'], ['teste', 'Só números de teste'], ['ligado', 'Ligado para todos']] as const).map(([v, r]) => (
            <button key={v} type="button" className={modo === v ? 'ativo' : ''} onClick={() => set('bot_modo', v)}>{r}</button>
          ))}
        </div>
        {modo === 'ligado' && <p className="aviso-falta">Ligado: todo cliente que abrir um chamado novo pelo WhatsApp vai receber as perguntas.</p>}
        <label className="det-campo">Números de teste (com DDD, separados por vírgula)
          <input value={cfg.bot_numeros_teste ?? ''} onChange={(e) => set('bot_numeros_teste', e.target.value)} placeholder="11999998888, 11988887777" />
        </label>
      </div>

      <div className="det-bloco" style={{ maxWidth: 760, marginBottom: 16 }}>
        <div className="det-tit">Mensagens</div>
        {TEXTOS.map((t) => (
          <label key={t.k} className="det-campo">{t.r}
            <textarea rows={2} value={cfg[t.k] ?? ''} onChange={(e) => set(t.k, e.target.value)} />
            {t.ajuda && <small className="muted">{t.ajuda}</small>}
          </label>
        ))}
      </div>

      <div className="det-bloco" style={{ maxWidth: 760, marginBottom: 16 }}>
        <div className="det-tit">Setores que o cliente pode escolher <small className="muted">(nome que o cliente vê, máx. 24 letras)</small></div>
        {setores.map((s) => {
          const item = lista.find((x) => x.id === s.id);
          return (
            <div key={s.id} className="bot-setor">
              <label className="check" style={{ margin: 0 }}>
                <input type="checkbox" checked={temSetor(s.id)}
                  onChange={(e) => setLista(e.target.checked ? [...lista, { id: s.id, rotulo: s.nome, descricao: '' }] : lista.filter((x) => x.id !== s.id))} />
                {s.nome}
              </label>
              {item && (
                <>
                  <input maxLength={24} value={item.rotulo} onChange={(e) => setLista(lista.map((x) => (x.id === s.id ? { ...x, rotulo: e.target.value } : x)))} />
                  <input maxLength={72} placeholder="Descrição (opcional)" value={item.descricao ?? ''} onChange={(e) => setLista(lista.map((x) => (x.id === s.id ? { ...x, descricao: e.target.value } : x)))} />
                </>
              )}
            </div>
          );
        })}
        <small className="muted">Os tipos de ocorrência mostrados são os tipos ativos do setor escolhido (Tipos de chamado).</small>
      </div>

      <button type="button" className="btn primario" disabled={salvando} onClick={() => void salvar()}>{salvando ? 'Salvando…' : 'Salvar'}</button>
    </div>
  );
}
