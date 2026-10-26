import {
  users, leads, contacts, equipment, sales, repairs, rentals, tasks, events,
  type User, type InsertUser,
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
import { eq, desc, asc } from "drizzle-orm";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { MIN_PASSWORD_LENGTH } from "@shared/access";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const sqlite = new Database("data.db");
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

  // Leads
  listLeads: () => db.select().from(leads).orderBy(desc(leads.updatedAt)).all(),
  getLead: (id: number) => db.select().from(leads).where(eq(leads.id, id)).get(),
  createLead: (data: InsertLead, actorId = DEFAULT_ACTOR_ID): Lead => {
    const t = now();
    const lead = db.insert(leads).values({ ...data, createdAt: t, updatedAt: t, updatedById: actorId }).returning().get() as Lead;
    db.insert(events).values({
      leadId: lead.id, type: "system", message: "Клієнта створено", authorId: actorId, createdAt: t,
    }).run();
    return lead;
  },
  updateLead: (id: number, data: Partial<InsertLead>, actorId = DEFAULT_ACTOR_ID): Lead | undefined => {
    const existing = db.select().from(leads).where(eq(leads.id, id)).get();
    if (!existing) return undefined;
    const t = now();
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
      message: `Картку клієнта відредаговано: ${actorName(actorId)}`,
      authorId: actorId,
      createdAt: t,
    }).run();
    return updated;
  },
  deleteLead: (id: number) => db.delete(leads).where(eq(leads.id, id)).run(),

  // Contacts
  listContacts: () => db.select().from(contacts).orderBy(asc(contacts.company), asc(contacts.fullName)).all(),
  listContactsByCompany: (company: string) => db.select().from(contacts).where(eq(contacts.company, company)).orderBy(asc(contacts.fullName)).all(),
  createContact: (data: InsertContact, actorId = DEFAULT_ACTOR_ID): Contact => {
    const t = now();
    const contact = db.insert(contacts).values({ ...data, createdAt: t, updatedAt: t, updatedById: actorId }).returning().get() as Contact;
    const companyLeads = db.select().from(leads).where(eq(leads.company, contact.company)).all();
    for (const lead of companyLeads) {
      addLeadEventForContact(lead.id, contact.id, "system", `Додано контакт до компанії ${contact.company}: ${contact.fullName}${contact.phone ? `, ${contact.phone}` : ""}`, actorId, t);
    }
    return contact;
  },
  updateContact: (id: number, data: Partial<InsertContact>, actorId = DEFAULT_ACTOR_ID): Contact | undefined => {
    const existing = db.select().from(contacts).where(eq(contacts.id, id)).get();
    if (!existing) return undefined;
    const t = now();
    const updated = db.update(contacts).set({ ...data, updatedAt: t, updatedById: actorId }).where(eq(contacts.id, id)).returning().get() as Contact;
    const companyLeads = db.select().from(leads).where(eq(leads.company, updated.company)).all();
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
