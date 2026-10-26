import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import LeadFormDialog from "@/components/LeadFormDialog";
import SaleFormDialog from "@/components/SaleFormDialog";
import RepairFormDialog from "@/components/RepairFormDialog";
import RentalFormDialog from "@/components/RentalFormDialog";
import TaskFormDialog from "@/components/TaskFormDialog";
import ContactFormDialog from "@/components/ContactFormDialog";
import DateFilterBar, { matchesDateFilter, type DateFilterMode } from "@/components/DateFilterBar";
import {
  stageLabels, stageBadgeClass, sourceLabels, roleLabels,
  repairStatusLabels, repairStatusBadge,
  rentalStatusLabels, rentalStatusBadge,
  taskStatusLabels, taskStatusBadge,
  priorityLabels, priorityBadge,
  eventTypeLabels, formatUAH, formatDate, formatDateTime,
} from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Pencil, MessageSquare, Send, Phone, Mail, Building2, MapPin,
  ShoppingCart, Wrench, CalendarRange, ListChecks, Activity, Trash2,
  UserPlus,
} from "lucide-react";
import type { Contact, Lead, User, Equipment, Sale, Repair, Rental, Task, Event } from "@shared/schema";

type FullLead = {
  lead: Lead;
  contacts: Contact[];
  sales: Sale[];
  repairs: Repair[];
  rentals: Rental[];
  tasks: Task[];
  events: Event[];
};

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const leadId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<FullLead>({ queryKey: ["/api/leads", leadId, "full"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: equipment = [] } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"] });

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const eqMap = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);

  const [comment, setComment] = useState("");
  const [historyMode, setHistoryMode] = useState<DateFilterMode>("all");
  const [historyDate, setHistoryDate] = useState("");
  const [taskMode, setTaskMode] = useState<DateFilterMode>("all");
  const [taskDate, setTaskDate] = useState("");
  const [saleMode, setSaleMode] = useState<DateFilterMode>("all");
  const [saleDate, setSaleDate] = useState("");
  const [repairMode, setRepairMode] = useState<DateFilterMode>("all");
  const [repairDate, setRepairDate] = useState("");
  const [rentalMode, setRentalMode] = useState<DateFilterMode>("all");
  const [rentalDate, setRentalDate] = useState("");

  const addComment = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/events", { leadId, type: "comment", message: comment, authorId: null });
      return res.json();
    },
    onSuccess: () => {
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "full"] });
      toast({ title: "Запис в історію додано" });
    },
  });

  const deleteLead = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/leads/${leadId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Клієнта видалено" });
      setLocation("/leads");
    },
  });

  if (isLoading) return <div className="text-muted-foreground">Завантаження…</div>;
  if (!data) return <div className="text-muted-foreground">Клієнта не знайдено</div>;

  const { lead, contacts, sales, repairs, rentals, tasks, events } = data;
  const responsible = lead.responsibleId ? userMap.get(lead.responsibleId) : undefined;
  const filteredEvents = events.filter((ev) => matchesDateFilter(ev.createdAt, historyMode, historyDate));
  const filteredTasks = tasks.filter((t) => matchesDateFilter(t.dueDate || t.createdAt, taskMode, taskDate));
  const filteredSales = sales.filter((s) => matchesDateFilter(s.soldAt, saleMode, saleDate));
  const filteredRepairs = repairs.filter((r) => matchesDateFilter(r.receivedAt, repairMode, repairDate));
  const filteredRentals = rentals.filter((r) => matchesDateFilter(r.startDate, rentalMode, rentalDate));

  return (
    <div>
      <div className="mb-3">
        <Link href="/leads" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1" data-testid="link-back-leads">
          <ArrowLeft className="w-3 h-3" /> До списку клієнтів
        </Link>
      </div>

      <PageHeader
        title={lead.title}
        subtitle={`Клієнт #${lead.id} · створено ${formatDate(lead.createdAt)} · оновлено ${formatDateTime(lead.updatedAt)} · редагував ${lead.updatedById ? userMap.get(lead.updatedById)?.fullName ?? "Адміністратор" : "Адміністратор"}`}
        actions={
          <>
            <LeadFormDialog
              lead={lead}
              trigger={<Button variant="outline" data-testid="button-edit-lead"><Pencil className="w-4 h-4 mr-2" />Редагувати</Button>}
            />
            <Button variant="outline" onClick={() => { if (confirm("Видалити клієнта безповоротно?")) deleteLead.mutate(); }} data-testid="button-delete-lead">
              <Trash2 className="w-4 h-4 mr-2" />Видалити
            </Button>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-4 lg:col-span-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Клієнт</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" /><span data-testid="text-lead-company">{lead.company ?? "—"}</span></div>
            <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" /><span data-testid="text-lead-city">{lead.city ?? "—"}</span></div>
            <div className="font-medium mt-2" data-testid="text-lead-contact">{lead.contactName}</div>
            {lead.contactPhone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><a href={`tel:${lead.contactPhone}`} className="hover:underline" data-testid="link-lead-phone">{lead.contactPhone}</a></div>}
            {lead.contactEmail && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><a href={`mailto:${lead.contactEmail}`} className="hover:underline" data-testid="link-lead-email">{lead.contactEmail}</a></div>}
          </div>
        </Card>

        <Card className="p-4 lg:col-span-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Статус</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Стадія</span><span className={`text-[11px] px-2 py-0.5 rounded-full ${stageBadgeClass(lead.stage)}`} data-testid="badge-lead-stage">{stageLabels[lead.stage]}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Джерело</span><span data-testid="text-lead-source">{sourceLabels[lead.source] ?? lead.source}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Бюджет</span><span className="tabular-nums" data-testid="text-lead-budget">{formatUAH(lead.budget)}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Відповідальний</span><span data-testid="text-lead-responsible">{responsible ? `${responsible.fullName}` : "—"}</span></div>
            {responsible && <div className="text-xs text-muted-foreground text-right">{roleLabels[responsible.role] ?? responsible.role}</div>}
          </div>
        </Card>

        <Card className="p-4 lg:col-span-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Нотатки</div>
          <p className="text-sm whitespace-pre-wrap" data-testid="text-lead-notes">{lead.notes || "—"}</p>
        </Card>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="font-semibold text-sm">Контакти компанії</div>
            <div className="text-xs text-muted-foreground">
              Компанія не дублюється. Новий контакт додається до існуючої компанії: {lead.company || "компанія не вказана"}
            </div>
          </div>
          {lead.company && (
            <ContactFormDialog
              company={lead.company}
              leadId={leadId}
              trigger={<Button size="sm" data-testid="button-add-company-contact"><UserPlus className="w-4 h-4 mr-1" />Додати контакт</Button>}
            />
          )}
        </div>
        {!lead.company && (
          <div className="text-sm text-muted-foreground">Щоб додавати контакти без дублювання, спочатку вкажіть компанію в картці клієнта.</div>
        )}
        <div className="grid lg:grid-cols-2 gap-3">
          <Card className="p-3 border-dashed">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs uppercase text-muted-foreground mb-1">Основний контакт з картки</div>
                <div className="font-medium">{lead.contactName}</div>
                <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                  <div>{lead.contactPhone || "телефон не вказано"}</div>
                  <div>{lead.contactEmail || "email не вказано"}</div>
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs">
              <div className="font-medium mb-1">Задачі без окремого контакту: {tasks.filter((t) => !t.contactId).length}</div>
              {tasks.filter((t) => !t.contactId).slice(0, 3).map((t) => (
                <div key={t.id} className="text-muted-foreground">• {t.title} · {formatDate(t.dueDate)}</div>
              ))}
            </div>
          </Card>
          {contacts.map((c) => {
            const contactTasks = tasks.filter((t) => t.contactId === c.id);
            const contactEvents = events.filter((ev) => ev.contactId === c.id);
            return (
              <Card key={c.id} className="p-3" data-testid={`card-company-contact-${c.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{c.fullName}</div>
                    {c.position && <div className="text-xs text-muted-foreground">{c.position}</div>}
                    <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                      <div>{c.phone || "телефон не вказано"}</div>
                      <div>{c.email || "email не вказано"}</div>
                    </div>
                  </div>
                  <ContactFormDialog
                    company={c.company}
                    contact={c}
                    leadId={leadId}
                    trigger={<Button variant="ghost" size="sm" data-testid={`button-edit-contact-${c.id}`}><Pencil className="w-3 h-3 mr-1" />Редагувати</Button>}
                  />
                </div>
                {c.notes && <div className="text-xs mt-2">{c.notes}</div>}
                <div className="grid md:grid-cols-2 gap-3 mt-3 text-xs">
                  <div>
                    <div className="font-medium mb-1">Задачі контакту</div>
                    {contactTasks.length === 0 && <div className="text-muted-foreground">Задач немає</div>}
                    {contactTasks.slice(0, 4).map((t) => (
                      <div key={t.id} className="text-muted-foreground">• {t.title} · {formatDate(t.dueDate)}</div>
                    ))}
                  </div>
                  <div>
                    <div className="font-medium mb-1">Історія контакту</div>
                    {contactEvents.length === 0 && <div className="text-muted-foreground">Історії ще немає</div>}
                    {contactEvents.slice(0, 4).map((ev) => (
                      <div key={ev.id} className="text-muted-foreground">• {formatDateTime(ev.createdAt)} · {ev.message}</div>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Card>

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="grid w-full grid-cols-5 max-w-2xl">
          <TabsTrigger value="timeline" data-testid="tab-timeline"><Activity className="w-4 h-4 mr-1" />Історія</TabsTrigger>
          <TabsTrigger value="tasks" data-testid="tab-tasks"><ListChecks className="w-4 h-4 mr-1" />Задачі</TabsTrigger>
          <TabsTrigger value="sales" data-testid="tab-sales"><ShoppingCart className="w-4 h-4 mr-1" />Продажі</TabsTrigger>
          <TabsTrigger value="repairs" data-testid="tab-repairs"><Wrench className="w-4 h-4 mr-1" />Сервіс</TabsTrigger>
          <TabsTrigger value="rentals" data-testid="tab-rentals"><CalendarRange className="w-4 h-4 mr-1" />Оренда</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <Card className="p-4">
            <div className="flex gap-2 mb-4">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Додати коментар або запис у історію подій…"
                rows={2}
                className="flex-1"
                data-testid="input-lead-comment"
              />
              <Button onClick={() => addComment.mutate()} disabled={!comment.trim() || addComment.isPending} data-testid="button-add-comment">
                <Send className="w-4 h-4 mr-1" />Додати
              </Button>
            </div>
            <div className="mb-4">
              <DateFilterBar
                label="Фільтр історії по даті, місяцю або року"
                mode={historyMode}
                value={historyDate}
                onModeChange={setHistoryMode}
                onValueChange={setHistoryDate}
              />
            </div>
            {filteredEvents.length === 0 && (
              <div className="text-sm text-muted-foreground py-8 text-center">Подій ще немає</div>
            )}
            <ol className="relative border-l border-border ml-2">
              {filteredEvents.map((ev) => (
                <li key={ev.id} className="ml-4 mb-4" data-testid={`event-${ev.id}`}>
                  <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-primary mt-1.5" />
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <MessageSquare className="w-3 h-3" />
                    <span>{eventTypeLabels[ev.type] ?? ev.type}</span>
                    <span>·</span>
                    <span>{formatDateTime(ev.createdAt)}</span>
                    {ev.authorId && <span>· {userMap.get(ev.authorId)?.fullName ?? ""}</span>}
                  </div>
                  <div className="text-sm mt-0.5 whitespace-pre-wrap">{ev.message}</div>
                </li>
              ))}
            </ol>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4 space-y-2">
          <div className="flex justify-end">
            <TaskFormDialog leadId={leadId} trigger={<Button size="sm" data-testid="button-new-task-on-lead">Нова задача</Button>} />
          </div>
          <DateFilterBar label="Фільтр задач по даті, місяцю або року" mode={taskMode} value={taskDate} onModeChange={setTaskMode} onValueChange={setTaskDate} />
          {filteredTasks.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">Задач немає</div>}
          {filteredTasks.map((t) => (
            <Card key={t.id} className="p-3" data-testid={`row-lead-task-${t.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{t.title}</div>
                  {t.description && <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{t.description}</div>}
                  <div className="text-xs text-muted-foreground mt-1">
                    Дедлайн: {formatDate(t.dueDate)}
                    {t.assigneeId && ` · Виконавець: ${userMap.get(t.assigneeId)?.fullName ?? "—"}`}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Редаговано: {formatDateTime(t.updatedAt ?? t.createdAt)} · {t.updatedById ? userMap.get(t.updatedById)?.fullName ?? "Адміністратор" : "Адміністратор"}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${priorityBadge(t.priority)}`}>{priorityLabels[t.priority]}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${taskStatusBadge(t.status)}`}>{taskStatusLabels[t.status]}</span>
                  <TaskFormDialog task={t} leadId={leadId} trigger={<Button variant="ghost" size="sm" data-testid={`button-edit-lead-task-${t.id}`}><Pencil className="w-3 h-3" /></Button>} />
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="sales" className="mt-4 space-y-2">
          <div className="flex justify-end">
            <SaleFormDialog leadId={leadId} trigger={<Button size="sm" data-testid="button-new-sale-on-lead">Додати продаж</Button>} />
          </div>
          <DateFilterBar label="Фільтр продажів по даті, місяцю або року" mode={saleMode} value={saleDate} onModeChange={setSaleMode} onValueChange={setSaleDate} />
          {filteredSales.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">Продажів ще не було</div>}
          {filteredSales.map((s) => {
            const eq = eqMap.get(s.equipmentId);
            return (
              <Card key={s.id} className="p-3" data-testid={`row-lead-sale-${s.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{eq?.name ?? "Обладнання"}</div>
                    <div className="text-xs text-muted-foreground">{eq?.model} · {formatDate(s.soldAt)}{s.notes ? ` · ${s.notes}` : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium tabular-nums">{formatUAH(s.price)}</div>
                    <div className="text-xs text-muted-foreground">Редаговано: {formatDateTime(s.updatedAt ?? s.soldAt)} · {s.updatedById ? userMap.get(s.updatedById)?.fullName ?? "Адміністратор" : "Адміністратор"}</div>
                    <SaleFormDialog sale={s} leadId={leadId} trigger={<Button variant="ghost" size="sm" data-testid={`button-edit-lead-sale-${s.id}`}><Pencil className="w-3 h-3 mr-1" />Редагувати</Button>} />
                  </div>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="repairs" className="mt-4 space-y-2">
          <div className="flex justify-end">
            <RepairFormDialog leadId={leadId} trigger={<Button size="sm" data-testid="button-new-repair-on-lead">Новий сервіс</Button>} />
          </div>
          <DateFilterBar label="Фільтр сервісу по даті, місяцю або року" mode={repairMode} value={repairDate} onModeChange={setRepairMode} onValueChange={setRepairDate} />
          {filteredRepairs.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">Сервісних кейсів немає</div>}
          {filteredRepairs.map((r) => {
            const eq = eqMap.get(r.equipmentId);
            return (
              <Card key={r.id} className="p-3" data-testid={`row-lead-repair-${r.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{eq?.name ?? "Обладнання"} <span className="text-xs text-muted-foreground">#{r.id}</span></div>
                    <div className="text-xs text-muted-foreground">Причина: {r.reason}</div>
                    {r.diagnosis && <div className="text-xs mt-1">Діагноз: {r.diagnosis}</div>}
                    {r.partsReplaced && <div className="text-xs">Замінено: {r.partsReplaced}</div>}
                    <div className="text-xs text-muted-foreground mt-1">
                      Прийнято: {formatDate(r.receivedAt)}{r.returnedAt ? ` · Видано: ${formatDate(r.returnedAt)}` : ""}
                      {r.engineerId && ` · Інженер: ${userMap.get(r.engineerId)?.fullName ?? ""}`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Редаговано: {formatDateTime(r.updatedAt ?? r.receivedAt)} · {r.updatedById ? userMap.get(r.updatedById)?.fullName ?? "Адміністратор" : "Адміністратор"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${repairStatusBadge(r.status)}`}>{repairStatusLabels[r.status]}</span>
                    <div className="mt-1 text-sm font-medium tabular-nums">{formatUAH(r.cost)}</div>
                    <RepairFormDialog repair={r} leadId={leadId} trigger={<Button variant="ghost" size="sm" data-testid={`button-edit-lead-repair-${r.id}`}><Pencil className="w-3 h-3 mr-1" />Редагувати</Button>} />
                  </div>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="rentals" className="mt-4 space-y-2">
          <div className="flex justify-end">
            <RentalFormDialog leadId={leadId} trigger={<Button size="sm" data-testid="button-new-rental-on-lead">Нова оренда</Button>} />
          </div>
          <DateFilterBar label="Фільтр оренди по даті, місяцю або року" mode={rentalMode} value={rentalDate} onModeChange={setRentalMode} onValueChange={setRentalDate} />
          {filteredRentals.length === 0 && <div className="text-sm text-muted-foreground py-8 text-center">Оренд ще не було</div>}
          {filteredRentals.map((r) => {
            const eq = eqMap.get(r.equipmentId);
            return (
              <Card key={r.id} className="p-3" data-testid={`row-lead-rental-${r.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{eq?.name ?? "Обладнання"} <span className="text-xs text-muted-foreground">#{r.id}</span></div>
                    <div className="text-xs text-muted-foreground">{formatDate(r.startDate)} → {formatDate(r.endDate)}</div>
                    <div className="text-xs">Ціна/добу: {formatUAH(r.pricePerDay)} · Застава: {formatUAH(r.deposit ?? 0)}</div>
                    {r.returnCondition && <div className="text-xs text-muted-foreground">Стан повернення: {r.returnCondition}</div>}
                    <div className="text-xs text-muted-foreground mt-1">Редаговано: {formatDateTime(r.updatedAt ?? r.startDate)} · {r.updatedById ? userMap.get(r.updatedById)?.fullName ?? "Адміністратор" : "Адміністратор"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${rentalStatusBadge(r.status)}`}>{rentalStatusLabels[r.status]}</span>
                    <RentalFormDialog rental={r} leadId={leadId} trigger={<Button variant="ghost" size="sm" data-testid={`button-edit-lead-rental-${r.id}`}><Pencil className="w-3 h-3 mr-1" />Редагувати</Button>} />
                  </div>
                </div>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
