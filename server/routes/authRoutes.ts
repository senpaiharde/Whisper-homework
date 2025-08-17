// server/routes/authRoutes.ts
import express from 'express';
import { rateLimit } from '../rateLimiter.js';
import {
  requestSchema,
  verifySchema,
  createAndStoreOtp,
  verifyOtp,
  signJWT,
} from '../auth.js';
import { sendBrevo } from '../email.js';

export const authRouter = express.Router();

authRouter.post('/auth/request-otp', async (req, res) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid email' });

    const { email, website } = parsed.data;

    // Honeypot: bots fill it  pretend success
    if (website && website.trim().length > 0) return res.json({ ok: true });

    const rl = rateLimit.check(email, ip);
    if (!rl.ok) return res.status(429).json({ error: rl.reason });

    const otp = await createAndStoreOtp(email, ip);
    const sent = await sendBrevo(email, otp); // never throws after step 2 below
    if (!sent.ok) console.warn('[brevo] send failed:', sent.error);

    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[/auth/request-otp] unhandled:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
});

authRouter.post('/auth/verify', async (req, res) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

    const { email, otp } = parsed.data;
    const ok = await verifyOtp(email, otp);
    if (!ok) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const token = signJWT(email);
    return res.json({ token });
  } catch (err: any) {
    console.error('[/auth/verify] unhandled:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
});