"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AnalyticsCardType,
  AnalyticsComparison,
  AnalyticsValueFormat,
  CreateCardInput,
  MetricDefinition,
} from "@/lib/analytics";

const VISUAL_LABELS: Record<AnalyticsCardType, { label: string; description: string; icon: string }> = {
  KPI: { label: "Chiffre clé", description: "Une valeur et son évolution", icon: "42" },
  LINE: { label: "Courbe", description: "Une tendance dans le temps", icon: "⌁" },
  FUNNEL: { label: "Funnel", description: "Les pertes entre les étapes", icon: "▽" },
};

export default function CardComposer({
  open,
  catalog,
  nextOrder,
  onClose,
  onSave,
}: {
  open: boolean;
  catalog: MetricDefinition[];
  nextOrder: number;
  onClose: () => void;
  onSave: (input: CreateCardInput) => Promise<void>;
}) {
  const [metricKey, setMetricKey] = useState(catalog[0]?.key);
  const definition = useMemo(() => catalog.find((item) => item.key === metricKey) ?? catalog[0], [catalog, metricKey]);
  const [type, setType] = useState<AnalyticsCardType>("KPI");
  const [title, setTitle] = useState("");
  const [comparison, setComparison] = useState<AnalyticsComparison>("PREVIOUS_PERIOD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!definition) return;
    setType(definition.visualizations[0]);
    setTitle(definition.label);
    setComparison(definition.key === "PIPELINE_FUNNEL" ? "NONE" : "PREVIOUS_PERIOD");
  }, [definition]);

  if (!open) return null;

  async function submit() {
    if (!definition || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const width = type === "KPI" ? 3 : 6;
      await onSave({
        title: title.trim(),
        subtitle: definition.description,
        type,
        metricKey: definition.key,
        valueFormat: definition.format as AnalyticsValueFormat,
        comparison,
        layout: { x: 0, y: 0, w: width, h: type === "KPI" ? 2 : 4 },
        sortOrder: nextOrder,
      });
      onClose();
    } catch {
      setError("La carte n’a pas pu être enregistrée.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="analytics-modal" role="dialog" aria-modal="true" aria-labelledby="card-composer-title">
      <button className="analytics-modal__backdrop" type="button" onClick={onClose} aria-label="Fermer" />
      <section className="analytics-composer">
        <header>
          <div>
            <span className="analytics-step">Nouvelle carte</span>
            <h2 id="card-composer-title">Quel signal voulez-vous suivre ?</h2>
            <p>Choisissez une donnée, son apparence et son niveau de comparaison.</p>
          </div>
          <button type="button" className="analytics-icon-button" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="analytics-composer__body">
          <label className="analytics-field">
            <span>Métrique</span>
            <select value={metricKey} onChange={(event) => setMetricKey(event.target.value as MetricDefinition["key"])}>
              {catalog.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            <small>{definition?.description}</small>
          </label>

          <fieldset className="analytics-fieldset">
            <legend>Visualisation</legend>
            <div className="analytics-visual-grid">
              {(Object.entries(VISUAL_LABELS) as Array<[AnalyticsCardType, typeof VISUAL_LABELS.KPI]>).map(([value, option]) => {
                const allowed = definition?.visualizations.includes(value) ?? false;
                return (
                  <button key={value} type="button" disabled={!allowed} className={type === value ? "is-selected" : ""} onClick={() => setType(value)}>
                    <b>{option.icon}</b><span>{option.label}<small>{option.description}</small></span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="analytics-field">
            <span>Titre de la carte</span>
            <input value={title} maxLength={90} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Ventes du mois" />
          </label>

          {type !== "FUNNEL" ? (
            <label className="analytics-field analytics-field--inline">
              <span>Comparer à la période précédente</span>
              <input type="checkbox" checked={comparison === "PREVIOUS_PERIOD"} onChange={(event) => setComparison(event.target.checked ? "PREVIOUS_PERIOD" : "NONE")} />
            </label>
          ) : null}

          <div className="analytics-preview-card">
            <span>Aperçu</span>
            <div><small>{title || "Titre de la carte"}</small><strong>{type === "KPI" ? "12 480" : type === "LINE" ? "⌁ Tendance" : "▽ Funnel"}</strong></div>
          </div>
          {error ? <p className="analytics-error">{error}</p> : null}
        </div>

        <footer>
          <button type="button" className="analytics-button analytics-button--ghost" onClick={onClose}>Annuler</button>
          <button type="button" className="analytics-button analytics-button--primary" disabled={saving || !title.trim()} onClick={submit}>{saving ? "Enregistrement…" : "Ajouter la carte"}</button>
        </footer>
      </section>
    </div>
  );
}
