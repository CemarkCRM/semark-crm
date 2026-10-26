import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import RepairFormDialog from "@/components/RepairFormDialog";
import DateFilterBar, { matchesDateFilter, type DateFilterMode } from "@/components/DateFilterBar";
import {
  repairStatusLabels, repairStatusBadge, formatDate, formatDateTime, formatUAH,
} from "@/lib/i18n";
import { downloadCSV } from "@/lib/csv";
import { downloadExcel } from "@/lib/excelExport";
import { useCurrentUser } from "@/lib/currentUser";
import { useToast } from "@/hooks/use-toast";
import { Plus, Download, Pencil } from "lucide-react";
import type { Equipment, Lead, Repair, User, Sale } from "@shared/schema";

export default function Service() {
  const { data: repairs = [], isLoading } = useQuery<Repair[]>({ queryKey: ["/api/repairs"] });
  const { data: equipment = [] } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: sales = [] } = useQuery<Sale[]>({ queryKey: ["/api/sales"] });
  const { canImportExport } = useCurrentUser();
  const { toast } = useToast();

  const eqMap = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);
  const leadMap = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateMode, setDateMode] = useState<DateFilterMode>("all");
  const [dateValue, setDateValue] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repairs.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!matchesDateFilter(r.receivedAt, dateMode, dateValue)) return false;
      if (!q) return true;
      const eq = eqMap.get(r.equipmentId);
      const lead = leadMap.get(r.leadId);
      return [r.reason, r.diagnosis, r.partsReplaced, eq?.name, eq?.model, lead?.company, lead?.contactName]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [repairs, eqMap, leadMap, search, statusFilter, dateMode, dateValue]);

  const exportRows = () => filtered.map((r) => {
      const eq = eqMap.get(r.equipmentId);
      const lead = leadMap.get(r.leadId);
      const sale = sales.find((s) => s.leadId === r.leadId && s.equipmentId === r.equipmentId);
      return {
        id: r.id,
        client: lead?.company ?? lead?.contactName ?? "",
        equipment: eq?.name ?? "",
        model: eq?.model ?? "",
        purchasedAt: sale?.soldAt ?? "",
        purchasePrice: sale?.price ?? "",
        receivedAt: r.receivedAt,
        reason: r.reason,
        diagnosis: r.diagnosis ?? "",
        partsReplaced: r.partsReplaced ?? "",
        cost: r.cost ?? 0,
        status: repairStatusLabels[r.status] ?? r.status,
        returnedAt: r.returnedAt ?? "",
        engineer: r.engineerId ? userMap.get(r.engineerId)?.fullName ?? "" : "",
        notes: r.notes ?? "",
      };
    });
  const ensureExportAccess = () => {
    if (canImportExport) return true;
    toast({ variant: "destructive", title: "Немає доступу", description: "Експорт дозволений тільки директору та виконавчому директору." });
    return false;
  };
  const exportCSV = () => {
    if (!ensureExportAccess()) return;
    const rows = exportRows();
    downloadCSV(`service_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };
  const exportExcel = () => {
    if (!ensureExportAccess()) return;
    downloadExcel(`service_${new Date().toISOString().slice(0, 10)}.xls`, "Сервіс", exportRows());
  };

  return (
    <div>
      <PageHeader
        title="Сервісний відділ"
        subtitle="Ремонт обладнання — від прийому до видачі"
        actions={
          <>
            <Button variant="outline" onClick={exportCSV} data-testid="button-export-service">
              <Download className="w-4 h-4 mr-2" />Експорт CSV
            </Button>
            <Button variant="outline" onClick={exportExcel} data-testid="button-export-service-excel">
              <Download className="w-4 h-4 mr-2" />Excel
            </Button>
            <RepairFormDialog trigger={<Button data-testid="button-new-repair"><Plus className="w-4 h-4 mr-2" />Новий сервіс</Button>} />
          </>
        }
      />

      <Card className="p-3 mb-4">
        <div className="grid md:grid-cols-3 gap-2">
          <Input className="md:col-span-2" placeholder="Пошук: клієнт, обладнання, причина…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-service-search" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-filter-service-status"><SelectValue placeholder="Статус" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі статуси</SelectItem>
              {Object.entries(repairStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-2">
          <DateFilterBar
            label="Фільтр сервісу по даті, місяцю або року"
            mode={dateMode}
            value={dateValue}
            onModeChange={setDateMode}
            onValueChange={setDateValue}
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Клієнт</th>
              <th className="text-left px-3 py-2">Обладнання</th>
              <th className="text-left px-3 py-2">Куплено / ціна</th>
              <th className="text-left px-3 py-2">Прийнято</th>
              <th className="text-left px-3 py-2">Причина / діагноз</th>
              <th className="text-left px-3 py-2">Інженер</th>
              <th className="text-right px-3 py-2">Вартість</th>
              <th className="text-left px-3 py-2">Статус</th>
              <th className="text-left px-3 py-2">Видано</th>
              <th className="text-left px-3 py-2">Редаговано</th>
              <th className="text-right px-3 py-2">Дії</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={12} className="text-center text-muted-foreground py-8">Завантаження…</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={12} className="text-center text-muted-foreground py-8">Сервісних кейсів не знайдено</td></tr>}
            {filtered.map((r) => {
              const eq = eqMap.get(r.equipmentId);
              const lead = leadMap.get(r.leadId);
              const sale = sales.find((s) => s.leadId === r.leadId && s.equipmentId === r.equipmentId);
              return (
                <tr key={r.id} className="border-t border-border hover-elevate align-top" data-testid={`row-repair-${r.id}`}>
                  <td className="px-3 py-2">{r.id}</td>
                  <td className="px-3 py-2">
                    {lead && <Link href={`/leads/${lead.id}`} className="text-primary hover:underline" data-testid={`link-repair-lead-${r.id}`}>{lead.company ?? lead.contactName}</Link>}
                  </td>
                  <td className="px-3 py-2">
                    <div>{eq?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{eq?.model}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {sale ? (
                      <>
                        <div>{formatDate(sale.soldAt)}</div>
                        <div className="text-muted-foreground tabular-nums">{formatUAH(sale.price)}</div>
                      </>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">{formatDate(r.receivedAt)}</td>
                  <td className="px-3 py-2">
                    <div>{r.reason}</div>
                    {r.diagnosis && <div className="text-xs text-muted-foreground">{r.diagnosis}</div>}
                    {r.partsReplaced && <div className="text-xs">Замінено: {r.partsReplaced}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.engineerId ? userMap.get(r.engineerId)?.fullName ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUAH(r.cost)}</td>
                  <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded-full ${repairStatusBadge(r.status)}`}>{repairStatusLabels[r.status] ?? r.status}</span></td>
                  <td className="px-3 py-2 text-muted-foreground">{formatDate(r.returnedAt)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <div>{formatDateTime(r.updatedAt ?? r.receivedAt)}</div>
                    <div>{r.updatedById ? userMap.get(r.updatedById)?.fullName ?? "Адміністратор" : "Адміністратор"}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RepairFormDialog repair={r} trigger={<Button variant="ghost" size="sm" data-testid={`button-edit-repair-${r.id}`}><Pencil className="w-3 h-3 mr-1" />Редагувати</Button>} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
