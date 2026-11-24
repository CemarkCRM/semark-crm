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
import type { Company, User } from "@shared/schema";

const FIELDS: { key: "edrpou" | "city" | "address" | "website" | "industry" | "phone" | "email"; label: string }[] = [
  { key: "edrpou", label: "ЄДРПОУ / ІПН" },
  { key: "city", label: "Місто" },
  { key: "address", label: "Адреса" },
  { key: "website", label: "Сайт" },
  { key: "industry", label: "Галузь" },
  { key: "phone", label: "Телефон компанії" },
  { key: "email", label: "Email компанії" },
];

export default function CompanyFormDialog({
  trigger, company, onSaved,
}: { trigger: React.ReactNode; company?: Company; onSaved?: (c: Company) => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const initial = () => ({
    name: company?.name ?? "",
    edrpou: company?.edrpou ?? "",
    city: company?.city ?? "",
    address: company?.address ?? "",
    website: company?.website ?? "",
    industry: company?.industry ?? "",
    phone: company?.phone ?? "",
    email: company?.email ?? "",
    responsibleId: company?.responsibleId?.toString() ?? "",
    notes: company?.notes ?? "",
  });
  const [form, setForm] = useState(initial);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { name: form.name.trim() };
      for (const f of FIELDS) payload[f.key] = form[f.key].trim() || null;
      payload.notes = form.notes.trim() || null;
      payload.responsibleId = form.responsibleId ? Number(form.responsibleId) : null;
      const res = company
        ? await apiRequest("PATCH", `/api/companies/${company.id}`, payload)
        : await apiRequest("POST", "/api/companies", payload);
      return res.json();
    },
    onSuccess: (saved: Company) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: company ? "Компанію оновлено" : "Компанію створено" });
      setOpen(false);
      onSaved?.(saved);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setForm(initial()); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{company ? "Редагувати компанію" : "Нова компанія"}</DialogTitle>
        </DialogHeader>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label>Назва компанії</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-company-name" />
          </div>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Input value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} data-testid={`input-company-${f.key}`} />
            </div>
          ))}
          <div>
            <Label>Відповідальний</Label>
            <Select value={form.responsibleId || "none"} onValueChange={(v) => setForm({ ...form, responsibleId: v === "none" ? "" : v })}>
              <SelectTrigger data-testid="select-company-responsible"><SelectValue placeholder="Не призначено" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не призначено</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Примітки</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-company-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Скасувати</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.name.trim() || mutation.isPending} data-testid="button-save-company">
            {mutation.isPending ? "Збереження…" : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
