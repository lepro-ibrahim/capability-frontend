"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Guard from "@/components/Guard";
import api from "@/lib/api";
import {
  getIntegrationHub,
  IntegrationCatalogItem,
  IntegrationConnection,
  startIntegrationOAuth,
} from "@/lib/integrationHub";

type Role = "ADMIN" | "CLOSER" | "SETTER";
type Me = { userId?: string; id?: string; role: Role; email: string };

const CATEGORY_LABELS: Record<string, string> = {
  ALL: "Toutes",
  CALENDAR: "Calendriers",
  MEETING: "Visioconférence",
  CRM: "CRM & tunnels",
  AUTOMATION: "Automatisation",
  COACHING: "Coaching",
  PAYMENT: "Paiements",
};

const PROVIDER_STYLE: Record<string, { mark: string; color: string }> = {
  FATHOM: { mark: "F", color: "from-violet-500 to-fuchsia-500" },
  GOOGLE_CALENDAR: { mark: "31", color: "from-blue-500 to-cyan-400" },
  ZOOM: { mark: "Z", color: "from-blue-600 to-indigo-500" },
  SYSTEME_IO: { mark: "S", color: "from-emerald-500 to-teal-400" },
  ZAPIER: { mark: "_", color: "from-orange-500 to-amber-400" },
  MAKE: { mark: "M", color: "from-purple-600 to-pink-500" },
  GOHIGHLEVEL: { mark: "G", color: "from-sky-500 to-blue-600" },
  CALENDLY: { mark: "C", color: "from-blue-500 to-blue-700" },
  STRIPE: { mark: "S", color: "from-indigo-500 to-violet-600" },
};

function ProviderMark({ provider, compact = false }: { provider: string; compact?: boolean }) {
  const style = PROVIDER_STYLE[provider] ?? {
    mark: provider.slice(0, 1),
    color: "from-slate-500 to-slate-700",
  };
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${style.color} font-black text-white shadow-lg ${
        compact ? "h-10 w-10 text-sm" : "h-14 w-14 text-lg"
      }`}
      aria-hidden="true"
    >
      {style.mark}
    </span>
  );
}

function StatusBadge({ connection }: { connection?: IntegrationConnection }) {
  if (!connection) {
    return (
      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-[--muted]">
        Non connectée
      </span>
    );
  }
  const error = connection.status === "ERROR";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        error
          ? "border-rose-400/25 bg-rose-400/10 text-rose-300"
          : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${error ? "bg-rose-400" : "bg-emerald-400"}`} />
      {error ? "À vérifier" : "Connectée"}
    </span>
  );
}

