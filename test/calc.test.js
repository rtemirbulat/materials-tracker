const assert = require('assert');
const { summarize, validateNumber, toCSV } = require('../web/calc');

const obj = {
  budget: 100000,
  materials: [
    { id: 'm1', name: 'Цемент', unit: 'мешок', qty: 50, price: 1000 },
    { id: 'm2', name: 'Песок', unit: 'т', qty: 10, price: 3000 },
  ],
  expenses: [
    { id: 'e1', materialId: 'm1', name: 'Цемент', unit: 'мешок', qty: 30, price: 1100 },
    { id: 'e2', materialId: 'm1', name: 'Цемент', unit: 'мешок', qty: 30, price: 1100 },
    { id: 'e3', materialId: null, name: 'Краска', unit: 'л', qty: 5, price: 2000 },
  ],
};

const s = summarize(obj);
const cement = s.rows.find((r) => r.key === 'm1');
assert.strictEqual(cement.planSum, 50000);
assert.strictEqual(cement.factSum, 66000);
assert.strictEqual(cement.over, true);
assert.strictEqual(cement.pct, 132);

const sand = s.rows.find((r) => r.key === 'm2');
assert.strictEqual(sand.factSum, 0);
assert.strictEqual(sand.over, false);
assert.strictEqual(sand.diff, 30000);

const paint = s.rows.find((r) => r.unplanned);
assert.strictEqual(paint.name, 'Краска');
assert.strictEqual(paint.planSum, 0);
assert.strictEqual(paint.over, true);
assert.strictEqual(paint.pct, null);

assert.strictEqual(s.planTotal, 80000);
assert.strictEqual(s.factTotal, 76000);
assert.strictEqual(s.budgetLeft, 24000);
assert.strictEqual(s.budgetPct, 76);
assert.strictEqual(s.overBudget, false);

// Один и тот же внесметный материал суммируется в одну строку
const s2 = summarize({ budget: 0, materials: [], expenses: [
  { materialId: null, name: 'Краска', unit: 'л', qty: 1, price: 10 },
  { materialId: null, name: ' краска ', unit: 'л', qty: 2, price: 10 },
] });
assert.strictEqual(s2.rows.length, 1);
assert.strictEqual(s2.rows[0].factSum, 30);
assert.strictEqual(s2.budgetPct, null);

// Дробные суммы без плавающих хвостов
const s3 = summarize({ budget: 0, materials: [{ id: 'a', name: 'a', unit: 'м', qty: 3, price: 0.1 }], expenses: [] });
assert.strictEqual(s3.planTotal, 0.3);

assert.strictEqual(validateNumber(5), null);
assert.ok(validateNumber(0));
assert.ok(validateNumber(-1));
assert.ok(validateNumber(NaN));
assert.strictEqual(validateNumber(0, { allowZero: true }), null);

const csv = toCSV(obj);
assert.ok(csv.includes('"Цемент";"мешок"'));
assert.ok(csv.includes('"ИТОГО"'));

console.log('OK: все тесты пройдены');
