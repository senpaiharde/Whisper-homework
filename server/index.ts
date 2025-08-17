import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

import { requireAuth } from './auth.js';
import { rateLimit } from './rateLimiter.js';
import { requestSchema, verifySchema, createAndStoreOtp, verifyOtp, signJWT } from './auth.js';
import { sendBrevo } from './email.js';
import { includes } from 'zod/v4';

// init
const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = Number(process.env.SERVER_PORT || 4000);
server.listen(PORT, () => console.log(`🚀  Server running on http://localhost:${PORT}`));
// file uploads
const upload = multer({ dest: path.join(process.cwd(), 'uploads') });

// middleware
app.use(cors());

app.use(express.json());

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.post('/auth/request-otp', async (req, res) => {
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

app.post('/auth/verify', async (req, res) => {
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

async function getOrCreateUserAndChat(email: string) {
  const [user, chat] = await Promise.all([
    prisma.user.upsert({
      where: { email },
      update: {},
      create: { email },
    }),
    prisma.chat.upsert({
      where: { name: 'General' },
      update: {},
      create: { name: 'General' },
    }),
  ]);
  return { user, chat };
}

// POST /api/messages
app.post('/api/messages', requireAuth, async (req, res) => {
  const email = (req as any).userEmail as string;
  const { chat, user } = await getOrCreateUserAndChat(email);
  const { text } = req.body as { text?: string };
  const msg = await prisma.message.create({
    data: { chatId: chat.id, userId: user.id, kind: 'TEXT', text: text ?? '' },
  });
  const wire = { ...msg, userEmail: user.email };
  io.emit('message:new', msg);
  res.json({ message: wire });
});

// POST /api/upload
app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
  const email = (req as any).userEmail as string;
  const { chat, user } = await getOrCreateUserAndChat(email);
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'No file' });
  const msg = await prisma.message.create({
    data: {
      chatId: chat.id,
      userId: user.id,
      kind: 'IMAGE',
      imageUrl: `/uploads/${file.filename}`,
    },
  });
  const wire = { ...msg, userEmail: user.email };
  io.emit('message:new', msg);
  res.json({ message: wire });
});
// get section
//
//
//
//
//
//
app.get('/api/me', requireAuth, (req, res) => {
  const email = (req as any).userEmail as string;
  res.json({ email });
});
// GET /api/messages
app.get('/api/messages', requireAuth, async (req, res) => {
  const email = (req as any).userEmail as string;
  const { chat } = await getOrCreateUserAndChat(email);

  const rows = await prisma.message.findMany({
    where: { chatId: chat.id },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { email: true } } },
  });

  const messages = rows.map((m) => ({
    id: m.id,
    kind: m.kind,
    text: m.text,
    imageUrl: m.imageUrl,
    createdAt: m.createdAt,
    userEmail: m.user?.email || null,
  }));

  res.json({ messages });
});

/// delete section11

app.delete('/api/messages/:id', requireAuth, async (req, res) => {
  const email = (req as any).userEmail as string;
  const user = await prisma.user.findUnique({ where: { email } });
  const msg = await prisma.message.findUnique({ where: { id: req.params.id } });

  if (!msg) return res.status(404).json({ error: 'not found!' });
  if (!user || msg.userId !== user.id) return res.status(403).json({ error: 'not allowed' });

  await prisma.message.delete({ where: { id: msg.id } });
  io.emit('message:deleted', { id: msg.id });
  res.json({ ok: true });
});
