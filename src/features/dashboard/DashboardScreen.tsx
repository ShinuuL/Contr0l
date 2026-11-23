import { useCallback, useEffect, useState } from "react";
import MonthSelector from "./MonthSelector";
import ExpensePieChart from "./ExpensePieChart";
import CategoryBreakdown from "./CategoryBreakdown";
import { buildChartSlices } from "./chartData";
import ScreenHeader, {
  SCREEN_SECTION_CLASS,
} from "../../components/ui/ScreenHeader";
import EmptyState from "../../components/ui/EmptyState";
import LoadingState from "../../components/ui/LoadingState";
import ErrorBanner from "../../components/ui/ErrorBanner";
import {
  monthlyTotalsByCategory,
  listTransactionsByMonth,
  settleDueTransactions,
} from "../../lib/repositories/transactions";
import { calculateMonthlyResult } from "../transactions/summary";
import { formatMonthLabel } from "../../lib/date";
import type { CategoryTotal, TransactionWithCategory } from "../../lib/types";
import { useTheme } from "../theme/ThemeProvider";
import { BalanceMoodCard } from "./BalanceMoodCard";
import { DashboardSummaryCards } from "./DashboardSummaryCards";

const TITLE_ID = "dashboard-title";

export default function DashboardScreen() {
  const { resolvedTheme } = useTheme();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>(
    [],
  );
  const [totals, setTotals] = useState<CategoryTotal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);

    settleDueTransactions()
      .then(() =>
        Promise.all([
          monthlyTotalsByCategory(year, month),
          listTransactionsByMonth(year, month),
        ]),
      )
      .then(([categoryTotals, monthTransactions]) => {
        if (cancelled) return;
        setTotals(categoryTotals);
        setTransactions(monthTransactions);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Erro ao carregar dados.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const handleMonthChange = useCallback(
    (nextYear: number, nextMonth: number) => {
      setYear(nextYear);
      setMonth(nextMonth);
    },
    [],
  );

  const summary = calculateMonthlyResult(transactions);

  const expenseTotals = totals
    .filter((t) => t.total_cents < 0)
    .map((t) => ({ ...t, total_cents: Math.abs(t.total_cents) }))
    .sort((a, b) => b.total_cents - a.total_cents);
  const slices = buildChartSlices(expenseTotals);
  const expensesTotalCents = expenseTotals.reduce(
    (acc, t) => acc + t.total_cents,
    0,
  );

  const hasData = transactions.length > 0;

  return (
    <section className={SCREEN_SECTION_CLASS} aria-labelledby={TITLE_ID}>
      <ScreenHeader
        id={TITLE_ID}
        title="Resumo"
        toolbar={
          <MonthSelector year={year} month={month} onChange={handleMonthChange} />
        }
      />

      {error && <ErrorBanner message={error} />}

      {!error && loading && <LoadingState />}

      {!error && !loading && !hasData && (
        <>
          {resolvedTheme === "strawberry" && <BalanceMoodCard realizedCents={0} />}
          <EmptyState>
            Nenhuma movimentação em {formatMonthLabel(year, month)}. Adicione sua
            primeira movimentação na aba Movimentações.
          </EmptyState>
        </>
      )}

      {!error && !loading && hasData && (
        <>
          <DashboardSummaryCards
            realizedCents={summary.realized_cents}
            projectedCents={summary.projected_cents}
            incomeCents={summary.income_cents}
            strawberry={resolvedTheme === "strawberry"}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section
              className="rounded-lg border border-border bg-surface p-5"
              aria-labelledby="chart-title"
            >
              <h3 id="chart-title" className="mb-4 text-sm font-medium">
                Saídas por categoria
              </h3>
              <ExpensePieChart slices={slices} totalCents={expensesTotalCents} />
            </section>

            <section
              className="rounded-lg border border-border bg-surface p-5"
              aria-labelledby="breakdown-title"
            >
              <h3 id="breakdown-title" className="mb-3 text-sm font-medium">
                Detalhamento
              </h3>
              <CategoryBreakdown totals={totals} />
            </section>
          </div>
        </>
      )}
    </section>
  );
}
