import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  AlertTriangle,
  CircleHelp,
  CirclePlus,
  Copy,
  Search,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import Button from "../../components/ui/Button";
import CategoryPicker from "./CategoryPicker";
import { useBackGuard } from "../../lib/navigation/backGuard";
import { formatBRL, formatSignedBRL } from "../../lib/currency";
import { formatDateBR } from "../../lib/date";
import type { ApprovedImportLine, Category } from "../../lib/types";
import type { CsvIssue, ParsedNature, ParsedStatementRow } from "./itauCsv";
import {
  dayDistance,
  normalizeDescription,
  reconciliationKey,
  type ReconciliationCandidate,
  type ReconciliationResult,
} from "./reconciliation";

type ImportDecision = "import" | "ignore" | "pending";
type ReviewGroup = "new" | "conflict";
export type ReviewTab = ReviewGroup | "duplicate" | "issue";

export interface ImportReviewLine {
  row: ParsedStatementRow & { existing?: ReconciliationCandidate };
  group: ReviewGroup;
  decision: ImportDecision;
  categoryId: string;
  nature: ParsedNature;
}

export interface ImportReviewStatus {
  importCount: number;
  pendingConflicts: number;
  missingCategories: number;
  canConfirm: boolean;
}

export interface ImportStatementModalProps {
  open: boolean;
  fileName: string;
  categories: Category[];
  result: ReconciliationResult;
  issues: CsvIssue[];
  submitting: boolean;
  error: string | null;
  onConfirm: (lines: ApprovedImportLine[]) => Promise<void>;
  onClose: () => void;
}

const tabs: ReviewTab[] = ["new", "conflict", "duplicate", "issue"];

const inputClass =
  "h-11 w-full rounded-lg border border-control-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted-foreground";

function normalizeCategoryName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

type MatchableCategory = Pick<Category, "id" | "name"> &
  Partial<Pick<Category, "is_preset">>;

/**
 * Slug derivado do nome. Não é campo do banco (a tabela `categories` não tem
 * slug): é uma chave estável calculada na leitura, para casar "CAFÉ-DA-MANHÃ"
 * com a categoria "Café da Manhã" sem depender de acento ou pontuação.
 */
