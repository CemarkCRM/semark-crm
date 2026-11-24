// Каталог обладнання: перетворення рядків Excel-файлу Продажів у записи CRM.
// Використовується і в браузері (попередній перегляд), і на сервері (перевірка).

export const equipmentTypeByLabel: Record<string, string> = {
  "волоконний лазерний маркер": "fiber_marker",
  "mopa лазерний маркер": "mopa_marker",
  "uv лазерний маркер": "uv_marker",
  "co2 лазерний маркер": "co2_marker",
  "co2 лазерний верстат": "co2_cutter",
  "лазерне очищення": "laser_cleaning",
  "ударно-точковий маркер": "dot_peen",
  "опція": "option",
  "витратні та запчастини": "consumable",
};

export const priceStatusByLabel: Record<string, string> = {
  "погоджено": "approved",
  "[уточнити]": "clarify",
  "уточнити": "clarify",
  "за запитом": "on_request",
};

// Заголовки файлу → поля CRM. Порівнюються без регістру і зайвих пробілів.
const HEADERS: Record<string, string> = {
  "бренд": "brand",
  "модель (артикул)": "model",
  "назва": "name",
  "тип": "type",
  "потужність, вт": "powerW",
  "робоче поле / розмір, мм": "workField",
  "джерело (внутрішнє)": "sourceInternal",
  "виконання": "execution",
  "ціна продажу без пдв, грн": "price",
  "ціна з пдв, грн": "priceVat",
  "статус ціни": "priceStatus",
  "дата прайсу": "priceDate",
  "наявність": "availability",
  "серійний №": "serial",
  "оренда/добу, грн": "rentalDayPrice",
  "нотатки": "notes",
};
export const REQUIRED_HEADERS = ["модель (артикул)", "назва", "тип", "ціна продажу без пдв, грн", "статус ціни"];

const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const key = (v: unknown) => norm(v).toLowerCase();

// Ключ повторного імпорту: артикул без різниці в регістрі й пробілах.
export function modelKey(model: unknown): string {
  return key(model);
}

// Маржа і курс — лише для директорів: не переносимо їх у нотатки CRM.
export function stripMargin(notes: unknown): string {
  let s = norm(notes);
  s = s.replace(/\s*\([^()]*марж[^()]*\)/gi, "");
  s = s.replace(/[^.;]*марж[^.;]*[.;]?/gi, "");
  return s.replace(/\s+([.,;])/g, "$1").replace(/\s+/g, " ").trim();
}

function toInt(v: unknown): number | null {
  if (v == null || norm(v) === "") return null;
  if (typeof v === "number") return Math.round(v);
  const n = Number(norm(v).replace(/[\s ]/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

// "09.11.2026" або дата Excel (число днів) → "2026-11-09".
function toIsoDate(v: unknown): string | null {
  if (v == null || norm(v) === "") return null;
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = norm(v);
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "invalid";
}

export type CatalogRow = {
  brand: string | null;
  model: string;
  name: string;
  type: string;
  powerW: string | null;
  workField: string | null;
  sourceInternal: string | null;
  execution: string | null;
  price: number;
  priceVat: number | null;
  priceStatus: string;
  priceDate: string | null;
  availability: string | null;
  serial: string | null;
  rentalDayPrice: number | null;
  notes: string | null;
};

export type ParsedSheet = { rows: CatalogRow[]; errors: string[]; skippedEmpty: number };

// rows[0] — заголовки; решта — значення. sheetName — для повідомлень про помилки.
export function parseCatalogSheet(sheetName: string, rows: unknown[][]): ParsedSheet {
  const errors: string[] = [];
  const out: CatalogRow[] = [];
  let skippedEmpty = 0;
  if (!rows.length) return { rows: out, errors: [`«${sheetName}»: аркуш порожній`], skippedEmpty };
  const header = rows[0].map(key);
  const missing = REQUIRED_HEADERS.filter((h) => !header.includes(h));
  if (missing.length) {
    return { rows: out, errors: [`«${sheetName}»: немає колонок ${missing.map((m) => `«${m}»`).join(", ")}`], skippedEmpty };
  }
  const idx: Record<string, number> = {};
  header.forEach((h, i) => { if (HEADERS[h] && idx[HEADERS[h]] == null) idx[HEADERS[h]] = i; });
  const cell = (r: unknown[], f: string) => (idx[f] == null ? null : r[idx[f]]);
  const text = (r: unknown[], f: string) => norm(cell(r, f)) || null;

  rows.slice(1).forEach((r, i) => {
    const line = `«${sheetName}», рядок ${i + 2}`;
    if (!r || r.every((v) => norm(v) === "")) { skippedEmpty++; return; }
    const model = norm(cell(r, "model"));
    const name = norm(cell(r, "name"));
    if (!model) { errors.push(`${line}: порожня модель (артикул)`); return; }
    if (!name) { errors.push(`${line}: порожня назва`); return; }
    const type = equipmentTypeByLabel[key(cell(r, "type"))];
    if (!type) { errors.push(`${line}: невідомий тип «${norm(cell(r, "type"))}»`); return; }
    const priceStatus = priceStatusByLabel[key(cell(r, "priceStatus"))];
    if (!priceStatus) { errors.push(`${line}: невідомий статус ціни «${norm(cell(r, "priceStatus"))}»`); return; }
    const price = toInt(cell(r, "price"));
    const priceVat = toInt(cell(r, "priceVat"));
    const rentalDayPrice = toInt(cell(r, "rentalDayPrice"));
    if ([price, priceVat, rentalDayPrice].some((n) => Number.isNaN(n))) { errors.push(`${line}: ціна не є числом`); return; }
    if (price == null && priceStatus !== "on_request") { errors.push(`${line}: немає ціни без ПДВ`); return; }
    const priceDate = toIsoDate(cell(r, "priceDate"));
    if (priceDate === "invalid") { errors.push(`${line}: дата прайсу не у форматі ДД.ММ.РРРР`); return; }
    out.push({
      brand: text(r, "brand"),
      model,
      name,
      type,
      powerW: text(r, "powerW"),
      workField: text(r, "workField"),
      sourceInternal: text(r, "sourceInternal"),
      execution: text(r, "execution"),
      price: price ?? 0,
      priceVat,
      priceStatus,
      priceDate,
      availability: text(r, "availability"),
      serial: text(r, "serial"),
      rentalDayPrice,
      notes: stripMargin(cell(r, "notes")) || null,
    });
  });
  return { rows: out, errors, skippedEmpty };
}
