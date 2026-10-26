import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useCurrentUser, type LoginResult } from "@/lib/currentUser";

export default function Login() {
  const { login } = useCurrentUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/login", { email: email.trim(), password });
      return (await res.json()) as LoginResult;
    },
    onSuccess: (result) => login(result),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold">S</div>
          <div className="leading-tight">
            <div className="text-base font-semibold">Semark CRM</div>
            <div className="text-[11px] text-muted-foreground">ТОВ Семарк</div>
          </div>
        </div>
        <h1 className="text-lg font-semibold mb-1">Вхід до системи</h1>
        <p className="text-xs text-muted-foreground mb-4">Введіть email та пароль</p>
        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="space-y-3"
        >
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-login-email"
              placeholder="you@semark.ua"
            />
          </div>
          <div>
            <Label>Пароль</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-login-password"
              placeholder="••••••"
            />
          </div>
          {mutation.isError && (
            <div className="text-xs text-rose-600 dark:text-rose-400" data-testid="text-login-error">
              {(mutation.error as Error)?.message?.includes("401")
                ? "Невірний email або пароль"
                : "Помилка входу"}
            </div>
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={!email.trim() || !password || mutation.isPending}
            data-testid="button-login"
          >
            {mutation.isPending ? "Вхід…" : "Увійти"}
          </Button>
        </form>
        <div className="mt-5 rounded-md bg-muted/50 p-3 text-[11px] text-muted-foreground leading-relaxed" data-testid="text-login-hint">
          <div className="text-muted-foreground/80">Сесія діє до 10 годин і зберігається лише в пам'яті — після оновлення сторінки потрібен повторний вхід.</div>
        </div>
      </Card>
    </div>
  );
}
