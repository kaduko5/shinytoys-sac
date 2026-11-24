import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [modo, setModo] = useState<'login' | 'esqueci'>('login');
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro(''); setMsg(''); setEnviando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setEnviando(false);
    if (error) setErro(error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : error.message.includes('Email not confirmed') ? 'E-mail ainda não confirmado. Veja sua caixa de entrada.' : `Não foi possível entrar: ${error.message}`);
  }

  async function recuperar(e: FormEvent) {
    e.preventDefault();
    setErro(''); setMsg(''); setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setEnviando(false);
    if (error) setErro(`Não foi possível enviar: ${error.message}`);
    else setMsg('Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.');
  }

  return (
    <div className="centro">
      <form className="cartao" onSubmit={modo === 'login' ? entrar : recuperar}>
        <div className="logo-s">S</div>
        <h1>Shiny Toys · Atendimento</h1>
        <p className="muted">{modo === 'login' ? 'Entre com seu e-mail e senha.' : 'Informe seu e-mail para receber o link de nova senha.'}</p>
        <label>E-mail
          <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </label>
        {modo === 'login' && (
          <label>Senha
            <input type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
          </label>
        )}
        {erro && <p className="erro">{erro}</p>}
        {msg && <p className="ok">{msg}</p>}
        <button className="btn primario" disabled={enviando}>
          {enviando ? 'Aguarde…' : modo === 'login' ? 'Entrar' : 'Enviar link'}
        </button>
        <button type="button" className="link" onClick={() => { setModo(modo === 'login' ? 'esqueci' : 'login'); setErro(''); setMsg(''); }}>
          {modo === 'login' ? 'Esqueci a senha' : 'Voltar para o login'}
        </button>
        <p className="muted pequeno">Não há cadastro aberto. Peça seu acesso ao administrador.</p>
      </form>
    </div>
  );
}
