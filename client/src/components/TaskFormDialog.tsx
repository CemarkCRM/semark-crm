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
import { taskStatusLabels, priorityLabels, roleLabels } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/currentUser";
import type { Contact, Lead, Task, User } from "@shared/schema";

export default function TaskFormDialog({
  trigger, leadId, task,
}: { trigger: React.ReactNode; leadId?: number; task?: Task }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { currentUserId } = useCurrentUser();
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: contacts = [] } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });

  const [form, setForm] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "open",
    priority: task?.priority ?? "medium",
    dueDate: task?.dueDate?.slice(0, 10) ?? "",
    assigneeId: task?.assigneeId?.toString() ?? "",
    leadId: task?.leadId?.toString() ?? leadId?.toString() ?? "",
    contactId: task?.contactId?.toString() ?? "0",
  });

  const selectedLead = leads.find((l) => l.id === Number(form.leadId));
  const companyContacts = selectedLead?.company
    ? contacts.filter((c) => c.company === selectedLead.company)
    : [];

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        description: form.description || null,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate || null,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
        leadId: form.leadId && form.leadId !== "0" ? Number(form.leadId) : null,
        contactId: form.contactId && form.contactId !== "0" ? Number(form.contactId) : null,
        updatedById: currentUserId ?? undefined,
      };
      const res = task
        ? await apiRequest("PATCH", `/api/tasks/${task.id}`, payload)
        : await apiRequest("POST", "/api/tasks", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      if (leadId) queryClient.invalidateQueries({ queryKey: ["/api/leads", leadId, "full"] });
      toast({ title: task ? "Задачу оновлено" : "Задачу створено" });
      setOpen(false);
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{task ? "Редагувати задачу" : "Нова задача"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Назва задачі</Label>
            <Input data-testid="input-task-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Опис</Label>
            <Textarea data-testid="input-task-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>Статус</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger data-testid="select-task-status"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(taskStatusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Пріоритет</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger data-testid="select-task-priority"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(priorityLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Дедлайн</Label>
            <Input data-testid="input-task-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </div>
          <div>
            <Label>Виконавець</Label>
            <Select value={form.assigneeId} onValueChange={(v) => setForm({ ...form, assigneeId: v })}>
              <SelectTrigger data-testid="select-task-assignee"><SelectValue placeholder="Оберіть виконавця" /></SelectTrigger>
              <SelectContent>{users.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.fullName} — {roleLabels[u.role] ?? u.role}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!leadId && (
            <div className="col-span-2">
              <Label>Пов'язаний клієнт (необов'язково)</Label>
              <Select value={form.leadId} onValueChange={(v) => setForm({ ...form, leadId: v })}>
                <SelectTrigger data-testid="select-task-lead"><SelectValue placeholder="Без клієнта" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Без клієнта</SelectItem>
                  {leads.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.title} — {l.company ?? l.contactName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {companyContacts.length > 0 && (
            <div className="col-span-2">
              <Label>Контакт у компанії</Label>
              <Select value={form.contactId} onValueChange={(v) => setForm({ ...form, contactId: v })}>
                <SelectTrigger data-testid="select-task-contact"><SelectValue placeholder="Без конкретного контакту" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Без конкретного контакту</SelectItem>
                  {companyContacts.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.fullName}{c.phone ? ` · ${c.phone}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Скасувати</Button>
          <Button
            data-testid="button-save-task"
            disabled={!form.title || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Збереження…" : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
