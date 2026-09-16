"use client";

import { ResponsiveContainer, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsCard, MetricResult } from "@/lib/analytics";

function formatValue(value: number, format: AnalyticsCard["valueFormat"]) {
  if (format === "CURRENCY") {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
  }
  if (format === "PERCENTAGE") return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function SparkTooltip({ active, payload, label, format }: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  format: AnalyticsCard["valueFormat"];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="analytics-tooltip">
      <span>{label ? new Date(`${label}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : ""}</span>
      <strong>{formatValue(Number(payload[0].value ?? 0), format)}</strong>
    </div>
  );
}

export default function AnalyticsMetricCard({
  card,
  result,
  editing,
  onEdit,
  onResize,
  onDuplicate,
  onDelete,
}: {
  card: AnalyticsCard;
  result?: MetricResult;
  editing: boolean;
  onEdit: () => void;
  onResize: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const loading = !result;
  const deltaPositive = (result?.delta ?? 0) >= 0;
  const filterCount =
    (card.filters?.sources?.length ?? 0) +
    (card.filters?.excludeSources?.length ?? 0);

  return (
    <article className="analytics-card group" aria-busy={loading}>
      <header className="analytics-card__header">
        <div>
          <p className="analytics-card__eyebrow">{card.type === "KPI" ? "Indicateur" : card.type === "LINE" ? "Évolution" : "Conversion"}</p>
          <h3>{card.title}</h3>
          {card.subtitle ? <p className="analytics-card__subtitle">{card.subtitle}</p> : null}
          {filterCount > 0 ? (
            <span className="analytics-card__filter-badge">
              {filterCount} filtre{filterCount > 1 ? "s" : ""} propre{filterCount > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
        {editing ? (
          <div className="analytics-card__actions">
            <button type="button" onClick={onEdit} title="Modifier la carte" aria-label={`Modifier ${card.title}`}>✎</button>
            <button type="button" onClick={onResize} title="Changer la largeur">↔</button>
            <button type="button" onClick={onDuplicate} title="Dupliquer">⧉</button>
            <button type="button" onClick={onDelete} title="Supprimer">×</button>
          </div>
        ) : null}
      </header>

      {loading ? <div className="analytics-skeleton" /> : null}

      {!loading && card.type === "KPI" ? (
        <div className="analytics-kpi">
          <strong>{formatValue(result.value, card.valueFormat)}</strong>
          {result.delta !== null ? (
            <span className={deltaPositive ? "is-positive" : "is-negative"}>
              {deltaPositive ? "↗" : "↘"} {Math.abs(result.delta).toLocaleString("fr-FR")} %
            </span>
          ) : <span className="is-muted">Pas de comparaison</span>}
          <p>par rapport à la période précédente</p>
        </div>
      ) : null}

      {!loading && card.type === "LINE" ? (
        result.series?.length ? (
          <div className="analytics-chart" aria-label={`Courbe ${card.title}`}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 230 }}>
              <LineChart data={result.series} margin={{ top: 12, right: 8, left: -24, bottom: 0 }}>
                <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} tick={{ fill: "#718096", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#718096", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<SparkTooltip format={card.valueFormat} />} />
                <Line type="monotone" dataKey="value" stroke="#7c83ff" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: "#45d6a6" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="analytics-empty-mini">Aucune donnée sur cette période.</div>
      ) : null}

      {!loading && card.type === "FUNNEL" ? (
        <div className="analytics-funnel">
          {(result.segments ?? []).map((segment, index, segments) => {
            const max = Math.max(segments[0]?.value ?? 0, 1);
            const previous = index > 0 ? segments[index - 1].value : segment.value;
            const conversion = previous ? Math.round((segment.value / previous) * 100) : 0;
            return (
              <div className="analytics-funnel__row" key={segment.key}>
                <div className="analytics-funnel__meta">
                  <span>{segment.label}</span><strong>{segment.value.toLocaleString("fr-FR")}</strong>
                  {index > 0 ? <em>{conversion} %</em> : null}
                </div>
                <div className="analytics-funnel__track"><i style={{ width: `${Math.max(4, (segment.value / max) * 100)}%` }} /></div>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
