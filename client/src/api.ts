import { error } from 'console';

export async function postDate<T>(url: string, body: unknown, token?: string): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const text = await r.text(); // read once
  if (!r.ok) {
    // try to parse { error } if provided
    try {
      const j = JSON.parse(text);
      throw new Error(j.error || `HTTP ${r.status}`);
    } catch {
      throw new Error(text || `HTTP ${r.status}`);
    }
  }
  return text ? JSON.parse(text) : ({} as T);
}

export async function GetDate<T>(url: string, token?: string): Promise<T> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

export async function DeleteDate<T>(url: string, token: string): Promise<T> {
  const r = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  const txt = await r.text();
  if (!r.ok) {
    try {
      throw new Error(JSON.parse(txt).error);
    } catch {
      throw new Error(txt || `HTTP ${r.status}`);
    }
  }
  return txt ? JSON.parse(txt) : ({} as T);
}

export async function uploadImage<T = { message: any }>(file: File, token: string): Promise<T> {
  const fd = new FormData();
  fd.append('image', file);
  const r = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }, 
    body: fd,
  });
  const txt = await r.text();
  if (!r.ok) {
    try {
      throw new Error(JSON.parse(txt).error);
    } catch {
      throw new Error(txt || `HTTP ${r.status}`);
    }
  }
  return txt ? JSON.parse(txt) : ({} as T);
}
