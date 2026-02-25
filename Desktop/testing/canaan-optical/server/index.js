/**
 * Express API server for Canaan Optical — serves SQLite data with pagination.
 * Port 3000, binds to 0.0.0.0 for LAN access.
 * Serves built React frontend from dist/ AND REST API.
 */
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'canaan.db');
const DIST_DIR = path.join(ROOT, 'dist');

// ─── Table name mapping: frontend name → SQLite table/view ─────────
const TABLE_MAP = {
  customers: 'v_customers',
  sales: 'Sale',
  stock: 'Stock',
  glass_sales: 'v_glass_sales',
  kt_glass: 'KT_GLASS',
  contact_stock: 'CONTACT_STOCK',
  contact_ecoupons: 'CONTACT_E-COUPON',
  kt_daily: '官塘日帳',
  kt_deposits: '官塘入數',
  deposit_records: '入數記錄',
  employees: '員工',
  frame_suppliers: '柴彎鏡架供應商',
  contact_lens_suppliers: '柴灣隱形眼鏡_藥水行供應商',
  frame_supplier_codes: '鏡架供應商編號',
  visitors: 'Check_Day',
  visitor_counts: 'Check_Day',
  lens_catalog: 'LENS_PRISE_LIST',
  boc_records: '中銀',
  cw_misc: '柴灣什項',
  employee_leaves: '員工假期',
  colors: 'COLOR',
  contact_prices: 'CONTACT_PRICE',
};

// For writes on views, map to the underlying table
const WRITE_TABLE_MAP = {
  v_customers: 'CUSTOMER',
  v_glass_sales: 'GLASS_SALE',
};

// ─── Database ───────────────────────────────────────────────────────
const db = new Database(DB_PATH, { readonly: false });
db.pragma('journal_mode = WAL');
db.pragma('cache_size = -32000');

// Cache table column info
const columnCache = new Map();
function getColumns(table) {
  if (columnCache.has(table)) return columnCache.get(table);
  try {
    const info = db.prepare(`PRAGMA table_info("${table}")`).all();
    if (info.length === 0) {
      // Might be a view — try selecting 0 rows to get columns
      const stmt = db.prepare(`SELECT * FROM "${table}" LIMIT 0`);
      const cols = stmt.columns().map(c => c.name);
      columnCache.set(table, cols);
      return cols;
    }
    const cols = info.map(c => c.name);
    columnCache.set(table, cols);
    return cols;
  } catch {
    return [];
  }
}

// ─── App setup ──────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── API: List all tables with row counts ───────────────────────────
app.get('/api/tables', (req, res) => {
  try {
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all();
    const views = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='view' ORDER BY name`
    ).all();

    const result = {};
    for (const { name } of [...tables, ...views]) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as count FROM "${name}"`).get();
        result[name] = { rows: row.count, columns: getColumns(name) };
      } catch { /* skip */ }
    }

    // Also include the frontend-name mapping
    const mapping = {};
    for (const [frontendName, sqliteName] of Object.entries(TABLE_MAP)) {
      if (result[sqliteName]) {
        mapping[frontendName] = { table: sqliteName, ...result[sqliteName] };
      }
    }

    res.json({ tables: result, mapping });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Paginated read with search and sort ───────────────────────
