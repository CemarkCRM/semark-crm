// Centralized labels (Ukrainian)

export const stageLabels: Record<string, string> = {
  new: "Новий",
  contacted: "Контакт",
  qualified: "Кваліфікований",
  proposal: "Пропозиція",
  negotiation: "Переговори",
  won: "Виграно",
  lost: "Втрачено",
};
export const stageOrder = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];

export const stageBadgeClass = (s: string) =>
  ({
    new: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
    contacted: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    qualified: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
    proposal: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
    negotiation: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    won: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    lost: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  }[s] || "bg-muted text-foreground");

export const sourceLabels: Record<string, string> = {
  website: "Сайт",
  referral: "Рекомендація",
  exhibition: "Виставка",
  phone: "Дзвінок",
  service: "Сервіс",
  partner: "Партнер",
  other: "Інше",
};

export const roleLabels: Record<string, string> = {
  director: "Директор",
  executive_director: "Виконавчий директор",
  engineer: "Сервісний інженер",
  accountant: "Бухгалтер",
  sales: "Менеджер з продажу",
  admin: "Адміністратор",
};

export const taskStatusLabels: Record<string, string> = {
  open: "Відкрита",
  in_progress: "В роботі",
  done: "Виконана",
  cancelled: "Скасована",
};

export const taskStatusBadge = (s: string) =>
  ({
    open: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
    in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    cancelled: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  }[s] || "bg-muted");

export const priorityLabels: Record<string, string> = {
  low: "Низький",
  medium: "Середній",
  high: "Високий",
  urgent: "Терміновий",
};

export const priorityBadge = (p: string) =>
  ({
    low: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200",
    medium: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
    high: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    urgent: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  }[p] || "bg-muted");

export const equipmentTypeLabels: Record<string, string> = {
  fiber: "Волоконний",
  co2: "CO2 лазер",
  marker: "Маркер",
  laser: "Лазер",
  accessory: "Аксесуар",
};

export const equipmentStatusLabels: Record<string, string> = {
  available: "Доступне",
  rented: "В оренді",
  maintenance: "На обслуговуванні",
};

export const equipmentStatusBadge = (s: string) =>
  ({
    available: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    rented: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    maintenance: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  }[s] || "bg-muted");

export const repairStatusLabels: Record<string, string> = {
  received: "Прийнято",
  diagnostic: "Діагностика",
  in_repair: "В ремонті",
  waiting_parts: "Очікує запчастини",
  ready: "Готово до видачі",
  returned: "Видано клієнту",
};

export const repairStatusBadge = (s: string) =>
  ({
    received: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
    diagnostic: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
    in_repair: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    waiting_parts: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    ready: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200",
    returned: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  }[s] || "bg-muted");

export const rentalStatusLabels: Record<string, string> = {
  reserved: "Заброньовано",
  active: "Активна",
  returned: "Повернуто",
  overdue: "Прострочена",
};

export const rentalStatusBadge = (s: string) =>
  ({
    reserved: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
    active: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    returned: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    overdue: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  }[s] || "bg-muted");

export const eventTypeLabels: Record<string, string> = {
  comment: "Коментар",
  stage_change: "Зміна стадії",
  task: "Задача",
  sale: "Продаж",
  repair: "Сервіс",
  rental: "Оренда",
  system: "Подія",
};

export function formatUAH(value?: number | null) {
  if (value == null) return "—";
  return new Intl.NumberFormat("uk-UA").format(value) + " грн";
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("uk-UA", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("uk-UA", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
