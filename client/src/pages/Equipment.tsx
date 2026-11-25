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
  equipmentTypeLabels, equipmentTypeLabel, equipmentStatusLabels, equipmentStatusBadge, formatUAH,
  equipmentKindLabels, priceStatusLabels, priceStatusBadge, formatPriceDate,
} from "@/lib/i18n";
import { downloadCSV } from "@/lib/csv";
import { downloadExcel } from "@/lib/excelExport";
import { readXlsx } from "@/lib/xlsx";
import { parseCatalogSheet, REQUIRED_HEADERS, type CatalogRow } from "@shared/catalogImport";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/currentUser";
import { Plus, Download, Pencil, Upload, AlertTriangle } from "lucide-react";
import EquipmentPicker from "@/components/EquipmentPicker";
import type { Equipment } from "@shared/schema";

const isLegacyType = (type: string) => !equipmentTypeLabels[type];
const vatOf = (price: string) => (price && Number(price) > 0 ? String(Math.round(Number(price) * 1.2)) : "");

function EquipmentDialog({ trigger, item, catalog, defaultKind = "catalog" }: {
  trigger: React.ReactNode; item?: Equipment; catalog: Equipment[]; defaultKind?: string;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const empty = (v?: string | number | null) => (v == null ? "" : String(v));
  const initial = () => ({
    kind: item?.kind ?? defaultKind,
    catalogId: empty(item?.catalogId),
    brand: empty(item?.brand), name: empty(item?.name), model: empty(item?.model),
    type: item?.type ?? "",
    powerW: empty(item?.powerW), workField: empty(item?.workField), execution: empty(item?.execution),
    sourceInternal: empty(item?.sourceInternal),
    price: item?.price != null && !(item.priceStatus === "on_request" && item.price === 0) ? String(item.price) : "",
    priceVat: empty(item?.priceVat),
    priceStatus: item?.priceStatus ?? "approved",
    priceDate: empty(item?.priceDate),
    availability: empty(item?.availability),
    serial: empty(item?.serial), rentalDayPrice: empty(item?.rentalDayPrice),
    status: item?.status ?? "available", notes: empty(item?.notes),
  });
  const [form, setForm] = useState(initial);
  const set = (patch: Partial<ReturnType<typeof initial>>) => setForm((f) => ({ ...f, ...patch }));

  const pickCatalog = (id: string) => {
    const c = catalog.find((e) => e.id === Number(id));
    if (!c) return set({ catalogId: "" });
    set({
      catalogId: id, name: c.name, model: c.model, type: c.type, brand: empty(c.brand),
      powerW: empty(c.powerW), workField: empty(c.workField), execution: empty(c.execution),
      price: c.priceStatus === "on_request" && c.price === 0 ? "" : String(c.price),
      priceVat: empty(c.priceVat), priceStatus: c.priceStatus ?? "approved", priceDate: empty(c.priceDate),
    });
  };

  const priceRequired = form.priceStatus !== "on_request";
  const valid = form.name.trim() && form.model.trim() && form.type && !isLegacyType(form.type)
    && (!priceRequired || Number(form.price) > 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const txt = (v: string) => v.trim() || null;
      const num = (v: string) => (v ? Number(v) : null);
      const payload = {
        kind: form.kind,
        catalogId: form.kind === "unit" && form.catalogId ? Number(form.catalogId) : null,
        brand: txt(form.brand), name: form.name.trim(), model: form.model.trim(), type: form.type,
        powerW: txt(form.powerW), workField: txt(form.workField), execution: txt(form.execution),
        sourceInternal: txt(form.sourceInternal),
        price: form.price ? Number(form.price) : 0, priceVat: num(form.priceVat),
        priceStatus: form.priceStatus, priceDate: form.priceDate || null, availability: txt(form.availability),
        serial: txt(form.serial), rentalDayPrice: num(form.rentalDayPrice),
        status: form.status, notes: txt(form.notes),
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

  const field = (label: string, key: keyof ReturnType<typeof initial>, props: React.ComponentProps<typeof Input> = {}) => (
    <div>
      <Label>{label}</Label>
      <Input data-testid={`input-eq-${key}`} value={form[key]} onChange={(e) => set({ [key]: e.target.value } as any)} {...props} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm(initial()); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? "Редагувати обладнання" : "Нове обладнання"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Запис</Label>
            <Select value={form.kind} onValueChange={(v) => set({ kind: v })}>
              <SelectTrigger data-testid="select-eq-kind"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(equipmentKindLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {form.kind === "unit" ? (
            <div>
              <Label>Модель з каталогу</Label>
              <EquipmentPicker testId="select-eq-catalog" items={catalog} value={form.catalogId} onChange={pickCatalog} placeholder="Оберіть модель" allowNone />
            </div>
          ) : <div />}
          {field("Бренд", "brand", { placeholder: "FidLASER / FidMARKER / FidCLEAN / Automator" })}
          {field("Модель (артикул)", "model")}
          <div className="sm:col-span-2">{field("Назва", "name")}</div>
          <div>
            <Label>Тип</Label>
            <Select value={isLegacyType(form.type) ? "" : form.type} onValueChange={(v) => set({ type: v })}>
              <SelectTrigger data-testid="select-eq-type">
                <SelectValue placeholder={form.type ? `${equipmentTypeLabel(form.type)}: оберіть новий` : "Оберіть тип"} />
              </SelectTrigger>
              <SelectContent>{Object.entries(equipmentTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {field("Виконання", "execution", { placeholder: "настільний, портативний, у лінію…" })}
          {field("Потужність, Вт", "powerW")}
          {field("Робоче поле / розмір, мм", "workField")}
          {field("Ціна продажу без ПДВ, грн", "price", {
            type: "number",
            onChange: (e) => set({ price: e.target.value, priceVat: form.priceVat && form.priceVat !== vatOf(form.price) ? form.priceVat : vatOf(e.target.value) }),
          })}
          {field("Ціна з ПДВ, грн", "priceVat", { type: "number" })}
          <div>
            <Label>Статус ціни</Label>
            <Select value={form.priceStatus} onValueChange={(v) => set({ priceStatus: v })}>
              <SelectTrigger data-testid="select-eq-price-status"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(priceStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {field("Дата прайсу", "priceDate", { type: "date" })}
          <div className="sm:col-span-2">{field("Наявність", "availability", { placeholder: "склад Полтава / під замовлення…" })}</div>
          <div className="sm:col-span-2">
            {field("Джерело (внутрішнє, не для клієнтів)", "sourceInternal")}
          </div>
          {form.kind === "unit" && (
            <>
              {field("Серійний №", "serial")}
              {field("Оренда/добу, грн", "rentalDayPrice", { type: "number" })}
              <div>
                <Label>Статус машини</Label>
                <Select value={form.status} onValueChange={(v) => set({ status: v })}>
                  <SelectTrigger data-testid="select-eq-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(equipmentStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="sm:col-span-2">{field("Нотатки", "notes")}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Скасувати</Button>
          <Button data-testid="button-save-equipment" disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Збереження…" : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ImportResult = {
  dryRun: boolean; created: number; updated: number; unchanged: number; priceChanged: number; notInFile: number;
  errors: string[]; changes: Array<{ model: string; action: string; fields: string[] }>;
};

const fieldLabels: Record<string, string> = {
  name: "назва", type: "тип", brand: "бренд", powerW: "потужність", workField: "поле", sourceInternal: "джерело",
  execution: "виконання", price: "ціна", priceVat: "ціна з ПДВ", priceStatus: "статус ціни", priceDate: "дата прайсу",
  availability: "наявність", serial: "серійний №", rentalDayPrice: "оренда", notes: "нотатки",
};

function CatalogImportDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [sheetInfo, setSheetInfo] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setFileName(""); setRows([]); setSheetInfo([]); setErrors([]); setPreview(null); };

  const send = async (dryRun: boolean, data: CatalogRow[]) => {
    const res = await apiRequest("POST", "/api/equipment/catalog-import", { dryRun, rows: data });
    return (await res.json()) as ImportResult;
  };

  const onFile = async (file?: File) => {
    reset();
    if (!file) return;
    setFileName(file.name);
    setBusy(true);
    try {
      const sheets = await readXlsx(file);
      const all: CatalogRow[] = [];
      const errs: string[] = [];
      const info: string[] = [];
      for (const s of sheets) {
        const header = (s.rows[0] ?? []).map((v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase());
        if (!REQUIRED_HEADERS.every((h) => header.includes(h))) continue; // довідкові аркуші
        const parsed = parseCatalogSheet(s.name, s.rows);
        all.push(...parsed.rows);
        errs.push(...parsed.errors);
        info.push(`«${s.name}»: ${parsed.rows.length} позицій`);
      }
      if (!info.length) errs.push(`У файлі немає аркуша з колонками ${REQUIRED_HEADERS.map((h) => `«${h}»`).join(", ")}`);
      setRows(all); setSheetInfo(info); setErrors(errs);
      if (all.length && !errs.length) {
        const result = await send(true, all);
        setPreview(result);
        if (result.errors.length) setErrors(result.errors);
      }
    } catch (e: any) {
      setErrors([e?.message ?? "Не вдалося прочитати файл"]);
    } finally { setBusy(false); }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const result = await send(false, rows);
      if (result.errors.length) { setErrors(result.errors); return; }
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast({ title: "Каталог імпортовано", description: `Нових: ${result.created}, оновлено: ${result.updated}, без змін: ${result.unchanged}` });
      setOpen(false); reset();
    } catch (e: any) {
      toast({ variant: "destructive", title: "Помилка імпорту", description: e?.message });
    } finally { setBusy(false); }
  };

  const updatedList = preview?.changes.filter((c) => c.action === "updated") ?? [];
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-import-catalog"><Upload className="w-4 h-4 mr-2" />Імпорт каталогу</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Імпорт каталогу з цінами (Excel)</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Файл Продажів .xlsx з аркушами «Обладнання» і «Опції та витратні». Позиції шукаються за колонкою
            «Модель (артикул)»: нові додаються, наявні оновлюються. Нічого не видаляється. Маржа з нотаток не переноситься.
          </p>
          <Input type="file" accept=".xlsx" data-testid="input-catalog-file" onChange={(e) => onFile(e.target.files?.[0])} />
          {busy && <p className="text-muted-foreground">Обробка…</p>}
          {fileName && sheetInfo.length > 0 && <p>{fileName}: {sheetInfo.join("; ")}</p>}
          {errors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1" data-testid="catalog-import-errors">
              <p className="font-medium text-destructive">Імпорт неможливий, виправте файл:</p>
              <ul className="list-disc pl-5 max-h-40 overflow-y-auto">{errors.slice(0, 50).map((e, i) => <li key={i}>{e}</li>)}</ul>
              {errors.length > 50 && <p>…ще {errors.length - 50}</p>}
            </div>
          )}
          {preview && !errors.length && (
            <div className="rounded-md border border-border p-3 space-y-1" data-testid="catalog-import-preview">
              <p className="font-medium">Що зміниться:</p>
              <p>Нових позицій: <b>{preview.created}</b></p>
              <p>Оновиться: <b>{preview.updated}</b> (з них змінилась ціна: {preview.priceChanged})</p>
              <p>Без змін: <b>{preview.unchanged}</b></p>
              {preview.notInFile > 0 && <p>У CRM, але немає у файлі: {preview.notInFile} (залишаться як є)</p>}
              {updatedList.length > 0 && (
                <ul className="list-disc pl-5 max-h-40 overflow-y-auto text-xs text-muted-foreground">
                  {updatedList.slice(0, 100).map((c) => <li key={c.model}>{c.model}: {c.fields.map((f) => fieldLabels[f] ?? f).join(", ")}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Скасувати</Button>
          <Button data-testid="button-apply-catalog-import" disabled={!preview || errors.length > 0 || busy || (preview.created + preview.updated === 0)} onClick={apply}>
            Імпортувати
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

  const [kind, setKind] = useState<"catalog" | "unit">("catalog");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const catalog = useMemo(() => equipment.filter((e) => e.kind === "catalog").sort((a, b) => a.model.localeCompare(b.model, "uk")), [equipment]);
  const units = useMemo(() => equipment.filter((e) => e.kind !== "catalog"), [equipment]);
  const legacyCount = equipment.filter((e) => isLegacyType(e.type)).length;
  const brands = useMemo(() => Array.from(new Set(equipment.map((e) => e.brand).filter(Boolean) as string[])).sort(), [equipment]);
  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (kind === "catalog" ? catalog : units).filter((e) => {
      if (typeFilter === "legacy" ? !isLegacyType(e.type) : typeFilter !== "all" && e.type !== typeFilter) return false;
      if (brandFilter !== "all" && e.brand !== brandFilter) return false;
      if (statusFilter !== "all" && (kind === "catalog" ? e.priceStatus : e.status) !== statusFilter) return false;
      if (!q) return true;
      return [e.name, e.model, e.serial, e.brand].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [kind, catalog, units, search, typeFilter, brandFilter, statusFilter]);

  const showPrice = (e: Equipment) => (e.priceStatus === "on_request" && !e.price ? "за запитом" : formatUAH(e.price));

  // Колонку «Джерело» не експортуємо: файл може потрапити до клієнта.
  const exportRows = () => filtered.map((e) => ({
    "Запис": equipmentKindLabels[e.kind] ?? e.kind,
    "Бренд": e.brand ?? "", "Модель (артикул)": e.model, "Назва": e.name, "Тип": equipmentTypeLabel(e.type),
    "Потужність, Вт": e.powerW ?? "", "Робоче поле / розмір, мм": e.workField ?? "", "Виконання": e.execution ?? "",
    "Ціна продажу без ПДВ, грн": e.priceStatus === "on_request" && !e.price ? "" : e.price,
    "Ціна з ПДВ, грн": e.priceVat ?? "",
    "Статус ціни": e.priceStatus ? priceStatusLabels[e.priceStatus] : "", "Дата прайсу": e.priceDate ? formatPriceDate(e.priceDate) : "",
    "Наявність": e.availability ?? "", "Серійний №": e.serial ?? "", "Оренда/добу, грн": e.rentalDayPrice ?? "",
    "Статус машини": e.kind === "unit" ? equipmentStatusLabels[e.status] ?? e.status : "", "Нотатки": e.notes ?? "",
  }));
  const ensureExportAccess = () => {
    if (canImportExport) return true;
    toast({ variant: "destructive", title: "Немає доступу", description: "Експорт дозволений тільки директору та виконавчому директору." });
    return false;
  };
  const fileBase = () => `${kind === "catalog" ? "catalog" : "equipment"}_${new Date().toISOString().slice(0, 10)}`;
  const exportCSV = () => { if (ensureExportAccess()) downloadCSV(`${fileBase()}.csv`, exportRows()); };
  const exportExcel = () => { if (ensureExportAccess()) downloadExcel(`${fileBase()}.xls`, "Обладнання", exportRows()); };

  const switchKind = (k: "catalog" | "unit") => { setKind(k); setStatusFilter("all"); };
  const statusOptions = kind === "catalog" ? priceStatusLabels : equipmentStatusLabels;
  const colCount = kind === "catalog" ? 11 : 9;

  return (
    <div>
      <PageHeader
        title="Обладнання"
        subtitle="Каталог з цінами і машини з серійними номерами"
        actions={
          <>
            {canImportExport && <CatalogImportDialog />}
            <Button variant="outline" onClick={exportCSV} data-testid="button-export-equipment">
              <Download className="w-4 h-4 mr-2" />Експорт CSV
            </Button>
            <Button variant="outline" onClick={exportExcel} data-testid="button-export-equipment-excel">
              <Download className="w-4 h-4 mr-2" />Excel
            </Button>
            <EquipmentDialog
              catalog={catalog} defaultKind={kind}
              trigger={<Button data-testid="button-new-equipment"><Plus className="w-4 h-4 mr-2" />Додати</Button>}
            />
          </>
        }
      />

      <div className="flex gap-2 mb-3">
        <Button variant={kind === "catalog" ? "default" : "outline"} size="sm" onClick={() => switchKind("catalog")} data-testid="tab-catalog">
          Каталог ({catalog.length})
        </Button>
        <Button variant={kind === "unit" ? "default" : "outline"} size="sm" onClick={() => switchKind("unit")} data-testid="tab-units">
          Машини з серійним № ({units.length})
        </Button>
      </div>

      {legacyCount > 0 && (
        <Card className="p-3 mb-3 flex items-center gap-2 text-sm border-amber-500/40 bg-amber-500/5" data-testid="legacy-type-banner">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Записів зі старим типом: {legacyCount}. Відкрийте кожен і виберіть один із 9 нових типів.</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => { setTypeFilter("legacy"); setKind(units.some((e) => isLegacyType(e.type)) ? "unit" : "catalog"); }}>
            Показати
          </Button>
        </Card>
      )}

      <Card className="p-3 mb-4">
        <div className="grid md:grid-cols-4 gap-2">
          <Input placeholder="Пошук: назва, модель, бренд, серійний…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-equipment-search" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger data-testid="select-filter-eq-type"><SelectValue placeholder="Тип" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі типи</SelectItem>
              {Object.entries(equipmentTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              {legacyCount > 0 && <SelectItem value="legacy">Старий тип: потрібно вибрати</SelectItem>}
            </SelectContent>
          </Select>
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger data-testid="select-filter-eq-brand"><SelectValue placeholder="Бренд" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі бренди</SelectItem>
              {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="select-filter-eq-status"><SelectValue placeholder="Статус" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{kind === "catalog" ? "Усі статуси ціни" : "Усі статуси"}</SelectItem>
              {Object.entries(statusOptions).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            {kind === "catalog" ? (
              <tr>
                <th className="text-left px-3 py-2">Модель</th>
                <th className="text-left px-3 py-2">Назва</th>
                <th className="text-left px-3 py-2">Тип</th>
                <th className="text-left px-3 py-2">Потужн., Вт</th>
                <th className="text-left px-3 py-2">Поле, мм</th>
                <th className="text-right px-3 py-2">Без ПДВ</th>
                <th className="text-right px-3 py-2">З ПДВ</th>
                <th className="text-left px-3 py-2">Ціна</th>
                <th className="text-left px-3 py-2">Наявність</th>
                <th className="text-left px-3 py-2" title="Внутрішнє: не для клієнтів">Джерело</th>
                <th className="text-right px-3 py-2">Дії</th>
              </tr>
            ) : (
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
            )}
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={colCount} className="text-center text-muted-foreground py-8">Завантаження…</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={colCount} className="text-center text-muted-foreground py-8">
                {kind === "catalog" && catalog.length === 0 ? "Каталог порожній. Завантажте файл кнопкою «Імпорт каталогу»." : "Обладнання не знайдено"}
              </td></tr>
            )}
            {filtered.map((e) => {
              const edit = (
                <EquipmentDialog
                  item={e} catalog={catalog}
                  trigger={<Button variant="ghost" size="sm" data-testid={`button-edit-equipment-${e.id}`}><Pencil className="w-3 h-3 mr-1" />Редагувати</Button>}
                />
              );
              const typeCell = (
                <td className="px-3 py-2">
                  {isLegacyType(e.type)
                    ? <span className="text-amber-700 dark:text-amber-400">{equipmentTypeLabel(e.type)}</span>
                    : equipmentTypeLabel(e.type)}
                </td>
              );
              if (kind === "catalog") {
                return (
                  <tr key={e.id} className="border-t border-border hover-elevate" data-testid={`row-equipment-${e.id}`}>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{e.model}</td>
                    <td className="px-3 py-2 text-xs min-w-[16rem] max-w-md" title={e.notes ?? undefined}>{e.name}{e.execution ? <span className="text-muted-foreground"> · {e.execution}</span> : null}</td>
                    {typeCell}
                    <td className="px-3 py-2 tabular-nums">{e.powerW ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{e.workField ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{showPrice(e)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{e.priceVat ? formatUAH(e.priceVat) : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {e.priceStatus && <span className={`text-[11px] px-2 py-0.5 rounded-full ${priceStatusBadge(e.priceStatus)}`}>{priceStatusLabels[e.priceStatus]}</span>}
                      <div className="text-[11px] text-muted-foreground">{formatPriceDate(e.priceDate)}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.availability ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.sourceInternal ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{edit}</td>
                  </tr>
                );
              }
              const parent = e.catalogId ? catalogById.get(e.catalogId) : undefined;
              return (
                <tr key={e.id} className="border-t border-border hover-elevate" data-testid={`row-equipment-${e.id}`}>
                  <td className="px-3 py-2 font-medium">{e.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.model}{parent ? <div className="text-[11px]">з каталогу</div> : null}</td>
                  {typeCell}
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{e.serial ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{showPrice(e)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{e.rentalDayPrice ? formatUAH(e.rentalDayPrice) : "—"}</td>
                  <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded-full ${equipmentStatusBadge(e.status)}`}>{equipmentStatusLabels[e.status] ?? e.status}</span></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{e.notes ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{edit}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
