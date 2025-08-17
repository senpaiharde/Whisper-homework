export async function sendBrevo(toEmail: string, code: string) {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    console.log(`[DEV OTP] ${toEmail} -> ${code}`);
    return { ok: true as const };
  }

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Whisper', email: 'xxslavan1@gmail.com' },
        to: [{ email: toEmail }],
        subject: 'Your login code',
        htmlContent: `<p>Your code: <b>${code}</b> (valid 10 minutes)</p>`,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.warn('[brevo] non-200', resp.status, text);
      return { ok: false as const, error: `brevo ${resp.status}` };
    }
    return { ok: true as const };
  } catch (e: any) {
    console.error('[brevo] exception', e?.message || e);
    return { ok: false as const, error: 'brevo-exception' };
  }
}
