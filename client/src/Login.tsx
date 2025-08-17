import React, { useEffect, useRef, useState } from 'react';
import { postDate } from './api.js';

function Login({ onAuthed }: { onAuthed: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'request' | 'verify'>('request');
  const [msg, setMsg] = useState('');

  async function requestOtp() {
    try {
      setMsg('');
      const res = await postDate<{ ok?: boolean; error?: string }>('/auth/request-otp', {
        email,
        website: '',
      });
      if (res.error) setMsg(res.error);
      else setStage('verify');
    } catch (e: any) {
      setMsg(e.message || 'Request failed');
    }
  }

  async function verifyOtp() {
    try {
      setMsg('');
      const res = await postDate<{ token?: string; error?: string }>('/auth/verify', {
        email,
        otp,
      });
      if (res.token) {
        localStorage.setItem('token', res.token);
        onAuthed(res.token);
      } else {
        setMsg(res.error || 'Invalid code');
      }
    } catch (e: any) {
      setMsg(e.message || 'Verify failed');
    }
  }
  return (
    <div className="container">
      <h2>Login</h2>
      <div className="card">
        <label>Email</label>
        <input
          placeholder="you@gmail.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', margin: '6px 0 12px' }}
        />
        {stage === 'verify' && (
          <>
            <label>OTP</label>
            <input
              placeholder='"6-digit code'
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              style={{ width: '100%', margin: '6px 0 12px' }}
            />
          </>
        )}
        <button
          onClick={stage === 'request' ? requestOtp : verifyOtp}
          disabled={!email || (stage === 'verify' && otp.length !== 6)}>
          {stage === 'request' ? 'requestOtp' : 'Verify'}
        </button>
        {msg && <p style={{ color: 'crimson' }}>{msg}</p>}
        <p className="muted" style={{ marginTop: 8 }}>
          Dev mode: OTP is printed in server console.
        </p>
      </div>
    </div>
  );
}
export default Login;
