import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import PageHeader from "@/components/PageHeader";
import {
  stageLabels, stageBadgeClass, taskStatusLabels, taskStatusBadge,
  repairStatusLabels, repairStatusBadge, rentalStatusLabels, rentalStatusBadge,
  formatUAH, formatDate,
} from "@/lib/i18n";
import type { Lead, Task, Repair, Rental, Sale } from "@shared/schema";
import { Users, ListChecks, Wrench, CalendarRange, TrendingUp } from "lucide-react";

function KPI({ label, value, icon: Icon, testId }: { label: string; value: string | number; icon: any; testId: string }) {
  return (
    <Card className="p-4 flex items-center gap-3" data-testid={testId}>
      <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold leading-tight">{value}</div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: repairs = [] } = useQuery<Repair[]>({ queryKey: ["/api/repairs"] });
  const { data: rentals = [] } = useQuery<Rental[]>({ queryKey: ["/api/rentals"] });
  const { data: sales = [] } = useQuery<Sale[]>({ queryKey: ["/api/sales"] });

  const activeLeads = leads.filter((l) => l.stage !== "won" && l.stage !== "lost");
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const activeRepairs = repairs.filter((r) => r.status !== "returned");
  const activeRentals = rentals.filter((r) => r.status === "active" || r.status === "reserved");
  const totalRevenue = sales.reduce((s, x) => s + (x.price ?? 0), 0);

  const recentLeads = [...leads].slice(0, 5);
  const upcomingTasks = [...tasks]
    .filter((t) => t.status !== "done" && t.status !== "cancelled")
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 5);

  return (
    <div>
      <PageHeader title="Дашборд" subtitle="Загальний огляд бізнесу ТОВ Семарк" />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <KPI testId="kpi-leads"   label="Активні клієнти" value={activeLeads.length}  icon={Users} />
        <KPI testId="kpi-tasks"   label="Відкриті задачі" value={openTasks.length}  icon={ListChecks} />
        <KPI testId="kpi-repairs" label="Сервіс у роботі" value={activeRepairs.length} icon={Wrench} />
        <KPI testId="kpi-rentals" label="Оренди" value={activeRentals.length} icon={CalendarRange} />
        <KPI testId="kpi-revenue" label="Сумарні продажі" value={formatUAH(totalRevenue)} icon={TrendingUp} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Останні клієнти</h2>
            <Link href="/leads" className="text-xs text-primary hover:underline" data-testid="link-all-leads">Усі клієнти →</Link>
          </div>
          <div className="space-y-1.5">
            {recentLeads.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Клієнтів немає</div>}
            {recentLeads.map((l) => (
              <Link key={l.id} href={`/leads/${l.id}`} className="block p-2 rounded-md hover-elevate" data-testid={`row-recent-lead-${l.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{l.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{l.company} · {l.contactName}</div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${stageBadgeClass(l.stage)}`}>{stageLabels[l.stage] ?? l.stage}</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Найближчі задачі</h2>
            <Link href="/tasks" className="text-xs text-primary hover:underline" data-testid="link-all-tasks">Усі задачі →</Link>
          </div>
          <div className="space-y-1.5">
            {upcomingTasks.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Задач немає</div>}
            {upcomingTasks.map((t) => (
              <div key={t.id} className="p-2 rounded-md hover-elevate" data-testid={`row-upcoming-task-${t.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground">Дедлайн: {formatDate(t.dueDate)}</div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${taskStatusBadge(t.status)}`}>{taskStatusLabels[t.status] ?? t.status}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Сервісні кейси</h2>
            <Link href="/service" className="text-xs text-primary hover:underline" data-testid="link-all-service">Усі →</Link>
          </div>
          <div className="space-y-1.5">
            {activeRepairs.slice(0, 5).map((r) => (
              <div key={r.id} className="p-2 rounded-md hover-elevate" data-testid={`row-active-repair-${r.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{r.reason}</div>
                    <div className="text-xs text-muted-foreground">Прийнято: {formatDate(r.receivedAt)}</div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${repairStatusBadge(r.status)}`}>{repairStatusLabels[r.status] ?? r.status}</span>
                </div>
              </div>
            ))}
            {activeRepairs.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Активних ремонтів немає</div>}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">Активні оренди</h2>
            <Link href="/rentals" className="text-xs text-primary hover:underline" data-testid="link-all-rentals">Усі →</Link>
          </div>
          <div className="space-y-1.5">
            {activeRentals.slice(0, 5).map((r) => (
              <div key={r.id} className="p-2 rounded-md hover-elevate" data-testid={`row-active-rental-${r.id}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">Оренда #{r.id}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(r.startDate)} → {formatDate(r.endDate)}</div>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${rentalStatusBadge(r.status)}`}>{rentalStatusLabels[r.status] ?? r.status}</span>
                </div>
              </div>
            ))}
            {activeRentals.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">Активних оренд немає</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
