"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Guard from "@/components/Guard";
import api from "@/lib/api";
import {
  teamAutomationsApi,
  type CreateTeamAutomationRuleInput,
  type RecipientStrategy,
  type TeamAutomationCatalog,
  type TeamAutomationRule,
  type TeamAutomationSummary,
  type TeamNotification,
  type TeamTask,
  type TeamTaskPriority,
  type TeamTaskStatus,
} from "@/lib/teamAutomations";

type Me = {
  userId: string;
  email: string;
  role: "ADMIN" | "SETTER" | "CLOSER";
};
type WorkspaceTab = "rules" | "tasks" | "notifications";

const EMPTY_SUMMARY: TeamAutomationSummary = {
  openTasks: 0,
  overdueTasks: 0,
  unreadNotifications: 0,
  activeRules: 0,
  runsToday: 0,
};

const PRIORITY_LABELS: Record<TeamTaskPriority, string> = {
  LOW: "Basse",
  NORMAL: "Normale",
  HIGH: "Haute",
  URGENT: "Urgente",
};

const RECIPIENT_LABELS: Record<RecipientStrategy, string> = {
  LEAD_SETTER: "Setter du prospect",
  LEAD_CLOSER: "Closer du prospect",
  ADMINS: "Administrateurs",
  SPECIFIC_USER: "Membre précis",
};

function humanizeStage(value: string) {
  const labels: Record<string, string> = {
    LEADS_RECEIVED: "Lead reçu",
    CALL_REQUESTED: "Demande d’appel",
    CALL_ATTEMPT: "Appel tenté",
    CALL_ANSWERED: "Appel répondu",
    FOLLOW_UP: "Relance setter",
    FOLLOW_UP_CLOSER: "Relance closer",
    RV0_PLANNED: "RV0 planifié",
    RV0_HONORED: "RV0 honoré",
    RV0_NO_SHOW: "RV0 no-show",
    RV1_PLANNED: "RDV closer planifié",
    RV1_HONORED: "RDV closer honoré",
    RV1_NO_SHOW: "RDV closer no-show",
    CONTRACT_SIGNED: "Contrat signé",
    WON: "Vente gagnée",
    LOST: "Perdu",
    NOT_QUALIFIED: "Non qualifié",
  };
  return labels[value] ?? value.replaceAll("_", " ").toLowerCase();
}

