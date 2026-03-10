function asIntegerOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function sanitizeAnswersMap(rawAnswers) {
  if (!rawAnswers || typeof rawAnswers !== 'object' || Array.isArray(rawAnswers)) {
    return {};
  }

  const result = {};
  for (const [key, value] of Object.entries(rawAnswers)) {
    const id = asIntegerOrNull(key);
    const answer = asIntegerOrNull(value);
    if (id === null || id <= 0 || answer === null) continue;
    result[String(id)] = answer;
  }
  return result;
}

export function calculateQuizResult(questions, rawAnswers) {
  const answers = sanitizeAnswersMap(rawAnswers);
  const safeQuestions = Array.isArray(questions) ? questions : [];

  let correctAnswers = 0;
  for (const q of safeQuestions) {
    const id = Number(q?.id);
    const correctOption = Number(q?.correct_option);
    if (!Number.isFinite(id) || !Number.isFinite(correctOption)) continue;
    if (answers[String(Math.trunc(id))] === Math.trunc(correctOption)) {
      correctAnswers += 1;
    }
  }

  const totalQuestions = safeQuestions.length;
  const score = totalQuestions > 0
    ? Math.round((correctAnswers / totalQuestions) * 100)
    : 0;

  return {
    answers,
    totalQuestions,
    correctAnswers,
    score,
  };
}
