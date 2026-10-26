import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { stageLabels, stageOrder, sourceLabels, roleLabels } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/currentUser";
import type { Lead, User } from "@shared/schema";

export default function LeadFormDialog({
  trigger, lead, onSaved,
}: { trigger: React.ReactNode; lead?: Lead; onSaved?: (lead: Lead) => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { currentUserId } = useCurrentUser();
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const [form, setForm] = useState({
    title: lead?.title ?? "",
    stage: lead?.stage ?? "new",
    source: lead?.source ?? "website",
    company: lead?.company ?? "",
    contactName: lead?.contactName ?? "",
    contactPhone: lead?.contactPhone ?? "",
    contactEmail: lead?.contactEmail ?? "",
    city: lead?.city ?? "",
    budget: lead?.budget?.toString() ?? "",
    responsibleId: lead?.responsibleId?.toString() ?? "",
    notes: lead?.notes ?? "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        budget: form.budget ? Number(form.budget) : null,
        responsibleId: form.responsibleId ? Number(form.responsibleId) : null,
        updatedById: currentUserId ?? undefined,
      };
      const res = lead
        ? await apiRequest("PATCH", `/api/leads/${lead.id}`, payload)
        : await apiRequest("POST", `/api/leads`, payload);
      return res.json();
    },
    onSuccess: (saved: Lead) => {
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads", saved.id, "full"] });
      toast({ title: lead ? "Клієнта оновлено" : "Клієнта створено" });
      setOpen(false);
      onSaved?.(saved);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lead ? "Редагувати клієнта" : "Новий клієнт"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Назва клієнта / запиту</Label>
            <Input data-testid="input-lead-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label>Стадія</Label>
            <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
              <SelectTrigger data-testid="select-lead-stage"><SelectValue /></SelectTrigger>
              <SelectContent>
                {stageOrder.map((s) => <SelectItem key={s} value={s}>{stageLabels[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Джерело</Label>
            <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
              <SelectTrigger data-testid="select-lead-source"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(sourceLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Компанія</Label>
            <Input data-testid="input-lead-company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div>
            <Label>Місто</Label>
            <Input data-testid="input-lead-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <Label>Контактна особа</Label>
            <Input data-testid="input-lead-contact-name" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </div>
          <div>
            <Label>Телефон</Label>
            <Input data-testid="input-lead-phone" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input data-testid="input-lead-email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          </div>
          <div>
            <Label>Бюджет, грн</Label>
            <Input data-testid="input-lead-budget" type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Відповідальний</Label>
            <Select value={form.responsibleId} onValueChange={(v) => setForm({ ...form, responsibleId: v })}>
              <SelectTrigger data-testid="select-lead-responsible"><SelectValue placeholder="Оберіть відповідального" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.fullName} — {roleLabels[u.role] ?? u.role}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Нотатки</Label>
            <Textarea data-testid="input-lead-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-lead">Скасувати</Button>
          <Button
            disabled={!form.title || !form.contactName || mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="button-save-lead"
          >
            {mutation.isPending ? "Збереження…" : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
