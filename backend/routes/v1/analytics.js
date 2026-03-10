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

r.get('/kpi', requirePermission('kpi:view'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();

    const filters = [];
    const params = [est];

    if (from) {
      params.push(from);
      filters.push(`shift_date >= $${params.length}::date`);
    }
    if (to) {
      params.push(to);
      filters.push(`shift_date <= $${params.length}::date`);
    }

    const whereSuffix = filters.length ? `AND ${filters.join(' AND ')}` : '';

    const rowsQ = await db(
      `SELECT
          id,
          shift_date,
          guests_count,
          orders_count,
          revenue,
          writeoff_cost,
          avg_ticket,
          notes,
          created_at,
          updated_at
       FROM shift_kpis
      WHERE establishment_id = $1
        ${whereSuffix}
      ORDER BY shift_date DESC
      LIMIT 120`,
      params
    );

    const totalsQ = await db(
      `SELECT
          COUNT(*)::int AS shifts,
          COALESCE(SUM(guests_count), 0)::int AS guests_total,
          COALESCE(SUM(orders_count), 0)::int AS orders_total,
          COALESCE(SUM(revenue), 0) AS revenue_total,
          COALESCE(SUM(writeoff_cost), 0) AS writeoff_total
       FROM shift_kpis
      WHERE establishment_id = $1
        ${whereSuffix}`,
      params
    );

    const totals = totalsQ.rows[0];
    const revenueTotal = Number(totals.revenue_total || 0);
    const ordersTotal = Number(totals.orders_total || 0);

    return res.json({
      rows: rowsQ.rows,
      totals: {
        ...totals,
        avg_ticket_total: ordersTotal > 0 ? +(revenueTotal / ordersTotal).toFixed(2) : 0,
      },
    });
  } catch (e) {
    console.error('analytics.kpi.get error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

r.post('/kpi', requirePermission('kpi:edit'), async (req, res) => {
  try {
    const est = getEstablishmentId(req);
    if (!est) return res.status(403).json({ error: 'establishment_required' });

    const shiftDate = String(req.body?.shift_date || '').trim();
    if (!shiftDate) return res.status(400).json({ error: 'shift_date_required' });

    const guestsCount = Math.max(0, Math.round(asNumber(req.body?.guests_count, 0)));
    const ordersCount = Math.max(0, Math.round(asNumber(req.body?.orders_count, 0)));
    const revenue = Math.max(0, asNumber(req.body?.revenue, 0));
    const writeoffCost = Math.max(0, asNumber(req.body?.writeoff_cost, 0));
    const avgTicket = ordersCount > 0 ? +(revenue / ordersCount).toFixed(2) : 0;
    const notes = String(req.body?.notes || '').trim() || null;

    const upsert = await db(
      `INSERT INTO shift_kpis(
        establishment_id, shift_date, recorded_by, guests_count, orders_count, revenue, writeoff_cost, avg_ticket, notes
      )
      VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (establishment_id, shift_date)
      DO UPDATE SET
        recorded_by = EXCLUDED.recorded_by,
        guests_count = EXCLUDED.guests_count,
        orders_count = EXCLUDED.orders_count,
        revenue = EXCLUDED.revenue,
        writeoff_cost = EXCLUDED.writeoff_cost,
        avg_ticket = EXCLUDED.avg_ticket,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING id, shift_date, guests_count, orders_count, revenue, writeoff_cost, avg_ticket, notes, updated_at`,
      [est, shiftDate, req.userId, guestsCount, ordersCount, revenue, writeoffCost, avgTicket, notes]
    );

    return res.json(upsert.rows[0]);
  } catch (e) {
    console.error('analytics.kpi.post error', e);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export default r;
