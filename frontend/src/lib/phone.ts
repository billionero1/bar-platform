// src/lib/phone.ts
export function phoneDigits(input: string): string {
  // только цифры, приводим к ведущей "7", максимум 11
  let d = (input || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  return d.slice(0, 11);
}

export function toDbDigits(input: string): string {
  // формат для БД и для /login-password, /register-user: 79XXXXXXXXX
  return phoneDigits(input);
}

export function toApiWithPlus(input: string): string {
  // формат для СМС-эндпоинтов: +79XXXXXXXXX
  const d = phoneDigits(input);
  return d ? '+' + d : '';
}

export function formatPhone(input: string): string {
  // красивый рендер +7 (___) ___ __ __
  const d = phoneDigits(input).padEnd(11, '_').split('');
  return `+7 (${d[1]}${d[2]}${d[3]}) ${d[4]}${d[5]}${d[6]} ${d[7]}${d[8]} ${d[9]}${d[10]}`.replace(/_/g, '').trim();
}

/**
 * Упрощённый backspace:
 * при нажатии Backspace удаляем ПОСЛЕДНЮЮ цифру телефона,
 * потом заново форматируем (проще всего и без «скачущего» курсора).
 */
export function handlePhoneBackspace(e: React.KeyboardEvent<HTMLInputElement>, setValue: (v: string)=>void, getValue: ()=>string) {
  if (e.key !== 'Backspace') return;
  e.preventDefault();
  const currentDigits = phoneDigits(getValue());
  const nextDigits = currentDigits.slice(0, -1);
  setValue(formatPhone(nextDigits));
}
