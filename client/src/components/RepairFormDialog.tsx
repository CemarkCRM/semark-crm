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
import { repairStatusLabels } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/currentUser";
import type { Equipment, Lead, Repair, User } from "@shared/schema";

export default function RepairFormDialog({
  trigger, leadId, repair,
}: { trigger: React.ReactNode; leadId?: number; repair?: Repair }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { currentUserId } = useCurrentUser();
  const { data: equipment = [] } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });

  const engineers = users.filter((u) => u.role === "engineer" || u.role === "admin");

  const [form, setForm] = useState({
    leadId: repair?.leadId?.toString() ?? leadId?.toString() ?? "",
    equipmentId: repair?.equipmentId?.toString() ?? "",
    reason: repair?.reason ?? "",
    diagnosis: repair?.diagnosis ?? "",
    partsReplaced: repair?.partsReplaced ?? "",
    cost: repair?.cost?.toString() ?? "0",
    status: repair?.status ?? "received",
    receivedAt: repair?.receivedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    returnedAt: repair?.returnedAt?.slice(0, 10) ?? "",
    engineerId: repair?.engineerId?.toString() ?? "",
    notes: repair?.notes ?? "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        leadId: Number(form.leadId),
        equipmentId: Number(form.equipmentId),
        reason: form.reason,
        diagnosis: form.diagnosis || null,
        partsReplaced: form.partsReplaced || null,
        cost: Number(form.cost) || 0,
        status: form.status,
        receivedAt: form.receivedAt,
        returnedAt: form.returnedAt || null,
        engineerId: form.engineerId ? Number(form.engineerId) : null,
        notes: form.notes || null,
        updatedById: currentUserId ?? undefined,
      };
      const res = repair
        ? await apiRequest("PATCH", `/api/repairs/${repair.id}`, payload)
        : await apiRequest("POST", "/api/repairs", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/repairs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      if (leadId) queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "full"] });
      toast({ title: repair ? "Сервіс оновлено" : "Сервіс створено" });
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{repair ? "Редагувати сервіс" : "Новий сервісний кейс"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {!leadId && (
            <div className="col-span-2">
              <Label>Клієнт</Label>
              <Select value={form.leadId} onValueChange={(v) => setForm({ ...form, leadId: v })}>
                <SelectTrigger data-testid="select-repair-lead"><SelectValue placeholder="Оберіть клієнта" /></SelectTrigger>
                <SelectContent>{leads.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.title} — {l.company ?? l.contactName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2">
            <Label>Обладнання</Label>
            <Select value={form.equipmentId} onValueChange={(v) => setForm({ ...form, equipmentId: v })}>
              <SelectTrigger data-testid="select-repair-equipment"><SelectValue placeholder="Оберіть обладнання" /></SelectTrigger>
              <SelectContent>{equipment.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name} — {e.model}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Причина звернення</Label>
            <Input data-testid="input-repair-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Діагноз</Label>
            <Textarea data-testid="input-repair-diagnosis" rows={2} value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Що замінено</Label>
            <Textarea data-testid="input-repair-parts" rows={2} value={form.partsReplaced} onChange={(e) => setForm({ ...form, partsReplaced: e.target.value })} />
          </div>
          <div>
            <Label>Вартість ремонту, грн</Label>
            <Input data-testid="input-repair-cost" type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </div>
          <div>
            <Label>Статус</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger data-testid="select-repair-status"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(repairStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Дата прийому</Label>
            <Input data-testid="input-repair-received" type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} />
          </div>
          <div>
            <Label>Дата видачі</Label>
            <Input data-testid="input-repair-returned" type="date" value={form.returnedAt} onChange={(e) => setForm({ ...form, returnedAt: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Інженер</Label>
            <Select value={form.engineerId} onValueChange={(v) => setForm({ ...form, engineerId: v })}>
              <SelectTrigger data-testid="select-repair-engineer"><SelectValue placeholder="Оберіть інженера" /></SelectTrigger>
              <SelectContent>{engineers.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Нотатки</Label>
            <Textarea data-testid="input-repair-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Скасувати</Button>
          <Button
            data-testid="button-save-repair"
            disabled={!form.leadId || !form.equipmentId || !form.reason || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Збереження…" : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
