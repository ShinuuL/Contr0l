import { monthRange } from "../date";
import { getDb } from "../db";
import { traceOperation } from "../observability/telemetry";

/** Meses mostrados na série quando a tela não pede outro recorte. */
export const DEFAULT_SERIES_MONTHS = 12;

export interface MonthlySeriesPoint {
  /** Mês no formato `YYYY-MM`. */
  period: string;
  year: number;
  month: number;
  /** Entradas do mês em centavos (sempre >= 0). */
  income_cents: number;
  /** Saídas do mês em centavos (sempre >= 0). */
  expense_cents: number;
  /** Entradas menos saídas, em centavos (pode ser negativo). */
  balance_cents: number;
}

interface MonthlySeriesRow {
  period: string;
  income_cents: number;
  expense_cents: number;
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Intervalo `[início, próximo início)` que cobre os `months` meses terminando
 * no mês selecionado, inclusive. O fim é o início do mês seguinte ao
 * selecionado, então o mês inteiro entra -- e nenhum dia de um mês futuro,
 * que ainda não aconteceu, é contado. O início sai do `monthRange` do primeiro
 * mês, que já trata a virada de ano.
 */
export function seriesRange(
  year: number,
  month: number,
  months: number,
): { start: string; end: string } {
  const first = new Date(year, month - 1 - (months - 1), 1);
  return {
    start: monthRange(first.getFullYear(), first.getMonth() + 1).start,
    end: monthRange(year, month).end,
  };
}

function validateMonths(months: number): number {
  if (!Number.isSafeInteger(months) || months < 1) {
    throw new Error("Informe um número de meses válido.");
  }
  return months;
}

/**
 * Série mês a mês de entradas, saídas e saldo. O agrupamento no banco usa
 * `strftime('%Y-%m', date)` sobre o intervalo parametrizado; meses sem
 * lançamento não voltam na consulta e são preenchidos com zero aqui, para o
 * gráfico ter sempre os `months` pontos em ordem cronológica.
 */
export async function monthlySeries(
  year: number,
  month: number,
  months: number = DEFAULT_SERIES_MONTHS,
): Promise<MonthlySeriesPoint[]> {
  return traceOperation("report.monthlySeries", async () => {
    const total = validateMonths(months);
    const db = await getDb();
    const { start, end } = seriesRange(year, month, total);
    const rows = await db.select<MonthlySeriesRow[]>(
      `SELECT strftime('%Y-%m', e.date) AS period,
              SUM(CASE WHEN e.nature = 'entrada' THEN e.amount_cents ELSE 0 END) AS income_cents,
              SUM(CASE WHEN e.nature = 'saida' THEN e.amount_cents ELSE 0 END) AS expense_cents
       FROM expenses e
       WHERE e.date >= $1 AND e.date < $2
       GROUP BY period
       ORDER BY period ASC`,
      [start, end],
    );
    const byPeriod = new Map(rows.map((row) => [row.period, row]));
    const points: MonthlySeriesPoint[] = [];
    for (let offset = total - 1; offset >= 0; offset -= 1) {
      const reference = new Date(year, month - 1 - offset, 1);
      const pointYear = reference.getFullYear();
      const pointMonth = reference.getMonth() + 1;
      const row = byPeriod.get(periodKey(pointYear, pointMonth));
      const income_cents = row?.income_cents ?? 0;
      const expense_cents = row?.expense_cents ?? 0;
      points.push({
        period: periodKey(pointYear, pointMonth),
        year: pointYear,
        month: pointMonth,
        income_cents,
        expense_cents,
        balance_cents: income_cents - expense_cents,
      });
    }
    return points;
  });
}
