import express from 'express';
import { query as dbQuery } from '../db.js';
import auth from '../middleware/auth.js';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

const {
  JWT_SECRET = 'dev_secret_change_me',
  JWT_TTL = '30d',
} = process.env;

const db = { query: (t, p) => dbQuery(t, p) };
const router = express.Router();

/* Хелперы */
const normPhone = p => String(p || '').replace(/\D/g, '').replace(/^8/, '7');
const hashPw = pw => bcrypt.hash(pw, 10);

/* --- Получение всего списка сотрудников --- */
router.get('/', auth, async (req, res) => {
  if (!req.user.is_admin) return res.sendStatus(403);

  // users
  const usersResult = await db.query(
    `SELECT id, name, phone, is_admin AS "isAdmin"
       FROM users
      WHERE establishment_id = $1
      ORDER BY is_admin DESC, name`,
    [req.user.establishment_id]
  );

  const users = usersResult.rows.map(u => ({
    id: u.id,
    name: u.name,
    phone: u.phone,
    isAdmin: u.isAdmin,
    mustChangePw: false,
    source: 'user'
  }));

  // team (приглашённые)
  const teamResult = await db.query(
    `SELECT id, name, phone, is_admin AS "isAdmin", must_change_pw AS "mustChangePw"
       FROM team
      WHERE establishment_id = $1
      ORDER BY is_admin DESC, name`,
    [req.user.establishment_id]
  );

  const team = teamResult.rows.map(t => ({ ...t, source: 'team' }));
  res.json([...users, ...team]);
});

