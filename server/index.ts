import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import { requireAuth } from './auth.js';
import { rateLimit } from './rateLimiter.js';
import { requestSchema, verifySchema, createAndStoreOtp, verifyOtp, signJWT } from './auth.js';
import { sendBrevo } from './email.js';
import { includes } from 'zod/v4';
import jwt from 'jsonwebtoken';
import { authRouter } from './routes/authRoutes.js';
// init
const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: 'http://localhost:5173' } });

const PORT = Number(process.env.SERVER_PORT || 4000);
server.listen(PORT, () => console.log(`🚀  Server running on http://localhost:${PORT}`));
// file uploads
const UP = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UP)) fs.mkdirSync(UP, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png','image/jpeg','image/webp','image/gif','image/jpg'].includes(file.mimetype);
    cb(ok ? null as any : new Error('invalid-mime'), ok);
  },
  limits: { fileSize: 8 * 1024 * 1024 }
});

// middleware
app.use(cors());

app.use(express.json());
app.use('/auth', authRouter);

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('no-token'));
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    (socket as any).userEmail = (payload as any).sub;
    next();
  } catch {
    next(new Error('bad-token'));
  }
});

io.on('connection', (s) => {
  console.log('socket ok:', (s as any).userEmail, s.id);
});

const msgBucket = new Map<string, number[]>();
function canSendNow(email: string) {
  const now = Date.now();
  const arr = msgBucket.get(email) || [];
  const kept = arr.filter((t) => now - t < 5000);
  if (kept.length >= 8) {
    msgBucket.set(email, kept);
    return false;
  }
  kept.push(now);
  msgBucket.set(email, kept);
  return true;
}

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));


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

  if (!canSendNow(email)) return res.status(429).json({ error: 'Slow down' });
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
  if (!canSendNow(email)) return res.status(429).json({ error: 'Slow down' });
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
