import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "./access";

// ─── Users / roles ────────────────────────────────────────────────────────────
// Roles: director | executive_director | engineer | accountant | sales | admin
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fullName: text("full_name").notNull(),
  role: text("role").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, passwordHash: true }).extend({
  password: z.string().min(MIN_PASSWORD_LENGTH, `Пароль має містити щонайменше ${MIN_PASSWORD_LENGTH} символів`).optional(),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
// User without the password hash — safe to return to clients.
export type SafeUser = Omit<User, "passwordHash">;

// ─── Companies ───────────────────────────────────────────────────────────────
// A company groups its clients (leads/deals) and contact persons.
// leads.company / contacts.company keep the name as text for compatibility;
// company_id is the real link and the server keeps both in sync.
export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  edrpou: text("edrpou"),
  city: text("city"),
  address: text("address"),
  website: text("website"),
  industry: text("industry"),
  phone: text("phone"),
  email: text("email"),
  responsibleId: integer("responsible_id"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedById: integer("updated_by_id"),
});

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  updatedById: true,
}).extend({
  name: z.string().trim().min(1, "Вкажіть назву компанії"),
});
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

// ─── Leads ───────────────────────────────────────────────────────────────────
// Stages: new | contacted | qualified | proposal | negotiation | won | lost
export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  stage: text("stage").notNull().default("new"),
  source: text("source").notNull().default("website"),
  company: text("company"),
  companyId: integer("company_id"),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  city: text("city"),
  budget: integer("budget"), // UAH
  responsibleId: integer("responsible_id"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedById: integer("updated_by_id"),
});

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  updatedById: true,
});
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

// ─── Contacts inside existing companies ─────────────────────────────────────
export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  company: text("company").notNull(),
  companyId: integer("company_id"),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  position: text("position"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedById: integer("updated_by_id"),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  updatedById: true,
});
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// ─── Equipment (catalog/inventory) ────────────────────────────────────────────
// type: see EQUIPMENT_TYPES below (9 catalog types). Old keys
// (laser | fiber | co2 | marker | accessory) stay readable until each record
// gets a new type by hand.
// kind: catalog = model in the price catalog (no serial number);
//       unit    = a specific machine with a serial number (stock, demo, rental).
// status (for rental inventory): available | rented | maintenance
export const equipment = sqliteTable("equipment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  model: text("model").notNull(),
  type: text("type").notNull(),
  kind: text("kind").notNull().default("unit"),
  catalogId: integer("catalog_id"), // unit → its model in the catalog
  brand: text("brand"),
  powerW: text("power_w"), // text: the price list has ranges like "60–70"
  workField: text("work_field"),
  sourceInternal: text("source_internal"), // internal only: never in КП or client documents
  execution: text("execution"),
  serial: text("serial"),
  price: integer("price").notNull(), // UAH sale price without VAT (0 when "за запитом")
  priceVat: integer("price_vat"), // UAH with VAT
  priceStatus: text("price_status"), // approved | clarify | on_request
  priceDate: text("price_date"), // YYYY-MM-DD
  availability: text("availability"),
  rentalDayPrice: integer("rental_day_price"), // UAH/day
  status: text("status").notNull().default("available"),
  notes: text("notes"),
  updatedAt: text("updated_at"),
  updatedById: integer("updated_by_id"),
});

export const EQUIPMENT_TYPES = [
  "fiber_marker", "mopa_marker", "uv_marker", "co2_marker", "co2_cutter",
  "laser_cleaning", "dot_peen", "option", "consumable",
] as const;
export const EQUIPMENT_KINDS = ["catalog", "unit"] as const;
export const PRICE_STATUSES = ["approved", "clarify", "on_request"] as const;

export const insertEquipmentSchema = createInsertSchema(equipment, {
  kind: z.enum(EQUIPMENT_KINDS).optional(),
  priceStatus: z.enum(PRICE_STATUSES).nullable().optional(),
  priceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).omit({ id: true, updatedAt: true, updatedById: true });
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type Equipment = typeof equipment.$inferSelect;

// ─── Sales (purchases by a lead/client) ──────────────────────────────────────
export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").notNull(),
  equipmentId: integer("equipment_id").notNull(),
  price: integer("price").notNull(), // UAH actual
  soldAt: text("sold_at").notNull(),
  notes: text("notes"),
  updatedAt: text("updated_at"),
  updatedById: integer("updated_by_id"),
});

export const insertSaleSchema = createInsertSchema(sales).omit({ id: true, updatedAt: true, updatedById: true });
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type Sale = typeof sales.$inferSelect;

// ─── Service / repairs ───────────────────────────────────────────────────────
// status: received | diagnostic | in_repair | waiting_parts | ready | returned
export const repairs = sqliteTable("repairs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").notNull(),
  equipmentId: integer("equipment_id").notNull(),
  reason: text("reason").notNull(),
  diagnosis: text("diagnosis"),
  partsReplaced: text("parts_replaced"), // free text list
  cost: integer("cost").default(0),
  status: text("status").notNull().default("received"),
  receivedAt: text("received_at").notNull(),
  returnedAt: text("returned_at"),
  engineerId: integer("engineer_id"),
  notes: text("notes"),
  updatedAt: text("updated_at"),
  updatedById: integer("updated_by_id"),
});

export const insertRepairSchema = createInsertSchema(repairs).omit({ id: true, updatedAt: true, updatedById: true });
export type InsertRepair = z.infer<typeof insertRepairSchema>;
export type Repair = typeof repairs.$inferSelect;

// ─── Rentals ────────────────────────────────────────────────────────────────
// status: reserved | active | returned | overdue
export const rentals = sqliteTable("rentals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").notNull(),
  equipmentId: integer("equipment_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  pricePerDay: integer("price_per_day").notNull(),
  deposit: integer("deposit").default(0),
  status: text("status").notNull().default("reserved"),
  returnCondition: text("return_condition"),
  notes: text("notes"),
  updatedAt: text("updated_at"),
  updatedById: integer("updated_by_id"),
});

export const insertRentalSchema = createInsertSchema(rentals).omit({ id: true, updatedAt: true, updatedById: true });
export type InsertRental = z.infer<typeof insertRentalSchema>;
export type Rental = typeof rentals.$inferSelect;

// ─── Tasks ──────────────────────────────────────────────────────────────────
// status: open | in_progress | done | cancelled
// priority: low | medium | high | urgent
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"),
  priority: text("priority").notNull().default("medium"),
  dueDate: text("due_date"),
  assigneeId: integer("assignee_id"),
  leadId: integer("lead_id"),
  contactId: integer("contact_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
  updatedById: integer("updated_by_id"),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true, updatedById: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// ─── Comments / activity events ─────────────────────────────────────────────
// type: comment | stage_change | task | sale | repair | rental | system
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  authorId: integer("author_id"),
  contactId: integer("contact_id"),
  createdAt: text("created_at").notNull(),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;
