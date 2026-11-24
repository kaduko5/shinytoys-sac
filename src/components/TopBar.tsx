import { supabase } from '../lib/supabase';
import { DRY_RUN } from '../lib/api';
import { iniciais, nomeSetor } from '../lib/format';
import type { Perfil } from '../lib/types';

interface Props { perfil: Perfil; rota: 'inbox' | 'admin'; onNavegar: (r: 'inbox' | 'admin') => void }

export default function TopBar({ perfil, rota, onNavegar }: Props) {
  const papel = perfil.papel === 'admin' ? 'Admin' : perfil.papel === 'supervisor' ? 'Supervisor' : 'Atendente';
  const setores = perfil.setores.map(nomeSetor).join(', ') || 'sem setor';
  return (
    <header className="topbar">
      <div className="marca">
        <div className="logo-s">S</div>
        <div>
          <strong>Shiny Toys / Asgard</strong>
          <small>Ferramenta de atendimento</small>
        </div>
      </div>
      {DRY_RUN && <span className="selo-teste" title="Envios fazem só a checagem, nada chega ao cliente">MODO TESTE · ENVIO SIMULADO</span>}
      <div className="wa-box">
        <span className="dot" />
        <div>
          <small>WHATSAPP COMPARTILHADO</small>
          <strong>+55 11 97246-5529 · Sac ShinyToys</strong>
        </div>
      </div>
      <nav className="nav">
        <button className={rota === 'inbox' ? 'ativo' : ''} onClick={() => onNavegar('inbox')}>Inbox</button>
        {perfil.papel === 'admin' && (
          <button className={rota === 'admin' ? 'ativo' : ''} onClick={() => onNavegar('admin')}>Atendentes</button>
        )}
      </nav>
      <div className="usuario">
        <div className="avatar">{iniciais(perfil.nome || perfil.email)}</div>
        <div>
          <strong>{perfil.nome || perfil.email}</strong>
          <small>{papel} · {setores}</small>
        </div>
        <button className="btn-sair" onClick={() => supabase.auth.signOut()} title="Sair">Sair</button>
      </div>
    </header>
  );
}
