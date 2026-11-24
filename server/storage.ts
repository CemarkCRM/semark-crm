import {
  users, companies, leads, contacts, equipment, sales, repairs, rentals, tasks, events,
  type User, type InsertUser,
  type Company, type InsertCompany,
  type Lead, type InsertLead,
  type Contact, type InsertContact,
  type Equipment, type InsertEquipment,
  type Sale, type InsertSale,
  type Repair, type InsertRepair,
  type Rental, type InsertRental,
  type Task, type InsertTask,
  type Event, type InsertEvent,
} from "@shared/schema";
import type { SafeUser } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, asc, inArray } from "drizzle-orm";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { MIN_PASSWORD_LENGTH } from "@shared/access";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// DB_PATH lets the hosting keep the database outside the public web folder.
const sqlite = new Database(process.env.DB_PATH || "data.db");
sqlite.pragma("journal_mode = WAL");

// ─── Password hashing (Node crypto scrypt, salt stored with the hash) ─────────
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password: string, stored?: string | null): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function sanitizeUser(user: User | undefined): SafeUser | undefined {
  if (!user) return undefined;
  const { passwordHash, ...safe } = user;
  return safe;
}

// Create tables (idempotent)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    password_hash TEXT
  );
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'new',
    source TEXT NOT NULL DEFAULT 'website',
    company TEXT,
    contact_name TEXT NOT NULL,
    contact_phone TEXT,
    contact_email TEXT,
    city TEXT,
    budget INTEGER,
    responsible_id INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    model TEXT NOT NULL,
    type TEXT NOT NULL,
    serial TEXT,
    price INTEGER NOT NULL,
    rental_day_price INTEGER,
    status TEXT NOT NULL DEFAULT 'available',
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    position TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    equipment_id INTEGER NOT NULL,
    price INTEGER NOT NULL,
    sold_at TEXT NOT NULL,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS repairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    equipment_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    diagnosis TEXT,
    parts_replaced TEXT,
    cost INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'received',
    received_at TEXT NOT NULL,
    returned_at TEXT,
    engineer_id INTEGER,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS rentals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    equipment_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    price_per_day INTEGER NOT NULL,
    deposit INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'reserved',
    return_condition TEXT,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date TEXT,
    assignee_id INTEGER,
    lead_id INTEGER,
    contact_id INTEGER,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    edrpou TEXT,
    city TEXT,
    address TEXT,
    website TEXT,
    industry TEXT,
    phone TEXT,
    email TEXT,
    responsible_id INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    author_id INTEGER,
    contact_id INTEGER,
    created_at TEXT NOT NULL
  );
`);

function ensureColumn(table: string, column: string, definition: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

for (const table of ["leads", "equipment", "sales", "repairs", "rentals", "tasks"]) {
  ensureColumn(table, "updated_by_id", "INTEGER");
}
for (const table of ["tasks", "events"]) {
  ensureColumn(table, "contact_id", "INTEGER");
}
for (const table of ["equipment", "sales", "repairs", "rentals", "tasks"]) {
  ensureColumn(table, "updated_at", "TEXT");
}
ensureColumn("users", "password_hash", "TEXT");
// Link clients and contacts to companies. Adding the columns does not change
// any existing rows: linking existing data is a separate, explicit action.
for (const table of ["leads", "contacts"]) {
  ensureColumn(table, "company_id", "INTEGER");
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_company_id ON ${table}(company_id)`);
}

export const db = drizzle(sqlite);

const now = () => new Date().toISOString();
const DEFAULT_ACTOR_ID = 5;

function actorName(actorId?: number | null) {
  if (!actorId) return "Адміністратор";
  return db.select().from(users).where(eq(users.id, actorId)).get()?.fullName ?? "Адміністратор";
}

function touchLead(leadId: number, t: string) {
  db.update(leads).set({ updatedAt: t }).where(eq(leads.id, leadId)).run();
}

function addLeadEvent(leadId: number | null | undefined, type: string, message: string, actorId?: number | null, t = now()) {
  if (!leadId) return;
  db.insert(events).values({
    leadId,
    type,
    message,
    authorId: actorId ?? DEFAULT_ACTOR_ID,
    createdAt: t,
  }).run();
  touchLead(leadId, t);
}
function addLeadEventForContact(leadId: number | null | undefined, contactId: number | null | undefined, type: string, message: string, actorId?: number | null, t = now()) {
  if (!leadId) return;
  db.insert(events).values({
    leadId,
    type,
    message,
    authorId: actorId ?? DEFAULT_ACTOR_ID,
    contactId: contactId ?? null as any,
    createdAt: t,
  }).run();
  touchLead(leadId, t);
}

