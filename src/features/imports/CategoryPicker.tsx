import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { createPortal } from "react-dom";
import type { Category } from "../../lib/types";
import { normalizeAccents } from "./statementValues";

export type PickerCategory = Pick<Category, "id" | "name" | "color">;

export interface CategoryPickerProps {
  value: string;
  categories: ReadonlyArray<PickerCategory>;
  onChange: (categoryId: string) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}

interface Position {
  top: number;
  left: number;
  width: number;
}

const PANEL_HEIGHT = 320;

/**
 * Substitui o `<select>` nativo da revisão. No celular o seletor do sistema
 * abria em tela cheia, escondia a linha que estava sendo revisada e não tinha
 * busca -- com 59 lançamentos isso tornava a conferência impossível. Aqui a
 * lista abre ancorada no controle, com filtro e navegação por teclado.
 */
export default function CategoryPicker({
  value,
  categories,
  onChange,
  label,
  disabled = false,
  className = "",
}: CategoryPickerProps) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);

  const selected = categories.find((category) => category.id === value);
  const visible = categories.filter((category) =>
    normalizeAccents(category.name)
      .toLowerCase()
      .includes(normalizeAccents(query).trim().toLowerCase()),
  );

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, 240);
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - width - 8),
    );
    const spaceBelow = window.innerHeight - rect.bottom;
    const top =
      spaceBelow >= PANEL_HEIGHT + 16 || spaceBelow > rect.top
        ? Math.min(rect.bottom + 6, window.innerHeight - PANEL_HEIGHT - 8)
        : Math.max(8, rect.top - PANEL_HEIGHT - 6);
    setPosition({ top: Math.max(8, top), left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      close(false);
    };
    const onViewportChange = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      measure();
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [close, measure, open]);

  // O painel entra no DOM só depois de `measure()`, então focalizar no efeito
  // anterior não funcionava: `searchRef.current` ainda era null.
  useEffect(() => {
    if (!open || !position) return;
    searchRef.current?.focus();
  }, [open, position]);

  const choose = (categoryId: string) => {
    onChange(categoryId);
    close();
  };

  const onPanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (visible.length === 0) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(
        (activeIndex + direction + visible.length) % visible.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const category = visible[activeIndex];
      if (category) choose(category.id);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'input, button:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const current = [...focusable].indexOf(document.activeElement as HTMLElement);
      const next =
        (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
      focusable[next]?.focus();
    }
  };

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      disabled={disabled}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      onClick={() => {
        setOpen((wasOpen) => !wasOpen);
        setQuery("");
        setActiveIndex(0);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setOpen(true);
        }
      }}
      className={`flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-control-border bg-background px-3 text-left text-sm text-foreground transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {selected ? (
        <>
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: selected.color }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">{selected.name}</span>
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          Selecione uma categoria
        </span>
      )}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );

  const panel =
    open && typeof document !== "undefined" && position ? (
      createPortal(
        <div
          ref={panelRef}
          id={listId}
          role="listbox"
          aria-label={label}
          data-category-picker-open="true"
          onKeyDown={onPanelKeyDown}
          style={{
            top: position.top,
            left: position.left,
            width: position.width,
          }}
          className="fixed z-[70] overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        >
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                aria-label="Buscar categoria"
                placeholder="Buscar categoria…"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                className="h-10 w-full rounded-lg border border-control-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-1 [scrollbar-width:thin] [scrollbar-color:var(--control-border)_transparent] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--control-border)]">
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                Nenhuma categoria encontrada.
              </p>
            ) : (
              visible.map((category, index) => (
                <button
                  key={category.id}
                  type="button"
                  role="option"
                  aria-selected={category.id === value}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(category.id)}
                  className={`flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                    index === activeIndex
                      ? "bg-primary/10 text-foreground"
                      : "text-foreground hover:bg-background"
                  }`}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: category.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{category.name}</span>
                  {category.id === value && (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden />
                  )}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body,
      )
    )
    : null;

  return (
    <>
      {trigger}
      {panel}
    </>
  );
}
