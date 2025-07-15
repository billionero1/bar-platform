import express from 'express';
import { db } from '../index.js';
import auth from '../middleware/auth.js';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_TTL } from '../index.js';

const router = express.Router();

/* Хелперы */
const normPhone = p => p.replace(/\D/g, '').replace(/^8/, '7');
const hashPw = pw => bcrypt.hash(pw, 10);

/* --- Получение всего списка сотрудников --- */
router.get('/', auth, async (req, res) => {
  if (!req.user.is_admin) return res.sendStatus(403);

  // 1️⃣ Менеджеры из users
  const managersResult = await db.query(
    `SELECT id, name, phone
     FROM users
     WHERE establishment_id = $1 AND is_admin = true
     ORDER BY name`,
    [req.user.establishment_id]
  );

  const managers = managersResult.rows.map(u => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    isAdmin: true,
    mustChangePw: false,
    source: 'user'
  }));

  // 2️⃣ Сотрудники из team
  const teamResult = await db.query(
    `SELECT id, name, phone, is_admin AS "isAdmin", must_change_pw AS "mustChangePw"
     FROM team
     WHERE establishment_id = $1
     ORDER BY name`,
    [req.user.establishment_id]
  );

  const team = teamResult.rows.map(t => ({
    ...t,
    source: 'team'
  }));

  // 3️⃣ Объединённый список
  const combined = [...managers, ...team];

  // 4️⃣ Вернуть менеджеров сверху
  combined.sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.name.localeCompare(b.name));

  res.json(combined);
});


/* --- Получить одного сотрудника для редактирования --- */
router.get('/:id', auth, async (req, res) => {
  const id = +req.params.id;
  const { rows } = await db.query(
    `SELECT id, name, surname, phone,
            is_admin AS "isAdmin",
            must_change_pw AS "mustChangePw"
     FROM team
     WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  if (!rows.length) return res.sendStatus(404);
  res.json(rows[0]);
});

/* --- Инвайт нового сотрудника --- */
router.post('/invite', auth, async (req, res) => {
  if (!req.user.is_admin) return res.sendStatus(403);

  let { name, surname, phone, isAdmin } = req.body;
  phone = normPhone(phone);
  if (phone.length < 10) return res.status(400).json({ error: 'Телефон некорректен' });

  // Проверяем, нет ли уже такого телефона
  const exists = await db.query(
    `SELECT 1 FROM team WHERE phone = $1`,
    [phone]
  );
  if (exists.rowCount > 0) {
    return res.status(400).json({ error: 'Пользователь уже зарегистрирован' });
  }

  // Генерируем временный пароль
  const tempPw = Math.random().toString(36).slice(-8);
  const pwHash = await hashPw(tempPw);

  // Генерируем invite-токен
  const inviteToken = uuidv4();

  // Записываем в team
  await db.query(
    `INSERT INTO team
       (establishment_id, phone, password_hash, name, surname,
        must_change_pw, is_admin, invite_token)
     VALUES ($1, $2, $3, $4, $5, true, $6, $7)`,
    [req.user.establishment_id, phone, pwHash, name, surname || '', !!isAdmin, inviteToken]
  );

  // Возвращаем и пароль и токен для ссылки
  res.json({ tempPassword: tempPw, inviteToken });
});

/* --- Удаление сотрудника (админ, но нельзя удалить себя) --- */
router.delete('/:id', auth, async (req, res) => {
  const id = +req.params.id;
  if (!req.user.is_admin) return res.sendStatus(403);
  if (id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить себя' });

  await db.query(
    `DELETE FROM team WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );

  res.json({ success: true });
});

/* --- Обновление сотрудника --- */
router.put('/:id', auth, async (req, res) => {
  const id = +req.params.id;
  const { name, surname, phone, isAdmin, newPassword } = req.body;

  const { rows } = await db.query(
    `SELECT id, is_admin FROM team WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });

  if (!req.user.is_admin) {
    if (req.user.id !== id) return res.status(403).json({ error: 'Нет доступа' });
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Введите новый пароль (мин. 6 символов)' });
    }

    const pwHash = await hashPw(newPassword);
    await db.query(
      `UPDATE team SET password_hash = $1, must_change_pw = false
       WHERE id = $2`,
      [pwHash, id]
    );
    return res.json({ success: true });
  }

  if (!name?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: 'Имя и телефон обязательны' });
  }

  const normedPhone = normPhone(phone);

  if (newPassword && newPassword.length >= 6) {
    const pwHash = await hashPw(newPassword);
    await db.query(
      `UPDATE team
         SET name = $1, surname = $2, phone = $3, is_admin = $4,
             password_hash = $5, must_change_pw = false
       WHERE id = $6 AND establishment_id = $7`,
      [name, surname || '', normedPhone, !!isAdmin, pwHash, id, req.user.establishment_id]
    );
  } else {
    await db.query(
      `UPDATE team
         SET name = $1, surname = $2, phone = $3, is_admin = $4
       WHERE id = $5 AND establishment_id = $6`,
      [name, surname || '', normedPhone, !!isAdmin, id, req.user.establishment_id]
    );
  }

  res.json({ success: true });
});

/* --- Принять новый пароль по токену + автологин --- */
router.post('/invite/:token', async (req, res) => {
  const token = req.params.token;
  const { password } = req.body;

  if (!token || !password || password.length < 6) {
    return res.status(400).json({ error: 'Неверные данные' });
  }

  const { rows } = await db.query(
    `SELECT id FROM team
     WHERE invite_token = $1 AND must_change_pw = true`,
    [token]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'Неверный или просроченный токен' });
  }

  const id = rows[0].id;
  const pwHash = await hashPw(password);

  await db.query(
    `UPDATE team
     SET password_hash = $1, must_change_pw = false, invite_token = NULL
     WHERE id = $2`,
    [pwHash, id]
  );

  // Получаем данные пользователя для токена
  const userRes = await db.query(
    `SELECT id, establishment_id, is_admin, name, surname
     FROM team
     WHERE id = $1`,
    [id]
  );

  const user = userRes.rows[0];

  if (!user) {
    return res.status(404).json({ error: 'Пользователь не найден после обновления пароля' });
  }

  // Генерируем токен
  const jwtToken = jwt.sign(
    {
      id: user.id,
      establishment_id: user.establishment_id,
      is_admin: user.is_admin,
      name: user.name,
      surname: user.surname
    },
    JWT_SECRET,
    { expiresIn: JWT_TTL }
  );

  res.json({
    token: jwtToken,
    isAdmin: user.is_admin,
    name: user.name,
    surname: user.surname
  });
});

/* --- Получить данные по токену для формы регистрации --- */
router.get('/invite/:token', async (req, res) => {
  const token = req.params.token;
  if (!token) return res.status(400).json({ error: 'Нет токена' });

  const { rows } = await db.query(
    `SELECT id, name, surname, phone
     FROM team
     WHERE invite_token = $1 AND must_change_pw = true`,
    [token]
  );

  if (!rows.length) return res.status(404).json({ error: 'Неверный или просроченный токен' });

  res.json(rows[0]);
});

export default router;
