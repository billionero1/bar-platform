import express from 'express';
import { rowsToCsv } from '../../utils/csv.js';
import { requirePermission } from '../../utils/permissions.js';

const r = express.Router();

const DOCS = [
  {
    code: 'SOP-BAR-01',
    title: 'Открытие барной станции',
    description: 'Подготовка льда, стекла, garnish и POS перед сменой.',
  },
  {
    code: 'SOP-BAR-02',
    title: 'Закрытие смены',
    description: 'Чек-лист уборки, инвентаризации и передачи станции.',
  },
  {
    code: 'SOP-BAR-03',
    title: 'Работа с заготовками',
    description: 'Маркировка, сроки хранения и контроль FIFO.',
  },
  {
    code: 'SOP-BAR-04',
    title: 'Коммуникация с гостем',
    description: 'Сценарии рекомендаций, апсейл и работа с возражениями.',
  },
  {
    code: 'SOP-BAR-05',
    title: 'Инциденты и эскалация',
    description: 'Порядок фиксации служебных инцидентов и передачи менеджеру.',
  },
];

r.get('/', requirePermission('docs:read'), (_req, res) => {
  return res.json(DOCS);
});

r.get('/export.csv', requirePermission('docs:export'), (_req, res) => {
  const csv = rowsToCsv(
    [
      { key: 'code', label: 'code' },
      { key: 'title', label: 'title' },
      { key: 'description', label: 'description' },
    ],
    DOCS
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=\"docs_export.csv\"');
  return res.status(200).send(csv);
});

export default r;
