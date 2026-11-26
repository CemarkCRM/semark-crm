// Password recovery from the server console, for when nobody who manages users
// can sign in (e.g. the director lost the password).
//   npm run reset-password              — list users (name, role, email)
//   npm run reset-password -- <email>   — set a new password for that user
// The new password is typed twice with hidden input. It is never passed as an
// argument or stored in .env, so it stays out of shell history and files.
// Make a backup first (npm run backup). Restart the CRM afterwards so the
// in-memory login-attempt limit is cleared.
require("dotenv/config");
const Database = require("better-sqlite3");
const { scryptSync, randomBytes } = require("node:crypto");

const MIN_PASSWORD_LENGTH = 10; // keep in sync with shared/access.ts
const dbPath = process.env.DB_PATH || "data.db";

// Same format as server/storage.ts hashPassword.
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error("Потрібен інтерактивний термінал (docker exec -it ...)."));
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") { // Ctrl+C
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const db = new Database(dbPath, { fileMustExist: true });
  const email = process.argv[2]?.trim();

  if (!email) {
    const rows = db.prepare("SELECT id, full_name, role, email FROM users ORDER BY id").all();
    console.log("Користувачі CRM:");
    for (const r of rows) console.log(`  ${r.id}. ${r.full_name} — ${r.role} — ${r.email}`);
    console.log("\nЩоб змінити пароль: npm run reset-password -- <email>");
    return;
  }

  const user = db.prepare("SELECT id, full_name, role FROM users WHERE lower(email) = lower(?)").get(email);
  if (!user) throw new Error(`Користувача з email ${email} не знайдено. Запустіть без email, щоб побачити список.`);

  console.log(`Новий пароль для: ${user.full_name} (${user.role})`);
  const first = await askHidden(`Новий пароль (щонайменше ${MIN_PASSWORD_LENGTH} символів): `);
  if (first.length < MIN_PASSWORD_LENGTH) throw new Error(`Пароль коротший за ${MIN_PASSWORD_LENGTH} символів. Нічого не змінено.`);
  const second = await askHidden("Повторіть пароль: ");
  if (first !== second) throw new Error("Паролі не збігаються. Нічого не змінено.");

  const result = db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(first), user.id);
  db.close();
  if (result.changes !== 1) throw new Error("Пароль не змінено.");
  console.log("Пароль змінено. Перезапустіть CRM і увійдіть з новим паролем.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
