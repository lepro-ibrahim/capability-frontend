"use client";

import { useEffect, useMemo, useState } from "react";
import SourcesFilter from "@/components/SourcesFilter";
import type {
  AnalyticsCard,
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

const SOURCE_FILTER_UNSUPPORTED = new Set<MetricDefinition["key"]>(["AD_SPEND", "CASH_IN", "ROAS"]);

export default function CardComposer({
  open,
  card,
  catalog,
  nextOrder,
  onClose,
  onSave,
}: {
  open: boolean;
  card?: AnalyticsCard | null;
  catalog: MetricDefinition[];
  nextOrder: number;
  onClose: () => void;
  onSave: (input: CreateCardInput) => Promise<void>;
}) {
  const [metricKey, setMetricKey] = useState(catalog[0]?.key);
  const definition = useMemo(() => catalog.find((item) => item.key === metricKey) ?? catalog[0], [catalog, metricKey]);
  const [type, setType] = useState<AnalyticsCardType>("KPI");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [comparison, setComparison] = useState<AnalyticsComparison>("PREVIOUS_PERIOD");
  const [sources, setSources] = useState<string[]>([]);
  const [excludeSources, setExcludeSources] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(card);
  const supportsSourceFilters = definition ? !SOURCE_FILTER_UNSUPPORTED.has(definition.key) : false;

  useEffect(() => {
    if (!open) return;
    const initialDefinition = catalog.find((item) => item.key === card?.metricKey) ?? catalog[0];
    if (!initialDefinition) return;
    setMetricKey(initialDefinition.key);
    setType(card?.type ?? initialDefinition.visualizations[0]);
    setTitle(card?.title ?? initialDefinition.label);
    setSubtitle(card?.subtitle ?? initialDefinition.description);
    setComparison(card?.comparison ?? (initialDefinition.key === "PIPELINE_FUNNEL" ? "NONE" : "PREVIOUS_PERIOD"));
    setSources(card?.filters?.sources ?? []);
    setExcludeSources(card?.filters?.excludeSources ?? []);
    setError(null);
  }, [card, catalog, open]);

  if (!open) return null;

  function selectMetric(nextKey: MetricDefinition["key"]) {
    const nextDefinition = catalog.find((item) => item.key === nextKey);
    if (!nextDefinition) return;
    setMetricKey(nextDefinition.key);
    setType(nextDefinition.visualizations[0]);
    setTitle(nextDefinition.label);
    setSubtitle(nextDefinition.description);
    setComparison(nextDefinition.key === "PIPELINE_FUNNEL" ? "NONE" : "PREVIOUS_PERIOD");
    if (SOURCE_FILTER_UNSUPPORTED.has(nextDefinition.key)) {
      setSources([]);
      setExcludeSources([]);
    }
  }

  async function submit() {
    if (!definition || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const width = type === "KPI" ? 3 : 6;
      const layout = card
        ? {
            ...card.layout,
            w: type === "KPI" ? card.layout.w : Math.max(6, card.layout.w),
            h: type === "KPI" ? 2 : Math.max(4, card.layout.h),
          }
        : { x: 0, y: 0, w: width, h: type === "KPI" ? 2 : 4 };
      await onSave({
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        type,
        metricKey: definition.key,
        valueFormat: definition.format as AnalyticsValueFormat,
        comparison,
        filters: {
          ...card?.filters,
          sources: supportsSourceFilters ? sources : [],
          excludeSources: supportsSourceFilters ? excludeSources : [],
        },
        layout,
        sortOrder: card?.sortOrder ?? nextOrder,
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
            <span className="analytics-step">{isEditing ? "Modifier la carte" : "Nouvelle carte"}</span>
            <h2 id="card-composer-title">{isEditing ? "Ajustez ce que cette carte mesure." : "Quel signal voulez-vous suivre ?"}</h2>
            <p>Métrique, apparence, comparaison et sources restent modifiables à tout moment.</p>
          </div>
          <button type="button" className="analytics-icon-button" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="analytics-composer__body">
          <label className="analytics-field">
            <span>Métrique</span>
            <select value={metricKey ?? ""} onChange={(event) => selectMetric(event.target.value as MetricDefinition["key"])}>
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

          <label className="analytics-field">
            <span>Description</span>
            <input value={subtitle} maxLength={180} onChange={(event) => setSubtitle(event.target.value)} placeholder="Expliquez rapidement ce que la carte mesure" />
          </label>

          {type !== "FUNNEL" ? (
            <label className="analytics-field analytics-field--inline">
              <span>Comparer à la période précédente</span>
              <input type="checkbox" checked={comparison === "PREVIOUS_PERIOD"} onChange={(event) => setComparison(event.target.checked ? "PREVIOUS_PERIOD" : "NONE")} />
            </label>
          ) : null}

          <fieldset className="analytics-fieldset analytics-card-filters">
            <legend>Filtres propres à cette carte</legend>
            {supportsSourceFilters ? (
              <>
                <p>Ils affinent les filtres globaux du tableau sans modifier les autres cartes.</p>
                <SourcesFilter
                  sources={sources}
                  excludeSources={excludeSources}
                  onSourcesChange={setSources}
                  onExcludeSourcesChange={setExcludeSources}
                />
              </>
            ) : (
              <p>Cette métrique financière n’est pas encore attribuable par source.</p>
            )}
          </fieldset>

          <div className="analytics-preview-card">
            <span>Aperçu</span>
            <div><small>{title || "Titre de la carte"}</small><strong>{type === "KPI" ? "12 480" : type === "LINE" ? "⌁ Tendance" : "▽ Funnel"}</strong></div>
          </div>
          {error ? <p className="analytics-error">{error}</p> : null}
        </div>

        <footer>
          <button type="button" className="analytics-button analytics-button--ghost" onClick={onClose}>Annuler</button>
          <button type="button" className="analytics-button analytics-button--primary" disabled={saving || !title.trim()} onClick={submit}>{saving ? "Enregistrement…" : isEditing ? "Enregistrer les modifications" : "Ajouter la carte"}</button>
        </footer>
      </section>
    </div>
  );
}
