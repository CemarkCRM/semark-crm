import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type DateFilterMode = "all" | "date" | "month" | "year";

export function matchesDateFilter(value: string | null | undefined, mode: DateFilterMode, selected: string) {
  if (mode === "all" || !selected) return true;
  if (!value) return false;
  const datePart = value.slice(0, 10);
  if (mode === "date") return datePart === selected;
  if (mode === "month") return datePart.slice(0, 7) === selected;
  if (mode === "year") return datePart.slice(0, 4) === selected;
  return true;
}

export default function DateFilterBar({
  mode,
  value,
  onModeChange,
  onValueChange,
  label = "Фільтр по даті",
}: {
  mode: DateFilterMode;
  value: string;
  onModeChange: (mode: DateFilterMode) => void;
  onValueChange: (value: string) => void;
  label?: string;
}) {
  const inputType = mode === "month" ? "month" : mode === "year" ? "number" : "date";
  const placeholder = mode === "year" ? "2026" : undefined;

  return (
    <div className="grid md:grid-cols-2 gap-2">
      <div>
        <Label className="sr-only">{label}</Label>
        <Select
          value={mode}
          onValueChange={(next) => {
            onModeChange(next as DateFilterMode);
            if (next === "all") onValueChange("");
          }}
        >
          <SelectTrigger data-testid="select-date-filter-mode"><SelectValue placeholder={label} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Усі дати</SelectItem>
            <SelectItem value="date">Конкретна дата</SelectItem>
            <SelectItem value="month">Місяць</SelectItem>
            <SelectItem value="year">Рік</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {mode !== "all" && (
        <Input
          data-testid="input-date-filter-value"
          type={inputType}
          min={mode === "year" ? "2000" : undefined}
          max={mode === "year" ? "2100" : undefined}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
        />
      )}
    </div>
  );
}
