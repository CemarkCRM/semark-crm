// CSV helpers — minimal, no dependency.

export function toCSV(rows: Record<string, any>[], headers?: string[]): string {
  if (rows.length === 0) return headers ? headers.join(",") + "\n" : "";
  const keys = headers ?? Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [keys.join(",")];
  for (const r of rows) lines.push(keys.map((k) => esc(r[k])).join(","));
  return lines.join("\n");
}

export function downloadCSV(filename: string, rows: Record<string, any>[], headers?: string[]) {
  const csv = toCSV(rows, headers);
  // Add UTF-8 BOM so Excel reads Ukrainian properly
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Tiny CSV parser supporting quoted fields and commas/semicolons.
export function parseCSV(text: string): Record<string, string>[] {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Auto-detect delimiter from first non-quoted line
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
}
