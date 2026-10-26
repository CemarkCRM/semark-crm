import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/lib/currentUser";
import type { Contact } from "@shared/schema";

export default function ContactFormDialog({
  trigger,
  company,
  contact,
  leadId,
}: {
  trigger: React.ReactNode;
  company: string;
  contact?: Contact;
  leadId?: number;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { currentUserId } = useCurrentUser();
  const [form, setForm] = useState({
    fullName: contact?.fullName ?? "",
    phone: contact?.phone ?? "",
    email: contact?.email ?? "",
    position: contact?.position ?? "",
    notes: contact?.notes ?? "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        company,
        fullName: form.fullName,
        phone: form.phone || null,
        email: form.email || null,
        position: form.position || null,
        notes: form.notes || null,
        updatedById: currentUserId ?? undefined,
      };
      const res = contact
        ? await apiRequest("PATCH", `/api/contacts/${contact.id}`, payload)
        : await apiRequest("POST", "/api/contacts", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      if (leadId) queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "full"] });
      toast({ title: contact ? "Контакт оновлено" : "Контакт додано до компанії" });
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{contact ? "Редагувати контакт" : "Додати контакт до компанії"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Компанія</Label>
            <Input value={company} disabled data-testid="input-contact-company" />
          </div>
          <div>
            <Label>ПІБ контакту</Label>
            <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} data-testid="input-contact-full-name" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Телефон</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-contact-phone" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-contact-email" />
            </div>
          </div>
          <div>
            <Label>Посада / роль</Label>
            <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} data-testid="input-contact-position" />
          </div>
          <div>
            <Label>Нотатки</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-contact-notes" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-contact">Скасувати</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.fullName.trim() || mutation.isPending} data-testid="button-save-contact">
            {mutation.isPending ? "Збереження…" : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
