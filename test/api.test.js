const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-'));
const { createServer, resetDb } = require('../server');

(async () => {
  resetDb();
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, url, body) => {
    const r = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json() };
  };

  let r = await call('POST', '/api/objects', { name: 'Объект 1', budget: 100000 });
  assert.strictEqual(r.status, 200);
  const oid = r.data.objects[0].id;

  r = await call('POST', '/api/objects', { name: '', budget: 1 });
  assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/objects', { name: 'X', budget: -5 });
  assert.strictEqual(r.status, 400);

  r = await call('POST', `/api/objects/${oid}/materials`, { name: 'Цемент', unit: 'мешок', qty: 50, price: 1000 });
  const mid = r.data.objects[0].materials[0].id;
  r = await call('POST', `/api/objects/${oid}/materials`, { name: 'Песок', unit: 'т', qty: 0, price: 1 });
  assert.strictEqual(r.status, 400);

  r = await call('POST', `/api/objects/${oid}/expenses`, { date: '2026-10-20', materialId: mid, qty: 10, price: 1100, by: 'Айгерим' });
  assert.strictEqual(r.status, 200);
  const exp = r.data.objects[0].expenses[0];
  assert.strictEqual(exp.name, 'Цемент');
  assert.strictEqual(exp.by, 'Айгерим');
  r = await call('POST', `/api/objects/${oid}/expenses`, { date: 'вчера', materialId: mid, qty: 1, price: 1 });
  assert.strictEqual(r.status, 400);
  r = await call('POST', `/api/objects/${oid}/expenses`, { date: '2026-10-20', materialId: 'nope', qty: 1, price: 1 });
  assert.strictEqual(r.status, 400);
  r = await call('POST', `/api/objects/${oid}/expenses`, { date: '2026-10-20', name: 'Краска', unit: 'л', qty: 2, price: 500 });
  assert.strictEqual(r.data.objects[0].expenses.length, 2);

  // удаление материала не удаляет расход, а делает его «вне сметы»
  r = await call('DELETE', `/api/objects/${oid}/materials/${mid}`);
  assert.strictEqual(r.data.objects[0].materials.length, 0);
  assert.strictEqual(r.data.objects[0].expenses.find((e) => e.id === exp.id).materialId, null);

  // данные переживают перезапуск
  const rev = (await call('GET', '/api/state')).data.rev;
  resetDb();
  require('../server').loadDb();
  r = await call('GET', '/api/state');
  assert.strictEqual(r.data.rev, rev);
  assert.strictEqual(r.data.objects.length, 1);

  r = await call('PATCH', `/api/objects/${oid}`, { name: 'Новое имя', budget: 5 });
  assert.strictEqual(r.data.objects[0].name, 'Новое имя');
  r = await call('DELETE', `/api/objects/${oid}`);
  assert.strictEqual(r.data.objects.length, 0);
  r = await call('DELETE', `/api/objects/${oid}`);
  assert.strictEqual(r.status, 404);

  r = await call('POST', '/api/import', { objects: 'x' });
  assert.strictEqual(r.status, 400);

  // статика и защита от выхода из папки
  const idx = await fetch(base + '/');
  assert.strictEqual(idx.status, 200);
  const esc = await fetch(base + '/..%2Fserver.js');
  assert.notStrictEqual(esc.status, 200);

  server.close();
  console.log('OK: API-тесты пройдены');
})().catch((e) => { console.error(e); process.exit(1); });
