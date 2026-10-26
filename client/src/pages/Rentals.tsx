import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import RentalFormDialog from "@/components/RentalFormDialog";
import DateFilterBar, { matchesDateFilter, type DateFilterMode } from "@/components/DateFilterBar";
import {
  rentalStatusLabels, rentalStatusBadge, formatDate, formatDateTime, formatUAH,
} from "@/lib/i18n";
import { downloadCSV } from "@/lib/csv";
import { downloadExcel } from "@/lib/excelExport";
import { useCurrentUser } from "@/lib/currentUser";
import { useToast } from "@/hooks/use-toast";
import { Plus, Download, Pencil } from "lucide-react";
import type { Equipment, Lead, Rental } from "@shared/schema";

export default function Rentals() {
  const { data: rentals = [], isLoading } = useQuery<Rental[]>({ queryKey: ["/api/rentals"] });
  const { data: equipment = [] } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { canImportExport } = useCurrentUser();
  const { toast } = useToast();

  const eqMap = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);
  const leadMap = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateMode, setDateMode] = useState<DateFilterMode>("all");
  const [dateValue, setDateValue] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rentals.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!matchesDateFilter(r.startDate, dateMode, dateValue)) return false;
      if (!q) return true;
      const eq = eqMap.get(r.equipmentId);
      const lead = leadMap.get(r.leadId);
      return [eq?.name, eq?.model, lead?.company, lead?.contactName, r.notes]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [rentals, eqMap, leadMap, search, statusFilter, dateMode, dateValue]);

  const exportRows = () => filtered.map((r) => {
      const eq = eqMap.get(r.equipmentId);
      const lead = leadMap.get(r.leadId);
      const days = Math.max(1, Math.round((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 86400000));
      return {
        id: r.id,
        client: lead?.company ?? lead?.contactName ?? "",
        equipment: eq?.name ?? "",
        model: eq?.model ?? "",
        startDate: r.startDate,
        endDate: r.endDate,
        days,
        pricePerDay: r.pricePerDay,
        total: r.pricePerDay * days,
        deposit: r.deposit ?? 0,
        status: rentalStatusLabels[r.status] ?? r.status,
        returnCondition: r.returnCondition ?? "",
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
    downloadCSV(`rentals_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };
  const exportExcel = () => {
    if (!ensureExportAccess()) return;
    downloadExcel(`rentals_${new Date().toISOString().slice(0, 10)}.xls`, "Оренда", exportRows());
  };

  return (
    <div>
      <PageHeader
        title="Оренда обладнання"
        subtitle="Облік оренди — дати, ціни, застави, повернення"
        actions={
          <>
            <Button variant="outline" onClick={exportCSV} data-testid="button-export-rentals">
              <Download className="w-4 h-4 mr-2" />Експорт CSV
            </Button>
            <Button variant="outline" onClick={exportExcel} data-testid="button-export-rentals-excel">
              <Download className="w-4 h-4 mr-2" />Excel
            </Button>
            <RentalFormDialog trigger={<Button data-testid="button-new-rental"><Plus className="w-4 h-4 mr-2" />Нова оренда</Button>} />
          </>
        }
      />

      <Card className="p-3 mb-4">
        <div className="grid md:grid-cols-3 gap-2">
          <Input className="md:col-span-2" placeholder="Пошук: клієнт, обладнання…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-rentals-search" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-filter-rental-status"><SelectValue placeholder="Статус" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі статуси</SelectItem>
              {Object.entries(rentalStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-2">
          <DateFilterBar
            label="Фільтр оренди по даті, місяцю або року"
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
              <th className="text-left px-3 py-2">Період</th>
              <th className="text-right px-3 py-2">Ціна/добу</th>
              <th className="text-right px-3 py-2">Сума</th>
              <th className="text-right px-3 py-2">Застава</th>
              <th className="text-left px-3 py-2">Стан повернення</th>
              <th className="text-left px-3 py-2">Статус</th>
              <th className="text-left px-3 py-2">Редаговано</th>
              <th className="text-right px-3 py-2">Дії</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={11} className="text-center text-muted-foreground py-8">Завантаження…</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={11} className="text-center text-muted-foreground py-8">Оренд не знайдено</td></tr>}
            {filtered.map((r) => {
              const eq = eqMap.get(r.equipmentId);
              const lead = leadMap.get(r.leadId);
              const days = Math.max(1, Math.round((new Date(r.endDate).getTime() - new Date(r.startDate).getTime()) / 86400000));
              return (
                <tr key={r.id} className="border-t border-border hover-elevate" data-testid={`row-rental-${r.id}`}>
                  <td className="px-3 py-2">{r.id}</td>
                  <td className="px-3 py-2">
                    {lead && <Link href={`/leads/${lead.id}`} className="text-primary hover:underline" data-testid={`link-rental-lead-${r.id}`}>{lead.company ?? lead.contactName}</Link>}
                  </td>
                  <td className="px-3 py-2">
                    <div>{eq?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{eq?.model}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{formatDate(r.startDate)} →</div>
                    <div>{formatDate(r.endDate)} <span className="text-muted-foreground">({days} дн.)</span></div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUAH(r.pricePerDay)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatUAH(r.pricePerDay * days)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUAH(r.deposit ?? 0)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.returnCondition ?? "—"}</td>
                  <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded-full ${rentalStatusBadge(r.status)}`}>{rentalStatusLabels[r.status]}</span></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <div>{formatDateTime(r.updatedAt ?? r.startDate)}</div>
                    <div>{r.updatedById ? "Адміністратор" : "Адміністратор"}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RentalFormDialog rental={r} trigger={<Button variant="ghost" size="sm" data-testid={`button-edit-rental-${r.id}`}><Pencil className="w-3 h-3 mr-1" />Редагувати</Button>} />
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