export function categorySlug(value: string): string {
  return normalizeCategoryName(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface CategoryMatch {
  id: string;
  preset: boolean;
}

function categoryIndexes(categories: ReadonlyArray<MatchableCategory>) {
  const byName = new Map<string, CategoryMatch>();
  const bySlug = new Map<string, CategoryMatch>();
  const register = (
    index: Map<string, CategoryMatch>,
    key: string,
    category: MatchableCategory,
  ) => {
    if (!key) return;
    const current = index.get(key);
    const preset = category.is_preset === true;
    // Empate de slug: a categoria que o usuário criou vale mais que a nossa.
    if (!current || (current.preset && !preset)) {
      index.set(key, { id: category.id, preset });
    }
  };

  for (const category of categories) {
    register(byName, normalizeCategoryName(category.name), category);
    register(bySlug, categorySlug(category.name), category);
  }
  return { byName, bySlug };
}

/**
 * Predefine a categoria sem criar nada: testa a categoria sugerida pelo extrato
 * e, se ela não vier, a própria descrição do lançamento. Só aceita casamento
 * exato de nome ou slug -- se não casar, quem decide é o usuário na prévia.
 */
export function resolveSuggestedCategoryId(
  suggestedName: string | undefined,
  description: string,
  categories: ReadonlyArray<MatchableCategory>,
): string {
  const { byName, bySlug } = categoryIndexes(categories);
  for (const candidate of [suggestedName, description]) {
    if (!candidate) continue;
    const exact = byName.get(normalizeCategoryName(candidate));
    if (exact) return exact.id;
    const slug = bySlug.get(categorySlug(candidate));
    if (slug) return slug.id;
  }
  return "";
}

/**
 * Categoria usada quando o extrato nao sugere nenhuma -- que e o caso de todo
 * extrato real: nem Itau nem Nubank exportam coluna de categoria. Sem esse
 * padrao a previa nasce com todas as linhas sem categoria e o botao de
 * confirmar fica desabilitado, o que na pratica impedia a importacao.
 *
 * Prefere "Outros" (categoria predefinida e neutra); se ela nao existir, cai na
 * primeira da lista, que ja vem ordenada por predefinidas primeiro.
 */
export function resolveFallbackCategoryId(
  categories: ReadonlyArray<MatchableCategory>,
): string {
  const outros = categories.find(
    (category) => categorySlug(category.name) === "outros",
  );
  return outros?.id ?? categories[0]?.id ?? "";
}

export function createInitialImportReview(
  result: ReconciliationResult,
  categories: ReadonlyArray<MatchableCategory>,
  fallbackCategoryId = "",
): ImportReviewLine[] {
  const reviewLine = (
    row: ImportReviewLine["row"],
    group: ReviewGroup,
  ): ImportReviewLine => ({
    row,
    group,
    decision: group === "new" ? "import" : "pending",
    categoryId:
      resolveSuggestedCategoryId(
        row.suggestedCategoryName,
        row.description,
        categories,
      ) || fallbackCategoryId,
    nature: row.nature,
  });

  return [
    ...result.newRows.map((row) => reviewLine(row, "new")),
    ...result.conflicts.map((row) => reviewLine(row, "conflict")),
  ];
}

export function syncSuggestedCategories(
  review: ImportReviewLine[],
  categories: ReadonlyArray<MatchableCategory>,
): ImportReviewLine[] {
  const fallbackCategoryId = resolveFallbackCategoryId(categories);
  return review.map((item) => {
    if (item.categoryId) return item;
    const categoryId =
      resolveSuggestedCategoryId(
        item.row.suggestedCategoryName,
        item.row.description,
        categories,
      ) || fallbackCategoryId;
    return categoryId ? { ...item, categoryId } : item;
  });
}

export function getInitialReviewTab(
  result: ReconciliationResult,
  issues: CsvIssue[],
): ReviewTab {
  if (result.newRows.length > 0) return "new";
  if (result.conflicts.length > 0) return "conflict";
  if (result.duplicates.length > 0) return "duplicate";
  if (issues.length > 0) return "issue";
  return "new";
}

export function getImportReviewStatus(
  review: ImportReviewLine[],
): ImportReviewStatus {
  const selected = review.filter((item) => item.decision === "import");
  const pendingConflicts = review.filter(
    (item) => item.group === "conflict" && item.decision === "pending",
  ).length;
  const missingCategories = selected.filter(
    (item) => item.categoryId === "",
  ).length;
  const importCount = selected.length;

  return {
    importCount,
    pendingConflicts,
    missingCategories,
    canConfirm:
      importCount > 0 && pendingConflicts === 0 && missingCategories === 0,
  };
}

/**
 * Aplica a mesma mudança a todas as linhas de um grupo. Extratos reais chegam
 * com dezenas de lançamentos e nenhuma categoria sugerida (o CSV do app do Itaú
 * não tem coluna "Categoria"), então escolher linha a linha inviabiliza a
 * importação: sem isso o botão de confirmar nunca sai do estado desabilitado.
 */
export function applyBulkChanges(
  review: ImportReviewLine[],
  group: ReviewGroup,
  changes: Partial<ImportReviewLine>,
): ImportReviewLine[] {
  return review.map((item) =>
    item.group === group ? { ...item, ...changes } : item,
  );
}

export function buildApprovedImportLines(
  review: ImportReviewLine[],
): ApprovedImportLine[] {
  const selected = review.filter((item) => item.decision === "import");
  if (selected.some((item) => item.categoryId === "")) {
    throw new Error(
      "Selecione uma categoria para todas as movimentações escolhidas.",
    );
  }

  return selected.map(({ row, categoryId, nature }) => ({
    category_id: categoryId,
    description: row.description,
    amount_cents: row.amount_cents,
    date: row.date,
    nature,
    fingerprint: row.externalId ?? reconciliationKey({ ...row, nature }),
  }));
}

function tabLabel(tab: ReviewTab): string {
  const labels: Record<ReviewTab, string> = {
    new: "Novas",
    conflict: "Conflitos",
    duplicate: "Duplicadas",
    issue: "Com erro",
  };
  return labels[tab];
}

function SummaryCard({
  icon: Icon,
  label,
  count,
}: {
  icon: typeof CirclePlus;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums">{count}</span>
    </div>
  );
}

function ReadOnlyRow({
  row,
  label,
  icon: Icon,
}: {
  row: ParsedStatementRow;
  label: string;
  icon: typeof Copy;
}) {
  const signedAmount = row.nature === "saida" ? -row.amount_cents : row.amount_cents;
  return (
    <article className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{row.description}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Linha {row.sourceRow} · {formatDateBR(row.date)}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums">
            {formatSignedBRL(signedAmount)}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Icon className="size-3.5" aria-hidden />
            {label}
          </p>
        </div>
      </div>
    </article>
  );
}

function BulkActions({
  categories,
  disabled,
  onApply,
}: {
  categories: Category[];
  disabled: boolean;
  onApply: (changes: Partial<ImportReviewLine>) => void;
}) {
  const [bulkCategoryId, setBulkCategoryId] = useState("");

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Aplicar a todas as linhas desta aba
      </p>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <CategoryPicker
          value={bulkCategoryId}
          categories={categories}
          disabled={disabled}
          label="Categoria para todas as linhas desta aba"
          onChange={(categoryId) => {
            setBulkCategoryId(categoryId);
            onApply({ categoryId });
          }}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          className="h-10 whitespace-nowrap px-3"
          onClick={() => onApply({ decision: "import" })}
        >
          Importar todas
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className="h-10 whitespace-nowrap px-3"
          onClick={() => onApply({ decision: "ignore" })}
        >
          Ignorar todas
        </Button>
      </div>
    </div>
  );
}

function dayDistanceLabel(left: string, right: string): string {
  const days = dayDistance(left, right);
  if (days === 0) return "a mesma data";
  return days === 1 ? "1 dia de diferença" : `${days} dias de diferença`;
}

function ReviewRow({
  item,
  categories,
  onChange,
}: {
  item: ImportReviewLine;
  categories: Category[];
  onChange: (changes: Partial<ImportReviewLine>) => void;
}) {
  const controlId = `${item.group}-${item.row.sourceRow}`;
  const importing = item.decision === "import";
  const signedAmount =
    item.nature === "saida" ? -item.row.amount_cents : item.row.amount_cents;

  return (
    <article
      data-import-row={controlId}
      className={`rounded-xl border bg-background p-3 sm:p-4 ${
        importing ? "border-border" : "border-border/60 opacity-75"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.row.description}</p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            Linha {item.row.sourceRow} · {formatDateBR(item.row.date)}
          </p>
        </div>
        <p
          className={`whitespace-nowrap text-sm font-semibold tabular-nums ${
            item.nature === "entrada" ? "text-success" : "text-foreground"
          }`}
        >
          {formatSignedBRL(signedAmount)}
        </p>
      </div>

      {item.row.existing && (
        <div className="mt-2 rounded-lg border border-warning/40 bg-surface p-2.5 text-xs">
          <p className="font-medium">Já existe uma movimentação parecida</p>
          <p className="mt-1 text-muted-foreground">
            {item.row.existing.description} · {formatDateBR(item.row.existing.date)} ·{" "}
            {formatSignedBRL(
              item.row.existing.nature === "saida"
                ? -item.row.existing.amount_cents
                : item.row.existing.amount_cents,
            )}
          </p>
          <p className="mt-1 text-muted-foreground">
            Mesmo valor e natureza, com {dayDistanceLabel(item.row.date, item.row.existing.date)}
            . Importe só se forem lançamentos diferentes.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <fieldset>
          <legend className="sr-only">
            {item.group === "conflict" ? "Decisão obrigatória" : "Incluir na importação"}
          </legend>
          <div className="inline-flex rounded-lg border border-control-border bg-surface p-0.5">
            <button
              type="button"
              aria-pressed={item.decision === "import"}
              onClick={() => onChange({ decision: "import" })}
              className={`h-9 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                item.decision === "import"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Importar
            </button>
            <button
              type="button"
              aria-pressed={item.decision === "ignore"}
              onClick={() => onChange({ decision: "ignore" })}
              className={`h-9 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                item.decision === "ignore"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Ignorar
            </button>
          </div>
        </fieldset>

        <div className="min-w-[10rem] flex-1">
          <CategoryPicker
            value={item.categoryId}
            categories={categories}
            disabled={!importing}
            label={`Categoria de ${item.row.description}`}
            onChange={(categoryId) => onChange({ categoryId })}
          />
        </div>

        <fieldset
          disabled={!importing}
          className={!importing ? "text-muted-foreground" : undefined}
        >
          <legend className="sr-only">Natureza</legend>
          <div className="inline-flex rounded-lg border border-control-border bg-surface p-0.5">
            {(["entrada", "saida"] as const).map((nature) => (
              <button
                key={nature}
                type="button"
                aria-pressed={item.nature === nature}
                onClick={() => onChange({ nature })}
                className={`h-9 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:text-muted-foreground ${
                  item.nature === nature
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {nature === "entrada" ? "Entrada" : "Saída"}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </article>
  );
}

export default function ImportStatementModal({
  open,
  fileName,
  categories,
  result,
  issues,
  submitting,
  error,
  onConfirm,
  onClose,
}: ImportStatementModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const categoriesLoadedRef = useRef(categories.length > 0);
  const [activeTab, setActiveTab] = useState<ReviewTab>(() =>
    getInitialReviewTab(result, issues),
  );
  const [query, setQuery] = useState("");
  const [review, setReview] = useState(() =>
    createInitialImportReview(
      result,
      categories,
      resolveFallbackCategoryId(categories),
    ),
  );
  const status = getImportReviewStatus(review);
  const normalizedQuery = normalizeDescription(query);
  const matchesQuery = (text: string): boolean =>
    normalizedQuery === "" ||
    normalizeDescription(text).includes(normalizedQuery);

  // Enquanto grava não dá para desistir pelo voltar, como o Cancelar e o X.
  useBackGuard(open && !submitting, onClose);

  useEffect(() => {
    if (categoriesLoadedRef.current || categories.length === 0) return;
    setReview((current) => syncSuggestedCategories(current, categories));
    categoriesLoadedRef.current = true;
  }, [categories]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        // O seletor de categoria vive em portal e trata o próprio Escape. Sem
        // isso, fechar a lista também fechava a prévia e perdia a revisão.
        if (document.querySelector('[data-category-picker-open="true"]')) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, submitting]);

  if (!open) return null;

  const counts: Record<ReviewTab, number> = {
    new: result.newRows.length,
    conflict: result.conflicts.length,
    duplicate: result.duplicates.length,
    issue: issues.length,
  };
  const updateReview = (
    group: ReviewGroup,
    sourceRow: number,
    changes: Partial<ImportReviewLine>,
  ) => {
    setReview((current) =>
      current.map((item) =>
        item.group === group && item.row.sourceRow === sourceRow
          ? { ...item, ...changes }
          : item,
      ),
    );
  };

  const applyBulk = (group: ReviewGroup, changes: Partial<ImportReviewLine>) => {
    setReview((current) => applyBulkChanges(current, group, changes));
  };

  const handleTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (tabs.indexOf(activeTab) + direction + tabs.length) % tabs.length;
    setActiveTab(tabs[nextIndex]);
    const tabButtons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    );
    tabButtons?.[nextIndex]?.focus();
  };

  const blockingMessage = status.pendingConflicts
    ? `Decida sobre ${status.pendingConflicts} conflito${status.pendingConflicts === 1 ? "" : "s"}.`
    : status.missingCategories
      ? `Selecione a categoria de ${status.missingCategories} movimenta${status.missingCategories === 1 ? "ção" : "ções"}.`
      : status.importCount === 0
        ? "Escolha ao menos uma movimentação para importar."
        : `${status.importCount} movimenta${status.importCount === 1 ? "ção pronta" : "ções prontas"} para importar.`;

  const selectedLines = review.filter((item) => item.decision === "import");
  const totalIn = selectedLines
    .filter((item) => item.nature === "entrada")
    .reduce((sum, item) => sum + item.row.amount_cents, 0);
  const totalOut = selectedLines
    .filter((item) => item.nature === "saida")
    .reduce((sum, item) => sum + item.row.amount_cents, 0);

  const filteredReview = review.filter((item) =>
    matchesQuery(
      `${item.row.description} ${item.row.date} ${item.row.sourceRow} ${item.row.amount_cents}`,
    ),
  );
  const filteredDuplicates = result.duplicates.filter((row) =>
    matchesQuery(
      `${row.description} ${row.date} ${row.sourceRow} ${row.amount_cents}`,
    ),
  );
  const filteredIssues = issues.filter((issue) =>
    matchesQuery(`${issue.message} ${issue.sourceRow}`),
  );

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={submitting}
        className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-surface shadow-2xl sm:h-[min(90dvh,56rem)] sm:max-w-5xl sm:rounded-xl sm:border sm:border-border"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight sm:text-xl">
              Revisar importação
            </h2>
            <p id={descriptionId} title={fileName} className="mt-1 truncate text-sm text-muted-foreground">
              {fileName}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Fechar prévia da importação"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex-1 space-y-5 px-4 py-5 sm:px-6">
            <section aria-label="Resumo do extrato">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                <SummaryCard icon={CirclePlus} label="Novas" count={counts.new} />
                <SummaryCard icon={CircleHelp} label="Conflitos" count={counts.conflict} />
                <SummaryCard icon={Copy} label="Duplicadas" count={counts.duplicate} />
                <SummaryCard icon={AlertTriangle} label="Com erro" count={counts.issue} />
              </div>
            </section>

            {error && (
              <div role="alert" className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <div
              role="tablist"
              aria-label="Filtrar linhas por estado"
              className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-background p-1"
            >
              {tabs.map((tab) => (
                <button
                  key={tab}
                  id={`${titleId}-${tab}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  aria-controls={`${titleId}-${tab}-panel`}
                  tabIndex={activeTab === tab ? 0 : -1}
                  onClick={() => setActiveTab(tab)}
                  onKeyDown={handleTabKeyDown}
                  className={`h-11 min-w-max flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    activeTab === tab
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground"
                  }`}
                >
                  {tabLabel(tab)} · {counts[tab]}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Buscar movimentações por descrição, data ou linha"
                placeholder="Buscar por descrição, data ou linha…"
                className={`${inputClass} pl-9`}
              />
            </div>

            {tabs.map((tab) => {
              const tabReview = filteredReview.filter((item) => item.group === tab);
              const visibleCount =
                tab === "new" || tab === "conflict"
                  ? tabReview.length
                  : tab === "duplicate"
                    ? filteredDuplicates.length
                    : filteredIssues.length;
              return (
                <section
                  key={tab}
                  id={`${titleId}-${tab}-panel`}
                  role="tabpanel"
                  aria-labelledby={`${titleId}-${tab}-tab`}
                  tabIndex={activeTab === tab ? 0 : -1}
                  hidden={activeTab !== tab}
                  className="space-y-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {(tab === "new" || tab === "conflict") && tabReview.length > 0 && (
                    <BulkActions
                      categories={categories}
                      disabled={submitting}
                      onApply={(changes) => applyBulk(tab, changes)}
                    />
                  )}
                  {(tab === "new" || tab === "conflict") &&
                    tabReview.map((item) => (
                      <ReviewRow
                        key={`${item.group}-${item.row.sourceRow}`}
                        item={item}
                        categories={categories}
                        onChange={(changes) =>
                          updateReview(item.group, item.row.sourceRow, changes)
                        }
                      />
                    ))}
                  {tab === "duplicate" &&
                    filteredDuplicates.map((row) => (
                      <ReadOnlyRow
                        key={row.sourceRow}
                        row={row}
                        label="Duplicada — será ignorada"
                        icon={Copy}
                      />
                    ))}
                  {tab === "issue" &&
                    filteredIssues.map((issue) => (
                      <article
                        key={`${issue.sourceRow}-${issue.message}`}
                        className="rounded-xl border border-destructive/30 bg-background p-4"
                      >
                        <div className="flex gap-3">
                          <AlertTriangle
                            className="mt-0.5 size-5 shrink-0 text-destructive"
                            aria-hidden
                          />
                          <div>
                            <p className="font-medium">Linha {issue.sourceRow}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {issue.message}
                            </p>
                            <p className="mt-2 text-xs font-medium text-destructive">
                              Com erro — não será importada
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  {visibleCount === 0 && (
                    <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                      {normalizedQuery
                        ? "Nenhuma linha corresponde à busca."
                        : "Nenhuma linha neste grupo."}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <footer className="sticky bottom-0 border-t border-border bg-surface/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-6 sm:pb-4">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-background px-3 py-2 text-xs tabular-nums">
              <span className="text-muted-foreground">
                Entradas{" "}
                <strong className="ml-1 font-semibold text-success">
                  {formatBRL(totalIn)}
                </strong>
              </span>
              <span className="text-muted-foreground">
                Saídas{" "}
                <strong className="ml-1 font-semibold text-foreground">
                  −{formatBRL(totalOut)}
                </strong>
              </span>
              <span className="text-muted-foreground">
                Saldo{" "}
                <strong className="ml-1 font-semibold text-foreground">
                  {formatSignedBRL(totalIn - totalOut)}
                </strong>
              </span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p
                id={`${descriptionId}-status`}
                className={`text-sm font-medium ${
                  status.canConfirm
                    ? "text-muted-foreground"
                    : "text-destructive"
                }`}
              >
                {blockingMessage}
              </p>
              <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2">
                <Button type="button" variant="ghost" className="order-2 whitespace-nowrap focus-visible:outline-offset-2 sm:order-1" onClick={onClose} disabled={submitting}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="order-1 whitespace-nowrap focus-visible:outline-offset-2 sm:order-2"
                  disabled={!status.canConfirm || submitting}
                  aria-describedby={`${descriptionId}-status`}
                  onClick={() => void onConfirm(buildApprovedImportLines(review))}
                >
                  {submitting
                    ? "Importando…"
                    : `Importar ${status.importCount} ${status.importCount === 1 ? "movimentação" : "movimentações"}`}
                </Button>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );

  // O dialog é `fixed`, mas `.theme-shell > *` dá z-index a <main>, que vira um
  // contexto de empilhamento: dentro dele o z-50 do overlay não alcança a
  // BottomNav (z-20), que passava por cima e escondia o botão de confirmar.
  // Portalizar para o body tira o dialog desse contexto. Em render de string
  // (testes de markup) não há document, então o overlay sai inline.
  return typeof document === "undefined"
    ? overlay
    : createPortal(overlay, document.body);
}
