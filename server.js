/**
 * FormCraft — Employee Details Form with Real Database
 * -------------------------------------------------------
 * Uses Node's BUILT-IN SQLite (node:sqlite, Node 22+). No npm install needed.
 *
 * Run:  node server.js
 * Open: http://localhost:3000
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = 3000;
const DB_PATH = path.join(__dirname, "formcraft.db");
const PUBLIC_DIR = path.join(__dirname, "public");

// ============================================================
// DATABASE SETUP
// ============================================================
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    serial_number INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT UNIQUE,
    name TEXT,
    father_name TEXT,
    cnic TEXT,
    age INTEGER,
    present_address TEXT,
    permanent_address TEXT,
    eye_color TEXT,
    company TEXT,
    designation TEXT,
    employee_id TEXT,
    scale TEXT,
    joining_date TEXT,
    experience TEXT,
    total_service TEXT,
    department TEXT,
    backend TEXT,
    hr_officer TEXT,
    employment_status TEXT,
    contact TEXT,
    email TEXT,
    remarks TEXT,
    photo_base64 TEXT,
    signature_base64 TEXT,
    document_names TEXT,
    submitted_at TEXT DEFAULT (datetime('now'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    username TEXT PRIMARY KEY,
    pin_hash TEXT NOT NULL
  )
`);

const PIN_SALT = "formcraft-salt-v1";
function hashPin(pin) {
  return crypto.scryptSync(pin, PIN_SALT, 32).toString("hex");
}
const adminExists = db.prepare("SELECT 1 FROM admins WHERE username = ?").get("admin");
if (!adminExists) {
  db.prepare("INSERT INTO admins (username, pin_hash) VALUES (?, ?)").run("admin", hashPin("1234"));
  console.log("Seeded default admin — username: admin, PIN: 1234");
}

// ============================================================
// SESSIONS
// ============================================================
const sessions = new Map();
function createSession() {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { createdAt: Date.now() });
  return token;
}
function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const [k, ...v] = pair.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  });
  return out;
}
function isAuthed(req) {
  const token = parseCookies(req).session;
  return token && sessions.has(token);
}

// ============================================================
// HELPERS
// ============================================================
function sendJSON(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}
function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    const MAX = 20 * 1024 * 1024; // 20MB (photo + signature + docs list as base64)
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX) { reject(new Error("Too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ============================================================
// ROUTES
// ============================================================
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  // ---- Submit form (public — no login needed to submit, like a real form) ----
  if (pathname === "/api/submit" && req.method === "POST") {
    try {
      const f = JSON.parse((await readBody(req)).toString());
      const id = crypto.randomUUID();
      const v = (x) => (x === undefined || x === "" ? null : x);
      const result = db.prepare(`
        INSERT INTO submissions (
          id, name, father_name, cnic, age, present_address, permanent_address, eye_color,
          company, designation, employee_id, scale, joining_date, experience, total_service,
          department, backend, hr_officer, employment_status, contact, email, remarks,
          photo_base64, signature_base64, document_names
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, v(f.name), v(f.father_name), v(f.cnic), v(f.age), v(f.present_address), v(f.permanent_address), v(f.eye_color),
        v(f.company), v(f.designation), v(f.employee_id), v(f.scale), v(f.joining_date), v(f.experience), v(f.total_service),
        v(f.department), v(f.backend), v(f.hr_officer), v(f.employment_status), v(f.contact), v(f.email), v(f.remarks),
        v(f.photo_base64), v(f.signature_base64), JSON.stringify(f.document_names || [])
      );
      return sendJSON(res, 200, { ok: true, id, serial_number: Number(result.lastInsertRowid) });
    } catch (e) {
      console.error(e);
      return sendJSON(res, 400, { ok: false, error: "Could not save submission" });
    }
  }

  // ---- Public lookup by serial number (no login needed — like a receipt/token number) ----
  if (pathname.startsWith("/api/lookup/") && req.method === "GET") {
    const serial = pathname.split("/api/lookup/")[1];
    const row = db.prepare("SELECT * FROM submissions WHERE serial_number = ?").get(serial);
    if (!row) return sendJSON(res, 404, { ok: false, error: "No record found with that number" });
    return sendJSON(res, 200, { ok: true, submission: row });
  }

  // ---- Admin login ----
  if (pathname === "/api/login" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)).toString());
    const admin = db.prepare("SELECT * FROM admins WHERE username = ?").get(body.username || "admin");
    if (admin && admin.pin_hash === hashPin(String(body.pin || ""))) {
      const token = createSession();
      res.setHeader("Set-Cookie", `session=${token}; HttpOnly; Path=/; Max-Age=3600`);
      return sendJSON(res, 200, { ok: true });
    }
    return sendJSON(res, 401, { ok: false, error: "Incorrect PIN" });
  }

  if (pathname === "/api/check" && req.method === "GET") {
    return sendJSON(res, 200, { authenticated: isAuthed(req) });
  }

  // ---- List all submissions (admin only) ----
  if (pathname === "/api/submissions" && req.method === "GET") {
    if (!isAuthed(req)) return sendJSON(res, 401, { ok: false, error: "Not logged in" });
    const rows = db.prepare("SELECT id, name, father_name, cnic, company, designation, department, submitted_at FROM submissions ORDER BY submitted_at DESC").all();
    return sendJSON(res, 200, { ok: true, submissions: rows });
  }

  // ---- Get one full submission by ID (admin only) ----
  if (pathname.startsWith("/api/submission/") && req.method === "GET") {
    if (!isAuthed(req)) return sendJSON(res, 401, { ok: false, error: "Not logged in" });
    const id = pathname.split("/api/submission/")[1];
    const row = db.prepare("SELECT * FROM submissions WHERE id = ?").get(id);
    if (!row) return sendJSON(res, 404, { ok: false, error: "Not found" });
    return sendJSON(res, 200, { ok: true, submission: row });
  }

  // ---- Delete submission (admin only) ----
  if (pathname.startsWith("/api/submission/") && req.method === "DELETE") {
    if (!isAuthed(req)) return sendJSON(res, 401, { ok: false, error: "Not logged in" });
    const id = pathname.split("/api/submission/")[1];
    db.prepare("DELETE FROM submissions WHERE id = ?").run(id);
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    sessions.delete(parseCookies(req).session);
    res.setHeader("Set-Cookie", "session=; HttpOnly; Path=/; Max-Age=0");
    return sendJSON(res, 200, { ok: true });
  }

  // ---- Static files ----
  let filePath = pathname === "/" ? "/index.html" : pathname;
  if (pathname === "/admin") filePath = "/admin.html";
  filePath = path.join(PUBLIC_DIR, filePath);
  const ext = path.extname(filePath);
  const types = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };
  if (types[ext]) return sendFile(res, filePath, types[ext]);

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`FormCraft server running: http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin  (username: admin, PIN: 1234)`);
});
                
