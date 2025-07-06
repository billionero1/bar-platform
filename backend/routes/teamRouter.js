import express from 'express';
import { db } from '../index.js';
import auth from '../middleware/auth.js';

// Простая "затычка", если вдруг не экспортирован normPhone/hashPw
const normPhone = p => p.replace(/\D/g, '').replace(/^8/, '7');
const hashPw = async pw => pw; // Тут подменить на реальный hash, если нужно
// const hashPw = async pw => require('bcrypt').hash(pw, 10); // Если хочешь по-настоящему

const router = express.Router();

// --- Рабочий GET: всегда должен работать! ---
router.get('/', auth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, phone, is_admin AS "isAdmin", must_change_pw AS "mustChangePw"
     FROM users
     WHERE establishment_id = $1
     ORDER BY is_admin DESC, name`,
    [req.user.establishment_id]
  );
  res.json(rows);
});

// --- Получить одного пользователя (для формы редактирования) ---
router.get('/:id', auth, async (req, res) => {
  const id = +req.params.id;
  const { rows } = await db.query(
    `SELECT id, name, phone, is_admin AS "isAdmin", must_change_pw AS "mustChangePw"
     FROM users
     WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  if (!rows.length) return res.sendStatus(404);
  res.json(rows[0]);
});

// --- Инвайт нового пользователя ---
router.post('/invite', auth, async (req, res) => {
  if (!req.user.is_admin) return res.sendStatus(403);

  let { name, phone, isAdmin } = req.body;
  phone = normPhone(phone);
  if (phone.length < 10) return res.status(400).json({ error: 'Телефон' });

  const exists = await db.query('SELECT 1 FROM users WHERE phone = $1', [phone]);
  if (exists.rowCount > 0)
    return res.status(400).json({ error: 'Уже зарегистрирован' });

  const tempPw = Math.random().toString(36).slice(-8);
  // Хешируй нормально если хочешь: const pwHash = await hashPw(tempPw);
  const pwHash = tempPw; // Пока что без хеша

  await db.query(
    `INSERT INTO users
       (establishment_id, phone, password_hash, name, must_change_pw, is_admin)
     VALUES ($1, $2, $3, $4, true, $5)`,
    [req.user.establishment_id, phone, pwHash, name, !!isAdmin]
  );

  // TODO: отправить SMS или Telegram с tempPw (по желанию)
  res.json({ tempPassword: tempPw });
});

// --- Удаление сотрудника (только админ, нельзя удалить себя) ---
router.delete('/:id', auth, async (req, res) => {
  const id = +req.params.id;
  if (!req.user.is_admin) return res.sendStatus(403);
  if (id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить себя' });
  await db.query(
    `DELETE FROM users WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  res.json({ success: true });
});

// --- Обновление сотрудника (опционально, если фронт будет использовать) ---
router.put('/:id', auth, async (req, res) => {
  const id = +req.params.id;
  const { name, phone, isAdmin, newPassword } = req.body;

  // Сначала получаем юзера по id и establishment
  const { rows } = await db.query(
    `SELECT id, is_admin FROM users WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });

  // Если НЕ админ — разрешаем менять только свой пароль
  if (!req.user.is_admin) {
    if (req.user.id !== id) return res.status(403).json({ error: 'Нет доступа' });
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Введите новый пароль (минимум 6 символов)' });
    }
    // Меняем только пароль!
    // В реальном коде: const pwHash = await hashPw(newPassword);
    const pwHash = newPassword;
    await db.query(
      `UPDATE users SET password_hash = $1, must_change_pw = false WHERE id = $2`,
      [pwHash, id]
    );
    return res.json({ success: true });
  }

  // Если админ — может всё (включая смену пароля)
  // Проверка данных (но пароль можно не передавать)
  if (!name?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: 'Имя и телефон обязательны' });
  }
  const normedPhone = phone.replace(/\D/g, '').replace(/^8/, '7');

  // Меняем всё (но только если были переданы)
  if (newPassword && newPassword.length >= 6) {
    // В реальном коде: const pwHash = await hashPw(newPassword);
    const pwHash = newPassword;
    await db.query(
      `UPDATE users SET name = $1, phone = $2, is_admin = $3, password_hash = $4, must_change_pw = false WHERE id = $5 AND establishment_id = $6`,
      [name, normedPhone, !!isAdmin, pwHash, id, req.user.establishment_id]
    );
  } else {
    await db.query(
      `UPDATE users SET name = $1, phone = $2, is_admin = $3 WHERE id = $4 AND establishment_id = $5`,
      [name, normedPhone, !!isAdmin, id, req.user.establishment_id]
    );
  }
  res.json({ success: true });
});



export default router;
