import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldAlert, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { roleLabels } from "@/lib/i18n";
import { IMPORT_EXPORT_ALLOWED_NAMES, useCurrentUser } from "@/lib/currentUser";
import type { User } from "@shared/schema";

const roleOrder = ["director", "executive_director", "engineer", "accountant", "sales", "admin"];

function PasswordResetForm({ userId }: { userId: number }) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");

  const reset = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/users/${userId}`, { password });
      return res.json();
    },
    onSuccess: () => {
      setPassword("");
      toast({ title: "Пароль оновлено" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });

  return (
    <div className="flex items-center gap-2">
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Новий пароль"
        className="h-8 w-36"
        data-testid={`input-reset-password-${userId}`}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={password.length < 4 || reset.isPending}
        onClick={() => reset.mutate()}
        data-testid={`button-reset-password-${userId}`}
      >
        <KeyRound className="w-3.5 h-3.5 mr-1" />
        {reset.isPending ? "…" : "Скинути"}
      </Button>
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { currentUser, canImportExport, canManageUsers } = useCurrentUser();
  const [form, setForm] = useState({ fullName: "", role: "sales", email: "", phone: "", password: "" });

  const createUser = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/users", {
        fullName: form.fullName,
        role: form.role,
        email: form.email,
        phone: form.phone || null,
        password: form.password || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setForm({ fullName: "", role: "sales", email: "", phone: "", password: "" });
      toast({ title: "Користувача створено" });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Помилка", description: e?.message }),
  });

  if (!canManageUsers) {
    return (
      <div>
        <PageHeader title="Налаштування CRM" subtitle="Користувачі, ролі та доступ" />
        <Card className="p-6 flex items-start gap-3 max-w-xl" data-testid="card-access-denied">
          <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
          <div>
            <h2 className="font-semibold text-sm">Доступ заборонено</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Розділ налаштувань доступний лише директору, виконавчому директору та адміністратору.
              Ваша роль: {currentUser ? (roleLabels[currentUser.role] ?? currentUser.role) : "—"}.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Налаштування CRM"
        subtitle="Користувачі, ролі та доступ до імпорту/експорту"
      />

      <div className="grid lg:grid-cols-[1fr_420px] gap-4">
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-sm">Користувачі CRM</h2>
            <p className="text-xs text-muted-foreground mt-1">Поточний користувач: {currentUser?.fullName ?? "не обрано"}</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">ПІБ</th>
                <th className="text-left px-3 py-2">Роль</th>
                <th className="text-left px-3 py-2">Email</th>
                <th className="text-left px-3 py-2">Телефон</th>
                <th className="text-left px-3 py-2">Права</th>
                <th className="text-left px-3 py-2">Пароль</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border" data-testid={`row-user-${u.id}`}>
                  <td className="px-3 py-2 font-medium">{u.fullName}</td>
                  <td className="px-3 py-2">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-foreground">
                      {roleLabels[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                  <td className="px-3 py-2 text-muted-foreground">{u.phone ?? "—"}</td>
                  <td className="px-3 py-2">
                    {IMPORT_EXPORT_ALLOWED_NAMES.includes(u.fullName) ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Імпорт/експорт дозволено</span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">Без імпорту/експорту</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <PasswordResetForm userId={u.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-3">Створити користувача</h2>
            <div className="space-y-3">
              <div>
                <Label>ПІБ</Label>
                <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} data-testid="input-new-user-name" />
              </div>
              <div>
                <Label>Роль</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger data-testid="select-new-user-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {roleOrder.map((r) => <SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-new-user-email" />
              </div>
              <div>
                <Label>Телефон</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-new-user-phone" />
              </div>
              <div>
                <Label>Пароль</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="input-new-user-password" placeholder="Мінімум 4 символи" />
              </div>
              <Button
                className="w-full"
                disabled={!form.fullName.trim() || !form.email.trim() || form.password.length < 4 || createUser.isPending}
                onClick={() => createUser.mutate()}
                data-testid="button-create-user"
              >
                {createUser.isPending ? "Створення…" : "Створити користувача"}
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold text-sm mb-2">Обмеження імпорту та експорту</h2>
            <p className="text-sm text-muted-foreground">
              Завантажувати та вигружати клієнтів і пов’язані дані можуть тільки: Цілюрик Юрій Вікторович та Безугла Людмила Анатоліївна.
            </p>
            <div className="mt-3 text-xs">
              Ваш поточний доступ: {canImportExport ? (
                <span className="text-emerald-700 dark:text-emerald-300 font-medium">дозволено</span>
              ) : (
                <span className="text-rose-700 dark:text-rose-300 font-medium">заборонено</span>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
