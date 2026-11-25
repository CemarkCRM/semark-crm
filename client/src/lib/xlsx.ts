// Мінімальне читання .xlsx у браузері без сторонніх бібліотек:
// zip (центральний каталог + deflate через DecompressionStream) і XML аркушів.
// Повертає значення клітинок (рядки та числа), без формул і стилів.

export type XlsxSheet = { name: string; rows: (string | number | null)[][] };

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Файл не є Excel (.xlsx)");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("Пошкоджений файл .xlsx");
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + compSize);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, await inflateRaw(raw));
  }
  return files;
}

function xml(files: Map<string, Uint8Array>, path: string): Document | null {
  const data = files.get(path);
  if (!data) return null;
  return new DOMParser().parseFromString(new TextDecoder().decode(data), "application/xml");
}

const byTag = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagNameNS("*", tag));

function colIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function cellText(el: Element): string {
  // Phonetic hints (<rPh>) are not part of the visible text.
  return byTag(el, "t").filter((t) => (t.parentNode as Element | null)?.localName !== "rPh")
    .map((t) => t.textContent ?? "").join("");
}

export async function readXlsx(file: File | Blob): Promise<XlsxSheet[]> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Браузер застарий для читання Excel. Оновіть Chrome, Edge або Firefox.");
  }
  const files = await unzip(await file.arrayBuffer());
  const workbook = xml(files, "xl/workbook.xml");
  if (!workbook) throw new Error("Файл не є Excel (.xlsx)");
  const rels = xml(files, "xl/_rels/workbook.xml.rels");
  const targets = new Map<string, string>();
  if (rels) {
    for (const r of byTag(rels, "Relationship")) {
      const target = r.getAttribute("Target") ?? "";
      targets.set(r.getAttribute("Id") ?? "", target.startsWith("/") ? target.slice(1) : `xl/${target}`);
    }
  }
  const shared = xml(files, "xl/sharedStrings.xml");
  const strings = shared ? byTag(shared, "si").map(cellText) : [];

  const sheets: XlsxSheet[] = [];
  for (const s of byTag(workbook, "sheet")) {
    const name = s.getAttribute("name") ?? "";
    const rid = s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
      ?? s.getAttribute("r:id") ?? "";
    const doc = xml(files, targets.get(rid) ?? "");
    if (!doc) continue;
    const rows: (string | number | null)[][] = [];
    for (const row of byTag(doc, "row")) {
      const rIdx = Number(row.getAttribute("r") ?? rows.length + 1) - 1;
      const values: (string | number | null)[] = [];
      for (const c of byTag(row, "c")) {
        const ref = c.getAttribute("r");
        const ci = ref ? colIndex(ref) : values.length;
        const type = c.getAttribute("t");
        const v = byTag(c, "v")[0]?.textContent ?? null;
        let value: string | number | null = null;
        if (type === "s") value = v == null ? null : strings[Number(v)] ?? null;
        else if (type === "inlineStr") value = cellText(c);
        else if (type === "str" || type === "e") value = v;
        else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
        else if (v != null && v !== "") value = Number(v);
        while (values.length < ci) values.push(null);
        values[ci] = value;
      }
      while (rows.length < rIdx) rows.push([]);
      rows[rIdx] = values;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
