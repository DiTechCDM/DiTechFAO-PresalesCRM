import React, { useState } from 'react';
import { useAppContext } from '../store';

export default function Login() {
  const { login } = useAppContext();
  const [email, setEmail]   = useState('');
  const [pass, setPass]     = useState('');
  const [err, setErr]       = useState('');
  const [logging, setLogging] = useState(false);

  const doLogin = async () => {
    const e = email.trim().toLowerCase();
    if (!e || !pass) { setErr('Enter your email and password'); return; }
    setLogging(true);
    setErr('');
    const result = await login(e, pass);
    setLogging(false);
    if (result.error) { setErr(result.error); }
  };

  return (
    <div id="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <div className="ll-icon">DF</div>
          <div className="ll-name">DiTech FAO</div>
          <div className="ll-tag">Presales CRM</div>
        </div>

        <div className="fg"><label>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} placeholder="you@ditech.com" autoFocus /></div>
        <div className="fg"><label>Password</label><input type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && doLogin()} placeholder="••••••••" /></div>
        <button className="login-btn" onClick={doLogin} disabled={logging}>{logging ? 'Signing in…' : 'Sign in'}</button>
        <div className="login-err">{err}</div>

        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--t3)', textAlign: 'center', lineHeight: 1.6 }}>
          admin@ditech.com · admin123<br />
          diksha@ditech.com · diksha123
        </div>
      </div>
    </div>
  );
}
