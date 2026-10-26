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
import { useCurrentUser } from "@/lib/currentUser";
import type { Equipment, Lead, Sale } from "@shared/schema";

export default function SaleFormDialog({
  trigger, leadId, sale,
}: { trigger: React.ReactNode; leadId?: number; sale?: Sale }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { currentUserId } = useCurrentUser();
  const { data: equipment = [] } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });

  const [form, setForm] = useState({
    leadId: sale?.leadId?.toString() ?? leadId?.toString() ?? "",
    equipmentId: sale?.equipmentId?.toString() ?? "",
    price: sale?.price?.toString() ?? "",
    soldAt: sale?.soldAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    notes: sale?.notes ?? "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        leadId: Number(form.leadId),
        equipmentId: Number(form.equipmentId),
        price: Number(form.price),
        soldAt: form.soldAt,
        notes: form.notes || null,
        updatedById: currentUserId ?? undefined,
      };
      const res = sale
        ? await apiRequest("PATCH", `/api/sales/${sale.id}`, payload)
        : await apiRequest("POST", "/api/sales", payload);
      return res.json();
    },
    onSuccess: (saved: Sale) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads", saved.leadId, "full"] });
      if (leadId && leadId !== saved.leadId) queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "full"] });
      toast({ title: sale ? "Продаж оновлено" : "Продаж збережено" });
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sale ? "Редагувати продаж" : "Новий продаж"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {!leadId && (
            <div className="col-span-2">
              <Label>Клієнт</Label>
              <Select value={form.leadId} onValueChange={(v) => setForm({ ...form, leadId: v })}>
                <SelectTrigger data-testid="select-sale-lead"><SelectValue placeholder="Оберіть клієнта" /></SelectTrigger>
                <SelectContent>
                  {leads.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.title} — {l.company ?? l.contactName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2">
            <Label>Обладнання</Label>
            <Select
              value={form.equipmentId}
              onValueChange={(v) => {
                const eq = equipment.find((e) => e.id === Number(v));
                setForm({ ...form, equipmentId: v, price: form.price || (eq ? String(eq.price) : "") });
              }}
            >
              <SelectTrigger data-testid="select-sale-equipment"><SelectValue placeholder="Оберіть обладнання" /></SelectTrigger>
              <SelectContent>
                {equipment.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name} — {e.model}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ціна, грн</Label>
            <Input data-testid="input-sale-price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </div>
          <div>
            <Label>Дата продажу</Label>
            <Input data-testid="input-sale-date" type="date" value={form.soldAt} onChange={(e) => setForm({ ...form, soldAt: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Нотатки</Label>
            <Textarea data-testid="input-sale-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Скасувати</Button>
          <Button
            data-testid="button-save-sale"
            disabled={!form.leadId || !form.equipmentId || !form.price || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Збереження…" : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
