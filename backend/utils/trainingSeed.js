import { query as db } from '../db.js';
import { DEFAULT_LEARNING_TOPICS, DEFAULT_QUIZ_QUESTIONS } from './defaultTrainingContent.js';

export async function seedDefaultTrainingContent(establishmentId, userId) {
  const est = Number(establishmentId);
  if (!Number.isFinite(est) || est <= 0) return;

  const topicCountQ = await db(
    `SELECT COUNT(*)::int AS cnt
       FROM learning_topics
      WHERE establishment_id=$1`,
    [est]
  );
  const topicCount = Number(topicCountQ.rows[0]?.cnt || 0);

  if (topicCount === 0) {
    for (const topic of DEFAULT_LEARNING_TOPICS) {
      await db(
        `INSERT INTO learning_topics(establishment_id, category, title, summary, bullets, position, created_by)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
        [
          est,
          topic.category,
          topic.title,
          topic.summary,
          JSON.stringify(topic.bullets || []),
          Number(topic.position || 100),
          userId || null,
        ]
      );
    }
  }

  const quizCountQ = await db(
    `SELECT COUNT(*)::int AS cnt
       FROM quiz_questions
      WHERE establishment_id=$1`,
    [est]
  );
  const quizCount = Number(quizCountQ.rows[0]?.cnt || 0);

  if (quizCount === 0) {
    for (const question of DEFAULT_QUIZ_QUESTIONS) {
      await db(
        `INSERT INTO quiz_questions(establishment_id, question, options, correct_option, hint, position, created_by)
         VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7)`,
        [
          est,
          question.question,
          JSON.stringify(question.options || []),
          Number(question.correctOption || 0),
          question.hint || null,
          Number(question.position || 100),
          userId || null,
        ]
      );
    }
  }
}
