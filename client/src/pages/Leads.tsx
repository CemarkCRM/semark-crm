import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import LeadFormDialog from "@/components/LeadFormDialog";
import { stageLabels, stageOrder, stageBadgeClass, sourceLabels, roleLabels, formatUAH, formatDateTime } from "@/lib/i18n";
import { downloadCSV, parseCSV } from "@/lib/csv";
import { downloadExcel } from "@/lib/excelExport";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/currentUser";
import { Plus, Download, Upload, FileText, Columns3 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Lead, User } from "@shared/schema";

// Стовпці списку клієнтів, які можна вмикати/вимикати. «Клієнт» показується завжди.
const COLUMNS = [
  { key: "contact", label: "Компанія / контакт" },
  { key: "city", label: "Місто" },
  { key: "stage", label: "Стадія" },
  { key: "source", label: "Джерело" },
  { key: "notes", label: "Примітки" },
  { key: "budget", label: "Бюджет" },
  { key: "responsible", label: "Відповідальний" },
  { key: "created", label: "Додано" },
  { key: "updated", label: "Оновлено / ким" },
] as const;
type ColumnKey = (typeof COLUMNS)[number]["key"];
const DEFAULT_HIDDEN: ColumnKey[] = ["budget", "responsible"];
const COLUMNS_STORAGE_KEY = "leads.hiddenColumns";

function loadHiddenColumns(): ColumnKey[] {
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : DEFAULT_HIDDEN;
  } catch {
    return DEFAULT_HIDDEN;
  }
}

