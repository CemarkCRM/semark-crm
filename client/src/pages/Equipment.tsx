import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import {
  equipmentTypeLabels, equipmentStatusLabels, equipmentStatusBadge, formatUAH,
} from "@/lib/i18n";
import { downloadCSV } from "@/lib/csv";
import { downloadExcel } from "@/lib/excelExport";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/currentUser";
import { Plus, Download, Pencil } from "lucide-react";
import type { Equipment } from "@shared/schema";

function EquipmentDialog({ trigger, item }: { trigger: React.ReactNode; item?: Equipment }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { currentUserId } = useCurrentUser();
  const [form, setForm] = useState({
    name: item?.name ?? "", model: item?.model ?? "", type: item?.type ?? "fiber", serial: item?.serial ?? "",
    price: item?.price?.toString() ?? "", rentalDayPrice: item?.rentalDayPrice?.toString() ?? "", status: item?.status ?? "available", notes: item?.notes ?? "",
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name, model: form.model, type: form.type,
        serial: form.serial || null,
        price: Number(form.price), rentalDayPrice: form.rentalDayPrice ? Number(form.rentalDayPrice) : null,
        status: form.status, notes: form.notes || null,
        updatedById: currentUserId ?? undefined,
      };
      const res = item
        ? await apiRequest("PATCH", `/api/equipment/${item.id}`, payload)
        : await apiRequest("POST", "/api/equipment", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: item ? "Обладнання оновлено" : "Обладнання додано" });
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{item ? "Редагувати обладнання" : "Нове обладнання"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Назва</Label><Input data-testid="input-eq-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Модель</Label><Input data-testid="input-eq-model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
          <div>
            <Label>Тип</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger data-testid="select-eq-type"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(equipmentTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Серійний №</Label><Input data-testid="input-eq-serial" value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} /></div>
          <div><Label>Ціна, грн</Label><Input data-testid="input-eq-price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
          <div><Label>Оренда/добу, грн</Label><Input data-testid="input-eq-rental" type="number" value={form.rentalDayPrice} onChange={(e) => setForm({ ...form, rentalDayPrice: e.target.value })} /></div>
          <div>
            <Label>Статус</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger data-testid="select-eq-status"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(equipmentStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Нотатки</Label><Input data-testid="input-eq-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Скасувати</Button>
          <Button data-testid="button-save-equipment" disabled={!form.name || !form.model || !form.price || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Збереження…" : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EquipmentPage() {
  const { data: equipment = [], isLoading } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"] });
  const { canImportExport } = useCurrentUser();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipment.filter((e) => {
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (!q) return true;
      return [e.name, e.model, e.serial].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [equipment, search, typeFilter, statusFilter]);

  const exportRows = () => filtered.map((e) => ({
      id: e.id, name: e.name, model: e.model, type: equipmentTypeLabels[e.type] ?? e.type,
      serial: e.serial ?? "", price: e.price, rentalDayPrice: e.rentalDayPrice ?? "",
      status: equipmentStatusLabels[e.status] ?? e.status, notes: e.notes ?? "",
    }));
  const ensureExportAccess = () => {
    if (canImportExport) return true;
    toast({ variant: "destructive", title: "Немає доступу", description: "Експорт дозволений тільки директору та виконавчому директору." });
    return false;
  };
  const exportCSV = () => {
    if (!ensureExportAccess()) return;
    const rows = exportRows();
    downloadCSV(`equipment_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };
  const exportExcel = () => {
    if (!ensureExportAccess()) return;
    downloadExcel(`equipment_${new Date().toISOString().slice(0, 10)}.xls`, "Обладнання", exportRows());
  };

  return (
    <div>
      <PageHeader
        title="Обладнання"
        subtitle="Каталог та інвентар маркувального обладнання"
        actions={
          <>
            <Button variant="outline" onClick={exportCSV} data-testid="button-export-equipment">
              <Download className="w-4 h-4 mr-2" />Експорт CSV
            </Button>
            <Button variant="outline" onClick={exportExcel} data-testid="button-export-equipment-excel">
              <Download className="w-4 h-4 mr-2" />Excel
            </Button>
            <EquipmentDialog trigger={<Button data-testid="button-new-equipment"><Plus className="w-4 h-4 mr-2" />Додати</Button>} />
          </>
        }
      />

      <Card className="p-3 mb-4">
        <div className="grid md:grid-cols-3 gap-2">
          <Input placeholder="Пошук: назва, модель, серійний…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-equipment-search" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger data-testid="select-filter-eq-type"><SelectValue placeholder="Тип" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі типи</SelectItem>
              {Object.entries(equipmentTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-filter-eq-status"><SelectValue placeholder="Статус" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі статуси</SelectItem>
              {Object.entries(equipmentStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Назва</th>
              <th className="text-left px-3 py-2">Модель</th>
              <th className="text-left px-3 py-2">Тип</th>
              <th className="text-left px-3 py-2">S/N</th>
              <th className="text-right px-3 py-2">Ціна</th>
              <th className="text-right px-3 py-2">Оренда/добу</th>
              <th className="text-left px-3 py-2">Статус</th>
              <th className="text-left px-3 py-2">Нотатки</th>
              <th className="text-right px-3 py-2">Дії</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">Завантаження…</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">Обладнання не знайдено</td></tr>}
            {filtered.map((e) => (
              <tr key={e.id} className="border-t border-border hover-elevate" data-testid={`row-equipment-${e.id}`}>
                <td className="px-3 py-2 font-medium">{e.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{e.model}</td>
                <td className="px-3 py-2">{equipmentTypeLabels[e.type] ?? e.type}</td>
                <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{e.serial ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatUAH(e.price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{e.rentalDayPrice ? formatUAH(e.rentalDayPrice) : "—"}</td>
                <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded-full ${equipmentStatusBadge(e.status)}`}>{equipmentStatusLabels[e.status] ?? e.status}</span></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{e.notes ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <EquipmentDialog
                    item={e}
                    trigger={<Button variant="ghost" size="sm" data-testid={`button-edit-equipment-${e.id}`}><Pencil className="w-3 h-3 mr-1" />Редагувати</Button>}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