function IntegrationPageContent() {
  const searchParams = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [catalog, setCatalog] = useState<IntegrationCatalogItem[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [category, setCategory] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<IntegrationCatalogItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    searchParams.get("connected") ? "Connexion réussie. Votre outil est prêt à être synchronisé." : null,
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [hub, meResponse] = await Promise.all([
        getIntegrationHub(),
        api.get<Me>("/auth/me"),
      ]);
      setCatalog(hub.catalog);
      setConnections(hub.connections);
      setMe(meResponse.data);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Chargement impossible";
      setError(message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connectionByProvider = useMemo(
    () => new Map(connections.map((item) => [item.provider, item])),
    [connections],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return catalog.filter(
      (item) =>
        (category === "ALL" || item.category === category) &&
        (!normalized ||
          item.name.toLowerCase().includes(normalized) ||
          item.description.toLowerCase().includes(normalized)),
    );
  }, [catalog, category, query]);

  async function connect(item: IntegrationCatalogItem) {
    setError(null);
    if (item.provider === "GOHIGHLEVEL") {
      window.location.href = "/integrations/automatisations";
      return;
    }
    if (item.authType === "OAUTH") {
      if (!item.configured) {
        setError(`${item.name} nécessite d’abord les identifiants OAuth de l’entreprise.`);
        return;
      }
      setBusy(item.provider);
      try {
        window.location.href = await startIntegrationOAuth(item.provider);
      } catch (caught: unknown) {
        const responseMessage = (caught as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setError(responseMessage ?? `Connexion ${item.name} impossible.`);
        setBusy(null);
      }
      return;
    }
    setSelected(item);
  }

  async function disconnect(connection: IntegrationConnection) {
    if (!window.confirm(`Déconnecter ${connection.provider} ?`)) return;
    setBusy(connection.provider);
    setError(null);
    try {
      await api.delete(`/integration-hub/connections/${connection.id}`);
      setNotice("La connexion a été supprimée.");
      await load();
    } catch (caught: unknown) {
      const responseMessage = (caught as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(responseMessage ?? "Déconnexion impossible.");
    } finally {
      setBusy(null);
    }
  }

  async function testConnection(connection: IntegrationConnection) {
    setBusy(connection.provider);
    setError(null);
    try {
      await api.post(`/integration-hub/connections/${connection.id}/test`);
      setNotice("Connexion vérifiée avec succès.");
      await load();
    } catch (caught: unknown) {
      const responseMessage = (caught as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(responseMessage ?? "Le test de connexion a échoué.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1480px]">
        <header className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(120deg,rgba(79,70,229,.18),rgba(14,165,233,.06)_45%,rgba(16,185,129,.12))] p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-indigo-300/15" />
          <div className="pointer-events-none absolute -right-2 -top-8 h-40 w-40 rounded-full border border-cyan-300/15" />
          <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">
                <span className="h-px w-7 bg-indigo-300/70" />
                Centre de connexions
              </div>
              <h1 className="max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
                Vos outils travaillent enfin dans le même espace.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[--muted] sm:text-base">
                Reliez les appels, agendas, tunnels et automatisations. Capability conserve une vue claire de chaque synchronisation.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                <div className="text-2xl font-black">{connections.length}</div>
                <div className="text-xs text-[--muted]">connexions</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                <div className="text-2xl font-black text-emerald-300">
                  {connections.filter((item) => item.status === "CONNECTED").length}
                </div>
                <div className="text-xs text-[--muted]">actives</div>
              </div>
              <div className="col-span-2 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 sm:col-span-1">
                <div className="text-2xl font-black">{catalog.filter((item) => item.available).length}</div>
                <div className="text-xs text-[--muted]">disponibles</div>
              </div>
            </div>
          </div>
        </header>

        {(error || notice) && (
          <div
            className={`mt-5 flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm ${
              error
                ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
                : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
            }`}
          >
            <span>{error ?? notice}</span>
            <button type="button" onClick={() => { setError(null); setNotice(null); }} aria-label="Fermer">×</button>
          </div>
        )}

        {connections.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">En service</p>
                <h2 className="mt-1 text-xl font-bold">Connexions actives</h2>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {connections.map((connection) => (
                <article key={connection.id} className="card flex items-center gap-4 !p-4">
                  <ProviderMark provider={connection.provider} compact />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">
                        {catalog.find((item) => item.provider === connection.provider)?.name ?? connection.provider}
                      </h3>
                      <StatusBadge connection={connection} />
                      {connection.scope === "WORKSPACE" && (
                        <span className="rounded-full bg-indigo-400/10 px-2 py-1 text-[10px] font-semibold text-indigo-300">Équipe</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-[--muted]">
                      {connection.accountEmail ?? connection.displayName ?? connection.user.email}
                      {connection.lastSyncedAt
                        ? ` · synchronisée ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(connection.lastSyncedAt))}`
                        : " · prête à synchroniser"}
                    </p>
                    {connection.lastError && <p className="mt-1 text-xs text-rose-300">{connection.lastError}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {(connection.user.id === (me?.userId ?? me?.id) || me?.role === "ADMIN") && (
                      <>
                        <button
                          type="button"
                          className="btn !px-3 !py-2 text-xs"
                          onClick={() => void testConnection(connection)}
                          disabled={busy === connection.provider}
                        >
                          Tester
                        </button>
                      <button
                        type="button"
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs text-[--muted] transition hover:border-rose-400/30 hover:text-rose-300"
                        onClick={() => void disconnect(connection)}
                        disabled={busy === connection.provider}
                      >
                        Déconnecter
                      </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="mt-10">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-300">Catalogue</p>
              <h2 className="mt-1 text-2xl font-black">Ajouter une connexion</h2>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1">
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setCategory(key)}
                    className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      category === key ? "bg-indigo-500 text-white shadow-lg" : "text-[--muted] hover:bg-white/5 hover:text-[--text]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="relative block">
                <span className="sr-only">Rechercher une intégration</span>
                <input
                  className="field min-w-64 !pl-10"
                  placeholder="Rechercher un outil…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[--muted]">⌕</span>
              </label>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => {
              const connection = connectionByProvider.get(item.provider);
              return (
                <article
                  key={item.provider}
                  className="group relative min-h-64 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.035] p-5 transition hover:-translate-y-0.5 hover:border-indigo-300/25 hover:bg-white/[0.055] hover:shadow-2xl"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent opacity-0 transition group-hover:opacity-100" />
                  <div className="flex items-start justify-between gap-3">
                    <ProviderMark provider={item.provider} />
                    <StatusBadge connection={connection} />
                  </div>
                  <div className="mt-5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black">{item.name}</h3>
                      {!item.available && (
                        <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-[--muted]">Bientôt</span>
                      )}
                    </div>
                    <p className="mt-2 min-h-12 text-sm leading-6 text-[--muted]">{item.description}</p>
                  </div>
                  <div className="absolute inset-x-5 bottom-5 flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/35">
                      {item.authType === "OAUTH" ? "Connexion sécurisée" : item.authType === "API_KEY" ? "Clé API chiffrée" : "Webhook"}
                    </span>
                    <button
                      type="button"
                      className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                        item.available
                          ? "bg-white text-slate-950 hover:bg-indigo-100"
                          : "cursor-not-allowed border border-white/10 text-white/30"
                      }`}
                      disabled={!item.available || busy === item.provider}
                      onClick={() => void connect(item)}
                    >
                      {connection ? "Configurer" : busy === item.provider ? "Connexion…" : "Connecter"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      {selected && (
        <ConnectionDialog
          item={selected}
          isAdmin={me?.role === "ADMIN"}
          onClose={() => setSelected(null)}
          onConnected={async () => {
            setSelected(null);
            setNotice(`${selected.name} est maintenant connecté.`);
            await load();
          }}
        />
      )}
    </main>
  );
}

function ConnectionDialog({
  item,
  isAdmin,
  onClose,
  onConnected,
}: {
  item: IntegrationCatalogItem;
  isAdmin: boolean;
  onClose: () => void;
  onConnected: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [outboundWebhookUrl, setOutboundWebhookUrl] = useState("");
  const [scope, setScope] = useState<"USER" | "WORKSPACE">("USER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/integration-hub/connections", {
        provider: item.provider,
        displayName: displayName || undefined,
        accountEmail: accountEmail || undefined,
        secret: secret || undefined,
        outboundWebhookUrl: outboundWebhookUrl || undefined,
        scope,
      });
      await onConnected();
    } catch (caught: unknown) {
      const responseMessage = (caught as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(responseMessage) ? responseMessage.join(" · ") : responseMessage ?? "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  }

  const needsSecret = item.authType === "API_KEY";
  const needsWebhook = item.authType === "WEBHOOK";
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="connection-title">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Fermer" />
      <form onSubmit={submit} className="relative w-full max-w-lg rounded-[28px] border border-white/10 bg-[#111827] p-6 shadow-2xl sm:p-7">
        <div className="flex items-start gap-4">
          <ProviderMark provider={item.provider} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-300">Nouvelle connexion</p>
            <h2 id="connection-title" className="mt-1 text-2xl font-black">Connecter {item.name}</h2>
            <p className="mt-2 text-sm leading-6 text-[--muted]">{item.description}</p>
          </div>
          <button type="button" className="rounded-full p-2 text-[--muted] hover:bg-white/5 hover:text-white" onClick={onClose} aria-label="Fermer">×</button>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="label">Nom de la connexion</span>
            <input className="field mt-1" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={`Ex. ${item.name} — Équipe commerciale`} />
          </label>
          {needsSecret && (
            <>
              <label className="block">
                <span className="label">Email du compte</span>
                <input type="email" className="field mt-1" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} placeholder="vous@entreprise.com" />
              </label>
              <label className="block">
                <span className="label">Clé API</span>
                <input type="password" required className="field mt-1" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="La clé sera chiffrée avant stockage" autoComplete="off" />
              </label>
            </>
          )}
          {needsWebhook && (
            <label className="block">
              <span className="label">URL du webhook de destination</span>
              <input type="url" className="field mt-1" value={outboundWebhookUrl} onChange={(event) => setOutboundWebhookUrl(event.target.value)} placeholder="https://hooks.make.com/…" />
              <span className="mt-1 block text-xs text-[--muted]">Capability créera aussi une URL entrante à copier dans {item.name}.</span>
            </label>
          )}
          {isAdmin && (
            <div>
              <span className="label">Portée</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  ["USER", "Personnelle", "Pour mon compte uniquement"],
                  ["WORKSPACE", "Équipe", "Partagée avec les utilisateurs"],
                ] as const).map(([value, title, description]) => (
                  <button key={value} type="button" onClick={() => setScope(value)} className={`rounded-2xl border p-3 text-left transition ${scope === value ? "border-indigo-400/50 bg-indigo-400/10" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"}`}>
                    <span className="block text-sm font-bold">{title}</span>
                    <span className="mt-1 block text-xs text-[--muted]">{description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
        <div className="mt-7 flex justify-end gap-3">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Connexion…" : "Connecter"}</button>
        </div>
      </form>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Guard>
      <IntegrationPageContent />
    </Guard>
  );
}
