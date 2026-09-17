"use client";

import Guard from "@/components/Guard";
import api from "@/lib/api";
import {
  closerSpaceApi,
  type CloserCockpit,
  type CloserListItem,
  type LedgerStatus,
  type LedgerType,
  type ReportOutcome,
  type Role,
} from "@/lib/closerSpace";
import { useCallback, useEffect, useMemo, useState } from "react";

type PeriodKey = "today" | "7d" | "30d" | "month" | "custom";
type Panel = "report" | "ledger" | "settings" | null;
type Me = { userId: string; email: string; role: Role };

const OBJECTIONS = [
  "Prix",
  "Timing",
  "Financement",
  "Besoin de réfléchir",
  "Décideur absent",
  "Manque de confiance",
  "Comparaison concurrent",
  "Pas prioritaire",
];

const euro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const compactDate = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function rangeFor(key: Exclude<PeriodKey, "custom">) {
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);
  if (key === "today") {
    from.setHours(0, 0, 0, 0);
  } else if (key === "7d") {
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else if (key === "30d") {
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  }
  to.setHours(23, 59, 59, 999);
  return { from: isoDay(from), to: isoDay(to) };
}

function errorMessage(error: unknown) {
  const candidate = error as {
    response?: { data?: { message?: string | string[] } };
    message?: string;
  };
  const message = candidate.response?.data?.message;
  return Array.isArray(message)
    ? message.join(" · ")
    : message || candidate.message || "Une erreur est survenue.";
}

function personName(
  person?: {
    firstName: string;
    lastName?: string | null;
  } | null,
) {
  if (!person) return "Prospect non relié";
  return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

function Metric({
  label,
  value,
  tone = "neutral",
  note,
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "warn" | "danger" | "violet";
  note?: string;
}) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.035]",
    good: "border-emerald-400/20 bg-emerald-400/[0.06]",
    warn: "border-amber-400/20 bg-amber-400/[0.06]",
    danger: "border-rose-400/20 bg-rose-400/[0.06]",
    violet: "border-violet-400/20 bg-violet-400/[0.06]",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
        {value}
      </p>
      {note ? <p className="mt-1 text-xs text-white/40">{note}</p> : null}
    </div>
  );
}

