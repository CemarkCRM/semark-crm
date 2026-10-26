function esc(value: any) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function downloadExcel(filename: string, sheetName: string, rows: Record<string, any>[]) {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<table>
<caption>${esc(sheetName)}</caption>
<thead><tr>${keys.map((k) => `<th>${esc(k)}</th>`).join("")}</tr></thead>
<tbody>
${rows.map((r) => `<tr>${keys.map((k) => `<td>${esc(r[k])}</td>`).join("")}</tr>`).join("\n")}
</tbody>
</table>
</body>
</html>`;
  const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