function errorMessage(error: unknown) {
  const candidate = error as {
    response?: { data?: { message?: string } };
    message?: string;
  };
  return (
    candidate.response?.data?.message ??
    candidate.message ??
    "Une erreur est survenue."
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Sans échéance";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isOverdue(task: TeamTask) {
  return (
    task.status === "TODO" &&
    Boolean(task.dueAt) &&
    new Date(task.dueAt as string).getTime() < Date.now()
  );
}

export default function AutomationsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("tasks");
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [rules, setRules] = useState<TeamAutomationRule[]>([]);
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [notifications, setNotifications] = useState<TeamNotification[]>([]);
  const [catalog, setCatalog] = useState<TeamAutomationCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const isAdmin = me?.role === "ADMIN";

  const refresh = useCallback(async (currentUser: Me) => {
    const common = [
      teamAutomationsApi.summary(),
      teamAutomationsApi.tasks(),
      teamAutomationsApi.notifications(),
    ] as const;
    if (currentUser.role === "ADMIN") {
      const [
        nextSummary,
        nextTasks,
        nextNotifications,
        nextRules,
        nextCatalog,
      ] = await Promise.all([
        ...common,
        teamAutomationsApi.rules(),
        teamAutomationsApi.catalog(),
      ]);
      setSummary(nextSummary);
      setTasks(nextTasks);
      setNotifications(nextNotifications);
      setRules(nextRules);
      setCatalog(nextCatalog);
      return;
    }
    const [nextSummary, nextTasks, nextNotifications] =
      await Promise.all(common);
    setSummary(nextSummary);
    setTasks(nextTasks);
    setNotifications(nextNotifications);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Me>("/auth/me")
      .then(async (response) => {
        if (cancelled) return;
        setMe(response.data);
        setActiveTab(response.data.role === "ADMIN" ? "rules" : "tasks");
        await refresh(response.data);
      })
      .catch((nextError: unknown) => {
        if (!cancelled) setError(errorMessage(nextError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function reload() {
    if (!me) return;
    setError(null);
    await refresh(me).catch((nextError: unknown) =>
      setError(errorMessage(nextError)),
    );
  }

  async function createFromTemplate(key: string) {
    if (!me) return;
    setBusyId(key);
    setError(null);
    try {
      await teamAutomationsApi.createFromTemplate(key);
      await refresh(me);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleRule(rule: TeamAutomationRule) {
    if (!me) return;
    setBusyId(rule.id);
    try {
      await teamAutomationsApi.updateRule(rule.id, {
        status: rule.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
      });
      await refresh(me);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusyId(null);
    }
  }

  async function updateTask(id: string, status: TeamTaskStatus) {
    if (!me) return;
    setBusyId(id);
    try {
      await teamAutomationsApi.updateTask(id, status);
      await refresh(me);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusyId(null);
    }
  }

  async function readNotification(id: string) {
    if (!me) return;
    setBusyId(id);
    try {
      await teamAutomationsApi.markNotificationRead(id);
      await refresh(me);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusyId(null);
    }
  }

  async function readAllNotifications() {
    if (!me) return;
    setBusyId("read-all");
    try {
      await teamAutomationsApi.markAllNotificationsRead();
      await refresh(me);
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setBusyId(null);
    }
  }

  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === "TODO"),
    [tasks],
  );
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === "DONE"),
    [tasks],
  );

  return (
    <Guard>
      <main className="min-h-screen bg-[#070b14] text-white">
        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_20%_0%,rgba(99,102,241,.22),transparent_42%),radial-gradient(circle_at_85%_5%,rgba(16,185,129,.14),transparent_35%)]" />
          <div className="relative mx-auto max-w-[1500px] px-5 py-8 lg:px-10">
            <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,.8)]" />
                  Centre d’automatisation
                </div>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Chaque événement déclenche la bonne action.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
                  Transformez les changements du pipeline en tâches,
                  notifications et webhooks sans laisser un prospect se perdre.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void reload()}
                  className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm text-white/75 transition hover:bg-white/10"
                >
                  Actualiser
                </button>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setComposerOpen(true)}
                    className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold shadow-[0_10px_35px_rgba(99,102,241,.35)] transition hover:bg-indigo-400"
                  >
                    + Nouvelle règle
                  </button>
                ) : null}
              </div>
            </header>

            <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                label="Règles actives"
                value={summary.activeRules}
                accent="indigo"
                hidden={!isAdmin}
              />
              <SummaryCard
                label="Exécutions aujourd’hui"
                value={summary.runsToday}
                accent="cyan"
                hidden={!isAdmin}
              />
              <SummaryCard
                label="Tâches ouvertes"
                value={summary.openTasks}
                accent="emerald"
              />
              <SummaryCard
                label="Tâches en retard"
                value={summary.overdueTasks}
                accent="rose"
              />
              <SummaryCard
                label="Notifications non lues"
                value={summary.unreadNotifications}
                accent="amber"
              />
            </section>

            {error ? (
              <div
                className="mt-5 flex items-center justify-between rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"
                role="alert"
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="text-rose-200/70 hover:text-white"
                >
                  ×
                </button>
              </div>
            ) : null}

            <section className="mt-7 overflow-hidden rounded-3xl border border-white/10 bg-[#0b1120]/90 shadow-2xl shadow-black/25 backdrop-blur-xl">
              <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-4 pt-3">
                {isAdmin ? (
                  <TabButton
                    active={activeTab === "rules"}
                    onClick={() => setActiveTab("rules")}
                  >
                    Règles <span>{rules.length}</span>
                  </TabButton>
                ) : null}
                <TabButton
                  active={activeTab === "tasks"}
                  onClick={() => setActiveTab("tasks")}
                >
                  Tâches <span>{summary.openTasks}</span>
                </TabButton>
                <TabButton
                  active={activeTab === "notifications"}
                  onClick={() => setActiveTab("notifications")}
                >
                  Notifications <span>{summary.unreadNotifications}</span>
                </TabButton>
              </div>

              {loading ? (
                <div className="grid min-h-80 place-items-center text-sm text-white/45">
                  Chargement de l’espace d’automatisation…
                </div>
              ) : null}

              {!loading && activeTab === "rules" && isAdmin ? (
                <RulesPanel
                  rules={rules}
                  catalog={catalog}
                  busyId={busyId}
                  onToggle={toggleRule}
                  onCreateTemplate={createFromTemplate}
                  onCreateCustom={() => setComposerOpen(true)}
                />
              ) : null}

              {!loading && activeTab === "tasks" ? (
                <TasksPanel
                  openTasks={openTasks}
                  completedTasks={completedTasks}
                  busyId={busyId}
                  onUpdate={updateTask}
                />
              ) : null}

              {!loading && activeTab === "notifications" ? (
                <NotificationsPanel
                  notifications={notifications}
                  busyId={busyId}
                  onRead={readNotification}
                  onReadAll={readAllNotifications}
                />
              ) : null}
            </section>
          </div>
        </div>

        {isAdmin && catalog ? (
          <RuleComposer
            open={composerOpen}
            catalog={catalog}
            onClose={() => setComposerOpen(false)}
            onSave={async (input) => {
              if (!me) return;
              await teamAutomationsApi.createRule(input);
              await refresh(me);
              setComposerOpen(false);
            }}
          />
        ) : null}
      </main>
    </Guard>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  hidden = false,
}: {
  label: string;
  value: number;
  accent: "indigo" | "cyan" | "emerald" | "rose" | "amber";
  hidden?: boolean;
}) {
  if (hidden) return null;
  const colors = {
    indigo: "from-indigo-500/20 text-indigo-200",
    cyan: "from-cyan-500/20 text-cyan-200",
    emerald: "from-emerald-500/20 text-emerald-200",
    rose: "from-rose-500/20 text-rose-200",
    amber: "from-amber-500/20 text-amber-200",
  };
  return (
    <article
      className={`rounded-2xl border border-white/10 bg-gradient-to-br ${colors[accent]} to-white/[0.025] p-4`}
    >
      <p className="text-xs text-white/50">{label}</p>
      <strong className="mt-2 block text-3xl font-semibold tracking-tight">
        {value}
      </strong>
    </article>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition ${
        active
          ? "border-indigo-400 text-white"
          : "border-transparent text-white/45 hover:text-white/75"
      }`}
    >
      {children}
    </button>
  );
}

function RulesPanel({
  rules,
  catalog,
  busyId,
  onToggle,
  onCreateTemplate,
  onCreateCustom,
}: {
  rules: TeamAutomationRule[];
  catalog: TeamAutomationCatalog | null;
  busyId: string | null;
  onToggle: (rule: TeamAutomationRule) => Promise<void>;
  onCreateTemplate: (key: string) => Promise<void>;
  onCreateCustom: () => void;
}) {
  return (
    <div className="p-5 lg:p-7">
      {catalog?.templates.length ? (
        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">
                Démarrage rapide
              </p>
              <h2 className="mt-1 text-xl font-semibold">
                Modèles recommandés
              </h2>
            </div>
            <button
              type="button"
              onClick={onCreateCustom}
              className="text-sm text-indigo-300 hover:text-indigo-200"
            >
              Construire une règle sur mesure →
            </button>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {catalog.templates.map((template) => (
              <article
                key={template.key}
                className="flex min-h-52 flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:-translate-y-0.5 hover:border-indigo-400/30 hover:bg-white/[0.055]"
              >
                <div className="mb-4 grid h-9 w-9 place-items-center rounded-xl bg-indigo-400/15 text-indigo-300">
                  ↯
                </div>
                <h3 className="font-semibold">{template.name}</h3>
                <p className="mt-2 flex-1 text-xs leading-5 text-white/45">
                  {template.description}
                </p>
                <div className="mt-3 text-[11px] text-white/35">
                  Quand :{" "}
                  {template.triggerConfig.toStages
                    .map(humanizeStage)
                    .join(", ")}
                </div>
                <button
                  type="button"
                  disabled={busyId === template.key}
                  onClick={() => void onCreateTemplate(template.key)}
                  className="mt-4 rounded-xl border border-indigo-400/25 bg-indigo-400/10 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-400/20 disabled:opacity-50"
                >
                  {busyId === template.key
                    ? "Activation…"
                    : "Activer ce modèle"}
                </button>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-9">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              En production
            </p>
            <h2 className="mt-1 text-xl font-semibold">Vos règles</h2>
          </div>
          <span className="text-xs text-white/35">
            {rules.filter((rule) => rule.status === "ACTIVE").length} actives
          </span>
        </div>
        {!rules.length ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center">
            <p className="font-medium">Aucune règle active pour le moment.</p>
            <p className="mt-2 text-sm text-white/40">
              Choisissez un modèle ou construisez votre première automatisation.
            </p>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-white/8 rounded-2xl border border-white/10 bg-white/[0.025]">
            {rules.map((rule) => {
              const lastRun = rule.runs[0];
              return (
                <article
                  key={rule.id}
                  className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${rule.status === "ACTIVE" ? "bg-emerald-400" : "bg-white/25"}`}
                      />
                      <h3 className="truncate font-semibold">{rule.name}</h3>
                      <span className="rounded-full bg-white/7 px-2 py-0.5 text-[10px] text-white/45">
                        {rule.triggerConfig.toStages
                          ?.map(humanizeStage)
                          .join(", ") || "Changement d’étape"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-white/40">
                      {rule.description || "Règle d’automatisation d’équipe"}
                    </p>
                  </div>
                  <div className="flex gap-5 text-center text-xs text-white/45">
                    <div>
                      <b className="block text-base text-white/85">
                        {rule._count.runs}
                      </b>
                      exécutions
                    </div>
                    <div>
                      <b className="block text-base text-white/85">
                        {rule._count.tasks}
                      </b>
                      tâches
                    </div>
                    <div>
                      <b className="block text-base text-white/85">
                        {rule._count.notifications}
                      </b>
                      notifications
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3">
                    <span
                      className={`text-[11px] ${lastRun?.status === "FAILED" ? "text-rose-300" : "text-white/35"}`}
                    >
                      {lastRun
                        ? `${lastRun.status === "SUCCESS" ? "Dernier succès" : "Dernière exécution"} · ${formatDate(lastRun.startedAt)}`
                        : "Jamais exécutée"}
                    </span>
                    <button
                      type="button"
                      aria-label={`${rule.status === "ACTIVE" ? "Mettre en pause" : "Activer"} ${rule.name}`}
                      disabled={busyId === rule.id}
                      onClick={() => void onToggle(rule)}
                      className={`relative h-7 w-12 rounded-full transition ${rule.status === "ACTIVE" ? "bg-emerald-500" : "bg-white/15"}`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${rule.status === "ACTIVE" ? "left-6" : "left-1"}`}
                      />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TasksPanel({
  openTasks,
  completedTasks,
  busyId,
  onUpdate,
}: {
  openTasks: TeamTask[];
  completedTasks: TeamTask[];
  busyId: string | null;
  onUpdate: (id: string, status: TeamTaskStatus) => Promise<void>;
}) {
  return (
    <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,.6fr)] lg:p-7">
      <section>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">
              À traiter
            </p>
            <h2 className="mt-1 text-xl font-semibold">Tâches ouvertes</h2>
          </div>
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
            {openTasks.length} en cours
          </span>
        </div>
        <div className="mt-4 space-y-3">
          {!openTasks.length ? (
            <div className="rounded-2xl border border-dashed border-white/15 px-6 py-14 text-center text-sm text-white/45">
              Aucune tâche ouverte. Votre file est à jour.
            </div>
          ) : (
            openTasks.map((task) => (
              <article
                key={task.id}
                className={`rounded-2xl border p-4 ${isOverdue(task) ? "border-rose-400/25 bg-rose-400/[0.06]" : "border-white/10 bg-white/[0.03]"}`}
              >
                <div className="flex gap-3">
                  <button
                    type="button"
                    aria-label={`Terminer ${task.title}`}
                    disabled={busyId === task.id}
                    onClick={() => void onUpdate(task.id, "DONE")}
                    className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-white/20 transition hover:border-emerald-400 hover:bg-emerald-400/15"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{task.title}</h3>
                      <PriorityBadge priority={task.priority} />
                      {isOverdue(task) ? (
                        <span className="text-[10px] font-semibold uppercase text-rose-300">
                          En retard
                        </span>
                      ) : null}
                    </div>
                    {task.description ? (
                      <p className="mt-1 text-sm text-white/45">
                        {task.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/35">
                      <span>Échéance : {formatDate(task.dueAt)}</span>
                      <span>
                        Assignée à {task.assignee.firstName}{" "}
                        {task.assignee.lastName ?? ""}
                      </span>
                      {task.lead ? (
                        <span>
                          Prospect : {task.lead.firstName}{" "}
                          {task.lead.lastName ?? ""}
                        </span>
                      ) : null}
                      {task.rule ? <span>Via {task.rule.name}</span> : null}
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
      <aside>
        <p className="text-xs uppercase tracking-[0.18em] text-white/35">
          Historique
        </p>
        <h2 className="mt-1 text-xl font-semibold">Terminées</h2>
        <div className="mt-4 space-y-2">
          {!completedTasks.length ? (
            <p className="text-sm text-white/35">Aucune tâche terminée.</p>
          ) : (
            completedTasks.slice(0, 12).map((task) => (
              <div
                key={task.id}
                className="rounded-xl border border-white/8 bg-white/[0.02] p-3"
              >
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400">✓</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white/60 line-through">
                      {task.title}
                    </p>
                    <p className="mt-1 text-[10px] text-white/25">
                      {task.assignee.firstName}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === task.id}
                    onClick={() => void onUpdate(task.id, "TODO")}
                    className="text-[10px] text-indigo-300 hover:text-indigo-200"
                  >
                    Rouvrir
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: TeamTaskPriority }) {
  const styles: Record<TeamTaskPriority, string> = {
    LOW: "bg-white/7 text-white/40",
    NORMAL: "bg-cyan-400/10 text-cyan-200",
    HIGH: "bg-amber-400/10 text-amber-200",
    URGENT: "bg-rose-400/10 text-rose-200",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] ${styles[priority]}`}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function NotificationsPanel({
  notifications,
  busyId,
  onRead,
  onReadAll,
}: {
  notifications: TeamNotification[];
  busyId: string | null;
  onRead: (id: string) => Promise<void>;
  onReadAll: () => Promise<void>;
}) {
  const unread = notifications.filter((item) => !item.readAt).length;
  return (
    <div className="p-5 lg:p-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-amber-300">
            Votre activité
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            Centre de notifications
          </h2>
        </div>
        {unread ? (
          <button
            type="button"
            disabled={busyId === "read-all"}
            onClick={() => void onReadAll()}
            className="text-sm text-indigo-300 hover:text-indigo-200"
          >
            Tout marquer comme lu
          </button>
        ) : null}
      </div>
      <div className="mt-5 divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/10">
        {!notifications.length ? (
          <div className="px-6 py-16 text-center text-sm text-white/40">
            Aucune notification pour le moment.
          </div>
        ) : (
          notifications.map((notification) => (
            <article
              key={notification.id}
              className={`flex gap-4 p-4 ${notification.readAt ? "bg-white/[0.015]" : "bg-indigo-400/[0.07]"}`}
            >
              <span
                className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${notification.readAt ? "bg-white/15" : "bg-indigo-400 shadow-[0_0_14px_rgba(129,140,248,.7)]"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">{notification.title}</h3>
                  <time className="text-[11px] text-white/30">
                    {formatDate(notification.createdAt)}
                  </time>
                </div>
                <p className="mt-1 text-sm leading-6 text-white/50">
                  {notification.message}
                </p>
                {notification.rule ? (
                  <p className="mt-2 text-[10px] uppercase tracking-wide text-white/25">
                    Automatisation : {notification.rule.name}
                  </p>
                ) : null}
              </div>
              {!notification.readAt ? (
                <button
                  type="button"
                  disabled={busyId === notification.id}
                  onClick={() => void onRead(notification.id)}
                  className="self-center rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/55 hover:bg-white/5"
                >
                  Marquer comme lue
                </button>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function RuleComposer({
  open,
  catalog,
  onClose,
  onSave,
}: {
  open: boolean;
  catalog: TeamAutomationCatalog;
  onClose: () => void;
  onSave: (input: CreateTeamAutomationRuleInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [toStage, setToStage] = useState("CALL_REQUESTED");
  const [source, setSource] = useState("");
  const [tag, setTag] = useState("");
  const [taskEnabled, setTaskEnabled] = useState(true);
  const [taskTitle, setTaskTitle] = useState("Contacter {{lead.firstName}}");
  const [taskAssignee, setTaskAssignee] =
    useState<RecipientStrategy>("LEAD_SETTER");
  const [taskUserId, setTaskUserId] = useState("");
  const [taskPriority, setTaskPriority] = useState<TeamTaskPriority>("HIGH");
  const [dueInMinutes, setDueInMinutes] = useState(15);
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [notificationTitle, setNotificationTitle] = useState("Action requise");
  const [notificationMessage, setNotificationMessage] = useState(
    "{{lead.firstName}} {{lead.lastName}} vient de changer d’étape.",
  );
  const [notificationRecipient, setNotificationRecipient] =
    useState<RecipientStrategy>("LEAD_SETTER");
  const [notificationUserId, setNotificationUserId] = useState("");
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit() {
    const actions: CreateTeamAutomationRuleInput["actions"] = [];
    if (taskEnabled) {
      actions.push({
        type: "CREATE_TASK",
        title: taskTitle,
        assignee: taskAssignee,
        userId: taskAssignee === "SPECIFIC_USER" ? taskUserId : undefined,
        dueInMinutes,
        priority: taskPriority,
      });
    }
    if (notificationEnabled) {
      actions.push({
        type: "SEND_NOTIFICATION",
        title: notificationTitle,
        message: notificationMessage,
        recipient: notificationRecipient,
        userId:
          notificationRecipient === "SPECIFIC_USER"
            ? notificationUserId
            : undefined,
      });
    }
    if (webhookEnabled)
      actions.push({ type: "OUTGOING_WEBHOOK", url: webhookUrl });
    if (!name.trim() || !toStage || !actions.length) {
      setError("Ajoutez un nom, une étape et au moins une action.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        trigger: "LEAD_STAGE_CHANGED",
        triggerConfig: {
          toStages: [toStage],
          sources: source.trim() ? [source.trim()] : undefined,
          tags: tag.trim() ? [tag.trim()] : undefined,
        },
        actions,
      });
    } catch (nextError) {
      setError(errorMessage(nextError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="automation-composer-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Fermer"
      />
      <section className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0b1120] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-white/10 bg-[#0b1120]/95 px-6 py-5 backdrop-blur-xl">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-300">
              Nouvelle règle
            </p>
            <h2
              id="automation-composer-title"
              className="mt-1 text-2xl font-semibold"
            >
              Quand ceci arrive, faites cela.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-xl text-white/55 hover:bg-white/10"
          >
            ×
          </button>
        </header>
        <div className="space-y-7 p-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom de la règle">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex. Relancer les nouveaux leads"
              />
            </Field>
            <Field label="Description">
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Objectif de cette automatisation"
              />
            </Field>
          </section>

          <section className="rounded-2xl border border-indigo-400/20 bg-indigo-400/[0.06] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">
              1 · Déclencheur
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="Quand le prospect passe à">
                <select
                  value={toStage}
                  onChange={(event) => setToStage(event.target.value)}
                >
                  {catalog.stages.map((stage) => (
                    <option key={stage} value={stage}>
                      {humanizeStage(stage)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Source spécifique (optionnel)">
                <input
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="Ex. Meta Ads"
                />
              </Field>
              <Field label="Tag spécifique (optionnel)">
                <input
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  placeholder="Ex. Webinaire"
                />
              </Field>
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
              2 · Actions
            </p>
            <div className="mt-4 space-y-3">
              <ActionBlock
                title="Créer une tâche"
                description="Ajoute automatiquement une action dans la file d’un membre."
                enabled={taskEnabled}
                onToggle={setTaskEnabled}
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Titre">
                    <input
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                    />
                  </Field>
                  <Field label="Assignée à">
                    <select
                      value={taskAssignee}
                      onChange={(event) =>
                        setTaskAssignee(event.target.value as RecipientStrategy)
                      }
                    >
                      {Object.entries(RECIPIENT_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  {taskAssignee === "SPECIFIC_USER" ? (
                    <Field label="Membre">
                      <select
                        value={taskUserId}
                        onChange={(event) => setTaskUserId(event.target.value)}
                      >
                        <option value="">Sélectionner</option>
                        {catalog.users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.firstName} {user.lastName ?? ""} · {user.role}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                  <Field label="Priorité">
                    <select
                      value={taskPriority}
                      onChange={(event) =>
                        setTaskPriority(event.target.value as TeamTaskPriority)
                      }
                    >
                      {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Échéance (minutes)">
                    <input
                      type="number"
                      min={0}
                      max={43200}
                      value={dueInMinutes}
                      onChange={(event) =>
                        setDueInMinutes(Number(event.target.value))
                      }
                    />
                  </Field>
                </div>
              </ActionBlock>

              <ActionBlock
                title="Envoyer une notification"
                description="Alerte le membre directement dans Capability."
                enabled={notificationEnabled}
                onToggle={setNotificationEnabled}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Titre">
                    <input
                      value={notificationTitle}
                      onChange={(event) =>
                        setNotificationTitle(event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Destinataire">
                    <select
                      value={notificationRecipient}
                      onChange={(event) =>
                        setNotificationRecipient(
                          event.target.value as RecipientStrategy,
                        )
                      }
                    >
                      {Object.entries(RECIPIENT_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  {notificationRecipient === "SPECIFIC_USER" ? (
                    <Field label="Membre">
                      <select
                        value={notificationUserId}
                        onChange={(event) =>
                          setNotificationUserId(event.target.value)
                        }
                      >
                        <option value="">Sélectionner</option>
                        {catalog.users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.firstName} {user.lastName ?? ""} · {user.role}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                  <Field label="Message">
                    <input
                      value={notificationMessage}
                      onChange={(event) =>
                        setNotificationMessage(event.target.value)
                      }
                    />
                  </Field>
                </div>
              </ActionBlock>

              <ActionBlock
                title="Appeler un webhook"
                description="Envoie l’événement vers Make, GHL, Slack ou un autre outil."
                enabled={webhookEnabled}
                onToggle={setWebhookEnabled}
              >
                <Field label="URL HTTPS publique">
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(event) => setWebhookUrl(event.target.value)}
                    placeholder="https://hook.eu2.make.com/…"
                  />
                </Field>
              </ActionBlock>
            </div>
          </section>

          <div className="rounded-xl border border-white/8 bg-white/[0.025] px-4 py-3 text-xs text-white/40">
            Variables disponibles :{" "}
            <code className="text-indigo-300">{"{{lead.firstName}}"}</code>,{" "}
            <code className="text-indigo-300">{"{{lead.lastName}}"}</code>,{" "}
            <code className="text-indigo-300">{"{{lead.source}}"}</code> et{" "}
            <code className="text-indigo-300">{"{{lead.stage}}"}</code>.
          </div>
          {error ? (
            <p className="text-sm text-rose-300" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-white/10 bg-[#0b1120]/95 px-6 py-4 backdrop-blur-xl">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-white/60 hover:bg-white/5"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50"
          >
            {saving ? "Activation…" : "Activer la règle"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <label className="grid gap-1.5 text-xs text-white/50">
      <span>{label}</span>
      <span className="[&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-white/10 [&_input]:bg-black/20 [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-sm [&_input]:text-white [&_input]:outline-none [&_input]:transition [&_input]:focus:border-indigo-400/60 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-white/10 [&_select]:bg-[#101827] [&_select]:px-3 [&_select]:py-2.5 [&_select]:text-sm [&_select]:text-white [&_select]:outline-none">
        {children}
      </span>
    </label>
  );
}

function ActionBlock({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border p-4 transition ${enabled ? "border-emerald-400/20 bg-emerald-400/[0.04]" : "border-white/8 bg-white/[0.02]"}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-xs text-white/40">{description}</p>
        </div>
        <button
          type="button"
          aria-pressed={enabled}
          onClick={() => onToggle(!enabled)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? "bg-emerald-500" : "bg-white/15"}`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${enabled ? "left-6" : "left-1"}`}
          />
        </button>
      </div>
      {enabled ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}
