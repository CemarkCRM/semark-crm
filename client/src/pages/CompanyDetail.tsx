import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import CompanyFormDialog from "@/components/CompanyFormDialog";
import ContactFormDialog from "@/components/ContactFormDialog";
import LeadFormDialog from "@/components/LeadFormDialog";
import {
  stageLabels, stageBadgeClass, repairStatusLabels, repairStatusBadge, rentalStatusLabels, rentalStatusBadge,
  formatUAH, formatDate, formatDateTime,
} from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/currentUser";
import { ArrowLeft, Pencil, Trash2, UserPlus, Plus, Merge, Phone, Mail, Globe, MapPin } from "lucide-react";
import type { Company, Contact, Lead, Sale, Repair, Rental, User, Equipment } from "@shared/schema";

type FullCompany = { company: Company; contacts: Contact[]; leads: Lead[]; sales: Sale[]; repairs: Repair[]; rentals: Rental[] };

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const companyId = Number(id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { canManageUsers } = useCurrentUser();
  const { data, isLoading } = useQuery<FullCompany>({ queryKey: ["/api/companies", companyId, "full"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: equipment = [] } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"] });
  const { data: allCompanies = [] } = useQuery<Company[]>({ queryKey: ["/api/companies"] });
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const eqMap = useMemo(() => new Map(equipment.map((e) => [e.id, e])), [equipment]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
    queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
    queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
  };

  const deleteCompany = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/companies/${companyId}`); },
    onSuccess: () => { refresh(); toast({ title: "Компанію видалено" }); setLocation("/companies"); },
    onError: (e: any) => toast({ variant: "destructive", title: "Не вдалося видалити", description: e?.message }),
  });
  const merge = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/companies/${companyId}/merge`, { targetId: Number(mergeTarget) })).json(),
    onSuccess: (target: Company) => {
      refresh();
      toast({ title: `Компанію об'єднано з «${target.name}»` });
      setMergeOpen(false);
      setLocation(`/companies/${target.id}`);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });

  if (isLoading) return <div className="text-muted-foreground">Завантаження…</div>;
  if (!data?.company) return <div className="text-muted-foreground">Компанію не знайдено</div>;
  const { company, contacts, leads, sales, repairs, rentals } = data;
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const responsible = company.responsibleId ? userMap.get(company.responsibleId) : undefined;
  const isEmpty = leads.length === 0 && contacts.length === 0;

  const leadLink = (leadId: number) => {
    const l = leadMap.get(leadId);
    return <Link href={`/leads/${leadId}`} className="hover:underline">{l?.title ?? `#${leadId}`}</Link>;
  };

  return (
    <div>
      <div className="mb-3">
        <Link href="/companies" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1" data-testid="link-back-companies">
          <ArrowLeft className="w-3 h-3" /> До списку компаній
        </Link>
      </div>

      <PageHeader
        title={company.name}
        subtitle={`Компанія #${company.id} · створено ${formatDate(company.createdAt)} · оновлено ${formatDateTime(company.updatedAt)}`}
        actions={
          <>
            <CompanyFormDialog company={company} trigger={<Button variant="outline" data-testid="button-edit-company"><Pencil className="w-4 h-4 mr-2" />Редагувати</Button>} />
            {canManageUsers && (
              <Button variant="outline" onClick={() => { setMergeTarget(""); setMergeOpen(true); }} data-testid="button-merge-company">
                <Merge className="w-4 h-4 mr-2" />Об'єднати
              </Button>
            )}
            {isEmpty && (
              <Button variant="outline" onClick={() => { if (confirm("Видалити компанію?")) deleteCompany.mutate(); }} data-testid="button-delete-company">
                <Trash2 className="w-4 h-4 mr-2" />Видалити
              </Button>
            )}
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Реквізити</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">ЄДРПОУ / ІПН</span><span>{company.edrpou || "—"}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Галузь</span><span>{company.industry || "—"}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Відповідальний</span><span>{responsible?.fullName ?? "—"}</span></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Зв'язок</div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" />{[company.city, company.address].filter(Boolean).join(", ") || "—"}</div>
            {company.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><a href={`tel:${company.phone}`} className="hover:underline">{company.phone}</a></div>}
            {company.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><a href={`mailto:${company.email}`} className="hover:underline">{company.email}</a></div>}
            {company.website && <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-muted-foreground" /><a href={/^https?:\/\//.test(company.website) ? company.website : `https://${company.website}`} target="_blank" rel="noreferrer" className="hover:underline">{company.website}</a></div>}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Примітки</div>
          <p className="text-sm whitespace-pre-wrap">{company.notes || "—"}</p>
        </Card>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="font-semibold text-sm">Контактні особи ({contacts.length})</div>
          <ContactFormDialog
            company={company.name}
            companyId={company.id}
            trigger={<Button size="sm" data-testid="button-add-company-contact"><UserPlus className="w-4 h-4 mr-1" />Додати контакт</Button>}
          />
        </div>
        {contacts.length === 0 && <div className="text-sm text-muted-foreground">Окремих контактів ще немає. Основні контакти клієнтів показані нижче, у списку клієнтів.</div>}
        <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-3">
          {contacts.map((c) => (
            <Card key={c.id} className="p-3" data-testid={`card-contact-${c.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{c.fullName}</div>
                  {c.position && <div className="text-xs text-muted-foreground">{c.position}</div>}
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <div>{c.phone || "телефон не вказано"}</div>
                    <div>{c.email || "email не вказано"}</div>
                  </div>
                  {c.notes && <div className="text-xs mt-2">{c.notes}</div>}
                </div>
                <ContactFormDialog
                  company={company.name}
                  companyId={company.id}
                  contact={c}
                  trigger={<Button variant="ghost" size="sm"><Pencil className="w-3 h-3" /></Button>}
                />
              </div>
            </Card>
          ))}
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="font-semibold text-sm">Клієнти / угоди ({leads.length})</div>
          <LeadFormDialog
            defaultCompany={company.name}
            trigger={<Button size="sm" data-testid="button-company-new-lead"><Plus className="w-4 h-4 mr-1" />Новий клієнт</Button>}
          />
        </div>
        {leads.length === 0 ? <div className="text-sm text-muted-foreground">Клієнтів ще немає</div> : (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left py-1">Клієнт</th>
                <th className="text-left py-1">Основний контакт</th>
                <th className="text-left py-1">Стадія</th>
                <th className="text-right py-1">Бюджет</th>
                <th className="text-left py-1 pl-3">Додано</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-t border-border" data-testid={`row-company-lead-${l.id}`}>
                  <td className="py-1.5"><Link href={`/leads/${l.id}`} className="font-medium hover:underline">{l.title}</Link></td>
                  <td className="py-1.5 text-muted-foreground">{[l.contactName, l.contactPhone].filter(Boolean).join(", ")}</td>
                  <td className="py-1.5"><span className={`text-[11px] px-2 py-0.5 rounded-full ${stageBadgeClass(l.stage)}`}>{stageLabels[l.stage] ?? l.stage}</span></td>
                  <td className="py-1.5 text-right tabular-nums">{formatUAH(l.budget)}</td>
                  <td className="py-1.5 pl-3 text-xs text-muted-foreground">{formatDate(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {(sales.length > 0 || repairs.length > 0 || rentals.length > 0) && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="font-semibold text-sm mb-2">Продажі ({sales.length})</div>
            {sales.map((s) => (
              <div key={s.id} className="text-xs py-1 border-t border-border">
                {formatDate(s.soldAt)} · {eqMap.get(s.equipmentId)?.name ?? "обладнання"} · {formatUAH(s.price)} · {leadLink(s.leadId)}
              </div>
            ))}
          </Card>
          <Card className="p-4">
            <div className="font-semibold text-sm mb-2">Сервіс ({repairs.length})</div>
            {repairs.map((r) => (
              <div key={r.id} className="text-xs py-1 border-t border-border">
                {formatDate(r.receivedAt)} · {eqMap.get(r.equipmentId)?.name ?? "обладнання"} ·{" "}
                <span className={`px-1.5 rounded-full ${repairStatusBadge(r.status)}`}>{repairStatusLabels[r.status] ?? r.status}</span> · {leadLink(r.leadId)}
              </div>
            ))}
          </Card>
          <Card className="p-4">
            <div className="font-semibold text-sm mb-2">Оренда ({rentals.length})</div>
            {rentals.map((r) => (
              <div key={r.id} className="text-xs py-1 border-t border-border">
                {formatDate(r.startDate)}–{formatDate(r.endDate)} · {eqMap.get(r.equipmentId)?.name ?? "обладнання"} ·{" "}
                <span className={`px-1.5 rounded-full ${rentalStatusBadge(r.status)}`}>{rentalStatusLabels[r.status] ?? r.status}</span> · {leadLink(r.leadId)}
              </div>
            ))}
          </Card>
        </div>
      )}

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Об'єднати компанію</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Усі клієнти й контакти компанії «{company.name}» перейдуть до вибраної компанії, а ця картка зникне. Порожні поля вибраної компанії заповняться з цієї.</p>
            <div>
              <Label>Об'єднати з</Label>
              <Select value={mergeTarget} onValueChange={setMergeTarget}>
                <SelectTrigger data-testid="select-merge-target"><SelectValue placeholder="Оберіть компанію" /></SelectTrigger>
                <SelectContent>
                  {allCompanies.filter((c) => c.id !== company.id).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>Скасувати</Button>
            <Button onClick={() => merge.mutate()} disabled={!mergeTarget || merge.isPending} data-testid="button-confirm-merge">Об'єднати</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
