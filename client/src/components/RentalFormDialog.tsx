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
import { rentalStatusLabels } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/currentUser";
import type { Equipment, Lead, Rental } from "@shared/schema";

export default function RentalFormDialog({
  trigger, leadId, rental,
}: { trigger: React.ReactNode; leadId?: number; rental?: Rental }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { currentUserId } = useCurrentUser();
  const { data: equipment = [] } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });

  const [form, setForm] = useState({
    leadId: rental?.leadId?.toString() ?? leadId?.toString() ?? "",
    equipmentId: rental?.equipmentId?.toString() ?? "",
    startDate: rental?.startDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    endDate: rental?.endDate?.slice(0, 10) ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    pricePerDay: rental?.pricePerDay?.toString() ?? "",
    deposit: rental?.deposit?.toString() ?? "0",
    status: rental?.status ?? "reserved",
    returnCondition: rental?.returnCondition ?? "",
    notes: rental?.notes ?? "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        leadId: Number(form.leadId),
        equipmentId: Number(form.equipmentId),
        startDate: form.startDate,
        endDate: form.endDate,
        pricePerDay: Number(form.pricePerDay),
        deposit: Number(form.deposit) || 0,
        status: form.status,
        returnCondition: form.returnCondition || null,
        notes: form.notes || null,
        updatedById: currentUserId ?? undefined,
      };
      const res = rental
        ? await apiRequest("PATCH", `/api/rentals/${rental.id}`, payload)
        : await apiRequest("POST", "/api/rentals", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rentals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leads"] });
      if (leadId) queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "full"] });
      toast({ title: rental ? "Оренду оновлено" : "Оренду створено" });
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{rental ? "Редагувати оренду" : "Нова оренда"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {!leadId && (
            <div className="col-span-2">
              <Label>Клієнт</Label>
              <Select value={form.leadId} onValueChange={(v) => setForm({ ...form, leadId: v })}>
                <SelectTrigger data-testid="select-rental-lead"><SelectValue placeholder="Оберіть клієнта" /></SelectTrigger>
                <SelectContent>{leads.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.title} — {l.company ?? l.contactName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2">
            <Label>Обладнання</Label>
            <Select
              value={form.equipmentId}
              onValueChange={(v) => {
                const eq = equipment.find((e) => e.id === Number(v));
                setForm({ ...form, equipmentId: v, pricePerDay: form.pricePerDay || (eq?.rentalDayPrice ? String(eq.rentalDayPrice) : "") });
              }}
            >
              <SelectTrigger data-testid="select-rental-equipment"><SelectValue placeholder="Оберіть обладнання" /></SelectTrigger>
              <SelectContent>{equipment.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name} — {e.model}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Початок</Label>
            <Input data-testid="input-rental-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <Label>Кінець</Label>
            <Input data-testid="input-rental-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div>
            <Label>Ціна за добу, грн</Label>
            <Input data-testid="input-rental-price" type="number" value={form.pricePerDay} onChange={(e) => setForm({ ...form, pricePerDay: e.target.value })} />
          </div>
          <div>
            <Label>Застава, грн</Label>
            <Input data-testid="input-rental-deposit" type="number" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} />
          </div>
          <div>
            <Label>Статус</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger data-testid="select-rental-status"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(rentalStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Стан повернення</Label>
            <Input data-testid="input-rental-condition" value={form.returnCondition} onChange={(e) => setForm({ ...form, returnCondition: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Нотатки</Label>
            <Textarea data-testid="input-rental-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Скасувати</Button>
          <Button
            data-testid="button-save-rental"
            disabled={!form.leadId || !form.equipmentId || !form.pricePerDay || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Збереження…" : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
