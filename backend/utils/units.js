const UNIT_DEFINITIONS = [
  {
    canonical: 'мл',
    kind: 'volume',
    toBase: 1,
    aliases: ['мл', 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
  },
  {
    canonical: 'л',
    kind: 'volume',
    toBase: 1000,
    aliases: ['л', 'l', 'liter', 'liters', 'litre', 'litres'],
  },
  {
    canonical: 'cl',
    kind: 'volume',
    toBase: 10,
    aliases: ['cl', 'сl', 'centiliter', 'centiliters', 'centilitre', 'centilitres'],
  },
  {
    canonical: 'г',
    kind: 'weight',
    toBase: 1,
    aliases: ['г', 'g', 'gram', 'grams'],
  },
  {
    canonical: 'кг',
    kind: 'weight',
    toBase: 1000,
    aliases: ['кг', 'kg', 'kilogram', 'kilograms'],
  },
  {
    canonical: 'шт',
    kind: 'count',
    toBase: 1,
    aliases: ['шт', 'pcs', 'pc', 'piece', 'pieces', 'unit', 'units'],
  },
];

const UNIT_INDEX = new Map();
for (const definition of UNIT_DEFINITIONS) {
  for (const alias of definition.aliases) {
    UNIT_INDEX.set(String(alias).trim().toLowerCase(), definition);
  }
}

export function normalizeUnit(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return null;
  return UNIT_INDEX.get(key)?.canonical || null;
}

function resolveUnitDefinition(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return null;
  return UNIT_INDEX.get(key) || null;
}

export function convertAmountLoose(amountRaw, fromUnitRaw, toUnitRaw) {
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount)) return null;

  const from = resolveUnitDefinition(fromUnitRaw);
  const to = resolveUnitDefinition(toUnitRaw);

  // Если одна из единиц не задана/неизвестна — сохраняем обратную совместимость.
  if (!from || !to) return amount;
  if (from.kind !== to.kind) return null;

  const baseValue = amount * from.toBase;
  return baseValue / to.toBase;
}
