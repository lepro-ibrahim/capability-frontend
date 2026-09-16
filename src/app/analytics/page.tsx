"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import Guard from "@/components/Guard";
import DateRangePicker, { type Range } from "@/components/DateRangePicker";
import SourcesFilter from "@/components/SourcesFilter";
import { useGlobalFilters } from "@/components/GlobalFiltersProvider";
import {
  analyticsApi,
  type AnalyticsCard,
  type AnalyticsDashboard,
  type AnalyticsQueryResponse,
  type CreateCardInput,
  type MetricDefinition,
} from "@/lib/analytics";
import AnalyticsMetricCard from "./AnalyticsMetricCard";
import CardComposer from "./CardComposer";

function isoDate(value: string | Date) {
  return dayjs(value).format("YYYY-MM-DD");
}

export default function AnalyticsPage() {
  const [dashboards, setDashboards] = useState<AnalyticsDashboard[]>([]);
  const [catalog, setCatalog] = useState<MetricDefinition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState<AnalyticsQueryResponse | null>(null);
  const [range, setRange] = useState<Range>({ from: dayjs().subtract(29, "day").format("YYYY-MM-DD"), to: dayjs().format("YYYY-MM-DD") });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<AnalyticsCard | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newDashboardOpen, setNewDashboardOpen] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const { sources, excludeSources } = useGlobalFilters();

  const activeDashboard = useMemo(
    () => dashboards.find((dashboard) => dashboard.id === selectedId) ?? dashboards[0],
    [dashboards, selectedId]
  );
  const cards = useMemo(
    () => [...(activeDashboard?.cards ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [activeDashboard]
  );

  const loadDashboards = useCallback(async () => {
    const [nextDashboards, nextCatalog] = await Promise.all([analyticsApi.dashboards(), analyticsApi.catalog()]);
    setDashboards(nextDashboards);
    setCatalog(nextCatalog);
    setSelectedId((current) => current && nextDashboards.some((item) => item.id === current)
      ? current
      : nextDashboards.find((item) => item.isDefault)?.id ?? nextDashboards[0]?.id ?? null);
  }, []);

  useEffect(() => {
    loadDashboards().catch(() => setError("Impossible de charger vos tableaux de bord.")).finally(() => setLoading(false));
  }, [loadDashboards]);

  const runQuery = useCallback(async () => {
    if (!activeDashboard) return;
    if (!activeDashboard.cards.length) {
      setQuery({ period: { from: isoDate(range.from), to: isoDate(range.to) }, results: {} });
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      setQuery(await analyticsApi.query({
        from: isoDate(range.from),
        to: isoDate(range.to),
        cards: activeDashboard.cards.map((card) => ({
          id: card.id,
          metricKey: card.metricKey,
          comparison: card.comparison,
          filters: card.filters ?? undefined,
        })),
        filters: { sources, excludeSources },
      }));
    } catch {
      setError("Les données du tableau n’ont pas pu être actualisées.");
    } finally {
      setRefreshing(false);
    }
  }, [activeDashboard, range.from, range.to, sources, excludeSources]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void runQuery(); }, 120);
    return () => window.clearTimeout(timer);
  }, [runQuery]);

  function replaceCard(updated: AnalyticsCard) {
    setDashboards((items) => items.map((dashboard) => dashboard.id !== updated.dashboardId ? dashboard : {
      ...dashboard,
      cards: dashboard.cards.map((card) => card.id === updated.id ? updated : card),
    }));
  }

  async function createCard(input: CreateCardInput) {
    if (!activeDashboard) return;
    const card = await analyticsApi.createCard(activeDashboard.id, input);
    setDashboards((items) => items.map((dashboard) => dashboard.id === activeDashboard.id
      ? { ...dashboard, cards: [...dashboard.cards, card] }
      : dashboard));
  }

  async function duplicateCard(card: AnalyticsCard) {
    await createCard({
      title: `${card.title} — copie`, subtitle: card.subtitle, type: card.type, metricKey: card.metricKey,
      valueFormat: card.valueFormat, comparison: card.comparison,
      filters: card.filters ? { ...card.filters } : undefined,
      layout: { ...card.layout, x: 0, y: card.layout.y + 1 }, sortOrder: cards.length,
    });
  }

  async function saveComposedCard(input: CreateCardInput) {
    if (editingCard) {
      replaceCard(await analyticsApi.updateCard(editingCard.id, input));
      return;
    }
    await createCard(input);
  }

  function openNewCardComposer() {
    setEditingCard(null);
    setComposerOpen(true);
  }

  function openCardEditor(card: AnalyticsCard) {
    setEditingCard(card);
    setComposerOpen(true);
  }

  function closeCardComposer() {
    setComposerOpen(false);
    setEditingCard(null);
  }

  async function deleteCard(card: AnalyticsCard) {
    if (!window.confirm(`Supprimer la carte « ${card.title} » ?`)) return;
    await analyticsApi.deleteCard(card.id);
    setDashboards((items) => items.map((dashboard) => dashboard.id === card.dashboardId
      ? { ...dashboard, cards: dashboard.cards.filter((item) => item.id !== card.id) }
      : dashboard));
  }

  async function resizeCard(card: AnalyticsCard) {
    const width = card.layout.w <= 3 ? 6 : card.layout.w <= 6 ? 12 : 3;
    replaceCard(await analyticsApi.updateCard(card.id, { layout: { ...card.layout, w: width } }));
  }

  async function moveCard(card: AnalyticsCard, direction: -1 | 1) {
    const index = cards.findIndex((item) => item.id === card.id);
    const target = index + direction;
    if (target < 0 || target >= cards.length) return;
    const other = cards[target];
    const [nextCard, nextOther] = await Promise.all([
      analyticsApi.updateCard(card.id, { sortOrder: other.sortOrder }),
      analyticsApi.updateCard(other.id, { sortOrder: card.sortOrder }),
    ]);
    replaceCard(nextCard);
    replaceCard(nextOther);
  }

  async function dropCard(targetId: string) {
    if (!draggedId || draggedId === targetId) return;
    const from = cards.findIndex((item) => item.id === draggedId);
    const to = cards.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...cards];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const updated = await Promise.all(reordered.map((card, index) => analyticsApi.updateCard(card.id, { sortOrder: index })));
    setDashboards((items) => items.map((dashboard) => dashboard.id === activeDashboard?.id ? { ...dashboard, cards: updated } : dashboard));
    setDraggedId(null);
  }

  async function createDashboard() {
    if (!newDashboardName.trim()) return;
    const dashboard = await analyticsApi.createDashboard({ name: newDashboardName.trim(), description: "Un espace de pilotage personnalisé." });
    setDashboards((items) => [...items, dashboard]);
    setSelectedId(dashboard.id);
    setNewDashboardName("");
    setNewDashboardOpen(false);
    setEditing(true);
  }

  async function duplicateDashboard() {
    if (!activeDashboard) return;
    const dashboard = await analyticsApi.duplicateDashboard(activeDashboard.id);
    setDashboards((items) => [...items, dashboard]);
    setSelectedId(dashboard.id);
  }

  return (
    <Guard>
      <main className="analytics-page">
        <div className="analytics-grid-glow" aria-hidden="true" />
        <header className="analytics-hero">
          <div>
            <span className="analytics-kicker"><i /> Centre de pilotage</span>
            <h1>Construisez la vue qui aide votre équipe à décider.</h1>
            <p>{activeDashboard?.description ?? "Mesurez chaque passage, du premier contact au revenu encaissé."}</p>
          </div>
          <div className="analytics-hero__actions">
            <button className="analytics-button analytics-button--ghost" type="button" onClick={() => setFiltersOpen((value) => !value)}>Filtres {sources.length || excludeSources.length ? `(${sources.length + excludeSources.length})` : ""}</button>
            <button className={`analytics-button ${editing ? "analytics-button--live" : "analytics-button--ghost"}`} type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Terminer" : "Organiser"}</button>
            <button className="analytics-button analytics-button--primary" type="button" onClick={openNewCardComposer} disabled={!activeDashboard}>+ Ajouter une carte</button>
          </div>
        </header>

        <section className="analytics-workspace-bar">
          <div className="analytics-dashboard-tabs" role="tablist" aria-label="Tableaux de bord">
            {dashboards.map((dashboard) => (
              <button role="tab" aria-selected={dashboard.id === activeDashboard?.id} className={dashboard.id === activeDashboard?.id ? "is-active" : ""} key={dashboard.id} onClick={() => setSelectedId(dashboard.id)}>
                {dashboard.name}{dashboard.isDefault ? <i>Principal</i> : null}
              </button>
            ))}
            <button className="analytics-dashboard-tabs__add" onClick={() => setNewDashboardOpen(true)} title="Nouveau tableau">+</button>
          </div>
          <div className="analytics-workspace-bar__meta">
            <span>{refreshing ? "Actualisation…" : `${cards.length} carte${cards.length > 1 ? "s" : ""}`}</span>
            <button type="button" onClick={duplicateDashboard}>Dupliquer le tableau</button>
          </div>
        </section>

        <section className="analytics-filter-strip">
          <DateRangePicker value={range} onChange={setRange} />
          {filtersOpen ? <div className="analytics-sources-popover"><SourcesFilter /></div> : null}
        </section>

        {error ? <div className="analytics-banner" role="alert"><span>{error}</span><button type="button" onClick={runQuery}>Réessayer</button></div> : null}

        {loading ? <div className="analytics-loading"><i /><span>Préparation de votre espace…</span></div> : null}

        {!loading && activeDashboard && cards.length === 0 ? (
          <section className="analytics-empty">
            <span>✦</span><h2>Ce tableau attend son premier signal.</h2>
            <p>Ajoutez une carte pour suivre un objectif, une tendance ou votre funnel commercial.</p>
            <button className="analytics-button analytics-button--primary" type="button" onClick={openNewCardComposer}>Créer la première carte</button>
          </section>
        ) : null}

        <section className={`analytics-canvas ${editing ? "is-editing" : ""}`} aria-label="Cartes du tableau de bord">
          {cards.map((card) => (
            <div
              className="analytics-canvas__item"
              style={{ gridColumn: `span ${Math.min(12, Math.max(3, card.layout.w))}` }}
              key={card.id}
              draggable={editing}
              onDragStart={() => setDraggedId(card.id)}
              onDragOver={(event) => editing && event.preventDefault()}
              onDrop={() => void dropCard(card.id)}
            >
              {editing ? <div className="analytics-drag-handle" title="Faire glisser pour déplacer">••••</div> : null}
              <AnalyticsMetricCard
                card={card}
                result={query?.results[card.id]}
                editing={editing}
                onEdit={() => openCardEditor(card)}
                onResize={() => void resizeCard(card)}
                onDuplicate={() => void duplicateCard(card)}
                onDelete={() => void deleteCard(card)}
              />
              {editing ? <div className="analytics-order-controls"><button onClick={() => void moveCard(card, -1)} aria-label="Déplacer vers la gauche">←</button><button onClick={() => void moveCard(card, 1)} aria-label="Déplacer vers la droite">→</button></div> : null}
            </div>
          ))}
        </section>

        <CardComposer
          open={composerOpen}
          card={editingCard}
          catalog={catalog}
          nextOrder={cards.length}
          onClose={closeCardComposer}
          onSave={saveComposedCard}
        />

        {newDashboardOpen ? (
          <div className="analytics-modal" role="dialog" aria-modal="true" aria-labelledby="new-dashboard-title">
            <button className="analytics-modal__backdrop" type="button" onClick={() => setNewDashboardOpen(false)} aria-label="Fermer" />
            <section className="analytics-small-dialog">
              <span className="analytics-step">Nouveau tableau</span>
              <h2 id="new-dashboard-title">Donnez un objectif à cette vue.</h2>
              <label className="analytics-field"><span>Nom</span><input autoFocus value={newDashboardName} onChange={(event) => setNewDashboardName(event.target.value)} placeholder="Ex. Performance marketing" maxLength={80} /></label>
              <div><button className="analytics-button analytics-button--ghost" onClick={() => setNewDashboardOpen(false)}>Annuler</button><button className="analytics-button analytics-button--primary" onClick={() => void createDashboard()} disabled={!newDashboardName.trim()}>Créer</button></div>
            </section>
          </div>
        ) : null}
      </main>
    </Guard>
  );
}
