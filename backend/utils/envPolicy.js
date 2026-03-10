function asString(value) {
  return String(value || '').trim();
}

function parseList(value) {
  return asString(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isPlaceholder(value) {
  const v = asString(value).toLowerCase();
  if (!v) return true;
  if (v.includes('change_me')) return true;
  if (v.includes('changeme')) return true;
  if (v.includes('example')) return true;
  if (v === 'your_secret_here') return true;
  return false;
}

function isHttpsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

function requireNonEmpty(env, name, errors) {
  const v = asString(env[name]);
  if (!v) {
    errors.push(`${name} is required`);
  }
}

function requireStrongSecret(env, name, minLength, errors) {
  const v = asString(env[name]);
  if (!v) {
    errors.push(`${name} is required`);
    return;
  }
  if (isPlaceholder(v)) {
    errors.push(`${name} must not contain placeholder value`);
    return;
  }
  if (v.length < minLength) {
    errors.push(`${name} must be at least ${minLength} characters`);
  }
}

function validateOtpConfig(env, errors, warnings) {
  const providers = parseList(env.OTP_PROVIDER_ORDER).map((x) => x.toLowerCase());
  if (!providers.length) {
    errors.push('OTP_PROVIDER_ORDER must contain at least one provider');
    return;
  }

  const knownProviders = new Set(['telegram', 'webhook']);
  const invalidProviders = providers.filter((p) => !knownProviders.has(p));
  if (invalidProviders.length) {
    errors.push(`OTP_PROVIDER_ORDER contains unknown providers: ${invalidProviders.join(', ')}`);
  }

  let hasConfiguredProvider = false;
  for (const provider of providers) {
    if (provider === 'telegram') {
      const token = asString(env.OTP_TELEGRAM_BOT_TOKEN);
      const chatIds = parseList(env.OTP_TELEGRAM_CHAT_IDS);
      if (!token || isPlaceholder(token) || !chatIds.length) {
        warnings.push('telegram provider is listed but OTP_TELEGRAM_BOT_TOKEN/OTP_TELEGRAM_CHAT_IDS are not fully configured');
      } else {
        hasConfiguredProvider = true;
      }
    }

    if (provider === 'webhook') {
      const webhookUrl = asString(env.OTP_WEBHOOK_URL);
      const webhookToken = asString(env.OTP_WEBHOOK_TOKEN);
      if (!webhookUrl || !isHttpsUrl(webhookUrl)) {
        warnings.push('webhook provider is listed but OTP_WEBHOOK_URL is missing or not https');
      } else if (!webhookToken || isPlaceholder(webhookToken) || webhookToken.length < 16) {
        warnings.push('webhook provider is listed but OTP_WEBHOOK_TOKEN is missing/weak');
      } else {
        hasConfiguredProvider = true;
      }
    }
  }

  if (!hasConfiguredProvider) {
    errors.push('no configured OTP provider found for production');
  }
}

export function validateRuntimeEnv(env = process.env) {
  const errors = [];
  const warnings = [];
  const isProd = asString(env.NODE_ENV).toLowerCase() === 'production';

  requireStrongSecret(env, 'JWT_SECRET', 32, errors);

  if (!asString(env.COOKIE_NAME)) {
    warnings.push('COOKIE_NAME is empty, default sid will be used');
  }

  if (!isProd) {
    return { isProd: false, errors, warnings };
  }

  requireNonEmpty(env, 'PGHOST', errors);
  requireNonEmpty(env, 'PGPORT', errors);
  requireNonEmpty(env, 'PGDATABASE', errors);
  requireNonEmpty(env, 'PGUSER', errors);
  requireStrongSecret(env, 'PGPASSWORD', 16, errors);
  requireStrongSecret(env, 'CSRF_SECRET', 32, errors);
  requireNonEmpty(env, 'FRONTEND_ORIGIN', errors);

  const frontendOrigin = asString(env.FRONTEND_ORIGIN);
  if (frontendOrigin && frontendOrigin.includes('localhost')) {
    errors.push('FRONTEND_ORIGIN must not point to localhost in production');
  }

  if (!['1', 'true'].includes(asString(env.FORCE_HTTPS).toLowerCase())) {
    warnings.push('FORCE_HTTPS is disabled in production');
  }

  validateOtpConfig(env, errors, warnings);

  return { isProd: true, errors, warnings };
}

export function assertRuntimeEnvSafe(env = process.env) {
  const report = validateRuntimeEnv(env);
  if (report.errors.length) {
    const details = report.errors.map((x) => `- ${x}`).join('\n');
    throw new Error(`Runtime env validation failed:\n${details}`);
  }
  return report;
}

