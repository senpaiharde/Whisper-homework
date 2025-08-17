import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';

const prisma = new PrismaClient();
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer') ? auth.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    (req as any).userEmail = (payload as any).sub; // attach email for downstream
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export const requestSchema = z.object({
  email: z.string().email(),
  // honeypot field (real users leave empty)
  website: z.string().optional().default(''),
});

export const verifySchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
});

function hashOtp(otp: string) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function makeOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function createAndStoreOtp(email: string, ip?: string) {
  const otp = makeOtp();
  await prisma.loginOtp.create({
    data: {
      email,
      otpHash: hashOtp(otp),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      ip,
    },
  });
  // ensure user exists (optional but nice)
  await prisma.user.upsert({ where: { email }, update: {}, create: { email } });
  return otp;
}

export async function verifyOtp(email: string, otp: string) {
  const now = new Date();
  const rec = await prisma.loginOtp.findFirst({
    where: { email, otpHash: hashOtp(otp), used: false, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
  if (!rec) return false;
  await prisma.loginOtp.update({ where: { id: rec.id }, data: { used: true } });
  return true;
}

export function signJWT(email: string) {
  const secret = process.env.JWT_SECRET || 'devsecret';
  return jwt.sign({ sub: email }, secret, { expiresIn: '7d' });
}
