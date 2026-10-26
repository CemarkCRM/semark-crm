import type { Express, Request, Response } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage } from "./storage";
import {
  insertUserSchema,
  insertLeadSchema, insertTaskSchema, insertEquipmentSchema,
  insertSaleSchema, insertRepairSchema, insertRentalSchema, insertEventSchema,
  insertContactSchema,
} from "@shared/schema";
import { z } from "zod";
import {
  createToken, verifyToken, revokeToken,
  requireAuth, requireManager, requireImportExportAccess,
} from "./auth";

function handle<T>(res: Response, fn: () => T) {
  try {
    const result = fn();
    res.json(result ?? null);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "Bad request" });
  }
}

// Actor always comes from the validated token — never from the request body.
function actorId(req: Request): number {
  return req.user?.id ?? 0;
}

// Strip any client-supplied audit fields so they cannot spoof the actor.
function withoutAudit(body: any) {
  const { updatedById, actorId, ...rest } = body ?? {};
  return rest;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Global API guard: everything under /api requires a valid token except the
  // public auth endpoints (login, logout). This protects all business routes
  // in one place so no endpoint is accidentally left open.
  const PUBLIC_API_PATHS = new Set(["/api/auth/login", "/api/auth/logout"]);
  app.use("/api", (req, res, next) => {
    const path = req.originalUrl.split("?")[0];
    if (PUBLIC_API_PATHS.has(path)) return next();
    return requireAuth(req, res, next);
  });

  // ─── Auth (public: only login) ───────────────────────────────────────────
  app.post("/api/auth/login", (req, res) => {
    const email = String(req.body?.email ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!email || !password) return res.status(400).json({ error: "Email та пароль обов'язкові" });
    const user = storage.login(email, password);
    if (!user) return res.status(401).json({ error: "Невірний email або пароль" });
    const { token, payload } = createToken(user);
    res.json({ user, token, expiresAt: payload.exp });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = storage.getUser(req.user!.id);
    if (!user) return res.status(401).json({ error: "Користувача не знайдено" });
    res.json(user);
  });

  app.post("/api/auth/logout", (req, res) => {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      const token = header.slice("Bearer ".length).trim();
      if (token && verifyToken(token)) revokeToken(token);
    }
    res.json({ ok: true });
  });

  // ─── Users (auth required; management actions require manager role) ────────
  app.get("/api/users", requireAuth, (_req, res) => handle(res, () => storage.listUsers()));
  app.post("/api/users", requireAuth, requireManager, (req, res) => {
    try {
      const data = insertUserSchema.parse(req.body);
      res.json(storage.createUser(data));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.patch("/api/users/:id", requireAuth, requireManager, (req, res) => {
    try {
      const data = insertUserSchema.partial().parse(req.body);
      const r = storage.updateUser(Number(req.params.id), data);
      if (!r) return res.status(404).json({ error: "Not found" });
      res.json(r);
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });

  // ─── Leads ───────────────────────────────────────────────────────────────
  app.get("/api/leads", (_req, res) => handle(res, () => storage.listLeads()));
  app.get("/api/leads/:id", (req, res) => handle(res, () => storage.getLead(Number(req.params.id))));
  app.post("/api/leads", (req, res) => {
    try {
      const data = insertLeadSchema.parse(withoutAudit(req.body));
      res.json(storage.createLead(data, actorId(req)));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.patch("/api/leads/:id", (req, res) => {
    try {
      const data = insertLeadSchema.partial().parse(withoutAudit(req.body));
      const r = storage.updateLead(Number(req.params.id), data, actorId(req));
      if (!r) return res.status(404).json({ error: "Not found" });
      res.json(r);
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.delete("/api/leads/:id", (req, res) => handle(res, () => storage.deleteLead(Number(req.params.id))));

  // ─── Contacts inside companies ───────────────────────────────────────────
  app.get("/api/contacts", (_req, res) => handle(res, () => storage.listContacts()));
  app.get("/api/contacts/company/:company", (req, res) => handle(res, () => storage.listContactsByCompany(decodeURIComponent(req.params.company))));
  app.post("/api/contacts", (req, res) => {
    try {
      const data = insertContactSchema.parse(withoutAudit(req.body));
      res.json(storage.createContact(data, actorId(req)));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.patch("/api/contacts/:id", (req, res) => {
    try {
      const data = insertContactSchema.partial().parse(withoutAudit(req.body));
      const r = storage.updateContact(Number(req.params.id), data, actorId(req));
      if (!r) return res.status(404).json({ error: "Not found" });
      res.json(r);
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.delete("/api/contacts/:id", (req, res) => handle(res, () => storage.deleteContact(Number(req.params.id))));

  // Bundle: full lead detail with related collections
  app.get("/api/leads/:id/full", (req, res) => handle(res, () => {
    const id = Number(req.params.id);
    const lead = storage.getLead(id);
    if (!lead) throw new Error("Лід не знайдено");
      return {
        lead,
        contacts: lead.company ? storage.listContactsByCompany(lead.company) : [],
        sales: storage.listSalesByLead(id),
      repairs: storage.listRepairsByLead(id),
      rentals: storage.listRentalsByLead(id),
      tasks: storage.listTasksByLead(id),
      events: storage.listEventsByLead(id),
    };
  }));

  // ─── Tasks ───────────────────────────────────────────────────────────────
  app.get("/api/tasks", (_req, res) => handle(res, () => storage.listTasks()));
  app.post("/api/tasks", (req, res) => {
    try {
      const data = insertTaskSchema.parse(withoutAudit(req.body));
      res.json(storage.createTask(data, actorId(req)));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.patch("/api/tasks/:id", (req, res) => {
    try {
      const data = insertTaskSchema.partial().parse(withoutAudit(req.body));
      res.json(storage.updateTask(Number(req.params.id), data, actorId(req)));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.delete("/api/tasks/:id", (req, res) => handle(res, () => storage.deleteTask(Number(req.params.id))));

  // ─── Equipment ───────────────────────────────────────────────────────────
  app.get("/api/equipment", (_req, res) => handle(res, () => storage.listEquipment()));
  app.post("/api/equipment", (req, res) => {
    try {
      const data = insertEquipmentSchema.parse(withoutAudit(req.body));
      res.json(storage.createEquipment(data, actorId(req)));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.patch("/api/equipment/:id", (req, res) => {
    try {
      const data = insertEquipmentSchema.partial().parse(withoutAudit(req.body));
      res.json(storage.updateEquipment(Number(req.params.id), data, actorId(req)));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.delete("/api/equipment/:id", (req, res) => handle(res, () => storage.deleteEquipment(Number(req.params.id))));

  // ─── Sales ───────────────────────────────────────────────────────────────
  app.get("/api/sales", (_req, res) => handle(res, () => storage.listSales()));
  app.post("/api/sales", (req, res) => {
    try {
      const data = insertSaleSchema.parse(withoutAudit(req.body));
      res.json(storage.createSale(data, actorId(req)));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.patch("/api/sales/:id", (req, res) => {
    try {
      const data = insertSaleSchema.partial().parse(withoutAudit(req.body));
      const r = storage.updateSale(Number(req.params.id), data, actorId(req));
      if (!r) return res.status(404).json({ error: "Not found" });
      res.json(r);
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.delete("/api/sales/:id", (req, res) => handle(res, () => storage.deleteSale(Number(req.params.id))));

  // ─── Repairs ─────────────────────────────────────────────────────────────
  app.get("/api/repairs", (_req, res) => handle(res, () => storage.listRepairs()));
  app.post("/api/repairs", (req, res) => {
    try {
      const data = insertRepairSchema.parse(withoutAudit(req.body));
      res.json(storage.createRepair(data, actorId(req)));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.patch("/api/repairs/:id", (req, res) => {
    try {
      const data = insertRepairSchema.partial().parse(withoutAudit(req.body));
      res.json(storage.updateRepair(Number(req.params.id), data, actorId(req)));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.delete("/api/repairs/:id", (req, res) => handle(res, () => storage.deleteRepair(Number(req.params.id))));

  // ─── Rentals ─────────────────────────────────────────────────────────────
  app.get("/api/rentals", (_req, res) => handle(res, () => storage.listRentals()));
  app.post("/api/rentals", (req, res) => {
    try {
      const data = insertRentalSchema.parse(withoutAudit(req.body));
      res.json(storage.createRental(data, actorId(req)));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.patch("/api/rentals/:id", (req, res) => {
    try {
      const data = insertRentalSchema.partial().parse(withoutAudit(req.body));
      res.json(storage.updateRental(Number(req.params.id), data, actorId(req)));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });
  app.delete("/api/rentals/:id", (req, res) => handle(res, () => storage.deleteRental(Number(req.params.id))));

  // ─── Events / comments ───────────────────────────────────────────────────
  app.post("/api/events", (req, res) => {
    try {
      const data = insertEventSchema.parse(req.body);
      res.json(storage.createEvent(data));
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });

  // ─── Import leads (restricted to import/export-authorized users) ─────────
  app.post("/api/leads/import", requireImportExportAccess, (req, res) => {
    try {
      const rows = z.array(insertLeadSchema).parse(req.body);
      const created = rows.map((r) => storage.createLead(r, actorId(req)));
      res.json({ count: created.length, created });
    } catch (e: any) { res.status(400).json({ error: e?.message }); }
  });

  return httpServer;
}
