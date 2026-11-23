import type { CategoryBudgetProgress } from "../../lib/types";
import {
  getCategoryBudgetProgress,
  type CategoryBudgetStatus,
} from "../categories/budget";

export interface CategoryReportRow {
  id: string;
  name: string;
  color: string;
  spent_cents: number;
  budget_monthly: number | null;
  /** Fatia do gasto do mês, em porcentagem (0 a 100). */
  share_percent: number;
  status: CategoryBudgetStatus;
  status_label: string;
  over_budget_cents: number;
}

export interface CategoryReport {
  rows: CategoryReportRow[];
  /** Soma dos gastos das linhas mostradas, em centavos. */
  total_spent_cents: number;
  /** Soma dos orçamentos definidos, em centavos (0 quando nenhum tem). */
  total_budget_cents: number;
}

const MONTH_ABBREVIATIONS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** Rótulo curto do eixo do gráfico: `2026-01` vira `jan/26`. */
export function formatPeriodShortLabel(period: string): string {
  const [year, month] = period.split("-");
  const abbreviation = MONTH_ABBREVIATIONS[Number(month) - 1];
  if (!abbreviation || !year) return period;
  return `${abbreviation}/${year.slice(2)}`;
}

/** Porcentagem em pt-BR, com uma casa: `12.3` vira `12,3 %`. */
export function formatSharePercent(percent: number): string {
  return `${percent.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
}

/**
 * Monta a tabela do relatório mensal. Só entra categoria com gasto no mês ou
 * com orçamento definido -- categoria zerada e sem limite não é informação, é
 * ruído. A maior fatia vem primeiro, e o desempate é alfabético para a ordem
 * não depender da ordem em que o banco devolveu as linhas.
 */
export function buildCategoryReport(
  categories: readonly CategoryBudgetProgress[],
): CategoryReport {
  const included = categories
    .filter(
      (category) =>
        category.spent_cents > 0 || category.budget_monthly !== null,
    )
    .sort(
      (a, b) =>
        b.spent_cents - a.spent_cents ||
        a.name.localeCompare(b.name, "pt-BR"),
    );

  const total_spent_cents = included.reduce(
    (acc, category) => acc + category.spent_cents,
    0,
  );
  const total_budget_cents = included.reduce(
    (acc, category) => acc + (category.budget_monthly ?? 0),
    0,
  );

  const rows = included.map((category): CategoryReportRow => {
    const progress = getCategoryBudgetProgress(category);
    return {
      id: category.id,
      name: category.name,
      color: category.color,
      spent_cents: category.spent_cents,
      budget_monthly: category.budget_monthly,
      share_percent:
        total_spent_cents > 0
          ? (category.spent_cents / total_spent_cents) * 100
          : 0,
      status: progress.status,
      status_label: progress.statusLabel,
      over_budget_cents: progress.overBudgetCents,
    };
  });

  return { rows, total_spent_cents, total_budget_cents };
}
