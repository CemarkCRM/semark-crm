import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Equipment } from "@shared/schema";

const MAX_SHOWN = 100;

export function equipmentOptionLabel(e: Equipment): string {
  return `${e.model}${e.serial ? ` · S/N ${e.serial}` : ""} — ${e.name}`;
}

// Вибір обладнання з пошуком під час набору: за моделлю, назвою, брендом
// або серійним №. Моделі, що починаються з набраного, — першими.
export default function EquipmentPicker({
  items, value, onChange, placeholder = "Оберіть обладнання", allowNone, noneLabel = "— без прив'язки —", testId,
}: {
  items: Equipment[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = items.find((e) => String(e.id) === value);

  const matches = useMemo(() => {
    const phrase = query.toLowerCase().replace(/\s+/g, " ").trim();
    if (!phrase) return items;
    const textOf = (e: Equipment) => [e.model, e.name, e.brand, e.serial].filter(Boolean).join(" ").toLowerCase();
    // Спершу точний збіг фрази; якщо такого немає — усі слова в будь-якому порядку.
    let found = items.filter((e) => textOf(e).includes(phrase));
    if (!found.length) {
      const words = phrase.split(" ");
      found = items.filter((e) => { const t = textOf(e); return words.every((w) => t.includes(w)); });
    }
    // Вище ті, у кого модель починається з набраного (з брендом чи без).
    const rank = (e: Equipment) => {
      const m = e.model.toLowerCase();
      const bare = m.replace(/^(fidlaser|fidmarker|fidclean|automator)\s+/, "");
      if (m.startsWith(phrase) || bare.startsWith(phrase)) return 0;
      if (m.includes(phrase)) return 1;
      return 2;
    };
    return found.map((e, i) => ({ e, r: rank(e), i })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.e);
  }, [items, query]);

  const pick = (id: string) => { onChange(id); setOpen(false); setQuery(""); };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline" role="combobox" aria-expanded={open} data-testid={testId}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? equipmentOptionLabel(selected) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[20rem]" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Почніть вводити модель, назву або S/N…" value={query} onValueChange={setQuery}
            data-testid={testId ? `${testId}-search` : undefined}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>Нічого не знайдено</CommandEmpty>
            {allowNone && !query && (
              <CommandItem value="__none__" onSelect={() => pick("")}>{noneLabel}</CommandItem>
            )}
            {matches.slice(0, MAX_SHOWN).map((e) => (
              <CommandItem key={e.id} value={String(e.id)} onSelect={() => pick(String(e.id))}>
                <Check className={cn("mr-2 h-4 w-4 shrink-0", String(e.id) === value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{equipmentOptionLabel(e)}</span>
              </CommandItem>
            ))}
            {matches.length > MAX_SHOWN && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Показано {MAX_SHOWN} з {matches.length}. Уточніть пошук.
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