// ─── Company name matching ───────────────────────────────────────────────────
// Exact key: same name ignoring case, extra spaces and quote styles.
export function companyKey(name?: string | null): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[«»"'`„“”‘’ʼ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Loose key for spotting probable duplicates ("ТОВ Альфа" vs "Альфа"):
// also drops legal forms and punctuation. Never used to merge automatically.
const LEGAL_FORMS = [
  "товариство з обмеженою відповідальністю", "приватне підприємство", "фізична особа підприємець",
  "фізична особа-підприємець", "публічне акціонерне товариство", "приватне акціонерне товариство",
  "акціонерне товариство", "тзов", "тов", "фоп", "прат", "пат", "пп", "ат", "дп", "кп", "ооо", "чп", "llc", "ltd",
];
const NON_ALNUM = new RegExp("[^\\p{L}\\p{N}]+", "gu");
export function companyLooseKey(name?: string | null): string {
  let k = companyKey(name);
  for (const form of LEGAL_FORMS) {
    k = k.replace(new RegExp(`(^|[\\s,.])${form}(?=$|[\\s,.])`, "g"), " ");
  }
  return k.replace(NON_ALNUM, " ").replace(/\s+/g, " ").trim();
}

function findCompanyByName(name: string): Company | undefined {
  const key = companyKey(name);
  if (!key) return undefined;
  return db.select().from(companies).all().find((c) => companyKey(c.name) === key);
}

function ensureCompanyId(name: string, actorId: number, t: string, extra: Partial<InsertCompany> = {}): number {
  const existing = findCompanyByName(name);
  if (existing) return existing.id;
  const created = db.insert(companies).values({
    ...extra, name: name.trim(), createdAt: t, updatedAt: t, updatedById: actorId,
  }).returning().get() as Company;
  return created.id;
}

// Keeps company (text) and companyId consistent on lead/contact writes.
function resolveCompanyLink<T extends { company?: string | null; companyId?: number | null }>(
  data: T, actorId: number, t: string, extra: Partial<InsertCompany> = {},
): T {
  const out = { ...data };
  const hasName = Object.prototype.hasOwnProperty.call(data, "company");
  const hasId = Object.prototype.hasOwnProperty.call(data, "companyId");
  if (hasId && data.companyId) {
    const c = db.select().from(companies).where(eq(companies.id, data.companyId)).get();
    if (!c) throw new Error("Компанію не знайдено");
    // An explicit name that differs from the selected company wins (user typed a new one).
    if (hasName && data.company && companyKey(data.company) !== companyKey(c.name)) {
      out.companyId = ensureCompanyId(data.company, actorId, t, extra);
      out.company = db.select().from(companies).where(eq(companies.id, out.companyId)).get()!.name;
    } else {
      out.company = c.name;
    }
  } else if (hasName) {
    const name = (data.company ?? "").trim();
    out.companyId = name ? ensureCompanyId(name, actorId, t, extra) : null;
    // Use the company's own spelling so the same company is written one way.
    out.company = out.companyId
      ? db.select().from(companies).where(eq(companies.id, out.companyId)).get()!.name
      : null;
  }
  return out;
}

// ─── Main contact of a client → contact person of its company ────────────────
// A client (deal) keeps one main contact inline. The same person should also be
// a contact person of the company, without duplicates.
const PLACEHOLDER_CONTACTS = new Set(["", "контакт", "-", "—"]);
const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "").slice(-9);

function sameContact(c: Contact, name: string, phone?: string | null, email?: string | null): boolean {
  if (companyKey(c.fullName) === companyKey(name)) return true;
  const p = digits(phone);
  if (p.length >= 9 && digits(c.phone) === p) return true;
  const e = (email ?? "").trim().toLowerCase();
  return !!e && (c.email ?? "").trim().toLowerCase() === e;
}

// Returns true when the lead's main contact is a real person not yet among the company's contacts.
function leadContactMissing(lead: Lead, companyContacts: Contact[]): boolean {
  if (!lead.companyId) return false;
  if (PLACEHOLDER_CONTACTS.has(companyKey(lead.contactName))) return false;
  return !companyContacts.some((c) => sameContact(c, lead.contactName, lead.contactPhone, lead.contactEmail));
}

function addLeadContactToCompany(lead: Lead, actorId: number, t: string): Contact | undefined {
  if (!lead.companyId) return undefined;
  const companyContacts = db.select().from(contacts).where(eq(contacts.companyId, lead.companyId)).all();
  if (!leadContactMissing(lead, companyContacts)) return undefined;
  const contact = db.insert(contacts).values({
    company: lead.company ?? "",
    companyId: lead.companyId,
    fullName: lead.contactName.trim(),
    phone: lead.contactPhone ?? null,
    email: lead.contactEmail ?? null,
    createdAt: t, updatedAt: t, updatedById: actorId,
  }).returning().get() as Contact;
  db.insert(events).values({
    leadId: lead.id, type: "system", contactId: contact.id, authorId: actorId, createdAt: t,
    message: `Контакт ${contact.fullName} додано до контактних осіб компанії ${contact.company}`,
  }).run();
  return contact;
}

export type ContactSyncReport = { contactsToCreate: number; leadsWithoutCompany: number; applied: boolean };

export type CompanyLinkReport = {
  companiesToCreate: number;
  existingCompaniesUsed: number;
  leadsToLink: number;
  contactsToLink: number;
  leadsWithoutCompany: number;
  possibleDuplicates: { names: string[]; leads: number }[];
  applied: boolean;
};

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) if (v != null && v !== "") counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined; let n = 0;
  for (const [v, c] of Array.from(counts.entries())) if (c > n) { best = v; n = c; }
  return best;
}

