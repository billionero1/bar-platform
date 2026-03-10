function isProd() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

function parseChatIds(raw) {
  return String(raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildMessage({ phone, code, purpose }) {
  const mode = purpose === 'reset' ? 'Восстановление пароля' : 'Подтверждение регистрации';
  const now = new Date().toISOString();
  return [
    '<b>OTP-код ProBar</b>',
    `Режим: ${escapeHtml(mode)}`,
    `Телефон: <code>${escapeHtml(phone)}</code>`,
    `Код: <b>${escapeHtml(code)}</b>`,
    `Время: <code>${escapeHtml(now)}</code>`,
  ].join('\n');
}

async function sendTelegramOtp(payload) {
  const botToken = String(process.env.OTP_TELEGRAM_BOT_TOKEN || '').trim();
  const chatIds = parseChatIds(process.env.OTP_TELEGRAM_CHAT_IDS);
  if (!botToken || !chatIds.length) {
    throw new Error('telegram_not_configured');
  }

  const apiBase = String(process.env.OTP_TELEGRAM_API_BASE || 'https://api.telegram.org').trim().replace(/\/+$/, '');
  const message = buildMessage(payload);
  let delivered = 0;

  for (const chatId of chatIds) {
    const response = await fetch(`${apiBase}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`telegram_send_failed:${response.status}:${body}`);
    }

    delivered += 1;
  }

  return {
    provider: 'telegram',
    deliveredTo: delivered,
  };
}

async function sendWebhookOtp(payload) {
  const webhookUrl = String(process.env.OTP_WEBHOOK_URL || '').trim();
  if (!webhookUrl) {
    throw new Error('webhook_not_configured');
  }

  const headers = {
    'Content-Type': 'application/json',
  };
  const token = String(process.env.OTP_WEBHOOK_TOKEN || '').trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'otp',
      purpose: payload.purpose,
      phone: payload.phone,
      code: payload.code,
      created_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`webhook_send_failed:${response.status}:${body}`);
  }

  return {
    provider: 'webhook',
    deliveredTo: 1,
  };
}

export async function deliverOtp(payload) {
  const phone = String(payload?.phone || '').trim();
  const code = String(payload?.code || '').trim();
  const purpose = String(payload?.purpose || '').trim();

  if (!phone || !code || !purpose) {
    throw new Error('otp_payload_invalid');
  }

  const providers = String(process.env.OTP_PROVIDER_ORDER || 'telegram,webhook')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  const errors = [];
  for (const provider of providers) {
    try {
      if (provider === 'telegram') {
        return await sendTelegramOtp({ phone, code, purpose });
      }
      if (provider === 'webhook') {
        return await sendWebhookOtp({ phone, code, purpose });
      }
    } catch (error) {
      errors.push({ provider, message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (!isProd()) {
    console.log(`[OTP:${purpose}] ${phone} -> ${code}`);
    return {
      provider: 'console',
      deliveredTo: 1,
      fallback: true,
      errors,
    };
  }

  if (!providers.length) {
    throw new Error('otp_delivery_not_configured');
  }

  throw new Error(`otp_delivery_failed:${JSON.stringify(errors)}`);
}
