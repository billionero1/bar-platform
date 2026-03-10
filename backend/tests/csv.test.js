import test from 'node:test';
import assert from 'node:assert/strict';

import { rowsToCsv } from '../utils/csv.js';

test('rowsToCsv escapes formula injections', () => {
  const csv = rowsToCsv(
    [
      { key: 'name', label: 'name' },
      { key: 'value', label: 'value' },
    ],
    [
      { name: 'safe', value: '=SUM(A1:A2)' },
      { name: 'safe2', value: '+cmd|\' /C calc\'!A0' },
      { name: 'safe3', value: '@malicious' },
      { name: 'safe4', value: '-1+2' },
    ]
  );

  assert.match(csv, /'\=SUM\(A1:A2\)/);
  assert.match(csv, /'\+cmd\|'/);
  assert.match(csv, /'@malicious/);
  assert.match(csv, /'\-1\+2/);
});
