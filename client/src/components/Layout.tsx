import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, ListChecks, Wrench, CalendarRange, Boxes,
  Search, Moon, Sun, Building2, Settings, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/lib/currentUser";
import { roleLabels } from "@/lib/i18n";
import type { Lead, Task, Equipment } from "@shared/schema";

type NavItem = { href: string; label: string; icon: React.ComponentType<any>; testId: string };

const nav: NavItem[] = [
  { href: "/",          label: "Дашборд",     icon: LayoutDashboard, testId: "link-nav-dashboard" },
  { href: "/leads",     label: "Клієнти",     icon: Users,           testId: "link-nav-leads" },
  { href: "/tasks",     label: "Задачі",      icon: ListChecks,      testId: "link-nav-tasks" },
  { href: "/service",   label: "Сервіс",      icon: Wrench,          testId: "link-nav-service" },
  { href: "/rentals",   label: "Оренда",      icon: CalendarRange,   testId: "link-nav-rentals" },
  { href: "/equipment", label: "Обладнання",  icon: Boxes,           testId: "link-nav-equipment" },
  { href: "/settings",  label: "Налаштування", icon: Settings,        testId: "link-nav-settings" },
];

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { data: leads = [] } = useQuery<Lead[]>({ queryKey: ["/api/leads"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: equipment = [] } = useQuery<Equipment[]>({ queryKey: ["/api/equipment"] });
  const { currentUser, logout } = useCurrentUser();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { leads: [], tasks: [], equipment: [] };
    return {
      leads: leads.filter((l) =>
        [l.title, l.company, l.contactName, l.contactEmail, l.contactPhone, l.city]
          .filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
      ).slice(0, 6),
      tasks: tasks.filter((t) => t.title.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)).slice(0, 6),
      equipment: equipment.filter((e) => e.name.toLowerCase().includes(q) || e.model.toLowerCase().includes(q)).slice(0, 6),
    };
  }, [query, leads, tasks, equipment]);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col">
        <div className="h-14 flex items-center gap-2 px-4 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
            S
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold" data-testid="text-brand">Semark CRM</div>
            <div className="text-[11px] text-muted-foreground">ТОВ Семарк</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {nav.map((it) => {
            const Icon = it.icon;
            const active = location === it.href || (it.href !== "/" && location.startsWith(it.href));
            return (
              <Link
                key={it.href}
                href={it.href}
                data-testid={it.testId}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm hover-elevate",
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/80"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{it.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-1 py-1">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">
              Маркувальне обладнання<br />Полтава · Київ
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center gap-3 px-4 bg-background/80 backdrop-blur">
          <div className="relative flex-1 max-w-xl">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="input-global-search"
              value={query}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              placeholder="Глобальний пошук: клієнт, задача, обладнання…"
              className="pl-9 h-9"
            />
            {open && query.trim() && (
              <div className="absolute left-0 right-0 top-11 z-50 bg-popover border border-popover-border rounded-md shadow-md p-2 text-sm max-h-96 overflow-auto" data-testid="popover-search-results">
                {results.leads.length === 0 && results.tasks.length === 0 && results.equipment.length === 0 && (
                  <div className="px-2 py-3 text-muted-foreground text-xs">Нічого не знайдено</div>
                )}
                {results.leads.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-[11px] uppercase text-muted-foreground">Клієнти</div>
                    {results.leads.map((l) => (
                      <Link key={l.id} href={`/leads/${l.id}`} className="block px-2 py-1.5 rounded hover-elevate" data-testid={`link-search-lead-${l.id}`}>
                        <div className="font-medium">{l.title}</div>
                        <div className="text-xs text-muted-foreground">{l.company} · {l.contactName}</div>
                      </Link>
                    ))}
                  </div>
                )}
                {results.tasks.length > 0 && (
                  <div className="mb-2">
                    <div className="px-2 py-1 text-[11px] uppercase text-muted-foreground">Задачі</div>
                    {results.tasks.map((t) => (
                      <Link key={t.id} href="/tasks" className="block px-2 py-1.5 rounded hover-elevate" data-testid={`link-search-task-${t.id}`}>
                        <div className="font-medium">{t.title}</div>
                      </Link>
                    ))}
                  </div>
                )}
                {results.equipment.length > 0 && (
                  <div>
                    <div className="px-2 py-1 text-[11px] uppercase text-muted-foreground">Обладнання</div>
                    {results.equipment.map((e) => (
                      <Link key={e.id} href="/equipment" className="block px-2 py-1.5 rounded hover-elevate" data-testid={`link-search-equipment-${e.id}`}>
                        <div className="font-medium">{e.name}</div>
                        <div className="text-xs text-muted-foreground">{e.model}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="text-right leading-tight" data-testid="text-current-user">
            <div className="text-sm font-medium">{currentUser?.fullName}</div>
            <div className="text-[11px] text-muted-foreground">{currentUser ? (roleLabels[currentUser.role] ?? currentUser.role) : ""}</div>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={toggle}
            data-testid="button-theme-toggle"
            aria-label="Переключити тему"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={logout}
            data-testid="button-logout"
            aria-label="Вийти"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </header>
        <main className="flex-1 min-w-0 overflow-x-hidden p-6">{children}</main>
      </div>
    </div>
  );
}
