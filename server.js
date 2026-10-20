// Сервер без зависимостей: раздаёт web/ и хранит общую базу в JSON-файле.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Calc = require('./web/calc');

const WEB = path.join(__dirname, 'web');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const MAX_BODY = 5 * 1024 * 1024;
const uid = () => crypto.randomBytes(5).toString('hex');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---- хранилище ----
let db = { rev: 0, objects: [] };
function loadDb() {
  try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { db = { rev: 0, objects: [] }; }
}
function saveDb() {
  db.rev += 1;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}

// ---- проверка ввода ----
const str = (v, field, max = 120) => {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `Поле «${field}» обязательно`);
  return v.trim().slice(0, max);
};
const numField = (v, field, opts) => {
  const err = Calc.validateNumber(v, opts);
  if (err) throw new HttpError(400, `${field}: ${err}`);
  return v;
};
const findObj = (id) => {
  const o = db.objects.find((x) => x.id === id);
  if (!o) throw new HttpError(404, 'Объект не найден');
  return o;
};

// ---- маршруты API ----
function api(method, parts, body) {
  const [res, id, sub, subId] = parts;
  if (res === 'state' && method === 'GET') return db;
  if (res === 'import' && method === 'POST') {
    if (!body || !Array.isArray(body.objects)) throw new HttpError(400, 'Неверный файл копии');
    db.objects = body.objects;
    saveDb();
    return db;
  }
  if (res !== 'objects') throw new HttpError(404, 'Не найдено');

  if (!id && method === 'POST') {
    const o = {
      id: uid(), name: str(body.name, 'Название'),
      budget: numField(body.budget ?? 0, 'Бюджет', { allowZero: true }),
      materials: [], expenses: [],
    };
    db.objects.push(o); saveDb(); return db;
  }
  if (id && !sub) {
    const o = findObj(id);
    if (method === 'PATCH') {
      if (body.name !== undefined) o.name = str(body.name, 'Название');
      if (body.budget !== undefined) o.budget = numField(body.budget, 'Бюджет', { allowZero: true });
      saveDb(); return db;
    }
    if (method === 'DELETE') { db.objects = db.objects.filter((x) => x !== o); saveDb(); return db; }
  }
  if (id && sub === 'materials') {
    const o = findObj(id);
    if (method === 'POST') {
      o.materials.push({
        id: uid(), name: str(body.name, 'Материал'), unit: str(body.unit, 'Ед. изм.', 20),
        qty: numField(body.qty, 'Количество'), price: numField(body.price, 'Цена', { allowZero: true }),
      });
      saveDb(); return db;
    }
    if (method === 'DELETE' && subId) {
      o.materials = o.materials.filter((m) => m.id !== subId);
      o.expenses.forEach((e) => { if (e.materialId === subId) e.materialId = null; });
      saveDb(); return db;
    }
  }
  if (id && sub === 'expenses') {
    const o = findObj(id);
    if (method === 'POST') {
      const m = body.materialId ? o.materials.find((x) => x.id === body.materialId) : null;
      if (body.materialId && !m) throw new HttpError(400, 'Материала нет в смете');
      if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new HttpError(400, 'Укажите дату');
      o.expenses.push({
        id: uid(), date: body.date, materialId: m ? m.id : null,
        name: m ? m.name : str(body.name, 'Материал'), unit: m ? m.unit : str(body.unit, 'Ед. изм.', 20),
        qty: numField(body.qty, 'Количество'), price: numField(body.price, 'Цена', { allowZero: true }),
        by: typeof body.by === 'string' ? body.by.trim().slice(0, 60) : '',
      });
      saveDb(); return db;
    }
    if (method === 'DELETE' && subId) {
      o.expenses = o.expenses.filter((e) => e.id !== subId);
      saveDb(); return db;
    }
  }
  throw new HttpError(404, 'Не найдено');
}

// ---- статика ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json' };
function serveStatic(req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(WEB, url === '/' ? 'index.html' : url));
  if (!file.startsWith(WEB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function createServer() {
  return http.createServer((req, res) => {
    if (!req.url.startsWith('/api/')) return serveStatic(req, res);
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) req.destroy(); else chunks.push(c); });
    req.on('end', () => {
      const send = (status, data) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(data));
      };
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body = {};
        if (raw) { try { body = JSON.parse(raw); } catch (e) { throw new HttpError(400, 'Неверный JSON'); } }
        const parts = req.url.slice(5).split('?')[0].split('/').filter(Boolean);
        send(200, api(req.method, parts, body));
      } catch (e) {
        if (e instanceof HttpError) send(e.status, { error: e.message });
        else { console.error(e); send(500, { error: 'Ошибка сервера' }); }
      }
    });
  });
}

if (require.main === module) {
  loadDb();
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, '0.0.0.0', () => console.log('Слушаю порт ' + port));
}

module.exports = { createServer, loadDb, resetDb: () => { db = { rev: 0, objects: [] }; } };