export const storage = {
  // Users — never expose password hashes to callers.
  listUsers: (): SafeUser[] => db.select().from(users).all().map((u) => sanitizeUser(u)!),
  getUser: (id: number): SafeUser | undefined =>
    sanitizeUser(db.select().from(users).where(eq(users.id, id)).get()),
  createUser: (data: InsertUser): SafeUser => {
    const { password, ...rest } = data;
    const passwordHash = password ? hashPassword(password) : null;
    const user = db.insert(users).values({ ...rest, passwordHash }).returning().get();
    return sanitizeUser(user)!;
  },
  updateUser: (id: number, data: Partial<InsertUser>): SafeUser | undefined => {
    const { password, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (password) patch.passwordHash = hashPassword(password);
    const user = db.update(users).set(patch).where(eq(users.id, id)).returning().get();
    return sanitizeUser(user);
  },
  // Authenticate by email + password; returns sanitized user or null.
  login: (email: string, password: string): SafeUser | null => {
    // In production short passwords (incl. the old demo default) are not accepted,
    // so accounts still on a demo password must get a new one from a manager first.
    if (IS_PRODUCTION && password.length < MIN_PASSWORD_LENGTH) return null;
    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user || !verifyPassword(password, user.passwordHash)) return null;
    return sanitizeUser(user)!;
  },

  // Companies
  listCompanies: () => db.select().from(companies).orderBy(asc(companies.name)).all(),
  getCompany: (id: number) => db.select().from(companies).where(eq(companies.id, id)).get(),
  createCompany: (data: InsertCompany, actorId = DEFAULT_ACTOR_ID): Company => {
    if (findCompanyByName(data.name)) throw new Error("Компанія з такою назвою вже є");
    const t = now();
    return db.insert(companies).values({ ...data, name: data.name.trim(), createdAt: t, updatedAt: t, updatedById: actorId }).returning().get() as Company;
  },
  updateCompany: (id: number, data: Partial<InsertCompany>, actorId = DEFAULT_ACTOR_ID): Company | undefined => {
    const existing = db.select().from(companies).where(eq(companies.id, id)).get();
    if (!existing) return undefined;
    if (data.name !== undefined) {
      const other = findCompanyByName(data.name);
      if (other && other.id !== id) throw new Error("Компанія з такою назвою вже є. Щоб звести їх в одну, скористайтеся «Об'єднати».");
    }
    const t = now();
    return sqlite.transaction(() => {
      const updated = db.update(companies).set({ ...data, updatedAt: t, updatedById: actorId }).where(eq(companies.id, id)).returning().get() as Company;
      if (data.name !== undefined && updated.name !== existing.name) {
        // Rename: keep the name copies on linked clients and contacts in sync.
        db.update(leads).set({ company: updated.name }).where(eq(leads.companyId, id)).run();
        db.update(contacts).set({ company: updated.name }).where(eq(contacts.companyId, id)).run();
      }
      return updated;
    })();
  },
  deleteCompany: (id: number) => {
    const linked = db.select().from(leads).where(eq(leads.companyId, id)).all().length
      + db.select().from(contacts).where(eq(contacts.companyId, id)).all().length;
    if (linked > 0) throw new Error("У компанії є угоди або контакти. Спершу перенесіть їх або об'єднайте компанію з іншою.");
    return db.delete(companies).where(eq(companies.id, id)).run();
  },
  // Moves all clients and contacts of `sourceId` into `targetId`, then removes the source.
  mergeCompanies: (sourceId: number, targetId: number, actorId = DEFAULT_ACTOR_ID): Company => {
    if (sourceId === targetId) throw new Error("Оберіть іншу компанію");
    const source = db.select().from(companies).where(eq(companies.id, sourceId)).get();
    const target = db.select().from(companies).where(eq(companies.id, targetId)).get();
    if (!source || !target) throw new Error("Компанію не знайдено");
    const t = now();
    return sqlite.transaction(() => {
      const movedLeads = db.select().from(leads).where(eq(leads.companyId, sourceId)).all();
      db.update(leads).set({ companyId: targetId, company: target.name }).where(eq(leads.companyId, sourceId)).run();
      db.update(contacts).set({ companyId: targetId, company: target.name }).where(eq(contacts.companyId, sourceId)).run();
      // Fill empty fields of the target from the source, never overwrite.
      const fill: Record<string, unknown> = {};
      for (const k of ["edrpou", "city", "address", "website", "industry", "phone", "email", "responsibleId", "notes"] as const) {
        if ((target as any)[k] == null || (target as any)[k] === "") fill[k] = (source as any)[k];
      }
      const updated = db.update(companies).set({ ...fill, updatedAt: t, updatedById: actorId }).where(eq(companies.id, targetId)).returning().get() as Company;
      db.delete(companies).where(eq(companies.id, sourceId)).run();
      for (const l of movedLeads) {
        addLeadEvent(l.id, "system", `Компанію «${source.name}» об'єднано з «${target.name}»: ${actorName(actorId)}`, actorId, t);
      }
      return updated;
    })();
  },
  // Creates companies from the names already typed in clients/contacts and links them.
  // dryRun=true only reports what would happen and changes nothing.
  linkExistingCompanies: (dryRun: boolean, actorId = DEFAULT_ACTOR_ID): CompanyLinkReport => {
    const unlinkedLeads = db.select().from(leads).all().filter((l) => !l.companyId);
    const unlinkedContacts = db.select().from(contacts).all().filter((c) => !c.companyId);
    const groups = new Map<string, { names: string[]; leads: Lead[]; contacts: Contact[] }>();
    const group = (key: string) => {
      if (!groups.has(key)) groups.set(key, { names: [], leads: [], contacts: [] });
      return groups.get(key)!;
    };
    let leadsWithoutCompany = 0;
    for (const l of unlinkedLeads) {
      const key = companyKey(l.company);
      if (!key) { leadsWithoutCompany++; continue; }
      const g = group(key); g.names.push(l.company!.trim()); g.leads.push(l);
    }
    for (const c of unlinkedContacts) {
      const key = companyKey(c.company);
      if (!key) continue;
      const g = group(key); g.names.push(c.company.trim()); g.contacts.push(c);
    }
    const existingByKey = new Map(db.select().from(companies).all().map((c) => [companyKey(c.name), c]));
    let companiesToCreate = 0; let existingCompaniesUsed = 0;
    for (const key of Array.from(groups.keys())) {
      if (existingByKey.has(key)) existingCompaniesUsed++; else companiesToCreate++;
    }

    // Probable duplicates among all company names (existing + to be created).
    const loose = new Map<string, Map<string, { name: string; leads: number }>>();
    const addLoose = (key: string, name: string, leadCount: number) => {
      const lk = companyLooseKey(name);
      if (!lk) return;
      if (!loose.has(lk)) loose.set(lk, new Map());
      const m = loose.get(lk)!;
      const prev = m.get(key);
      m.set(key, { name: prev?.name ?? name, leads: (prev?.leads ?? 0) + leadCount });
    };
    for (const [key, c] of Array.from(existingByKey.entries())) addLoose(key, c.name, 0);
    for (const [key, g] of Array.from(groups.entries())) addLoose(key, existingByKey.get(key)?.name ?? mostCommon(g.names)!, g.leads.length);
    const possibleDuplicates = Array.from(loose.values())
      .filter((m) => m.size > 1)
      .map((m) => ({ names: Array.from(m.values()).map((v) => v.name), leads: Array.from(m.values()).reduce((a, v) => a + v.leads, 0) }))
      .sort((a, b) => b.leads - a.leads);

    const report: CompanyLinkReport = {
      companiesToCreate,
      existingCompaniesUsed,
      leadsToLink: Array.from(groups.values()).reduce((a, g) => a + g.leads.length, 0),
      contactsToLink: Array.from(groups.values()).reduce((a, g) => a + g.contacts.length, 0),
      leadsWithoutCompany,
      possibleDuplicates,
      applied: false,
    };
    if (dryRun) return report;

    const t = now();
    sqlite.transaction(() => {
      for (const [key, g] of Array.from(groups.entries())) {
        let company = existingByKey.get(key);
        if (!company) {
          company = db.insert(companies).values({
            name: mostCommon(g.names)!,
            city: mostCommon(g.leads.map((l) => l.city?.trim() || null)) ?? null,
            responsibleId: mostCommon(g.leads.map((l) => l.responsibleId)) ?? null,
            createdAt: t, updatedAt: t, updatedById: actorId,
          }).returning().get() as Company;
        }
        // Only the link is set; client names, dates and history stay as they are.
        if (g.leads.length) db.update(leads).set({ companyId: company.id, company: company.name }).where(inArray(leads.id, g.leads.map((l) => l.id))).run();
        if (g.contacts.length) db.update(contacts).set({ companyId: company.id, company: company.name }).where(inArray(contacts.id, g.contacts.map((c) => c.id))).run();
      }
    })();
    return { ...report, applied: true };
  },

  // Adds the main contact of every client to its company's contact persons (no duplicates).
  // dryRun=true only counts; nothing changes.
  syncLeadContacts: (dryRun: boolean, actorId = DEFAULT_ACTOR_ID): ContactSyncReport => {
    const allLeads = db.select().from(leads).orderBy(asc(leads.createdAt)).all();
    const byCompany = new Map<number, Contact[]>();
    for (const c of db.select().from(contacts).all()) {
      if (c.companyId) byCompany.set(c.companyId, [...(byCompany.get(c.companyId) ?? []), c]);
    }
    let contactsToCreate = 0;
    const toCreate: Lead[] = [];
    for (const l of allLeads) {
      if (!l.companyId) continue;
      const list = byCompany.get(l.companyId) ?? [];
      if (!leadContactMissing(l, list)) continue;
      contactsToCreate++;
      toCreate.push(l);
      // Count the same person in two deals only once.
      list.push({ fullName: l.contactName, phone: l.contactPhone, email: l.contactEmail } as Contact);
      byCompany.set(l.companyId, list);
    }
    const report = { contactsToCreate, leadsWithoutCompany: allLeads.filter((l) => !l.companyId).length, applied: false };
    if (dryRun) return report;
    const t = now();
    sqlite.transaction(() => { for (const l of toCreate) addLeadContactToCompany(l, actorId, t); })();
    return { ...report, applied: true };
  },

  // Leads
  listLeads: () => db.select().from(leads).orderBy(desc(leads.updatedAt)).all(),
  getLead: (id: number) => db.select().from(leads).where(eq(leads.id, id)).get(),
  createLead: (
    data: InsertLead,
    actorId = DEFAULT_ACTOR_ID,
    dates: { createdAt?: string; updatedAt?: string } = {},
  ): Lead => {
    const created = dates.createdAt || now();
    const updated = dates.updatedAt || created;
    data = resolveCompanyLink(data, actorId, now(), { city: data.city ?? null, responsibleId: data.responsibleId ?? null });
    const lead = db.insert(leads).values({ ...data, createdAt: created, updatedAt: updated, updatedById: actorId }).returning().get() as Lead;
    db.insert(events).values({
      leadId: lead.id, type: "system", message: "Угоду створено", authorId: actorId, createdAt: created,
    }).run();
    addLeadContactToCompany(lead, actorId, created);
    return lead;
  },
  updateLead: (id: number, data: Partial<InsertLead>, actorId = DEFAULT_ACTOR_ID): Lead | undefined => {
    const existing = db.select().from(leads).where(eq(leads.id, id)).get();
    if (!existing) return undefined;
    const t = now();
    data = resolveCompanyLink(data, actorId, t, { city: data.city ?? existing.city, responsibleId: data.responsibleId ?? existing.responsibleId });
    if (data.stage && data.stage !== existing.stage) {
      db.insert(events).values({
        leadId: id, type: "stage_change",
        message: `Стадія змінена: ${existing.stage} → ${data.stage}`,
        authorId: actorId, createdAt: t,
      }).run();
    }
    const updated = db.update(leads).set({ ...data, updatedAt: t, updatedById: actorId }).where(eq(leads.id, id)).returning().get();
    db.insert(events).values({
      leadId: id,
      type: "system",
      message: `Картку угоди відредаговано: ${actorName(actorId)}`,
      authorId: actorId,
      createdAt: t,
    }).run();
    if (updated) addLeadContactToCompany(updated as Lead, actorId, t);
    return updated;
  },
  deleteLead: (id: number) => db.delete(leads).where(eq(leads.id, id)).run(),

  // Contacts
  listContacts: () => db.select().from(contacts).orderBy(asc(contacts.company), asc(contacts.fullName)).all(),
  listContactsByCompany: (company: string) => db.select().from(contacts).where(eq(contacts.company, company)).orderBy(asc(contacts.fullName)).all(),
  listContactsByCompanyId: (companyId: number) => db.select().from(contacts).where(eq(contacts.companyId, companyId)).orderBy(asc(contacts.fullName)).all(),
  listLeadsByCompanyId: (companyId: number) => db.select().from(leads).where(eq(leads.companyId, companyId)).orderBy(desc(leads.updatedAt)).all(),
  createContact: (data: InsertContact, actorId = DEFAULT_ACTOR_ID): Contact => {
    const t = now();
    data = resolveCompanyLink(data, actorId, t) as InsertContact;
    if (!data.company) throw new Error("Вкажіть компанію");
    const contact = db.insert(contacts).values({ ...data, createdAt: t, updatedAt: t, updatedById: actorId }).returning().get() as Contact;
    const companyLeads = db.select().from(leads).where(eq(leads.companyId, contact.companyId!)).all();
    for (const lead of companyLeads) {
      addLeadEventForContact(lead.id, contact.id, "system", `Додано контакт до компанії ${contact.company}: ${contact.fullName}${contact.phone ? `, ${contact.phone}` : ""}`, actorId, t);
    }
    return contact;
  },
  updateContact: (id: number, data: Partial<InsertContact>, actorId = DEFAULT_ACTOR_ID): Contact | undefined => {
    const existing = db.select().from(contacts).where(eq(contacts.id, id)).get();
    if (!existing) return undefined;
    const t = now();
    data = resolveCompanyLink(data, actorId, t);
    if (Object.prototype.hasOwnProperty.call(data, "company") && !data.company) throw new Error("Вкажіть компанію");
    const updated = db.update(contacts).set({ ...data, updatedAt: t, updatedById: actorId }).where(eq(contacts.id, id)).returning().get() as Contact;
    const companyLeads = updated.companyId
      ? db.select().from(leads).where(eq(leads.companyId, updated.companyId)).all()
      : db.select().from(leads).where(eq(leads.company, updated.company)).all();
    for (const lead of companyLeads) {
      addLeadEventForContact(lead.id, updated.id, "system", `Контакт відредаговано: ${updated.fullName}`, actorId, t);
    }
    return updated;
  },
  deleteContact: (id: number) => db.delete(contacts).where(eq(contacts.id, id)).run(),

  // Equipment
  listEquipment: () => db.select().from(equipment).orderBy(asc(equipment.name)).all(),
  getEquipment: (id: number) => db.select().from(equipment).where(eq(equipment.id, id)).get(),
  createEquipment: (data: InsertEquipment, actorId = DEFAULT_ACTOR_ID) =>
    db.insert(equipment).values({ ...data, updatedAt: now(), updatedById: actorId }).returning().get(),
  updateEquipment: (id: number, data: Partial<InsertEquipment>, actorId = DEFAULT_ACTOR_ID) =>
    db.update(equipment).set({ ...data, updatedAt: now(), updatedById: actorId }).where(eq(equipment.id, id)).returning().get(),
  deleteEquipment: (id: number) => db.delete(equipment).where(eq(equipment.id, id)).run(),

  // Sales
  listSales: () => db.select().from(sales).orderBy(desc(sales.soldAt)).all(),
  listSalesByLead: (leadId: number) => db.select().from(sales).where(eq(sales.leadId, leadId)).all(),
  createSale: (data: InsertSale, actorId = DEFAULT_ACTOR_ID) => {
    const t = now();
    const sale = db.insert(sales).values({ ...data, updatedAt: t, updatedById: actorId }).returning().get() as Sale;
    const eq2 = db.select().from(equipment).where(eq(equipment.id, sale.equipmentId)).get();
    addLeadEvent(sale.leadId, "sale", `Продаж: ${eq2?.name ?? "обладнання"} — ${sale.price.toLocaleString("uk-UA")} грн`, actorId, t);
    return sale;
  },
  updateSale: (id: number, data: Partial<InsertSale>, actorId = DEFAULT_ACTOR_ID) => {
    const existing = db.select().from(sales).where(eq(sales.id, id)).get();
    if (!existing) return undefined;
    const t = now();
    const updated = db.update(sales).set({ ...data, updatedAt: t, updatedById: actorId }).where(eq(sales.id, id)).returning().get() as Sale;
    addLeadEvent(updated.leadId, "sale", `Продаж #${id} відредаговано: ${actorName(actorId)}`, actorId, t);
    return updated;
  },
  deleteSale: (id: number) => db.delete(sales).where(eq(sales.id, id)).run(),

  // Repairs
  listRepairs: () => db.select().from(repairs).orderBy(desc(repairs.receivedAt)).all(),
  listRepairsByLead: (leadId: number) => db.select().from(repairs).where(eq(repairs.leadId, leadId)).all(),
  getRepair: (id: number) => db.select().from(repairs).where(eq(repairs.id, id)).get(),
  createRepair: (data: InsertRepair, actorId = DEFAULT_ACTOR_ID) => {
    const t = now();
    const r = db.insert(repairs).values({ ...data, updatedAt: t, updatedById: actorId }).returning().get() as Repair;
    const eq2 = db.select().from(equipment).where(eq(equipment.id, r.equipmentId)).get();
    addLeadEvent(r.leadId, "repair", `Прийом у сервіс: ${eq2?.name ?? "обладнання"} — ${r.reason}`, r.engineerId ?? actorId, t);
    return r;
  },
  updateRepair: (id: number, data: Partial<InsertRepair>, actorId = DEFAULT_ACTOR_ID) => {
    const existing = db.select().from(repairs).where(eq(repairs.id, id)).get();
    if (!existing) return undefined;
    const t = now();
    const updated = db.update(repairs).set({ ...data, updatedAt: t, updatedById: actorId }).where(eq(repairs.id, id)).returning().get() as Repair;
    if (data.status && data.status !== existing.status) {
      addLeadEvent(updated.leadId, "repair", `Сервіс #${id}: статус → ${data.status}`, actorId, t);
    } else {
      addLeadEvent(updated.leadId, "repair", `Сервіс #${id} відредаговано: ${actorName(actorId)}`, actorId, t);
    }
    return updated;
  },
  deleteRepair: (id: number) => db.delete(repairs).where(eq(repairs.id, id)).run(),

  // Rentals
  listRentals: () => db.select().from(rentals).orderBy(desc(rentals.startDate)).all(),
  listRentalsByLead: (leadId: number) => db.select().from(rentals).where(eq(rentals.leadId, leadId)).all(),
  getRental: (id: number) => db.select().from(rentals).where(eq(rentals.id, id)).get(),
  createRental: (data: InsertRental, actorId = DEFAULT_ACTOR_ID) => {
    const t = now();
    const r = db.insert(rentals).values({ ...data, updatedAt: t, updatedById: actorId }).returning().get() as Rental;
    const eq2 = db.select().from(equipment).where(eq(equipment.id, r.equipmentId)).get();
    addLeadEvent(r.leadId, "rental", `Оренда: ${eq2?.name ?? "обладнання"} — ${r.startDate} → ${r.endDate}`, actorId, t);
    return r;
  },
  updateRental: (id: number, data: Partial<InsertRental>, actorId = DEFAULT_ACTOR_ID) => {
    const existing = db.select().from(rentals).where(eq(rentals.id, id)).get();
    if (!existing) return undefined;
    const t = now();
    const updated = db.update(rentals).set({ ...data, updatedAt: t, updatedById: actorId }).where(eq(rentals.id, id)).returning().get() as Rental;
    addLeadEvent(updated.leadId, "rental", `Оренду #${id} відредаговано: ${actorName(actorId)}`, actorId, t);
    return updated;
  },
  deleteRental: (id: number) => db.delete(rentals).where(eq(rentals.id, id)).run(),

  // Tasks
  listTasks: () => db.select().from(tasks).orderBy(desc(tasks.createdAt)).all(),
  listTasksByLead: (leadId: number) => db.select().from(tasks).where(eq(tasks.leadId, leadId)).all(),
  getTask: (id: number) => db.select().from(tasks).where(eq(tasks.id, id)).get(),
  createTask: (data: InsertTask, actorId = DEFAULT_ACTOR_ID) => {
    const ts = now();
    const t = db.insert(tasks).values({ ...data, createdAt: ts, updatedAt: ts, updatedById: actorId }).returning().get() as Task;
    addLeadEventForContact(t.leadId, t.contactId, "task", `Задача створена: ${t.title}`, actorId, ts);
    return t;
  },
  updateTask: (id: number, data: Partial<InsertTask>, actorId = DEFAULT_ACTOR_ID) => {
    const existing = db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!existing) return undefined;
    const t = now();
    const updated = db.update(tasks).set({ ...data, updatedAt: t, updatedById: actorId }).where(eq(tasks.id, id)).returning().get() as Task;
    addLeadEventForContact(updated.leadId, updated.contactId, "task", `Задачу #${id} відредаговано: ${actorName(actorId)}`, actorId, t);
    return updated;
  },
  deleteTask: (id: number) => db.delete(tasks).where(eq(tasks.id, id)).run(),

  // Events
  listEventsByLead: (leadId: number) =>
    db.select().from(events).where(eq(events.leadId, leadId)).orderBy(desc(events.createdAt)).all(),
  createEvent: (data: InsertEvent) =>
    db.insert(events).values({ ...data, createdAt: now() }).returning().get(),
};

