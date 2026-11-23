import { useCallback, useEffect, useState } from "react";
import ScreenHeader, {
  SCREEN_SECTION_CLASS,
} from "../../components/ui/ScreenHeader";
import EmptyState from "../../components/ui/EmptyState";
import LoadingState from "../../components/ui/LoadingState";
import ErrorBanner from "../../components/ui/ErrorBanner";
import CategoryMarker from "../../components/ui/CategoryMarker";
import MonthSelector from "../dashboard/MonthSelector";
import SeriesChart from "./SeriesChart";
import { buildCategoryReport, formatSharePercent } from "./reportData";
import { listCategoryBudgetProgress } from "../../lib/repositories/categories";
import {
  monthlySeries,
  type MonthlySeriesPoint,
} from "../../lib/repositories/reports";
import { formatBRL } from "../../lib/currency";
import { formatMonthLabel } from "../../lib/date";
import type { CategoryBudgetProgress } from "../../lib/types";
import { useTheme } from "../theme/ThemeProvider";

const TITLE_ID = "reports-title";

export default function ReportsScreen() {
  const { resolvedTheme } = useTheme();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [categories, setCategories] = useState<CategoryBudgetProgress[]>([]);
  const [series, setSeries] = useState<MonthlySeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setLoading(true);

    Promise.all([
      listCategoryBudgetProgress(year, month),
      monthlySeries(year, month),
    ])
      .then(([categoryRows, seriesPoints]) => {
        if (cancelled) return;
        setCategories(categoryRows);
        setSeries(seriesPoints);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Erro ao carregar relatórios.",
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

  const report = buildCategoryReport(categories);
  const seriesHasData = series.some(
    (point) => point.income_cents !== 0 || point.expense_cents !== 0,
  );
  const hasData = report.rows.length > 0 || seriesHasData;
  const strawberry = resolvedTheme === "strawberry";

  return (
    <section className={SCREEN_SECTION_CLASS} aria-labelledby={TITLE_ID}>
      <ScreenHeader
        id={TITLE_ID}
        title="Relatórios"
        toolbar={
          <MonthSelector year={year} month={month} onChange={handleMonthChange} />
        }
      />

      {error && <ErrorBanner message={error} />}

      {!error && loading && <LoadingState />}

      {!error && !loading && !hasData && (
        <EmptyState>
          Nenhuma movimentação registrada nos últimos {series.length} meses.
          Adicione lançamentos na aba Movimentações para ver os relatórios.
        </EmptyState>
      )}

      {!error && !loading && hasData && (
        <>
          <section
            className="rounded-lg border border-border bg-surface p-5"
            aria-labelledby="reports-series-title"
          >
            <h3 id="reports-series-title" className="mb-4 text-sm font-medium">
              Evolução nos últimos {series.length} meses
            </h3>
            <SeriesChart points={series} />
          </section>

          <section
            className="rounded-lg border border-border bg-surface p-5"
            aria-labelledby="reports-category-title"
          >
            <h3 id="reports-category-title" className="mb-3 text-sm font-medium">
              Gastos por categoria em {formatMonthLabel(year, month)}
            </h3>
            {report.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum gasto registrado neste mês.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="pb-2 pr-3 font-medium">
                        Categoria
                      </th>
                      <th scope="col" className="pb-2 pr-3 text-right font-medium">
                        Total
                      </th>
                      <th scope="col" className="pb-2 pr-3 text-right font-medium">
                        % do total
                      </th>
                      <th scope="col" className="pb-2 pr-3 text-right font-medium">
                        Orçamento
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        Situação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.rows.map((row) => (
                      <tr key={row.id}>
                        <th
                          scope="row"
                          className="flex items-center gap-2 py-2 pr-3 font-normal"
                        >
                          <CategoryMarker
                            color={row.color}
                            strawberry={strawberry}
                          />
                          {row.name}
                        </th>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatBRL(row.spent_cents)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                          {formatSharePercent(row.share_percent)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {row.budget_monthly === null
                            ? "—"
                            : formatBRL(row.budget_monthly)}
                        </td>
                        <td
                          className={`py-2 text-right ${
                            row.status === "over-budget"
                              ? "font-medium text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {row.over_budget_cents > 0
                            ? `Acima em ${formatBRL(row.over_budget_cents)}`
                            : row.status_label}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border font-medium">
                      <th scope="row" className="py-2 pr-3 text-left">
                        Total
                      </th>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {formatBRL(report.total_spent_cents)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {formatSharePercent(
                          report.total_spent_cents > 0 ? 100 : 0,
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {report.total_budget_cents > 0
                          ? formatBRL(report.total_budget_cents)
                          : "—"}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
