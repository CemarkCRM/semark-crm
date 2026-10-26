// Consistent snapshot of the SQLite database while the CRM is running.
// Run nightly from the hosting's cron:  npm run backup
// DB_PATH (default data.db), BACKUP_DIR (default backups), BACKUP_KEEP_DAYS (default 30).
require("dotenv/config");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const dbPath = process.env.DB_PATH || "data.db";
const dir = process.env.BACKUP_DIR || "backups";
const keepDays = Number(process.env.BACKUP_KEEP_DAYS) || 30;

async function main() {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const target = path.join(dir, `data-${stamp}.db`);

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  await db.backup(target);
  db.close();

  // Make the copy a single self-contained file and prove it passes SQLite's own integrity check.
  const check = new Database(target);
  check.pragma("journal_mode = DELETE");
  const result = check.pragma("integrity_check", { simple: true });
  check.close();
  if (result !== "ok") throw new Error(`Копія ${target} пошкоджена: ${result}`);

  const cutoff = Date.now() - keepDays * 86400000;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    if (/^data-.*\.db$/.test(name) && fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file);
  }
  console.log(`Резервна копія: ${target}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