// ─── Seed ────────────────────────────────────────────────────────────────────
function seed() {
  const userCount = db.select().from(users).all().length;
  if (userCount > 0) return;

  const dh = () => hashPassword("123456");
  const insertedUsers = db.insert(users).values([
    { fullName: "Олександр Ковальчук", role: "director",   email: "director@semark.ua", phone: "+380501112233", passwordHash: dh() },
    { fullName: "Ігор Шевченко",       role: "engineer",   email: "engineer@semark.ua", phone: "+380502223344", passwordHash: dh() },
    { fullName: "Олена Бондаренко",    role: "accountant", email: "buh@semark.ua",      phone: "+380503334455", passwordHash: dh() },
    { fullName: "Марина Левченко",     role: "sales",      email: "sales@semark.ua",    phone: "+380504445566", passwordHash: dh() },
    { fullName: "Адміністратор",       role: "admin",      email: "admin@semark.ua",    phone: "+380505556677", passwordHash: dh() },
  ]).returning().all();
  const [director, engineer, accountant, sales1, admin] = insertedUsers;

  const insertedEq = db.insert(equipment).values([
    { name: "Волоконний маркер 30W", model: "Semark FM-30",  type: "fiber",   serial: "FM30-001", price: 165000,  rentalDayPrice: 2500, status: "available", notes: "Базова комплектація" },
    { name: "Волоконний маркер 50W", model: "Semark FM-50",  type: "fiber",   serial: "FM50-002", price: 215000,  rentalDayPrice: 3500, status: "rented",    notes: null },
    { name: "CO2 лазер 60W",         model: "Semark CO2-60", type: "co2",     serial: "CO60-003", price: 185000,  rentalDayPrice: 3000, status: "available", notes: null },
    { name: "CO2 лазер 100W",        model: "Semark CO2-100",type: "co2",     serial: "CO100-04", price: 285000,  rentalDayPrice: 4500, status: "maintenance", notes: "Калібрування" },
    { name: "УФ маркер 3W",          model: "Semark UV-3",   type: "marker",  serial: "UV3-005",  price: 320000,  rentalDayPrice: 5500, status: "available", notes: null },
    { name: "Поворотна вісь",        model: "Semark RA-1",   type: "accessory", serial: "RA-006", price: 24000,   rentalDayPrice: 500,  status: "available", notes: "Аксесуар" },
  ]).returning().all();

  const todayIso = new Date().toISOString();
  const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
  const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

  const ld = db.insert(leads).values([
    { title: "Маркування підшипників — ТОВ КиївПром",          stage: "won",        source: "referral", company: "ТОВ КиївПром",       contactName: "Андрій Мельник",   contactPhone: "+380671112233", contactEmail: "a.melnyk@kyivprom.ua", city: "Київ",    budget: 220000, responsibleId: sales1.id, notes: "Постійний клієнт, замовлення з 2021 року.", createdAt: daysAgo(120), updatedAt: daysAgo(2) },
    { title: "Гравіювання шильд — Полтавазапчастина",          stage: "negotiation",source: "website",  company: "Полтавазапчастина",  contactName: "Світлана Гончар", contactPhone: "+380672223344", contactEmail: "s.gonchar@plzap.ua",   city: "Полтава", budget: 190000, responsibleId: sales1.id, notes: "Просять знижку 7%.", createdAt: daysAgo(30), updatedAt: daysAgo(1) },
    { title: "Маркування медичних інструментів",                stage: "proposal",   source: "exhibition", company: "МедТех Київ",     contactName: "Юлія Петрова",     contactPhone: "+380673334455", contactEmail: "yu.petrova@medtech.ua",city: "Київ",    budget: 340000, responsibleId: director.id, notes: "Потрібен УФ або волоконний.", createdAt: daysAgo(14), updatedAt: daysAgo(3) },
    { title: "Гравіювання сувенірної продукції",                stage: "qualified",  source: "phone",    company: "ФОП Іваненко",      contactName: "Олег Іваненко",    contactPhone: "+380674445566", contactEmail: "oleg@iv.com.ua",        city: "Полтава", budget: 120000, responsibleId: sales1.id, notes: "Розглядають оренду.", createdAt: daysAgo(7), updatedAt: daysAgo(7) },
    { title: "Маркування деталей — Турбоагро",                  stage: "contacted",  source: "website",  company: "Турбоагро",         contactName: "Микола Гриценко",  contactPhone: "+380675556677", contactEmail: "m.gr@turboagro.ua",    city: "Кременчук", budget: 175000, responsibleId: sales1.id, notes: null, createdAt: daysAgo(3), updatedAt: daysAgo(3) },
    { title: "Нанесення логотипів на корпуси",                  stage: "new",        source: "website",  company: "Electronix UA",     contactName: "Дмитро Сидоренко", contactPhone: "+380676667788", contactEmail: "d.s@electronix.ua",    city: "Київ",    budget: 95000,  responsibleId: sales1.id, notes: null, createdAt: daysAgo(1), updatedAt: daysAgo(1) },
    { title: "Ремонт волоконного маркера",                      stage: "won",        source: "service",  company: "ТОВ КиївПром",       contactName: "Андрій Мельник",   contactPhone: "+380671112233", contactEmail: "a.melnyk@kyivprom.ua", city: "Київ",    budget: 12000,  responsibleId: engineer.id, notes: "Сервісний кейс.", createdAt: daysAgo(20), updatedAt: daysAgo(5) },
  ]).returning().all();

  // Sales
  db.insert(sales).values([
    { leadId: ld[0].id, equipmentId: insertedEq[0].id, price: 165000, soldAt: daysAgo(110), notes: "З поворотною віссю." },
    { leadId: ld[0].id, equipmentId: insertedEq[5].id, price: 24000,  soldAt: daysAgo(110), notes: null },
    { leadId: ld[6].id, equipmentId: insertedEq[1].id, price: 215000, soldAt: daysAgo(180), notes: "Продано раніше, зараз сервіс." },
  ]).run();

  // Repairs
  db.insert(repairs).values([
    { leadId: ld[6].id, equipmentId: insertedEq[1].id, reason: "Не запускається лазер", diagnosis: "Вийшов з ладу блок живлення", partsReplaced: "Блок живлення 48V", cost: 8500, status: "returned", receivedAt: daysAgo(20), returnedAt: daysAgo(12), engineerId: engineer.id, notes: "Гарантійне обслуговування." },
    { leadId: ld[0].id, equipmentId: insertedEq[0].id, reason: "Слабка потужність маркування", diagnosis: "Забруднена оптика", partsReplaced: "Захисне скло",            cost: 1200, status: "ready",    receivedAt: daysAgo(5),  returnedAt: null,       engineerId: engineer.id, notes: "Чекає клієнта." },
    { leadId: ld[1].id, equipmentId: insertedEq[2].id, reason: "Профілактика",                 diagnosis: "Планове ТО",         partsReplaced: "Фільтри, оптика",            cost: 3500, status: "in_repair",receivedAt: daysAgo(2),  returnedAt: null,       engineerId: engineer.id, notes: null },
  ]).run();

  // Rentals
  db.insert(rentals).values([
    { leadId: ld[3].id, equipmentId: insertedEq[1].id, startDate: daysFromNow(-3), endDate: daysFromNow(11), pricePerDay: 3500, deposit: 15000, status: "active",   returnCondition: null, notes: "Тестовий запуск перед купівлею." },
    { leadId: ld[2].id, equipmentId: insertedEq[4].id, startDate: daysFromNow(7),  endDate: daysFromNow(14), pricePerDay: 5500, deposit: 25000, status: "reserved", returnCondition: null, notes: "Очікує доставки." },
    { leadId: ld[0].id, equipmentId: insertedEq[2].id, startDate: daysFromNow(-40),endDate: daysFromNow(-25),pricePerDay: 3000, deposit: 12000, status: "returned", returnCondition: "Без зауважень", notes: null },
  ]).run();

  // Tasks
  db.insert(tasks).values([
    { title: "Підготувати КП для Полтавазапчастина",  description: "Знижка 7%, термін постачання 14 днів.", status: "in_progress", priority: "high",   dueDate: daysFromNow(2),  assigneeId: sales1.id,    leadId: ld[1].id, createdAt: daysAgo(2) },
    { title: "Узгодити ТЗ з МедТех Київ",              description: "Уточнити матеріали інструментів.",      status: "open",        priority: "medium", dueDate: daysFromNow(5),  assigneeId: director.id,  leadId: ld[2].id, createdAt: daysAgo(1) },
    { title: "Видати рахунок на оренду УФ маркера",    description: "Передоплата + застава 25 000 грн.",     status: "open",        priority: "high",   dueDate: daysFromNow(1),  assigneeId: accountant.id,leadId: ld[2].id, createdAt: daysAgo(1) },
    { title: "Замовити запчастини для CO2-100",        description: "Лазерна трубка + дзеркала.",            status: "open",        priority: "urgent", dueDate: daysFromNow(0),  assigneeId: engineer.id,  leadId: null,    createdAt: daysAgo(1) },
    { title: "Зателефонувати Electronix UA",            description: "Кваліфікувати лід.",                    status: "open",        priority: "medium", dueDate: daysFromNow(1),  assigneeId: sales1.id,    leadId: ld[5].id, createdAt: daysAgo(0) },
    { title: "Закрити сервісний кейс ТОВ КиївПром",    description: "Викликати клієнта на видачу.",          status: "done",        priority: "medium", dueDate: daysFromNow(-2), assigneeId: engineer.id,  leadId: ld[6].id, createdAt: daysAgo(8) },
  ]).run();

  // System / activity events for richer timelines
  db.insert(events).values([
    // Lead 0 — KyivProm history
    { leadId: ld[0].id, type: "system",       message: "Лід створено",                                              authorId: sales1.id,   createdAt: daysAgo(120) },
    { leadId: ld[0].id, type: "stage_change", message: "Стадія змінена: new → contacted",                            authorId: sales1.id,   createdAt: daysAgo(118) },
    { leadId: ld[0].id, type: "stage_change", message: "Стадія змінена: contacted → qualified",                      authorId: sales1.id,   createdAt: daysAgo(115) },
    { leadId: ld[0].id, type: "sale",         message: "Продаж: Волоконний маркер 30W — 165 000 грн",                authorId: sales1.id,   createdAt: daysAgo(110) },
    { leadId: ld[0].id, type: "sale",         message: "Продаж: Поворотна вісь — 24 000 грн",                        authorId: sales1.id,   createdAt: daysAgo(110) },
    { leadId: ld[0].id, type: "stage_change", message: "Стадія змінена: qualified → won",                            authorId: sales1.id,   createdAt: daysAgo(108) },
    { leadId: ld[0].id, type: "rental",       message: "Оренда: CO2 лазер 60W — повернено без зауважень",            authorId: sales1.id,   createdAt: daysAgo(45)  },
    { leadId: ld[0].id, type: "repair",       message: "Прийом у сервіс: Волоконний маркер 30W — слабка потужність", authorId: engineer.id, createdAt: daysAgo(5)   },
    { leadId: ld[0].id, type: "comment",      message: "Клієнт задоволений якістю маркування.",                       authorId: sales1.id,   createdAt: daysAgo(2)   },

    // Lead 1 — Poltavazapchastyna
    { leadId: ld[1].id, type: "system",       message: "Лід створено",                                              authorId: sales1.id,   createdAt: daysAgo(30)  },
    { leadId: ld[1].id, type: "stage_change", message: "Стадія змінена: new → contacted",                            authorId: sales1.id,   createdAt: daysAgo(28)  },
    { leadId: ld[1].id, type: "stage_change", message: "Стадія змінена: contacted → qualified",                      authorId: sales1.id,   createdAt: daysAgo(20)  },
    { leadId: ld[1].id, type: "stage_change", message: "Стадія змінена: qualified → proposal",                       authorId: sales1.id,   createdAt: daysAgo(10)  },
    { leadId: ld[1].id, type: "stage_change", message: "Стадія змінена: proposal → negotiation",                     authorId: sales1.id,   createdAt: daysAgo(4)   },
    { leadId: ld[1].id, type: "task",         message: "Задача створена: Підготувати КП для Полтавазапчастина",      authorId: sales1.id,   createdAt: daysAgo(2)   },
    { leadId: ld[1].id, type: "comment",      message: "Клієнт просить додатковий тест на нержавійці.",              authorId: sales1.id,   createdAt: daysAgo(1)   },

    // Lead 2 — MedTech
    { leadId: ld[2].id, type: "system",       message: "Лід створено",                                              authorId: director.id, createdAt: daysAgo(14)  },
    { leadId: ld[2].id, type: "stage_change", message: "Стадія змінена: new → contacted",                            authorId: director.id, createdAt: daysAgo(12)  },
    { leadId: ld[2].id, type: "stage_change", message: "Стадія змінена: contacted → qualified",                      authorId: director.id, createdAt: daysAgo(8)   },
    { leadId: ld[2].id, type: "stage_change", message: "Стадія змінена: qualified → proposal",                       authorId: director.id, createdAt: daysAgo(5)   },
    { leadId: ld[2].id, type: "comment",      message: "Призначено демо в офісі 14:00.",                              authorId: director.id, createdAt: daysAgo(3)   },
    { leadId: ld[2].id, type: "rental",       message: "Оренда: УФ маркер 3W — заброньовано на тиждень",             authorId: director.id, createdAt: daysAgo(2)   },

    // Lead 6 — Service case for KyivProm
    { leadId: ld[6].id, type: "system",       message: "Сервісний кейс відкрито",                                    authorId: engineer.id, createdAt: daysAgo(20)  },
    { leadId: ld[6].id, type: "repair",       message: "Прийом у сервіс: Волоконний маркер 50W — не запускається лазер", authorId: engineer.id, createdAt: daysAgo(20) },
    { leadId: ld[6].id, type: "repair",       message: "Сервіс #1: статус → in_repair",                              authorId: engineer.id, createdAt: daysAgo(18)  },
    { leadId: ld[6].id, type: "repair",       message: "Сервіс #1: статус → ready",                                  authorId: engineer.id, createdAt: daysAgo(14)  },
    { leadId: ld[6].id, type: "repair",       message: "Сервіс #1: статус → returned. Замінено блок живлення.",      authorId: engineer.id, createdAt: daysAgo(12)  },
    { leadId: ld[6].id, type: "stage_change", message: "Стадія змінена: negotiation → won",                          authorId: engineer.id, createdAt: daysAgo(12)  },

    // Lead 3 — rental case
    { leadId: ld[3].id, type: "system",       message: "Лід створено",                                              authorId: sales1.id,   createdAt: daysAgo(7)   },
    { leadId: ld[3].id, type: "rental",       message: "Оренда: Волоконний маркер 50W — стартувала",                authorId: sales1.id,   createdAt: daysAgo(3)   },

    // Leads 4, 5
    { leadId: ld[4].id, type: "system",       message: "Лід створено",                                              authorId: sales1.id,   createdAt: daysAgo(3)   },
    { leadId: ld[5].id, type: "system",       message: "Лід створено",                                              authorId: sales1.id,   createdAt: daysAgo(1)   },
  ]).run();
}

// Demo data is only for local development; a production database starts empty.
if (!IS_PRODUCTION) seed();

// First administrator (or password recovery) from the server environment:
// ADMIN_EMAIL + ADMIN_PASSWORD create that user, or reset the password of an
// existing user with that email. Remove ADMIN_PASSWORD from .env afterwards.
function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`ADMIN_PASSWORD коротший за ${MIN_PASSWORD_LENGTH} символів — адміністратора не створено.`);
    return;
  }
  const existing = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
  if (existing) {
    sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), existing.id);
  } else {
    sqlite.prepare("INSERT INTO users (full_name, role, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)")
      .run(process.env.ADMIN_NAME?.trim() || "Адміністратор", "director", email, null, hashPassword(password));
  }
}

bootstrapAdmin();
