import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import TaskFormDialog from "@/components/TaskFormDialog";
import DateFilterBar, { matchesDateFilter, type DateFilterMode } from "@/components/DateFilterBar";
import {
  taskStatusLabels, taskStatusBadge,
  priorityLabels, priorityBadge,
  roleLabels, formatDate, formatDateTime,
} from "@/lib/i18n";
import { downloadCSV } from "@/lib/csv";
import { downloadExcel } from "@/lib/excelExport";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCurrentUser } from "@/lib/currentUser";
import { useToast } from "@/hooks/use-toast";
import { Plus, Download, CheckCircle2, Pencil, AlertTriangle, CalendarClock } from "lucide-react";
import type { Lead, Task, User } from "@shared/schema";

export default function Tasks() {
  const { data: tasks = [], isLoading } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { canImportExport } = useCurrentUser();
  const { toast } = useToast();

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const leadMap = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [dateMode, setDateMode] = useState<DateFilterMode>("all");
  const [dateValue, setDateValue] = useState("");
  const [deadlineSort, setDeadlineSort] = useState("none");

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayTasks = useMemo(() => tasks.filter((t) => t.dueDate?.slice(0, 10) === todayKey && t.status !== "done" && t.status !== "cancelled"), [tasks, todayKey]);
  const isOverdue = (t: Task) => !!t.dueDate && t.dueDate.slice(0, 10) < todayKey && t.status !== "done" && t.status !== "cancelled";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (assigneeFilter !== "all" && String(t.assigneeId ?? "") !== assigneeFilter) return false;
      if (!matchesDateFilter(t.dueDate || t.createdAt, dateMode, dateValue)) return false;
      if (!q) return true;
      return [t.title, t.description].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
    if (deadlineSort !== "none") {
      rows.sort((a, b) => {
        const av = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bv = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return deadlineSort === "asc" ? av - bv : bv - av;
      });
    }
    return rows;
  }, [tasks, search, statusFilter, priorityFilter, assigneeFilter, dateMode, dateValue, deadlineSort]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/tasks/${id}`, { status });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  const exportRows = () => filtered.map((t) => ({
      id: t.id,
      title: t.title,
      status: taskStatusLabels[t.status] ?? t.status,
      priority: priorityLabels[t.priority] ?? t.priority,
      dueDate: t.dueDate ?? "",
      assignee: t.assigneeId ? userMap.get(t.assigneeId)?.fullName ?? "" : "",
      lead: t.leadId ? leadMap.get(t.leadId)?.title ?? "" : "",
      description: t.description ?? "",
      createdAt: t.createdAt,
    }));

  const ensureExportAccess = () => {
    if (canImportExport) return true;
    toast({ variant: "destructive", title: "Немає доступу", description: "Експорт дозволений тільки директору Цілюрику Юрію Вікторовичу та виконавчому директору Безуглій Людмилі Анатоліївні." });
    return false;
  };

  const exportCSV = () => {
    if (!ensureExportAccess()) return;
    const rows = exportRows();
    downloadCSV(`tasks_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };
  const exportExcel = () => {
    if (!ensureExportAccess()) return;
    downloadExcel(`tasks_${new Date().toISOString().slice(0, 10)}.xls`, "Задачі", exportRows());
  };

  return (
    <div>
      <PageHeader
        title="Задачі"
        subtitle="Призначення задач співробітникам по ролях та клієнтах"
        actions={
          <>
            <Button variant="outline" onClick={exportCSV} data-testid="button-export-tasks">
              <Download className="w-4 h-4 mr-2" />Експорт CSV
            </Button>
            <Button variant="outline" onClick={exportExcel} data-testid="button-export-tasks-excel">
              <Download className="w-4 h-4 mr-2" />Excel
            </Button>
            <TaskFormDialog trigger={<Button data-testid="button-new-task"><Plus className="w-4 h-4 mr-2" />Нова задача</Button>} />
          </>
        }
      />

      <Card className="p-3 mb-4">
        <div className="grid md:grid-cols-4 gap-2">
          <Input placeholder="Пошук задач…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-tasks-search" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-filter-task-status"><SelectValue placeholder="Статус" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі статуси</SelectItem>
              {Object.entries(taskStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger data-testid="select-filter-task-priority"><SelectValue placeholder="Пріоритет" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі пріоритети</SelectItem>
              {Object.entries(priorityLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger data-testid="select-filter-task-assignee"><SelectValue placeholder="Виконавець" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі виконавці</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.fullName} — {roleLabels[u.role]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={deadlineSort} onValueChange={setDeadlineSort}>
            <SelectTrigger data-testid="select-deadline-sort"><SelectValue placeholder="Сортування дедлайну" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Без сортування</SelectItem>
              <SelectItem value="asc">Дедлайн: по зростанню</SelectItem>
              <SelectItem value="desc">Дедлайн: по убуванню</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-2">
          <DateFilterBar
            label="Фільтр задач по даті, місяцю або року"
            mode={dateMode}
            value={dateValue}
            onModeChange={setDateMode}
            onValueChange={setDateValue}
          />
        </div>
      </Card>

      <Card className="p-3 mb-4 border-blue-200 bg-blue-50/70 dark:bg-blue-950/20 dark:border-blue-900">
        <div className="flex items-start gap-2">
          <CalendarClock className="w-4 h-4 text-blue-700 dark:text-blue-300 mt-0.5" />
          <div>
            <div className="font-medium text-sm">На сьогодні заплановано: {todayTasks.length}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {todayTasks.length === 0 ? "На сьогодні відкритих задач немає." : todayTasks.slice(0, 4).map((t) => t.title).join(" · ")}
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 w-8"></th>
              <th className="text-left px-3 py-2">Задача</th>
              <th className="text-left px-3 py-2">Клієнт</th>
              <th className="text-left px-3 py-2">Виконавець</th>
              <th className="text-left px-3 py-2">Дедлайн</th>
              <th className="text-left px-3 py-2">Пріоритет</th>
              <th className="text-left px-3 py-2">Статус</th>
              <th className="text-left px-3 py-2">Редаговано</th>
              <th className="text-right px-3 py-2">Дії</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">Завантаження…</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">Задач не знайдено</td></tr>}
            {filtered.map((t) => (
              <tr key={t.id} className={`border-t border-border hover-elevate ${isOverdue(t) ? "bg-rose-50 dark:bg-rose-950/25" : ""}`} data-testid={`row-task-${t.id}`}>
                <td className="px-3 py-2">
                  <button
                    title={t.status === "done" ? "Відмітити як відкриту" : "Відмітити як виконану"}
                    onClick={() => updateStatus.mutate({ id: t.id, status: t.status === "done" ? "open" : "done" })}
                    data-testid={`button-toggle-task-${t.id}`}
                  >
                    <CheckCircle2 className={`w-4 h-4 ${t.status === "done" ? "text-emerald-600" : "text-muted-foreground"}`} />
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{t.title}</div>
                  {t.description && <div className="text-xs text-muted-foreground truncate max-w-md">{t.description}</div>}
                </td>
                <td className="px-3 py-2">
                  {t.leadId ? (
                    <Link href={`/leads/${t.leadId}`} className="text-primary hover:underline text-xs" data-testid={`link-task-lead-${t.id}`}>
                      {leadMap.get(t.leadId)?.title ?? `#${t.leadId}`}
                    </Link>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs">
                  {t.assigneeId ? userMap.get(t.assigneeId)?.fullName ?? "—" : "—"}
                  {t.assigneeId && <div>{roleLabels[userMap.get(t.assigneeId)?.role ?? ""]}</div>}
                </td>
                <td className={`px-3 py-2 ${isOverdue(t) ? "text-rose-700 dark:text-rose-300 font-medium" : ""}`}>
                  <div className="flex items-center gap-1">
                    {isOverdue(t) && <AlertTriangle className="w-3 h-3" />}
                    <span>{formatDate(t.dueDate)}</span>
                  </div>
                  {isOverdue(t) && <div className="text-[11px]">Прострочено</div>}
                </td>
                <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded-full ${priorityBadge(t.priority)}`}>{priorityLabels[t.priority]}</span></td>
                <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded-full ${taskStatusBadge(t.status)}`}>{taskStatusLabels[t.status]}</span></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  <div>{formatDateTime(t.updatedAt ?? t.createdAt)}</div>
                  <div>{t.updatedById ? userMap.get(t.updatedById)?.fullName ?? "Адміністратор" : "Адміністратор"}</div>
                </td>
                <td className="px-3 py-2 text-right">
                  <TaskFormDialog task={t} trigger={<Button variant="ghost" size="sm" data-testid={`button-edit-task-${t.id}`}><Pencil className="w-3 h-3 mr-1" />Редагувати</Button>} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
