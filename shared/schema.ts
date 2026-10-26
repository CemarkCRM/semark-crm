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

// ─── Leads ───────────────────────────────────────────────────────────────────
// Stages: new | contacted | qualified | proposal | negotiation | won | lost
export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  stage: text("stage").notNull().default("new"),
  source: text("source").notNull().default("website"),
  company: text("company"),
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
// type: laser | fiber | co2 | marker | accessory
// status (for rental inventory): available | rented | maintenance
export const equipment = sqliteTable("equipment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  model: text("model").notNull(),
  type: text("type").notNull(),
  serial: text("serial"),
  price: integer("price").notNull(), // UAH list price
  rentalDayPrice: integer("rental_day_price"), // UAH/day
  status: text("status").notNull().default("available"),
  notes: text("notes"),
  updatedAt: text("updated_at"),
  updatedById: integer("updated_by_id"),
});

export const insertEquipmentSchema = createInsertSchema(equipment).omit({ id: true, updatedAt: true, updatedById: true });
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
