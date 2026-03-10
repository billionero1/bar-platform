import express from 'express';
import { query as db } from '../../db.js';
import { hasPermission, requirePermission } from '../../utils/permissions.js';

const r = express.Router();

function getEstablishmentId(req) {
  return Number(req.user?.establishment_id || 0);
}

function asInteger(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function normalizeBullets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeOptions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeTopicPayload(body) {
  return {
    category: String(body?.category || 'Общее').trim() || 'Общее',
    title: String(body?.title || '').trim(),
    summary: String(body?.summary || '').trim(),
    bullets: normalizeBullets(body?.bullets),
    position: asInteger(body?.position, 100),
  };
}

function normalizeQuestionPayload(body) {
  return {
    question: String(body?.question || '').trim(),
    options: normalizeOptions(body?.options),
    correctOption: asInteger(body?.correct_option, -1),
    hint: String(body?.hint || '').trim() || null,
    position: asInteger(body?.position, 100),
  };
}

r.get('/topics', requirePermission('training:read'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const includeArchived = hasPermission(req.user, 'training:manage') && String(req.query.include_archived || '') === '1';
    const whereArchived = includeArchived ? '' : 'AND is_active=true';

    const q = await db(
      `SELECT id, category, title, summary, bullets, position, is_active, created_at, updated_at
         FROM learning_topics
        WHERE establishment_id=$1
          ${whereArchived}
        ORDER BY position ASC, id ASC`,
      [est]
    );

    return res.json(q.rows);
  } catch (e) {
    console.error('training.topics.get error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.post('/topics', requirePermission('training:manage'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const payload = normalizeTopicPayload(req.body || {});
    if (!payload.title) {
      return res.status(400).json({ error: 'title_required' });
    }

    const ins = await db(
      `INSERT INTO learning_topics(
        establishment_id, category, title, summary, bullets, position, created_by
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
      RETURNING id`,
      [
        est,
        payload.category,
        payload.title,
        payload.summary,
        JSON.stringify(payload.bullets),
        payload.position,
        req.userId,
      ]
    );

    return res.status(201).json({ id: ins.rows[0].id });
  } catch (e) {
    console.error('training.topics.post error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.put('/topics/:id', requirePermission('training:manage'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = asInteger(req.params.id, 0);
    if (!id) return res.status(400).json({ error: 'invalid_id' });

    const payload = normalizeTopicPayload(req.body || {});
    if (!payload.title) {
      return res.status(400).json({ error: 'title_required' });
    }

    const upd = await db(
      `UPDATE learning_topics
          SET category=$1,
              title=$2,
              summary=$3,
              bullets=$4::jsonb,
              position=$5,
              updated_at=now()
        WHERE id=$6
          AND establishment_id=$7`,
      [
        payload.category,
        payload.title,
        payload.summary,
        JSON.stringify(payload.bullets),
        payload.position,
        id,
        est,
      ]
    );

    if (!upd.rowCount) return res.sendStatus(404);
    return res.sendStatus(200);
  } catch (e) {
    console.error('training.topics.put error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.delete('/topics/:id', requirePermission('training:manage'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = asInteger(req.params.id, 0);
    if (!id) return res.status(400).json({ error: 'invalid_id' });

    const upd = await db(
      `UPDATE learning_topics
          SET is_active=false,
              updated_at=now()
        WHERE id=$1
          AND establishment_id=$2
          AND is_active=true`,
      [id, est]
    );

    if (!upd.rowCount) return res.sendStatus(404);
    return res.sendStatus(200);
  } catch (e) {
    console.error('training.topics.delete error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.get('/quiz-questions', requirePermission('tests:take'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const includeArchived = hasPermission(req.user, 'tests:manage') && String(req.query.include_archived || '') === '1';
    const includeCorrect = hasPermission(req.user, 'tests:manage') && String(req.query.include_correct || '') === '1';

    const whereArchived = includeArchived ? '' : 'AND is_active=true';
    const selectCorrect = includeCorrect ? ', correct_option' : '';

    const q = await db(
      `SELECT id, question, options, hint, position, is_active, created_at, updated_at${selectCorrect}
         FROM quiz_questions
        WHERE establishment_id=$1
          ${whereArchived}
        ORDER BY position ASC, id ASC`,
      [est]
    );

    return res.json(q.rows);
  } catch (e) {
    console.error('training.quiz.get error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.post('/quiz-questions', requirePermission('tests:manage'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const payload = normalizeQuestionPayload(req.body || {});
    if (!payload.question) return res.status(400).json({ error: 'question_required' });
    if (payload.options.length < 2) return res.status(400).json({ error: 'options_required' });
    if (payload.correctOption < 0 || payload.correctOption >= payload.options.length) {
      return res.status(400).json({ error: 'correct_option_out_of_range' });
    }

    const ins = await db(
      `INSERT INTO quiz_questions(
        establishment_id, question, options, correct_option, hint, position, created_by
      )
      VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7)
      RETURNING id`,
      [
        est,
        payload.question,
        JSON.stringify(payload.options),
        payload.correctOption,
        payload.hint,
        payload.position,
        req.userId,
      ]
    );

    return res.status(201).json({ id: ins.rows[0].id });
  } catch (e) {
    console.error('training.quiz.post error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.put('/quiz-questions/:id', requirePermission('tests:manage'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = asInteger(req.params.id, 0);
    if (!id) return res.status(400).json({ error: 'invalid_id' });

    const payload = normalizeQuestionPayload(req.body || {});
    if (!payload.question) return res.status(400).json({ error: 'question_required' });
    if (payload.options.length < 2) return res.status(400).json({ error: 'options_required' });
    if (payload.correctOption < 0 || payload.correctOption >= payload.options.length) {
      return res.status(400).json({ error: 'correct_option_out_of_range' });
    }

    const upd = await db(
      `UPDATE quiz_questions
          SET question=$1,
              options=$2::jsonb,
              correct_option=$3,
              hint=$4,
              position=$5,
              updated_at=now()
        WHERE id=$6
          AND establishment_id=$7`,
      [
        payload.question,
        JSON.stringify(payload.options),
        payload.correctOption,
        payload.hint,
        payload.position,
        id,
        est,
      ]
    );

    if (!upd.rowCount) return res.sendStatus(404);
    return res.sendStatus(200);
  } catch (e) {
    console.error('training.quiz.put error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.delete('/quiz-questions/:id', requirePermission('tests:manage'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const id = asInteger(req.params.id, 0);
    if (!id) return res.status(400).json({ error: 'invalid_id' });

    const upd = await db(
      `UPDATE quiz_questions
          SET is_active=false,
              updated_at=now()
        WHERE id=$1
          AND establishment_id=$2
          AND is_active=true`,
      [id, est]
    );

    if (!upd.rowCount) return res.sendStatus(404);
    return res.sendStatus(200);
  } catch (e) {
    console.error('training.quiz.delete error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default r;
