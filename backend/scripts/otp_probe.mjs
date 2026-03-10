import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

import { deliverOtp } from '../services/otpDelivery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    env: '.env',
    phone: '',
    purpose: 'verify',
    code: '',
    chatId: '',
    allowNonProd: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--env') {
      args.env = argv[i + 1] || '.env';
      i += 1;
      continue;
    }
    if (token === '--phone') {
      args.phone = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (token === '--purpose') {
      args.purpose = argv[i + 1] || 'verify';
      i += 1;
      continue;
    }
    if (token === '--code') {
      args.code = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (token === '--chat-id') {
      args.chatId = argv[i + 1] || '';
      i += 1;
      continue;
    }
    if (token === '--allow-non-prod') {
      args.allowNonProd = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
  }

  return args;
}

function printUsage() {
  console.log('Usage: node scripts/otp_probe.mjs --phone <E164> [--purpose verify|reset] [--code 1234] [--chat-id 123456789] [--env .env]');
}

function resolveEnvPath(rawPath) {
  if (!rawPath) return path.join(backendDir, '.env');
  if (path.isAbsolute(rawPath)) return rawPath;
  return path.join(backendDir, rawPath);
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('8')) return `7${digits.slice(1)}`.slice(0, 11);
  if (!digits.startsWith('7')) return `7${digits}`.slice(0, 11);
  return digits.slice(0, 11);
}

const args = parseArgs(process.argv);
if (args.help) {
  printUsage();
  process.exit(0);
}

const envPath = resolveEnvPath(args.env);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
if (!isProd && !args.allowNonProd) {
  console.error('[otp:probe] NODE_ENV is not production. Refusing to run because non-prod can fallback to console delivery.');
  console.error('[otp:probe] Use --allow-non-prod only for local diagnostics.');
  process.exit(1);
}

const phone = normalizePhone(args.phone);
if (!phone || phone.length !== 11) {
  console.error('[otp:probe] valid --phone is required');
  process.exit(1);
}

if (args.purpose !== 'verify' && args.purpose !== 'reset') {
  console.error('[otp:probe] --purpose must be verify or reset');
  process.exit(1);
}

const code = args.code || String(crypto.randomInt(0, 10000)).padStart(4, '0');

try {
  const payload = {
    phone,
    code,
    purpose: args.purpose,
  };
  const chatId = String(args.chatId || '').trim();
  if (chatId) payload.chatId = chatId;

  const result = await deliverOtp(payload);

  console.log('[otp:probe] OTP delivered');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('[otp:probe] delivery failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
