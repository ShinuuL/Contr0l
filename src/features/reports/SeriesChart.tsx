import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL, formatSignedBRL } from "../../lib/currency";
import { formatMonthLabel } from "../../lib/date";
import type { MonthlySeriesPoint } from "../../lib/repositories/reports";
import { formatPeriodShortLabel } from "./reportData";

interface SeriesChartProps {
  points: MonthlySeriesPoint[];
}

const compactBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  color: "var(--foreground)",
  fontSize: "0.875rem",
  boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)",
};

/**
 * Entradas e saídas em barras, saldo em linha -- mesma paleta do resto do app
 * (entrada verde, saída vermelha). O gráfico é decorativo para o leitor de
 * tela: a tabela abaixo repete os mesmos números, e é ela que o leitor
 * percorre, sem depender do SVG.
 */
export default function SeriesChart({ points }: SeriesChartProps) {
  const data = points.map((point) => ({
    period: point.period,
    label: formatPeriodShortLabel(point.period),
    Entradas: point.income_cents,
    Saídas: point.expense_cents,
    Saldo: point.balance_cents,
  }));

  return (
    <div>
      <div className="h-72" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="var(--muted-foreground)"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={12}
              width={72}
              stroke="var(--muted-foreground)"
              tickFormatter={(value) =>
                compactBRL.format(Number(value) / 100)
              }
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: "var(--border)", fillOpacity: 0.4 }}
              formatter={(value, name) => [
                name === "Saldo"
                  ? formatSignedBRL(Number(value))
                  : formatBRL(Number(value)),
                name,
              ]}
            />
            <Legend />
            <Bar
              dataKey="Entradas"
              name="Entradas"
              fill="var(--success)"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="Saídas"
              name="Saídas"
              fill="var(--danger)"
              radius={[4, 4, 0, 0]}
            />
            <Line
              type="monotone"
              dataKey="Saldo"
              name="Saldo"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Entradas, saídas e saldo por mês</caption>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col">Entradas</th>
            <th scope="col">Saídas</th>
            <th scope="col">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.period}>
              <th scope="row">{formatMonthLabel(point.year, point.month)}</th>
              <td>{formatBRL(point.income_cents)}</td>
              <td>{formatBRL(point.expense_cents)}</td>
              <td>{formatSignedBRL(point.balance_cents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
