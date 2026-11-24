import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function NovaSenha({ onPronto }: { onPronto: () => void }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return setErro('Use pelo menos 8 caracteres.');
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) setErro(error.message);
    else onPronto();
  }
  return (
    <div className="centro">
      <form className="cartao" onSubmit={salvar}>
        <h1>Criar nova senha</h1>
        <label>Nova senha
          <input type="password" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button className="btn primario">Salvar senha</button>
      </form>
    </div>
  );
}