function Progress({ value, tone }: { value: number; tone: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

export default function ClosersPage() {
  const initialRange = useMemo(() => rangeFor("30d"), []);
  const [me, setMe] = useState<Me | null>(null);
  const [closers, setClosers] = useState<CloserListItem[]>([]);
  const [closerId, setCloserId] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [data, setData] = useState<CloserCockpit | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);

  const fetchCockpit = useCallback(
    async (selectedCloserId: string, nextFrom: string, nextTo: string) => {
      if (!selectedCloserId) return;
      setRefreshing(true);
      setError(null);
      try {
        const cockpit = await closerSpaceApi.cockpit({
          closerId: selectedCloserId,
          from: `${nextFrom}T00:00:00.000Z`,
          to: `${nextTo}T23:59:59.999Z`,
        });
        setData(cockpit);
      } catch (nextError) {
        setError(errorMessage(nextError));
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );

  const loadCockpit = useCallback(
    (selectedCloserId: string, nextFrom = from, nextTo = to) =>
      fetchCockpit(selectedCloserId, nextFrom, nextTo),
    [fetchCockpit, from, to],
  );

  useEffect(() => {
    let cancelled = false;
    api
      .get<Me>("/auth/me")
      .then(async (meResponse) => {
        if (cancelled) return;
        setMe(meResponse.data);
        if (meResponse.data.role === "SETTER") return;
        const nextClosers = await closerSpaceApi.closers();
        if (cancelled) return;
        setClosers(nextClosers);
        const firstId = nextClosers[0]?.id;
        if (firstId) {
          setCloserId(firstId);
          await fetchCockpit(firstId, initialRange.from, initialRange.to);
        }
      })
      .catch((nextError) => {
        if (!cancelled) setError(errorMessage(nextError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchCockpit, initialRange.from, initialRange.to]);

  function selectPeriod(key: Exclude<PeriodKey, "custom">) {
    const next = rangeFor(key);
    setPeriod(key);
    setFrom(next.from);
    setTo(next.to);
    void loadCockpit(closerId, next.from, next.to);
  }

  async function refreshAll() {
    await loadCockpit(closerId);
    const nextClosers = await closerSpaceApi.closers();
    setClosers(nextClosers);
  }

  const currentCloser = closers.find((item) => item.id === closerId);
  const maxObjection = data?.objections[0]?.count ?? 1;

  if (me?.role === "SETTER") {
    return (
      <Guard>
        <main className="grid min-h-screen place-items-center bg-[#070b14] p-6 text-white">
          <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
            <p className="text-2xl font-semibold">Espace réservé aux closers</p>
            <p className="mt-3 text-sm text-white/50">
              Votre rôle Setter ne permet pas d’accéder aux données financières
              des closers.
            </p>
          </div>
        </main>
      </Guard>
    );
  }

  return (
    <Guard>
      <main className="min-h-screen bg-[#070b14] text-white">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(79,70,229,.18),transparent_30%),radial-gradient(circle_at_100%_15%,rgba(16,185,129,.12),transparent_28%)]" />
        <div className="relative mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-10">
          <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,.8)]" />
                Cockpit closer
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Transformer les rendez-vous en cash.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
                Performance commerciale, encaissements et actions prioritaires
                dans un seul espace.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPanel("report")}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-white/90"
              >
                + Compte-rendu
              </button>
              {me?.role === "ADMIN" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setPanel("ledger")}
                    className="rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/15"
                  >
                    + Mouvement financier
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanel("settings")}
                    className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/10"
                  >
                    Commission
                  </button>
                </>
              ) : null}
            </div>
          </header>

          <section className="mt-7 rounded-2xl border border-white/10 bg-[#0d1320]/90 p-3 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["today", "Aujourd’hui"],
                    ["7d", "7 jours"],
                    ["30d", "30 jours"],
                    ["month", "Ce mois"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectPeriod(key)}
                    className={`rounded-xl px-3.5 py-2 text-sm transition ${
                      period === key
                        ? "bg-indigo-500 text-white shadow-lg shadow-indigo-950/40"
                        : "border border-white/10 bg-white/[0.04] text-white/60 hover:bg-white/[0.08]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                {me?.role === "ADMIN" ? (
                  <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    Closer
                    <select
                      value={closerId}
                      onChange={(event) => {
                        setCloserId(event.target.value);
                        void loadCockpit(event.target.value);
                      }}
                      className="min-w-52 rounded-xl border border-white/10 bg-[#151c2b] px-3 py-2.5 text-sm normal-case tracking-normal text-white outline-none focus:border-indigo-400/50"
                    >
                      {closers.map((closer) => (
                        <option key={closer.id} value={closer.id}>
                          {personName(closer)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="flex gap-2">
                  <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    Du
                    <input
                      type="date"
                      value={from}
                      onChange={(event) => {
                        setFrom(event.target.value);
                        setPeriod("custom");
                      }}
                      className="rounded-xl border border-white/10 bg-[#151c2b] px-3 py-2 text-sm normal-case text-white outline-none"
                    />
                  </label>
                  <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                    Au
                    <input
                      type="date"
                      value={to}
                      onChange={(event) => {
                        setTo(event.target.value);
                        setPeriod("custom");
                      }}
                      className="rounded-xl border border-white/10 bg-[#151c2b] px-3 py-2 text-sm normal-case text-white outline-none"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void loadCockpit(closerId)}
                    className="self-end rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white/70 hover:bg-white/10"
                  >
                    Appliquer
                  </button>
                </div>
              </div>
            </div>
          </section>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          {loading || !data ? (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
                />
              ))}
            </div>
          ) : (
            <div
              className={`mt-6 space-y-6 transition-opacity ${refreshing ? "opacity-55" : "opacity-100"}`}
            >
              <section>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-300">
                      Activité rendez-vous
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">
                      Du planning à la présence
                    </h2>
                  </div>
                  <p className="hidden text-xs text-white/35 sm:block">
                    RV1 et RV2 · {personName(data.closer)}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Metric
                    label="RDV planifiés"
                    value={data.appointments.planned}
                  />
                  <Metric
                    label="RDV honorés"
                    value={data.appointments.honored}
                    tone="good"
                  />
                  <Metric
                    label="No-shows"
                    value={data.appointments.noShows}
                    tone="danger"
                  />
                  <Metric
                    label="Reportés"
                    value={data.appointments.postponed}
                    tone="warn"
                  />
                  <Metric
                    label="Annulations"
                    value={data.appointments.canceled}
                    tone="neutral"
                  />
                </div>
              </section>

              <section>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300">
                  Conversion commerciale
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <Metric
                    label="Propositions"
                    value={data.sales.proposals}
                    tone="violet"
                  />
                  <Metric
                    label="Contrats signés"
                    value={data.sales.contractsSigned}
                  />
                  <Metric label="Ventes" value={data.sales.sales} tone="good" />
                  <Metric
                    label="Panier moyen"
                    value={euro.format(data.sales.averageBasket)}
                  />
                  <Metric
                    label="Taux de closing"
                    value={`${data.sales.closingRate} %`}
                    tone="good"
                  />
                  <Metric
                    label="Taux d’encaissement"
                    value={`${data.cash.collectionRate} %`}
                    tone="warn"
                  />
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.55fr_.75fr]">
                <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d1422]">
                  <div className="border-b border-white/10 px-5 py-4 sm:px-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                      Cycle du cash
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">
                      Signé n’est pas encaissé
                    </h2>
                  </div>
                  <div className="grid gap-px bg-white/10 sm:grid-cols-3">
                    <div className="bg-[#0d1422] p-5 sm:p-6">
                      <p className="text-xs uppercase tracking-wider text-white/40">
                        CA signé
                      </p>
                      <p className="mt-2 text-3xl font-semibold">
                        {euro.format(data.cash.signedRevenue)}
                      </p>
                      <p className="mt-2 text-xs text-white/35">
                        Valeur contractuelle brute
                      </p>
                    </div>
                    <div className="bg-emerald-400/[0.045] p-5 sm:p-6">
                      <p className="text-xs uppercase tracking-wider text-emerald-200/60">
                        CA encaissé net
                      </p>
                      <p className="mt-2 text-3xl font-semibold text-emerald-300">
                        {euro.format(data.cash.netCollected)}
                      </p>
                      <p className="mt-2 text-xs text-white/35">
                        Après remboursements
                      </p>
                    </div>
                    <div className="bg-amber-400/[0.045] p-5 sm:p-6">
                      <p className="text-xs uppercase tracking-wider text-amber-200/60">
                        Reste à encaisser
                      </p>
                      <p className="mt-2 text-3xl font-semibold text-amber-200">
                        {euro.format(data.cash.remaining)}
                      </p>
                      <p className="mt-2 text-xs text-white/35">
                        À sécuriser dans le temps
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                    <div>
                      <div className="mb-2 flex justify-between text-sm">
                        <span className="text-white/55">
                          Progression d’encaissement
                        </span>
                        <span className="font-semibold text-emerald-300">
                          {data.cash.collectionRate} %
                        </span>
                      </div>
                      <Progress
                        value={data.cash.collectionRate}
                        tone="bg-emerald-400"
                      />
                      <p className="mt-3 text-xs text-white/35">
                        Encaissé brut :{" "}
                        {euro.format(data.cash.collectedRevenue)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] p-4">
                        <p className="text-xs text-rose-200/60">
                          Remboursements
                        </p>
                        <p className="mt-1 text-xl font-semibold text-rose-200">
                          {euro.format(data.cash.refunds)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-orange-400/15 bg-orange-400/[0.05] p-4">
                        <p className="text-xs text-orange-200/60">Impayés</p>
                        <p className="mt-1 text-xl font-semibold text-orange-200">
                          {euro.format(data.cash.unpaid)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-indigo-400/15 bg-[linear-gradient(145deg,rgba(79,70,229,.16),rgba(13,20,34,.9)_55%)] p-5 sm:p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-200/70">
                    Commission estimée
                  </p>
                  <p className="mt-4 text-4xl font-semibold tracking-tight">
                    {euro.format(data.commission.estimated)}
                  </p>
                  <p className="mt-2 text-sm text-white/45">
                    {data.commission.rate} % du CA encaissé net
                  </p>
                  <div className="my-6 h-px bg-white/10" />
                  <p className="text-xs leading-5 text-white/40">
                    Les remboursements réduisent automatiquement la base de
                    commission. Le CA non encaissé n’est pas commissionné.
                  </p>
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
                <div className="rounded-3xl border border-white/10 bg-[#0d1422] p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-300">
                        Coaching
                      </p>
                      <h2 className="mt-1 text-xl font-semibold">
                        Objections les plus fréquentes
                      </h2>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/40">
                      comptes-rendus
                    </span>
                  </div>
                  <div className="mt-6 space-y-4">
                    {data.objections.length ? (
                      data.objections.map((objection, index) => (
                        <div key={objection.label}>
                          <div className="mb-2 flex items-center justify-between text-sm">
                            <span className="flex items-center gap-3 text-white/70">
                              <span className="w-5 text-xs text-white/25">
                                0{index + 1}
                              </span>
                              {objection.label}
                            </span>
                            <span className="font-semibold">
                              {objection.count}
                            </span>
                          </div>
                          <Progress
                            value={(objection.count / maxObjection) * 100}
                            tone="bg-rose-400"
                          />
                        </div>
                      ))
                    ) : (
                      <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/35">
                        Ajoutez des comptes-rendus pour faire ressortir les
                        objections à travailler en coaching.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-[#0d1422] p-5 sm:p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300">
                    Aujourd’hui
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    Prochaines actions
                  </h2>
                  <div className="mt-5 space-y-3">
                    {[
                      ...data.tasks.map((task) => ({
                        id: task.id,
                        label: task.title,
                        meta: task.dueAt
                          ? compactDate.format(new Date(task.dueAt))
                          : "Sans échéance",
                        danger: task.overdue,
                        badge: task.priority,
                      })),
                      ...data.upcoming.map((appointment) => ({
                        id: appointment.id,
                        label: personName(appointment.lead),
                        meta: compactDate.format(
                          new Date(appointment.scheduledAt),
                        ),
                        danger: false,
                        badge: appointment.type,
                      })),
                    ]
                      .slice(0, 7)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3"
                        >
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${item.danger ? "bg-rose-400" : "bg-emerald-400"}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-white/75">
                              {item.label}
                            </p>
                            <p
                              className={`mt-0.5 text-xs ${item.danger ? "text-rose-300" : "text-white/35"}`}
                            >
                              {item.meta}
                            </p>
                          </div>
                          <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-white/45">
                            {item.badge}
                          </span>
                        </div>
                      ))}
                    {!data.tasks.length && !data.upcoming.length ? (
                      <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/35">
                        Aucune action urgente.
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#0d1422]">
                <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
                      Portefeuille
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">
                      Contrats et encaissements
                    </h2>
                  </div>
                  <p className="text-xs text-white/35">
                    Chaque euro est rapproché de son contrat.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="border-b border-white/[0.07] text-[10px] uppercase tracking-[0.16em] text-white/35">
                      <tr>
                        <th className="px-6 py-3 font-medium">Prospect</th>
                        <th className="px-4 py-3 font-medium">Signature</th>
                        <th className="px-4 py-3 text-right font-medium">
                          CA signé
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Encaissé
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Remboursé
                        </th>
                        <th className="px-6 py-3 text-right font-medium">
                          Reste
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {data.contracts.map((contract) => (
                        <tr
                          key={contract.id}
                          className="transition hover:bg-white/[0.025]"
                        >
                          <td className="px-6 py-4">
                            <p className="font-medium text-white/80">
                              {personName(contract.prospect)}
                            </p>
                            <p className="mt-0.5 text-xs text-white/30">
                              {contract.prospect?.email ||
                                contract.id.slice(0, 10)}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-white/45">
                            {compactDate.format(new Date(contract.signedAt))}
                          </td>
                          <td className="px-4 py-4 text-right font-medium">
                            {euro.format(contract.signed)}
                          </td>
                          <td className="px-4 py-4 text-right text-emerald-300">
                            {euro.format(contract.collected)}
                          </td>
                          <td className="px-4 py-4 text-right text-rose-300">
                            {euro.format(contract.refunded)}
                          </td>
                          <td className="px-6 py-4 text-right text-amber-200">
                            {euro.format(contract.remaining)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data.contracts.length ? (
                    <p className="p-8 text-center text-sm text-white/35">
                      Aucun contrat sur cette période.
                    </p>
                  ) : null}
                </div>
              </section>
            </div>
          )}
        </div>

        {panel && data ? (
          <ActionPanel
            panel={panel}
            data={data}
            currentCloser={currentCloser}
            onClose={() => setPanel(null)}
            onSaved={async () => {
              setPanel(null);
              await refreshAll();
            }}
          />
        ) : null}
      </main>
    </Guard>
  );
}

function ActionPanel({
  panel,
  data,
  currentCloser,
  onClose,
  onSaved,
}: {
  panel: Exclude<Panel, null>;
  data: CloserCockpit;
  currentCloser?: CloserListItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadId, setLeadId] = useState(data.leads[0]?.id ?? "");
  const selectedLead = data.leads.find((lead) => lead.id === leadId);
  const [appointmentId, setAppointmentId] = useState(
    selectedLead?.appointments[0]?.id ?? "",
  );
  const [outcome, setOutcome] = useState<ReportOutcome>("FOLLOW_UP");
  const [proposalMade, setProposalMade] = useState(true);
  const [objections, setObjections] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [contractId, setContractId] = useState(data.contracts[0]?.id ?? "");
  const [ledgerType, setLedgerType] = useState<LedgerType>("PAYMENT");
  const [ledgerStatus, setLedgerStatus] = useState<LedgerStatus>("PAID");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [occurredAt, setOccurredAt] = useState(isoDay(new Date()));
  const [commissionRate, setCommissionRate] = useState(
    String(
      currentCloser?.closerSettings?.commissionRate ?? data.commission.rate,
    ),
  );
  const [monthlyTarget, setMonthlyTarget] = useState(
    String(currentCloser?.closerSettings?.monthlyTarget ?? ""),
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (panel === "report") {
        if (!leadId) throw new Error("Sélectionnez un prospect.");
        await closerSpaceApi.createReport({
          closerId: data.closer.id,
          leadId,
          appointmentId: appointmentId || undefined,
          outcome,
          proposalMade,
          objections,
          notes: notes || undefined,
        });
      } else if (panel === "ledger") {
        const numericAmount = Number(amount);
        if (!numericAmount || numericAmount <= 0)
          throw new Error("Saisissez un montant positif.");
        const contract = data.contracts.find((item) => item.id === contractId);
        await closerSpaceApi.createLedgerEntry({
          closerId: data.closer.id,
          contractId,
          leadId: contract?.leadId || undefined,
          type: ledgerType,
          status: ledgerStatus,
          amount: numericAmount,
          label: label || undefined,
          occurredAt: `${occurredAt}T12:00:00.000Z`,
        });
      } else {
        await closerSpaceApi.updateSettings(data.closer.id, {
          commissionRate: Number(commissionRate),
          monthlyTarget: monthlyTarget ? Number(monthlyTarget) : undefined,
        });
      }
      await onSaved();
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  const titles = {
    report: ["Compte-rendu de closing", "Capitalisez sur chaque rendez-vous."],
    ledger: [
      "Mouvement financier",
      "Enregistrez un paiement, un impayé ou un remboursement.",
    ],
    settings: [
      "Règles de commission",
      "Définissez la base de calcul de ce closer.",
    ],
  } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/65 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <aside
        className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0b111d] p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-2xl font-semibold">{titles[panel][0]}</p>
            <p className="mt-2 text-sm text-white/45">{titles[panel][1]}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le panneau"
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-white/50 hover:bg-white/[0.06]"
          >
            ×
          </button>
        </div>
        <div className="my-6 h-px bg-white/10" />
        <form onSubmit={submit} className="space-y-5">
          {panel === "report" ? (
            <>
              <Field label="Prospect">
                <select
                  value={leadId}
                  onChange={(event) => {
                    setLeadId(event.target.value);
                    const lead = data.leads.find(
                      (item) => item.id === event.target.value,
                    );
                    setAppointmentId(lead?.appointments[0]?.id ?? "");
                  }}
                  className="field"
                >
                  {data.leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {personName(lead)} · {lead.stage.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Rendez-vous relié">
                <select
                  value={appointmentId}
                  onChange={(event) => setAppointmentId(event.target.value)}
                  className="field"
                >
                  <option value="">Sans rendez-vous relié</option>
                  {selectedLead?.appointments.map((appointment) => (
                    <option key={appointment.id} value={appointment.id}>
                      {appointment.type} ·{" "}
                      {compactDate.format(new Date(appointment.scheduledAt))} ·{" "}
                      {appointment.status}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Issue du rendez-vous">
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ["FOLLOW_UP", "À relancer"],
                      ["WON", "Gagné"],
                      ["LOST", "Perdu"],
                      ["NOT_QUALIFIED", "Non qualifié"],
                    ] as const
                  ).map(([value, text]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setOutcome(value)}
                      className={`rounded-xl border px-3 py-2.5 text-sm ${outcome === value ? "border-indigo-400/50 bg-indigo-400/15 text-indigo-100" : "border-white/10 bg-white/[0.03] text-white/50"}`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </Field>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={proposalMade}
                  onChange={(event) => setProposalMade(event.target.checked)}
                  className="h-4 w-4 accent-indigo-500"
                />
                Une proposition commerciale a été faite
              </label>
              <Field label="Objections rencontrées">
                <div className="flex flex-wrap gap-2">
                  {OBJECTIONS.map((objection) => {
                    const selected = objections.includes(objection);
                    return (
                      <button
                        key={objection}
                        type="button"
                        onClick={() =>
                          setObjections(
                            selected
                              ? objections.filter((item) => item !== objection)
                              : [...objections, objection],
                          )
                        }
                        className={`rounded-full border px-3 py-2 text-xs ${selected ? "border-rose-400/40 bg-rose-400/15 text-rose-100" : "border-white/10 bg-white/[0.03] text-white/45"}`}
                      >
                        {objection}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={5}
                  className="field resize-none"
                  placeholder="Contexte, prochaine étape, verbatim utile…"
                />
              </Field>
            </>
          ) : null}

          {panel === "ledger" ? (
            <>
              <Field label="Contrat">
                <select
                  value={contractId}
                  onChange={(event) => setContractId(event.target.value)}
                  className="field"
                >
                  {data.contracts.map((contract) => (
                    <option key={contract.id} value={contract.id}>
                      {personName(contract.prospect)} ·{" "}
                      {euro.format(contract.signed)}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nature">
                  <select
                    value={ledgerType}
                    onChange={(event) =>
                      setLedgerType(event.target.value as LedgerType)
                    }
                    className="field"
                  >
                    <option value="PAYMENT">Paiement</option>
                    <option value="REFUND">Remboursement</option>
                  </select>
                </Field>
                <Field label="Statut">
                  <select
                    value={ledgerStatus}
                    onChange={(event) =>
                      setLedgerStatus(event.target.value as LedgerStatus)
                    }
                    className="field"
                  >
                    <option value="PAID">Payé</option>
                    <option value="PENDING">En attente</option>
                    <option value="OVERDUE">Impayé / en retard</option>
                    <option value="FAILED">Échoué</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Montant (€)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="field"
                    placeholder="1 500"
                  />
                </Field>
                <Field label="Date">
                  <input
                    type="date"
                    value={occurredAt}
                    onChange={(event) => setOccurredAt(event.target.value)}
                    className="field"
                  />
                </Field>
              </div>
              <Field label="Libellé">
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="field"
                  placeholder="Virement, mensualité 2/6…"
                />
              </Field>
            </>
          ) : null}

          {panel === "settings" ? (
            <>
              <div className="rounded-2xl border border-indigo-400/15 bg-indigo-400/[0.06] p-4 text-sm leading-6 text-indigo-100/70">
                La commission estimée est calculée sur le CA encaissé net :
                paiements reçus moins remboursements.
              </div>
              <Field label="Taux de commission (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={commissionRate}
                  onChange={(event) => setCommissionRate(event.target.value)}
                  className="field"
                />
              </Field>
              <Field label="Objectif mensuel encaissé (€)">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={monthlyTarget}
                  onChange={(event) => setMonthlyTarget(event.target.value)}
                  className="field"
                  placeholder="50 000"
                />
              </Field>
            </>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-100">
              {error}
            </p>
          ) : null}
          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm text-white/55 hover:bg-white/[0.05]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy}
              className="flex-1 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50"
            >
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
      {label}
      {children}
    </label>
  );
}
