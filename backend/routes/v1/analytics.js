import express from 'express';
import { query as db } from '../../db.js';
import { hasPermission, requirePermission } from '../../utils/permissions.js';
import { calculateQuizResult, sanitizeAnswersMap } from '../../utils/quiz.js';

const r = express.Router();

function getEstablishmentId(req) {
  return Number(req.user?.establishment_id || 0);
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

r.post('/quiz-attempts', requirePermission('tests:take'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const durationSec = Math.max(0, Math.round(asNumber(req.body?.duration_sec, 0)));
    const answers = sanitizeAnswersMap(req.body?.answers);

    const questionsQ = await db(
      `SELECT id, correct_option
         FROM quiz_questions
        WHERE establishment_id=$1
          AND is_active=true
        ORDER BY position ASC, id ASC`,
      [est]
    );
    if (!questionsQ.rowCount) {
      return res.status(400).json({ error: 'quiz_not_configured' });
    }

    const result = calculateQuizResult(questionsQ.rows, answers);
    if (result.totalQuestions <= 0) {
      return res.status(400).json({ error: 'quiz_not_configured' });
    }

    const ins = await db(
      `INSERT INTO quiz_attempts(
        establishment_id, user_id, score, total_questions, correct_answers, answers, duration_sec
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
      RETURNING id, created_at, score, total_questions, correct_answers`,
      [
        est,
        req.userId,
        result.score,
        result.totalQuestions,
        result.correctAnswers,
        JSON.stringify(result.answers),
        durationSec,
      ]
    );

    return res.status(201).json(ins.rows[0]);
  } catch (e) {
    console.error('analytics.quiz.post error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.get('/quiz-summary', requirePermission('tests:take'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const canTeam = hasPermission(req.user, 'tests:analytics_team');
    const scope = canTeam ? 'team' : 'own';
    const whereOwn = canTeam ? '' : 'AND qa.user_id = $2';
    const params = canTeam ? [est] : [est, req.userId];

    const totalsQ = await db(
      `SELECT
          COUNT(*)::int AS attempts,
          COALESCE(ROUND(AVG(score)::numeric, 2), 0) AS avg_score,
          COALESCE(MAX(score), 0)::int AS best_score,
          COUNT(DISTINCT user_id)::int AS participants
       FROM quiz_attempts qa
      WHERE qa.establishment_id = $1
        ${whereOwn}`,
      params
    );

    const latestQ = await db(
      `SELECT
          qa.id,
          qa.user_id,
          qa.score,
          qa.total_questions,
          qa.correct_answers,
          qa.duration_sec,
          qa.created_at,
          u.name AS user_name,
          u.phone AS user_phone
       FROM quiz_attempts qa
       JOIN users u ON u.id = qa.user_id
      WHERE qa.establishment_id = $1
        ${whereOwn}
      ORDER BY qa.created_at DESC
      LIMIT 20`,
      params
    );

    const trendQ = await db(
      `SELECT
          qa.created_at::date AS day,
          COUNT(*)::int AS attempts,
          COALESCE(ROUND(AVG(qa.score)::numeric, 2), 0) AS avg_score
       FROM quiz_attempts qa
      WHERE qa.establishment_id = $1
        ${whereOwn}
      GROUP BY qa.created_at::date
      ORDER BY qa.created_at::date DESC
      LIMIT 14`,
      params
    );

    return res.json({
      scope,
      totals: totalsQ.rows[0],
      latest: latestQ.rows,
      trend: trendQ.rows,
    });
  } catch (e) {
    console.error('analytics.quiz.get error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default r;
