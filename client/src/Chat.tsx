import React, { useEffect, useRef, useState } from 'react';
import { DeleteDate, GetDate, postDate } from './api.js';
import { io } from 'socket.io-client';

type Msg = {
  id: string;
  kind: 'TEXT' | 'IMAGE' | string;
  text?: string;
  imageUrl?: string;
  createdAt: string;
  userEmail: string | null;
};
//npx prisma studio data inspect

function Chat({ token, OnLogout }: { token: string; OnLogout: () => void }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [me, setMe] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    (async () => {
      const dataMe = await GetDate<{ email: string }>('/api/me', token);
      setMe(dataMe.email || 'me');
      const res = await GetDate<{ messages: Msg[] }>('/api/messages', token);
      setMessages(res.messages || []);
    })().catch(() => console.error());

    const s = io('http://localhost:4000');
    s.on('message:new', (m: Msg) => {
      setMessages((prev) => [...prev, m]);

      audioRef.current?.play().catch(() => {});
    });
    s.on('message:delete', ({ id }: { id: string }) =>
      setMessages((ms) => ms.filter((m) => m.id !== id))
    );
    return () => {
      s.disconnect();
    };
  }, [token]);
  function canDelete(m: Msg) {
    return m.userEmail && m.userEmail === me;
  }
  async function deleteMSG(id: string) {
    try {
      await DeleteDate(`/api/messages/${id}`, token);
      setMessages((currect) => currect.filter((m) => m.id !== id));
    } catch (e: any) {
      alert(e.message || 'Delete failed');
    }
  }
  async function sendText() {
    const val = text.trim();
    if (!val) return;
    await postDate('/api/messages', { text: val }, token);
    setText('');
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fs = new FormData();
    fs.append('image', file);
    await fetch('/api/upload', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: fs,
    });
    e.target.value = '';
  }
  return (
    <div className="container">
      <h2>General</h2>
      <div className="card" style={{ height: 420, overflowY: 'auto', marginBottom: 12 }}>
        {messages.map((m, idx) => (
          <div key={idx} style={{ marginBottom: 10 }}>
            <div style={{fontSize : 12, opacity : 0.7, marginBlock : 4}}></div>
            {m.kind === 'IMAGE' ? (
              <img className="msg-img" src={m.imageUrl} alt="" />
            ) : (
              <div
                style={{
                  fontSize: /^\p{Extended_Pictographic}$/u.test(m.text || '') ? '2.2rem' : '1rem',
                }}>
                {m.text}
              </div>
            )}
            {canDelete(m) && (
              <button
                onClick={() => {
                  deleteMSG(m.id);
                }}
                title="delete"
                style={{
                  position: 'absolute',
                  right: 6,
                  top: 6,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                }}>
                X
              </button>
            )}
            <div className="muted"> {new Date(m.createdAt).toLocaleTimeString()}</div>
          </div>
        ))}
      </div>

      <div className="row">
        <input
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendText()}
          style={{ flex: 1 }}
        />
        <button onClick={sendText} disabled={!text.trim()}>
          Send
        </button>
        <label
          style={{
            border: '1px solid #d1d5db',
            borderRadius: 8,
            padding: '8px 10px',
            cursor: 'pointer',
          }}>
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickFile} />
        </label>
        <button onClick={OnLogout}>Logout</button>
        <audio
          ref={audioRef}
          src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
          preload="auto"
        />
      </div>
    </div>
  );
}

export default Chat;