/* --- Получить конкретного сотрудника --- */
router.get('/:id', auth, async (req, res) => {
  const id = +req.params.id;

  let result = await db.query(
    `SELECT id, name, surname, phone,
            is_admin AS "isAdmin",
            must_change_pw AS "mustChangePw"
       FROM team
      WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  if (result.rows.length) return res.json({ ...result.rows[0], source: 'team' });

  result = await db.query(
    `SELECT id, name, surname, phone,
            is_admin AS "isAdmin"
       FROM users
      WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  if (!result.rows.length) return res.sendStatus(404);

  return res.json({ ...result.rows[0], mustChangePw: false, source: 'user' });
});

/* --- Инвайт нового сотрудника (только админ) --- */
router.post('/invite', auth, async (req, res) => {
  if (!req.user.is_admin) return res.sendStatus(403);

  let { name, surname, phone, isAdmin } = req.body || {};
  phone = normPhone(phone);
  if (!phone || phone.length < 10) return res.status(400).json({ error: 'Телефон некорректен' });

  // нет ли уже такого телефона в users ИЛИ team
  const exists = await db.query(
    `SELECT 1 FROM users WHERE phone = $1 AND establishment_id = $2
     UNION ALL
     SELECT 1 FROM team  WHERE phone = $1 AND establishment_id = $2
     LIMIT 1`,
    [phone, req.user.establishment_id]
  );
  if (exists.rowCount > 0) {
    return res.status(400).json({ error: 'Пользователь уже зарегистрирован' });
  }

  // временный пароль + токен
  const tempPw = Math.random().toString(36).slice(-8);
  const pwHash = await hashPw(tempPw);
  const inviteToken = uuidv4();

  await db.query(
    `INSERT INTO team
       (establishment_id, phone, password_hash, name, surname,
        must_change_pw, is_admin, invite_token)
     VALUES ($1, $2, $3, $4, $5, true, $6, $7)`,
    [req.user.establishment_id, phone, pwHash, name || '', surname || '', !!isAdmin, inviteToken]
  );

  res.json({ tempPassword: tempPw, inviteToken });
});

/* --- Удаление сотрудника (админ, нельзя удалить себя) --- */
router.delete('/:id', auth, async (req, res) => {
  const id = +req.params.id;
  if (!req.user.is_admin) return res.sendStatus(403);
  if (id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить себя' });

  try {
    await db.query(
      `DELETE FROM users WHERE id = $1 AND establishment_id = $2`,
      [id, req.user.establishment_id]
    );
    await db.query(
      `DELETE FROM team WHERE id = $1 AND establishment_id = $2`,
      [id, req.user.establishment_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка при удалении:', err);
    res.status(500).json({ error: 'Ошибка при удалении пользователя' });
  }
});

/* --- Обновление сотрудника (users или team) --- */
router.put('/:id', auth, async (req, res) => {
  const id = +req.params.id;
  const { name, surname, phone, isAdmin, newPassword } = req.body || {};
  if (!name?.trim() || !phone?.trim()) {
    return res.status(400).json({ error: 'Имя и телефон обязательны' });
  }
  const normedPhone = normPhone(phone);

  // users?
  const userResult = await db.query(
    `SELECT id FROM users WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  if (userResult.rowCount > 0) {
    if (newPassword && newPassword.length >= 6) {
      const pwHash = await hashPw(newPassword);
      await db.query(
        `UPDATE users
            SET name = $1, surname = $2, phone = $3, is_admin = $4, password_hash = $5
          WHERE id = $6 AND establishment_id = $7`,
        [name, surname || '', normedPhone, !!isAdmin, pwHash, id, req.user.establishment_id]
      );
    } else {
      await db.query(
        `UPDATE users
            SET name = $1, surname = $2, phone = $3, is_admin = $4
          WHERE id = $5 AND establishment_id = $6`,
        [name, surname || '', normedPhone, !!isAdmin, id, req.user.establishment_id]
      );
    }
    return res.json({ success: true });
  }

  // team?
  const teamResult = await db.query(
    `SELECT id FROM team WHERE id = $1 AND establishment_id = $2`,
    [id, req.user.establishment_id]
  );
  if (teamResult.rowCount === 0) return res.status(404).json({ error: 'Пользователь не найден' });

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

/* --- Принять новый пароль по инвайту + автологин --- */
router.post('/invite/:token', async (req, res) => {
  const token = req.params.token;
  const { password } = req.body || {};
  if (!token || !password || password.length < 6) {
    return res.status(400).json({ error: 'Неверные данные' });
  }

  const { rows } = await db.query(
    `SELECT * FROM team WHERE invite_token = $1 AND must_change_pw = true`,
    [token]
  );
  if (!rows.length) return res.status(404).json({ error: 'Неверный или просроченный токен' });

  const invited = rows[0];
  const pwHash = await hashPw(password);

  // создать/обновить в users
  const userCheck = await db.query(
    `SELECT id FROM users WHERE phone = $1`,
    [invited.phone]
  );
  if (userCheck.rowCount === 0) {
    await db.query(
      `INSERT INTO users (establishment_id, phone, password_hash, is_admin, name, surname)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [invited.establishment_id, invited.phone, pwHash, invited.is_admin, invited.name, invited.surname || '']
    );
  } else {
    await db.query(
      `UPDATE users
          SET password_hash = $1, is_admin = $2, name = $3, surname = $4
        WHERE phone = $5`,
      [pwHash, invited.is_admin, invited.name, invited.surname || '', invited.phone]
    );
  }

  // собрать JWT c названием заведения
  const userRes = await db.query(
    `SELECT id, establishment_id, is_admin, name, surname
       FROM users WHERE phone = $1`,
    [invited.phone]
  );
  const user = userRes.rows[0];

  const estRes = await db.query(
    `SELECT name FROM establishments WHERE id = $1`,
    [user.establishment_id]
  );
  const establishment_name = estRes.rows[0]?.name || '';

  const jwtToken = jwt.sign(
    {
      id: user.id,
      establishment_id: user.establishment_id,
      is_admin: user.is_admin,
      name: user.name,
      surname: user.surname,
      establishment_name,
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

  // удалить инвайт
  process.nextTick(async () => {
    try {
      await db.query(`DELETE FROM team WHERE id = $1`, [invited.id]);
    } catch (err) {
      console.error('Ошибка при удалении инвайта:', err);
    }
  });
});

/* --- Данные для формы регистрации по токену --- */
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
