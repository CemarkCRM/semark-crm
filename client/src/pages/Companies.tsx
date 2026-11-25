import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import CompanyFormDialog from "@/components/CompanyFormDialog";
import { downloadCSV } from "@/lib/csv";
import { downloadExcel } from "@/lib/excelExport";
import { formatDateTime } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/currentUser";
import { Plus, Download, Building2, Link2, Users } from "lucide-react";
import type { Company, Contact, Lead, User } from "@shared/schema";

type LinkReport = {
  companiesToCreate: number;
  existingCompaniesUsed: number;
  leadsToLink: number;
  contactsToLink: number;
  leadsWithoutCompany: number;
  possibleDuplicates: { names: string[]; leads: number }[];
  applied: boolean;
};

const contactLine = (c: { fullName: string; position?: string | null; phone?: string | null; email?: string | null }) =>
  [c.fullName, c.position, c.phone, c.email].filter(Boolean).join(", ");

export default function Companies() {
  const { toast } = useToast();
  const { canImportExport } = useCurrentUser();
  const { data: companies = [], isLoading } = useQuery<Company[]>({ queryKey: ["/api/companies"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: contacts = [] } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const [search, setSearch] = useState("");
  const [report, setReport] = useState<LinkReport | null>(null);

  const leadsByCompany = useMemo(() => {
    const m = new Map<number, Lead[]>();
    for (const l of leads) if (l.companyId) m.set(l.companyId, [...(m.get(l.companyId) ?? []), l]);
    return m;
  }, [leads]);
  const contactsByCompany = useMemo(() => {
    const m = new Map<number, Contact[]>();
    for (const c of contacts) if (c.companyId) m.set(c.companyId, [...(m.get(c.companyId) ?? []), c]);
    return m;
  }, [contacts]);
  const unlinkedWithName = leads.filter((l) => !l.companyId && l.company?.trim()).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => {
      const own = [c.name, c.edrpou, c.city, c.industry, c.phone, c.email].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      if (own) return true;
      const people = [...(contactsByCompany.get(c.id) ?? []).map((p) => [p.fullName, p.phone, p.email]),
        ...(leadsByCompany.get(c.id) ?? []).map((l) => [l.contactName, l.contactPhone, l.contactEmail])].flat();
      return people.filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [companies, search, contactsByCompany, leadsByCompany]);

  // One row per company. Contact persons = company contacts + main contacts from its clients (without repeats).
  const exportRows = () => filtered.map((c) => {
    const companyLeads = leadsByCompany.get(c.id) ?? [];
    const seen = new Set<string>();
    const people: string[] = [];
    const add = (p: { fullName: string; position?: string | null; phone?: string | null; email?: string | null }) => {
      const key = `${p.fullName}|${p.phone ?? ""}|${p.email ?? ""}`.toLowerCase();
      if (!p.fullName || seen.has(key)) return;
      seen.add(key); people.push(contactLine(p));
    };
    for (const p of contactsByCompany.get(c.id) ?? []) add(p);
    for (const l of companyLeads) add({ fullName: l.contactName, phone: l.contactPhone, email: l.contactEmail });
    return {
      "ID": c.id,
      "Компанія": c.name,
      "ЄДРПОУ / ІПН": c.edrpou ?? "",
      "Місто": c.city ?? "",
      "Адреса": c.address ?? "",
      "Сайт": c.website ?? "",
      "Галузь": c.industry ?? "",
      "Телефон компанії": c.phone ?? "",
      "Email компанії": c.email ?? "",
      "Відповідальний": c.responsibleId ? userMap.get(c.responsibleId)?.fullName ?? "" : "",
      "Кількість угод": companyLeads.length,
      "Контактні особи": people.join("; "),
      "Примітки": c.notes ?? "",
      "Створено": c.createdAt,
      "Оновлено": c.updatedAt,
    };
  });

  const ensureAccess = () => {
    if (canImportExport) return true;
    toast({ variant: "destructive", title: "Немає доступу", description: "Експорт доступний лише директору та виконавчому директору." });
    return false;
  };
  const stamp = () => new Date().toISOString().slice(0, 10);

  const { data: contactSync } = useQuery<{ contactsToCreate: number; leadsWithoutCompany: number }>({
    queryKey: ["/api/contacts/sync-from-leads"],
    enabled: canImportExport,
  });
  const [syncOpen, setSyncOpen] = useState(false);
  const syncMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/contacts/sync-from-leads", {})).json() as Promise<{ contactsToCreate: number }>,
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts/sync-from-leads"] });
      toast({ title: `Додано контактних осіб: ${r.contactsToCreate}` });
      setSyncOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });

  const linkMutation = useMutation({
    mutationFn: async (apply: boolean) => (await apiRequest("POST", "/api/companies/link-existing", { apply })).json() as Promise<LinkReport>,
    onSuccess: (r) => {
      setReport(r);
      if (r.applied) {
        queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
        queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
        queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
        toast({ title: "Компанії створено і прив'язано" });
      }
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });

  return (
    <div>
      <PageHeader
        title="Компанії"
        subtitle="Компанії, їхні контактні особи та угоди"
        actions={
          <>
            {canImportExport && unlinkedWithName > 0 && (
              <Button variant="outline" onClick={() => linkMutation.mutate(false)} disabled={linkMutation.isPending} data-testid="button-link-companies">
                <Link2 className="w-4 h-4 mr-2" />Створити компанії з угод ({unlinkedWithName})
              </Button>
            )}
            {canImportExport && unlinkedWithName === 0 && (contactSync?.contactsToCreate ?? 0) > 0 && (
              <Button variant="outline" onClick={() => setSyncOpen(true)} data-testid="button-sync-contacts">
                <Users className="w-4 h-4 mr-2" />Перенести контакти в компанії ({contactSync!.contactsToCreate})
              </Button>
            )}
            <Button variant="outline" onClick={() => ensureAccess() && downloadCSV(`companies_${stamp()}.csv`, exportRows())} data-testid="button-export-companies">
              <Download className="w-4 h-4 mr-2" />Експорт CSV
            </Button>
            <Button variant="outline" onClick={() => ensureAccess() && downloadExcel(`companies_${stamp()}.xls`, "Компанії", exportRows())} data-testid="button-export-companies-excel">
              <Download className="w-4 h-4 mr-2" />Excel
            </Button>
            <CompanyFormDialog trigger={<Button data-testid="button-new-company"><Plus className="w-4 h-4 mr-2" />Нова компанія</Button>} />
          </>
        }
      />

      <Card className="p-3 mb-4">
        <Input
          placeholder="Пошук: назва, ЄДРПОУ, місто, контактна особа, телефон…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-companies-search"
        />
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2">Компанія</th>
              <th className="text-left px-3 py-2">Місто</th>
              <th className="text-left px-3 py-2">Контактні особи</th>
              <th className="text-right px-3 py-2">Угод</th>
              <th className="text-left px-3 py-2">Відповідальний</th>
              <th className="text-left px-3 py-2">Оновлено</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Завантаження…</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8">
                <Building2 className="w-6 h-6 mx-auto mb-1 opacity-50" />
                Компаній не знайдено
              </td></tr>
            )}
            {filtered.map((c) => {
              const people = contactsByCompany.get(c.id) ?? [];
              const companyLeads = leadsByCompany.get(c.id) ?? [];
              const main = people[0]?.fullName ?? companyLeads[0]?.contactName;
              return (
                <tr key={c.id} className="border-t border-border hover-elevate" data-testid={`row-company-${c.id}`}>
                  <td className="px-3 py-2">
                    <Link href={`/companies/${c.id}`} className="font-medium hover:underline" data-testid={`link-company-${c.id}`}>{c.name}</Link>
                    {c.edrpou && <div className="text-xs text-muted-foreground">ЄДРПОУ {c.edrpou}</div>}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{c.city ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {main ?? "—"}
                    {people.length > 1 && <span className="text-xs"> і ще {people.length - 1}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{companyLeads.length}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.responsibleId ? userMap.get(c.responsibleId)?.fullName ?? "—" : "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{formatDateTime(c.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Dialog open={syncOpen} onOpenChange={setSyncOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Перенести контакти в компанії</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>Основний контакт кожної угоди стане контактною особою його компанії. Буде додано: <b>{contactSync?.contactsToCreate ?? 0}</b>.</p>
            <p className="text-muted-foreground">Людей, які вже є в компанії (той самий ПІБ, телефон або email), не дублюємо. Самі угоди, дати й історія не змінюються.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSyncOpen(false)}>Скасувати</Button>
            <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} data-testid="button-apply-sync-contacts">
              {syncMutation.isPending ? "Виконується…" : "Перенести"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!report} onOpenChange={(v) => { if (!v) setReport(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{report?.applied ? "Готово" : "Створити компанії з наявних угод"}</DialogTitle>
          </DialogHeader>
          {report && (
            <div className="space-y-3 text-sm">
              <div>
                {report.applied ? "Зроблено" : "Буде зроблено"}: нових компаній {report.companiesToCreate}
                {report.existingCompaniesUsed > 0 && `, наявних використано ${report.existingCompaniesUsed}`};
                прив'язано угод {report.leadsToLink}, контактів {report.contactsToLink}.
                Угод без назви компанії: {report.leadsWithoutCompany} (лишаються як є).
              </div>
              <div className="text-muted-foreground">
                Однакові назви (без різниці у великих літерах, пробілах і лапках) стають однією компанією.
                Назви угод, дати й історія не змінюються.
              </div>
              {report.possibleDuplicates.length > 0 && (
                <div>
                  <div className="font-medium mb-1">Схожі назви, які варто перевірити ({report.possibleDuplicates.length}).
                    Вони не об'єднуються автоматично; об'єднати можна в картці компанії.</div>
                  <div className="max-h-60 overflow-auto border rounded p-2 text-xs space-y-1">
                    {report.possibleDuplicates.map((d, i) => <div key={i}>• {d.names.join("  |  ")}</div>)}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReport(null)}>{report?.applied ? "Закрити" : "Скасувати"}</Button>
            {report && !report.applied && (
              <Button onClick={() => linkMutation.mutate(true)} disabled={linkMutation.isPending} data-testid="button-apply-link-companies">
                {linkMutation.isPending ? "Виконується…" : "Створити і прив'язати"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
