import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateQuizResult, sanitizeAnswersMap } from '../utils/quiz.js';

test('sanitizeAnswersMap keeps only numeric keys and values', () => {
  const map = sanitizeAnswersMap({
    1: 2,
    2: '1',
    bad: 3,
    3: 'x',
    4: null,
  });

  assert.deepEqual(map, {
    '1': 2,
    '2': 1,
  });
});

test('calculateQuizResult computes score on server answers', () => {
  const questions = [
    { id: 1, correct_option: 2 },
    { id: 2, correct_option: 0 },
    { id: 3, correct_option: 1 },
  ];
  const result = calculateQuizResult(questions, {
    1: 2,
    2: 1,
    3: 1,
  });

  assert.equal(result.totalQuestions, 3);
  assert.equal(result.correctAnswers, 2);
  assert.equal(result.score, 67);
});
