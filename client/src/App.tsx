import React, { useState } from 'react';
import Chat from './Chat.js';
import Login from './Login.js';

function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('token') || '');

  function logout() {
    localStorage.removeItem('token');
    setToken('');
  }

  return token ? <Chat token={token} OnLogout={logout} /> : <Login onAuthed={setToken} />;
}

export default App;