export default function Leads() {
  const { toast } = useToast();
  const { canImportExport } = useCurrentUser();
  const { data: leads = [], isLoading } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const [search, setSearch] = useState("");
  const [companyContactFilter, setCompanyContactFilter] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("created_desc");
  const [hiddenColumns, setHiddenColumns] = useState<ColumnKey[]>(loadHiddenColumns);
  const show = (key: ColumnKey) => !hiddenColumns.includes(key);
  const toggleColumn = (key: ColumnKey, visible: boolean) => {
    const next = visible ? hiddenColumns.filter((k) => k !== key) : [...hiddenColumns, key];
    setHiddenColumns(next);
    try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next)); } catch { /* приватний режим — просто не запам'ятовуємо */ }
  };
  const visibleColumnCount = 1 + COLUMNS.filter((c) => show(c.key)).length;

  const cities = useMemo(() => Array.from(new Set(leads.map((l) => l.city).filter(Boolean))) as string[], [leads]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const companyQ = companyContactFilter.trim().toLowerCase();
    const list = leads.filter((l) => {
      if (stageFilter !== "all" && l.stage !== stageFilter) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (cityFilter !== "all" && l.city !== cityFilter) return false;
      if (companyQ) {
        const companyMatch = (l.company ?? "").toLowerCase().startsWith(companyQ) || (l.company ?? "").toLowerCase().includes(companyQ);
        const contactMatch = [l.contactName, l.contactPhone, l.contactEmail].filter(Boolean).some((v) => String(v).toLowerCase().includes(companyQ));
        if (!companyMatch && !contactMatch) return false;
      }
      if (!q) return true;
      return [l.title, l.company, l.contactName, l.contactPhone, l.contactEmail, l.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    // Дати зберігаються як ISO-рядки, тож порівняння рядків дає правильний порядок.
    const [field, dir] = sortBy.split("_") as ["created" | "updated", "asc" | "desc"];
    const key = field === "created" ? "createdAt" : "updatedAt";
    return [...list].sort((a, b) => {
      const cmp = (a[key] ?? "").localeCompare(b[key] ?? "") || a.id - b.id;
      return dir === "asc" ? cmp : -cmp;
    });
  }, [leads, search, companyContactFilter, stageFilter, sourceFilter, cityFilter, sortBy]);

  const exportRows = () => filtered.map((l) => ({
      id: l.id,
      title: l.title,
      stage: stageLabels[l.stage] ?? l.stage,
      source: sourceLabels[l.source] ?? l.source,
      company: l.company ?? "",
      contactName: l.contactName,
      contactPhone: l.contactPhone ?? "",
      contactEmail: l.contactEmail ?? "",
      city: l.city ?? "",
      budget: l.budget ?? "",
      responsible: l.responsibleId ? userMap.get(l.responsibleId)?.fullName ?? "" : "",
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      notes: l.notes ?? "",
    }));

  const ensureImportExportAccess = () => {
    if (canImportExport) return true;
    toast({ variant: "destructive", title: "Немає доступу", description: "Імпорт та експорт дозволений тільки директору Цілюрику Юрію Вікторовичу та виконавчому директору Безуглій Людмилі Анатоліївні." });
    return false;
  };

  const exportCSV = () => {
    if (!ensureImportExportAccess()) return;
    const rows = exportRows();
    downloadCSV(`clients_${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };
  const exportExcel = () => {
    if (!ensureImportExportAccess()) return;
    downloadExcel(`clients_${new Date().toISOString().slice(0, 10)}.xls`, "Клієнти", exportRows());
  };

  const importMutation = useMutation({
    mutationFn: async (rows: any[]) => {
      const res = await apiRequest("POST", "/api/leads/import", rows);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      toast({ title: "Імпорт завершено", description: `Створено клієнтів: ${data.count}` });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка імпорту", description: e?.message }),
  });

  const handleImport = async (file: File) => {
    if (!ensureImportExportAccess()) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) {
      toast({ variant: "destructive", title: "Порожній CSV" });
      return;
    }
    // Map stage/source by Ukrainian label OR code
    const stageInverse: Record<string, string> = {};
    for (const [k, v] of Object.entries(stageLabels)) stageInverse[v.toLowerCase()] = k;
    const sourceInverse: Record<string, string> = {};
    for (const [k, v] of Object.entries(sourceLabels)) sourceInverse[v.toLowerCase()] = k;

    // Дата з файлу: "2026-08-12 12:36:45" (місцевий час), "12.08.2026 12:36" або ISO → ISO-рядок.
    const toISO = (raw?: string): string | undefined => {
      const v = (raw || "").trim();
      if (!v) return undefined;
      const dmy = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
      const d = dmy
        ? new Date(+dmy[3], +dmy[2] - 1, +dmy[1], +(dmy[4] || 0), +(dmy[5] || 0), +(dmy[6] || 0))
        : new Date(/^\d{4}-\d{2}-\d{2} \d/.test(v) ? v.replace(" ", "T") : v);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    };
    const userByName = new Map(users.map((u) => [u.fullName.trim().toLowerCase(), u.id]));

    const payload = rows.map((r) => {
      const stageRaw = (r.stage || r.stage_code || "new").trim();
      const sourceRaw = (r.source || "website").trim();
      const stage = stageInverse[stageRaw.toLowerCase()] || stageRaw || "new";
      const source = sourceInverse[sourceRaw.toLowerCase()] || sourceRaw || "website";
      return {
        title: r.title || r.назва || r["Назва"] || "Без назви",
        stage: stageOrder.includes(stage) ? stage : "new",
        source,
        company: r.company || r["Компанія"] || null,
        contactName: r.contactName || r.contact || r["Контакт"] || "Контакт",
        contactPhone: r.contactPhone || r.phone || r["Телефон"] || null,
        contactEmail: r.contactEmail || r.email || r["Email"] || null,
        city: r.city || r["Місто"] || null,
        budget: (r.budget || r["Бюджет"]) ? Number(r.budget || r["Бюджет"]) || null : null,
        responsibleId: r.responsibleId
          ? Number(r.responsibleId)
          : userByName.get((r.responsible || r["Відповідальний"] || "").trim().toLowerCase()) ?? null,
        notes: r.notes || r["Нотатки"] || null,
        createdAt: toISO(r.createdAt || r["Дата створення"]),
        updatedAt: toISO(r.updatedAt || r["Оновлено"]),
      };
    });
    importMutation.mutate(payload);
  };

  return (
    <div>
      <PageHeader
        title="Клієнти"
        subtitle="Клієнтська база, контакти, історія та воронка продажів"
        actions={
          <>
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={!canImportExport}
                data-testid="input-import-leads"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); e.currentTarget.value = ""; }}
              />
              <Button variant="outline" asChild data-testid="button-import-leads" disabled={!canImportExport}>
                <span><Upload className="w-4 h-4 mr-2" />Імпорт CSV</span>
              </Button>
            </label>
            <Button variant="outline" onClick={exportCSV} data-testid="button-export-leads">
              <Download className="w-4 h-4 mr-2" />Експорт CSV
            </Button>
            <Button variant="outline" onClick={exportExcel} data-testid="button-export-leads-excel">
              <Download className="w-4 h-4 mr-2" />Excel
            </Button>
            <LeadFormDialog
              trigger={<Button data-testid="button-new-lead"><Plus className="w-4 h-4 mr-2" />Новий клієнт</Button>}
            />
          </>
        }
      />

      <Card className="p-3 mb-4">
        <div className="grid md:grid-cols-4 gap-2">
          <Input
            placeholder="Пошук: назва, компанія, контакт…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-leads-search"
          />
          <Input
            placeholder="Компанія / контакт: введіть перші літери…"
            value={companyContactFilter}
            onChange={(e) => setCompanyContactFilter(e.target.value)}
            data-testid="input-company-contact-filter"
          />
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger data-testid="select-filter-stage"><SelectValue placeholder="Стадія" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі стадії</SelectItem>
              {stageOrder.map((s) => <SelectItem key={s} value={s}>{stageLabels[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger data-testid="select-filter-source"><SelectValue placeholder="Джерело" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі джерела</SelectItem>
              {Object.entries(sourceLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger data-testid="select-filter-city"><SelectValue placeholder="Місто" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Усі міста</SelectItem>
              {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger data-testid="select-sort-leads"><SelectValue placeholder="Сортування" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="created_desc">Спершу нові (за датою додавання)</SelectItem>
              <SelectItem value="created_asc">Спершу старі (за датою додавання)</SelectItem>
              <SelectItem value="updated_desc">Нещодавно оновлені</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="justify-start" data-testid="button-leads-columns">
                <Columns3 className="w-4 h-4 mr-2" />Стовпці
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Показувати стовпці</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={show(c.key)}
                  onCheckedChange={(v) => toggleColumn(c.key, v === true)}
                  onSelect={(e) => e.preventDefault()}
                  data-testid={`toggle-column-${c.key}`}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Клієнт</th>
              {show("contact") && <th className="text-left px-3 py-2">Компанія / контакт</th>}
              {show("city") && <th className="text-left px-3 py-2">Місто</th>}
              {show("stage") && <th className="text-left px-3 py-2">Стадія</th>}
              {show("source") && <th className="text-left px-3 py-2">Джерело</th>}
              {show("notes") && <th className="text-left px-3 py-2">Примітки</th>}
              {show("budget") && <th className="text-right px-3 py-2">Бюджет</th>}
              {show("responsible") && <th className="text-left px-3 py-2">Відповідальний</th>}
              {show("created") && <th className="text-left px-3 py-2">Додано</th>}
              {show("updated") && <th className="text-left px-3 py-2">Оновлено / ким</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={visibleColumnCount} className="text-center text-muted-foreground py-8">Завантаження…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={visibleColumnCount} className="text-center text-muted-foreground py-8">
                <FileText className="w-6 h-6 mx-auto mb-1 opacity-50" />
                Клієнтів не знайдено
              </td></tr>
            )}
            {filtered.map((l) => (
              <tr key={l.id} className="border-t border-border hover-elevate" data-testid={`row-lead-${l.id}`}>
                <td className="px-3 py-2">
                  <Link href={`/leads/${l.id}`} className="font-medium hover:underline" data-testid={`link-lead-${l.id}`}>
                    {l.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">#{l.id}</div>
                </td>
                {show("contact") && <td className="px-3 py-2">
                  <div>{l.company ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{l.contactName}</div>
                  <div className="text-xs text-muted-foreground">{l.contactPhone ?? "телефон не вказано"}</div>
                  <div className="text-xs text-muted-foreground">{l.contactEmail ?? "email не вказано"}</div>
                </td>}
                {show("city") && <td className="px-3 py-2 text-muted-foreground">{l.city ?? "—"}</td>}
                {show("stage") && <td className="px-3 py-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${stageBadgeClass(l.stage)}`}>{stageLabels[l.stage] ?? l.stage}</span>
                </td>}
                {show("source") && <td className="px-3 py-2 text-muted-foreground">{sourceLabels[l.source] ?? l.source}</td>}
                {show("notes") && <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs" data-testid={`text-lead-notes-${l.id}`}>
                  {/* Довгі примітки обрізаються до 3 рядків, повний текст — у підказці та в картці клієнта. */}
                  <div className="line-clamp-3 whitespace-pre-line" title={l.notes ?? undefined}>{l.notes || "—"}</div>
                </td>}
                {show("budget") && <td className="px-3 py-2 text-right tabular-nums">{formatUAH(l.budget)}</td>}
                {show("responsible") && <td className="px-3 py-2 text-muted-foreground">
                  {l.responsibleId ? (userMap.get(l.responsibleId)?.fullName ?? "—") : "—"}
                </td>}
                {show("created") && <td className="px-3 py-2 text-muted-foreground text-xs" data-testid={`text-lead-created-${l.id}`}>
                  {formatDateTime(l.createdAt)}
                </td>}
                {show("updated") && <td className="px-3 py-2 text-muted-foreground text-xs">
                  <div>{formatDateTime(l.updatedAt)}</div>
                  <div>{l.updatedById ? userMap.get(l.updatedById)?.fullName ?? "Адміністратор" : "Адміністратор"}</div>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