app.get('/api/data/:table', (req, res) => {
  try {
    const frontendName = req.params.table;
    const sqliteTable = TABLE_MAP[frontendName] || frontendName;
    const columns = getColumns(sqliteTable);
    if (columns.length === 0) {
      return res.status(404).json({ error: `Table "${frontendName}" not found` });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 50));
    const search = (req.query.search || '').trim();
    const sortBy = req.query.sortBy || '';
    const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const branch = (req.query.branch || '').trim();

    // Determine if table has an id column or use rowid
    const hasId = columns.includes('id');
    const idExpr = hasId ? 'id' : 'rowid as id';

    // Build WHERE clause for search
    const whereParts = [];
    const params = [];

    if (search) {
      // Search across all text columns
      const searchCols = columns.filter(c => c !== 'id' && c !== 'original_id');
      const searchConditions = searchCols.map(c => `"${c}" LIKE ?`);
      whereParts.push(`(${searchConditions.join(' OR ')})`);
      for (let i = 0; i < searchCols.length; i++) {
        params.push(`%${search}%`);
      }
    }

    if (branch) {
      // Try common branch column names
      if (columns.includes('branch_code')) {
        whereParts.push(`"branch_code" = ?`);
        params.push(branch);
      } else if (columns.includes('comp')) {
        whereParts.push(`"comp" = ?`);
        params.push(branch);
      } else if (columns.includes('company')) {
        whereParts.push(`"company" = ?`);
        params.push(branch);
      }
    }

    const whereSQL = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    // Count total
    const countSQL = `SELECT COUNT(*) as total FROM "${sqliteTable}" ${whereSQL}`;
    const { total } = db.prepare(countSQL).get(...params);

    // Sort
    let orderSQL = '';
    if (sortBy && columns.includes(sortBy)) {
      orderSQL = `ORDER BY "${sortBy}" ${sortOrder}`;
    } else if (hasId) {
      orderSQL = `ORDER BY id DESC`;
    } else {
      orderSQL = `ORDER BY rowid DESC`;
    }

    // Paginate
    const offset = (page - 1) * pageSize;
    const selectCols = hasId ? '*' : `rowid as id, *`;
    const dataSQL = `SELECT ${selectCols} FROM "${sqliteTable}" ${whereSQL} ${orderSQL} LIMIT ? OFFSET ?`;
    const data = db.prepare(dataSQL).all(...params, pageSize, offset);

    res.json({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Insert ────────────────────────────────────────────────────
app.post('/api/data/:table', (req, res) => {
  try {
    const frontendName = req.params.table;
    let sqliteTable = TABLE_MAP[frontendName] || frontendName;
    // If it's a view, redirect to underlying table
    if (WRITE_TABLE_MAP[sqliteTable]) sqliteTable = WRITE_TABLE_MAP[sqliteTable];

    const body = req.body;
    const keys = Object.keys(body).filter(k => k !== 'id' && k !== '_source' && k !== 'branch_code');
    if (keys.length === 0) return res.status(400).json({ error: 'No data provided' });

    const cols = keys.map(k => `"${k}"`).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => body[k] ?? null);

    const result = db.prepare(
      `INSERT INTO "${sqliteTable}" (${cols}) VALUES (${placeholders})`
    ).run(...values);

    res.json({ id: result.lastInsertRowid, ...body });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Update ────────────────────────────────────────────────────
app.put('/api/data/:table/:id', (req, res) => {
  try {
    const frontendName = req.params.table;
    let sqliteTable = TABLE_MAP[frontendName] || frontendName;
    if (WRITE_TABLE_MAP[sqliteTable]) sqliteTable = WRITE_TABLE_MAP[sqliteTable];
    const id = parseInt(req.params.id);

    const body = req.body;
    const keys = Object.keys(body).filter(k => k !== 'id' && k !== '_source' && k !== 'branch_code');
    if (keys.length === 0) return res.status(400).json({ error: 'No data provided' });

    const sets = keys.map(k => `"${k}" = ?`).join(', ');
    const values = keys.map(k => body[k] ?? null);

    db.prepare(`UPDATE "${sqliteTable}" SET ${sets} WHERE rowid = ?`).run(...values, id);
    res.json({ id, ...body });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Delete ────────────────────────────────────────────────────
app.delete('/api/data/:table/:id', (req, res) => {
  try {
    const frontendName = req.params.table;
    let sqliteTable = TABLE_MAP[frontendName] || frontendName;
    if (WRITE_TABLE_MAP[sqliteTable]) sqliteTable = WRITE_TABLE_MAP[sqliteTable];
    const id = parseInt(req.params.id);

    db.prepare(`DELETE FROM "${sqliteTable}" WHERE rowid = ?`).run(id);
    res.json({ deleted: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: Aggregated reports ─────────────────────────────────────────
// GET /api/report?type=<category>&month=<YYYY-MM>&branch=<code>
// Returns pre-aggregated data for the 排行榜 page.
app.get('/api/report', (req, res) => {
  try {
    const { type, month, branch } = req.query;
    if (!type || !month) {
      return res.status(400).json({ error: 'type and month are required' });
    }

    // Parse "2026-02" → year=2026, month=2
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr);
    const mo = parseInt(monthStr); // unpadded: 2
    const moPadded = String(mo).padStart(2, '0'); // padded: "02"

    // SQLite dates are "YYYY/M/D 00:00:00" — match both padded and unpadded
    const dateLike1 = `${year}/${mo}/%`;      // "2026/2/%"
    const dateLike2 = `${year}/${moPadded}/%`; // "2026/02/%"

    // Branch filter helper
    const branchWhere = (col) => branch ? ` AND "${col}" = ?` : '';
    const branchParams = branch ? [branch] : [];

    let rows;
    switch (type) {
      case 'revenue': {
        // 官塘日帳: GROUP BY comp, SUM financial columns
        const sql = `
          SELECT comp AS branch,
                 COUNT(*) AS count,
                 SUM(COALESCE(cash,0)) AS cash,
                 SUM(COALESCE(eps,0)) AS eps,
                 SUM(COALESCE(credit_card,0)) AS credit_card,
                 SUM(COALESCE(revenue,0)) AS revenue,
                 SUM(COALESCE(octopus,0)) AS octopus,
                 SUM(COALESCE(alipay,0)) AS alipay,
                 SUM(COALESCE(wechat,0)) AS wechat
          FROM "官塘日帳"
          WHERE (record_date LIKE ? OR record_date LIKE ?)${branchWhere('comp')}
          GROUP BY comp
          ORDER BY revenue DESC`;
        rows = db.prepare(sql).all(dateLike1, dateLike2, ...branchParams);
        break;
      }
      case 'performance': {
        // Sale: GROUP BY sale_person, SUM total
        const sql = `
          SELECT COALESCE(sale_person, '(未記錄)') AS name,
                 COUNT(*) AS count,
                 SUM(COALESCE(total,0)) AS total
          FROM Sale
          WHERE (sale_date LIKE ? OR sale_date LIKE ?)${branchWhere('comp')}
          GROUP BY sale_person
          ORDER BY total DESC`;
        rows = db.prepare(sql).all(dateLike1, dateLike2, ...branchParams);
        break;
      }
      case 'glasses_purchase': {
        // v_glass_sales: GROUP BY company_name, SUM price/qty
        const sql = `
          SELECT COALESCE(company_name, '(未記錄)') AS name,
                 SUM(COALESCE(qty,0)) AS qty,
                 SUM(COALESCE(price,0)) AS total
          FROM v_glass_sales
          WHERE (sale_date LIKE ? OR sale_date LIKE ?)${branchWhere('company')}
          GROUP BY company_name
          ORDER BY total DESC`;
        rows = db.prepare(sql).all(dateLike1, dateLike2, ...branchParams);
        break;
      }
      case 'contact_lens': {
        // CONTACT_STOCK: GROUP BY company_name, SUM qty and unit_price*qty
        const sql = `
          SELECT COALESCE(company_name, '(未記錄)') AS name,
                 type,
                 SUM(COALESCE(qty,0)) AS qty,
                 SUM(COALESCE(unit_price,0) * COALESCE(qty,0)) AS total
          FROM CONTACT_STOCK
          WHERE (stock_date LIKE ? OR stock_date LIKE ?)${branchWhere('comp')}
          GROUP BY company_name, type
          ORDER BY total DESC`;
        rows = db.prepare(sql).all(dateLike1, dateLike2, ...branchParams);
        break;
      }
      case 'misc': {
        // 官塘日帳: WHERE misc > 0, return detail rows
        const sql = `
          SELECT record_date, comp, misc_code, misc
          FROM "官塘日帳"
          WHERE (record_date LIKE ? OR record_date LIKE ?)
            AND COALESCE(misc,0) > 0${branchWhere('comp')}
          ORDER BY record_date DESC`;
        rows = db.prepare(sql).all(dateLike1, dateLike2, ...branchParams);
        break;
      }
      case 'glasses_sales': {
        // Sale: GROUP BY sale_person, SUM glass (where glass > 0)
        const sql = `
          SELECT COALESCE(sale_person, '(未記錄)') AS name,
                 COUNT(*) AS count,
                 SUM(COALESCE(glass,0)) AS total
          FROM Sale
          WHERE (sale_date LIKE ? OR sale_date LIKE ?)
            AND COALESCE(glass,0) > 0${branchWhere('comp')}
          GROUP BY sale_person
          ORDER BY total DESC`;
        rows = db.prepare(sql).all(dateLike1, dateLike2, ...branchParams);
        break;
      }
      case 'lens': {
        // Sale: GROUP BY sale_person, SUM(hoya+essilor+bl)
        const sql = `
          SELECT COALESCE(sale_person, '(未記錄)') AS name,
                 COUNT(*) AS count,
                 SUM(COALESCE(hoya,0) + COALESCE(essilor,0) + COALESCE(bl,0)) AS total
          FROM Sale
          WHERE (sale_date LIKE ? OR sale_date LIKE ?)
            AND (COALESCE(hoya,0) + COALESCE(essilor,0) + COALESCE(bl,0)) > 0${branchWhere('comp')}
          GROUP BY sale_person
          ORDER BY total DESC`;
        rows = db.prepare(sql).all(dateLike1, dateLike2, ...branchParams);
        break;
      }
      case 'total_sales': {
        // Sale: GROUP BY comp, SUM total/frame/glass
        const sql = `
          SELECT COALESCE(comp, '(未記錄)') AS branch,
                 COUNT(*) AS count,
                 SUM(COALESCE(total,0)) AS total,
                 SUM(COALESCE(frame,0)) AS frame,
                 SUM(COALESCE(glass,0)) AS glass
          FROM Sale
          WHERE (sale_date LIKE ? OR sale_date LIKE ?)${branchWhere('comp')}
          GROUP BY comp
          ORDER BY total DESC`;
        rows = db.prepare(sql).all(dateLike1, dateLike2, ...branchParams);
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown report type: ${type}` });
    }

    res.json({ data: rows, type, month });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Serve static frontend ─────────────────────────────────────────
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('{*path}', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    }
  });
}

// ─── Start server ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

function getLanIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const lanIP = getLanIP();
  console.log(`\n  Canaan Optical API Server`);
  console.log(`  ─────────────────────────`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  LAN:     http://${lanIP}:${PORT}`);
  console.log(`  API:     http://localhost:${PORT}/api/tables`);
  console.log(`  DB:      ${DB_PATH}\n`);
});
