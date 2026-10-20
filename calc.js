(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  // Сводка по объекту: план vs факт по каждому материалу + итоги.
  // Расходы вне сметы (materialId = null) попадают в строки с планом 0.
  function summarize(obj) {
    const rows = new Map();
    for (const m of obj.materials) {
      rows.set(m.id, {
        key: m.id, name: m.name, unit: m.unit,
        planQty: m.qty, planPrice: m.price, planSum: round2(m.qty * m.price),
        factQty: 0, factSum: 0, unplanned: false,
      });
    }
    for (const e of obj.expenses) {
      const key = e.materialId && rows.has(e.materialId) ? e.materialId : 'x:' + (e.name || '').trim().toLowerCase();
      if (!rows.has(key)) {
        rows.set(key, {
          key, name: e.name, unit: e.unit,
          planQty: 0, planPrice: 0, planSum: 0, factQty: 0, factSum: 0, unplanned: true,
        });
      }
      const r = rows.get(key);
      r.factQty += e.qty;
      r.factSum += e.qty * e.price;
    }
    const list = [...rows.values()].map((r) => {
      const factSum = round2(r.factSum);
      const diff = round2(r.planSum - factSum);
      return {
        ...r, factSum, factQty: round2(r.factQty), diff,
        over: factSum > r.planSum,
        pct: r.planSum > 0 ? Math.round((factSum / r.planSum) * 100) : null,
      };
    });
    const planTotal = round2(list.reduce((s, r) => s + r.planSum, 0));
    const factTotal = round2(list.reduce((s, r) => s + r.factSum, 0));
    const budget = obj.budget || 0;
    return {
      rows: list, planTotal, factTotal,
      diff: round2(planTotal - factTotal),
      budget,
      budgetLeft: round2(budget - factTotal),
      budgetPct: budget > 0 ? Math.round((factTotal / budget) * 100) : null,
      overBudget: budget > 0 && factTotal > budget,
    };
  }

  // Проверка ввода: возвращает текст ошибки или null.
  function validateNumber(v, { allowZero = false } = {}) {
    if (typeof v !== 'number' || !isFinite(v)) return 'Введите число';
    if (v < 0 || (!allowZero && v === 0)) return 'Значение должно быть больше нуля';
    return null;
  }

  function toCSV(obj) {
    const s = summarize(obj);
    const esc = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const head = ['Материал', 'Ед.', 'План кол-во', 'План цена', 'План сумма', 'Факт кол-во', 'Факт сумма', 'Остаток', '% выполнения'];
    const lines = [head.map(esc).join(';')];
    for (const r of s.rows) {
      lines.push([r.name, r.unit, r.planQty, r.planPrice, r.planSum, r.factQty, r.factSum, r.diff, r.pct === null ? '' : r.pct]
        .map(esc).join(';'));
    }
    lines.push(['ИТОГО', '', '', '', s.planTotal, '', s.factTotal, s.diff, ''].map(esc).join(';'));
    return '﻿' + lines.join('\n');
  }

  return { summarize, validateNumber, toCSV, round2 };
});
