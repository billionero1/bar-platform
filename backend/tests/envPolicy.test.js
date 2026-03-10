import test from 'node:test';
import assert from 'node:assert/strict';

import { validateRuntimeEnv } from '../utils/envPolicy.js';

test('validateRuntimeEnv reports production placeholder errors', () => {
  const env = {
    NODE_ENV: 'production',
    JWT_SECRET: 'CHANGE_ME_JWT_SECRET',
    PGPASSWORD: 'CHANGE_ME_DB_PASSWORD',
    CSRF_SECRET: 'CHANGE_ME_CSRF_SECRET',
    PGHOST: '127.0.0.1',
    PGPORT: '5432',
    PGDATABASE: 'appdb',
    PGUSER: 'app',
    FRONTEND_ORIGIN: 'https://staging.example.com',
    OTP_PROVIDER_ORDER: 'telegram',
    OTP_TELEGRAM_BOT_TOKEN: '',
    OTP_TELEGRAM_CHAT_IDS: '',
  };

  const report = validateRuntimeEnv(env);
  assert.equal(report.isProd, true);
  assert.ok(report.errors.length > 0);
});

test('validateRuntimeEnv accepts configured production env', () => {
  const env = {
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(40),
    PGPASSWORD: 'y'.repeat(20),
    CSRF_SECRET: 'z'.repeat(40),
    PGHOST: '127.0.0.1',
    PGPORT: '5432',
    PGDATABASE: 'appdb',
    PGUSER: 'app',
    FRONTEND_ORIGIN: 'https://staging.example.com',
    FORCE_HTTPS: '1',
    OTP_PROVIDER_ORDER: 'webhook',
    OTP_WEBHOOK_URL: 'https://otp.example.com/hook',
    OTP_WEBHOOK_TOKEN: 't'.repeat(24),
  };

  const report = validateRuntimeEnv(env);
  assert.deepEqual(report.errors, []);
});

