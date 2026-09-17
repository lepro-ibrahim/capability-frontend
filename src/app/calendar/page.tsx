"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Guard from "@/components/Guard";
import api from "@/lib/api";
import {
  addDays,
  AvailabilityRule,
  BookingEventType,
  CalendarAppointment,
  getCalendarOverview,
  getCalendarRange,
  startOfWeek,
} from "@/lib/calendar";
import { IntegrationConnection } from "@/lib/integrationHub";

type Role = "ADMIN" | "CLOSER" | "SETTER";
type Me = { userId: string; email: string; role: Role };
type TeamUser = {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  role: Role;
  isActive: boolean;
};
type Tab = "AGENDA" | "EVENT_TYPES" | "AVAILABILITY";

const DAY_LABELS: Record<AvailabilityRule["day"], string> = {
  MON: "Lundi",
  TUE: "Mardi",
  WED: "Mercredi",
  THU: "Jeudi",
  FRI: "Vendredi",
  SAT: "Samedi",
  SUN: "Dimanche",
};
const DAY_ORDER = Object.keys(DAY_LABELS) as AvailabilityRule["day"][];

const STATUS_STYLE: Record<CalendarAppointment["status"], string> = {
  SCHEDULED: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  HONORED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  POSTPONED: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  CANCELED: "border-slate-400/20 bg-slate-400/10 text-slate-300",
  NO_SHOW: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  NOT_QUALIFIED: "border-orange-400/30 bg-orange-400/10 text-orange-200",
};

const STATUS_LABEL: Record<CalendarAppointment["status"], string> = {
  SCHEDULED: "Planifié",
  HONORED: "Honoré",
  POSTPONED: "Reporté",
  CANCELED: "Annulé",
  NO_SHOW: "No-show",
  NOT_QUALIFIED: "Non qualifié",
};

function getErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(responseMessage)) return responseMessage.join(" · ");
  return responseMessage ?? (error instanceof Error ? error.message : fallback);
}

function formatDay(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" }).format(date);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function sameLocalDay(value: string, day: Date) {
  const date = new Date(value);
  return date.getFullYear() === day.getFullYear() && date.getMonth() === day.getMonth() && date.getDate() === day.getDate();
}

function CalendarContent() {
  const [me, setMe] = useState<Me | null>(null);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [eventTypes, setEventTypes] = useState<BookingEventType[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRule[]>([]);
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [tab, setTab] = useState<Tab>("AGENDA");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAppointment, setShowAppointment] = useState(false);
  const [showEventType, setShowEventType] = useState(false);

  const activeUserId = selectedUserId || me?.userId || "";

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const meResponse = await api.get<Me>("/auth/me");
      const current = meResponse.data;
      setMe(current);
      setSelectedUserId((value) => value || current.userId);
      const requests: Promise<unknown>[] = [
        api.get<IntegrationConnection[]>("/integration-hub/connections"),
      ];
      if (current.role === "ADMIN") {
        requests.push(api.get<{ items: TeamUser[] }>("/admin/users", { params: { pageSize: 100, isActive: true } }));
      }
      const responses = await Promise.all(requests);
      setConnections((responses[0] as { data: IntegrationConnection[] }).data);
      if (responses[1]) {
        setTeam((responses[1] as { data: { items: TeamUser[] } }).data.items.filter((user) => user.role !== "ADMIN"));
      }
    } catch (caught) {
      setError(getErrorMessage(caught, "Le calendrier n’a pas pu être chargé."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCalendar = useCallback(async () => {
    if (!activeUserId) return;
    setLoading(true);
    try {
      const [overview, typesResponse, availabilityResponse] = await Promise.all([
        getCalendarOverview(weekStart, activeUserId),
        api.get<BookingEventType[]>("/calendar/event-types", { params: { userId: activeUserId } }),
        api.get<{ timezone: string; rules: AvailabilityRule[] }>("/calendar/availability", { params: { userId: activeUserId } }),
      ]);
      setAppointments(overview.appointments);
      setEventTypes(typesResponse.data);
      setAvailability(availabilityResponse.data.rules);
      setTimezone(availabilityResponse.data.timezone);
    } catch (caught) {
      setError(getErrorMessage(caught, "Impossible de charger les rendez-vous."));
    } finally {
      setLoading(false);
    }
  }, [activeUserId, weekStart]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const googleConnected = connections.some(
    (item) => item.provider === "GOOGLE_CALENDAR" && item.status === "CONNECTED" && item.user.id === activeUserId,
  );
  const todayCount = appointments.filter((item) => sameLocalDay(item.scheduledAt, new Date())).length;
  const noShowCount = appointments.filter((item) => item.status === "NO_SHOW").length;
  const openCount = appointments.filter((item) => item.status === "SCHEDULED").length;

  async function syncGoogle() {
    const { from, to } = getCalendarRange(weekStart);
    setBusy(true);
    setError(null);
    try {
      const response = await api.post<{ synced: number }>("/calendar/sync/google", null, {
        params: { from: from.toISOString(), to: to.toISOString(), userId: activeUserId },
      });
      setNotice(`${response.data.synced} événement(s) Google synchronisé(s).`);
      await loadCalendar();
    } catch (caught) {
      setError(getErrorMessage(caught, "Synchronisation Google impossible."));
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: string, status: CalendarAppointment["status"]) {
    try {
      await api.patch(`/calendar/appointments/${id}/status`, { status });
      setAppointments((items) => items.map((item) => (item.id === id ? { ...item, status } : item)));
    } catch (caught) {
      setError(getErrorMessage(caught, "Le statut n’a pas pu être modifié."));
    }
  }

  async function saveAvailability() {
    setBusy(true);
    setError(null);
    try {
      await api.put("/calendar/availability", {
        userId: activeUserId,
        timezone,
        rules: availability.map(({ day, startTime, endTime, isActive }) => ({ day, startTime, endTime, isActive })),
      });
      setNotice("Disponibilités enregistrées.");
      await loadCalendar();
    } catch (caught) {
      setError(getErrorMessage(caught, "Enregistrement impossible."));
    } finally {
      setBusy(false);
    }
  }

  function normalizedAvailability() {
    return DAY_ORDER.map((day) =>
      availability.find((rule) => rule.day === day) ?? {
        day,
        startTime: "09:00",
        endTime: "18:00",
        isActive: !["SAT", "SUN"].includes(day),
      },
    );
  }

  function updateAvailability(day: AvailabilityRule["day"], patch: Partial<AvailabilityRule>) {
    const rules = normalizedAvailability().map((rule) => (rule.day === day ? { ...rule, ...patch } : rule));
    setAvailability(rules);
  }

  const selectedUser = team.find((user) => user.id === activeUserId);
  return (
    <main className="min-h-screen px-4 py-6 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1540px]">
        <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
              <span className="h-px w-7 bg-cyan-300/70" />
              Centre de rendez-vous
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Calendrier commercial</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[--muted]">
              Disponibilités, réservations et rendez-vous externes réunis dans une seule chronologie.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {me?.role === "ADMIN" && (
              <select className="field !w-auto min-w-52" value={activeUserId} onChange={(event) => setSelectedUserId(event.target.value)} aria-label="Sélectionner un membre">
                <option value={me.userId}>Mon calendrier</option>
                {team.map((user) => (
                  <option key={user.id} value={user.id}>{user.firstName} {user.lastName ?? ""} · {user.role.toLowerCase()}</option>
                ))}
              </select>
            )}
            <button type="button" className="btn" onClick={() => window.location.assign("/integrations")}>Gérer les connexions</button>
            <button type="button" className="btn btn-primary" onClick={() => setShowAppointment(true)}>+ Nouveau rendez-vous</button>
          </div>
        </header>

        {(error || notice) && (
          <div className={`mt-5 flex justify-between rounded-2xl border px-4 py-3 text-sm ${error ? "border-rose-400/25 bg-rose-400/10 text-rose-200" : "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"}`}>
            <span>{error ?? notice}</span>
            <button type="button" onClick={() => { setError(null); setNotice(null); }} aria-label="Fermer">×</button>
          </div>
        )}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card !p-4"><div className="text-xs uppercase tracking-wider text-[--muted]">Cette semaine</div><div className="mt-2 text-3xl font-black">{appointments.length}</div></div>
          <div className="card !p-4"><div className="text-xs uppercase tracking-wider text-[--muted]">Aujourd’hui</div><div className="mt-2 text-3xl font-black text-cyan-300">{todayCount}</div></div>
          <div className="card !p-4"><div className="text-xs uppercase tracking-wider text-[--muted]">À venir</div><div className="mt-2 text-3xl font-black text-indigo-300">{openCount}</div></div>
          <div className="card !p-4"><div className="text-xs uppercase tracking-wider text-[--muted]">No-shows</div><div className="mt-2 text-3xl font-black text-rose-300">{noShowCount}</div></div>
        </section>

        <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.025] p-1 sm:w-fit">
          {([[
            "AGENDA", "Agenda"
          ], ["EVENT_TYPES", "Types de rendez-vous"], ["AVAILABILITY", "Disponibilités"]] as Array<[Tab, string]>).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTab(value)} className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === value ? "bg-indigo-500 text-white shadow-lg" : "text-[--muted] hover:bg-white/5 hover:text-white"}`}>{label}</button>
          ))}
        </div>

        {tab === "AGENDA" && (
          <section className="mt-5 overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.025]">
            <div className="flex flex-col gap-3 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <button type="button" className="btn !px-3" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semaine précédente">←</button>
                <button type="button" className="btn" onClick={() => setWeekStart(startOfWeek(new Date()))}>Aujourd’hui</button>
                <button type="button" className="btn !px-3" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Semaine suivante">→</button>
                <span className="ml-2 text-sm font-bold capitalize">
                  {new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(weekStart)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs ${googleConnected ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-white/10 text-[--muted]"}`}>
                  <span className={`h-2 w-2 rounded-full ${googleConnected ? "bg-emerald-400" : "bg-slate-500"}`} />
                  Google Agenda {googleConnected ? "connecté" : "non connecté"}
                </span>
                {googleConnected && activeUserId === me?.userId && <button type="button" className="btn !py-2 text-xs" onClick={() => void syncGoogle()} disabled={busy}>{busy ? "Synchronisation…" : "Synchroniser"}</button>}
              </div>
            </div>

            {loading ? (
              <div className="grid min-h-96 place-items-center text-sm text-[--muted]">Chargement de l’agenda…</div>
            ) : (
              <div className="grid min-w-[980px] grid-cols-7 divide-x divide-white/10 overflow-x-auto">
                {weekDays.map((day) => {
                  const events = appointments.filter((item) => sameLocalDay(item.scheduledAt, day));
                  const isToday = sameLocalDay(new Date().toISOString(), day);
                  return (
                    <div key={day.toISOString()} className="min-h-[560px] bg-gradient-to-b from-white/[0.025] to-transparent">
                      <div className={`sticky top-0 z-10 border-b border-white/10 px-3 py-3 text-center backdrop-blur-xl ${isToday ? "bg-indigo-500/15" : "bg-[#101621]/90"}`}>
                        <div className="text-xs font-bold uppercase tracking-wider text-[--muted]">{formatDay(day).split(" ")[0]}</div>
                        <div className={`mt-1 text-lg font-black ${isToday ? "text-indigo-300" : ""}`}>{day.getDate()}</div>
                      </div>
                      <div className="space-y-2 p-2.5">
                        {events.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/25">Libre</div>
                        ) : events.map((event) => (
                          <article key={event.id} className={`rounded-2xl border p-3 ${STATUS_STYLE[event.status]}`}>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-xs font-black">{formatTime(event.scheduledAt)}</span>
                              <span className="text-[9px] font-bold uppercase tracking-wide opacity-70">{event.type}</span>
                            </div>
                            <h3 className="mt-2 line-clamp-2 text-sm font-bold text-[--text]">{event.title}</h3>
                            <p className="mt-1 truncate text-[11px] opacity-75">{event.attendeeName ?? event.attendeeEmail ?? event.provider}</p>
                            {event.meetingUrl && <a href={event.meetingUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-[11px] font-bold text-cyan-300 hover:underline">Rejoindre ↗</a>}
                            <select className="mt-3 w-full rounded-lg border border-white/10 bg-slate-950/40 px-2 py-1.5 text-[10px] text-[--text]" value={event.status} onChange={(change) => void updateStatus(event.id, change.target.value as CalendarAppointment["status"])} aria-label={`Statut de ${event.title}`}>
                              {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                          </article>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "EVENT_TYPES" && (
          <section className="mt-5">
            <div className="flex items-end justify-between gap-4">
              <div><h2 className="text-xl font-black">Liens de réservation</h2><p className="mt-1 text-sm text-[--muted]">Partagez un lien pour que vos prospects choisissent un créneau disponible.</p></div>
              {activeUserId === me?.userId && <button type="button" className="btn btn-primary" onClick={() => setShowEventType(true)}>+ Créer un type</button>}
            </div>
            {eventTypes.length === 0 ? (
              <div className="mt-5 rounded-[24px] border border-dashed border-white/15 p-10 text-center"><div className="text-lg font-bold">Aucun lien de réservation</div><p className="mt-2 text-sm text-[--muted]">Créez par exemple « Appel de qualification » ou « Entretien de closing ».</p></div>
            ) : (
              <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {eventTypes.map((eventType) => {
                  const bookingUrl = typeof window !== "undefined" ? `${window.location.origin}/book/${eventType.slug}` : `/book/${eventType.slug}`;
                  return (
                    <article key={eventType.id} className="card relative overflow-hidden !p-5">
                      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: eventType.color }} />
                      <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-[--muted]">{eventType.durationMin} min · {eventType.appointmentType}</div><h3 className="mt-2 text-lg font-black">{eventType.name}</h3></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${eventType.isActive ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-[--muted]"}`}>{eventType.isActive ? "Actif" : "Masqué"}</span></div>
                      <p className="mt-3 min-h-10 text-sm leading-5 text-[--muted]">{eventType.description || "Lien de réservation personnalisé."}</p>
                      <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/10 p-2"><span className="min-w-0 flex-1 truncate text-xs text-[--muted]">{bookingUrl}</span><button type="button" className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-bold hover:bg-white/15" onClick={() => { void navigator.clipboard.writeText(bookingUrl); setNotice("Lien copié."); }}>Copier</button></div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === "AVAILABILITY" && (
          <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="card !p-0">
              <div className="border-b border-white/10 p-5"><h2 className="text-xl font-black">Horaires disponibles</h2><p className="mt-1 text-sm text-[--muted]">Ces horaires déterminent les créneaux proposés sur vos liens.</p></div>
              <div className="divide-y divide-white/10">
                {normalizedAvailability().map((rule) => (
                  <div key={rule.day} className="grid items-center gap-3 p-4 sm:grid-cols-[140px_1fr]">
                    <label className="flex items-center gap-3"><input type="checkbox" checked={rule.isActive} onChange={(event) => updateAvailability(rule.day, { isActive: event.target.checked })} disabled={activeUserId !== me?.userId && me?.role !== "ADMIN"} /><span className="font-bold">{DAY_LABELS[rule.day]}</span></label>
                    {rule.isActive ? <div className="flex items-center gap-2"><input type="time" className="field !w-auto" value={rule.startTime} onChange={(event) => updateAvailability(rule.day, { startTime: event.target.value })} /><span className="text-[--muted]">à</span><input type="time" className="field !w-auto" value={rule.endTime} onChange={(event) => updateAvailability(rule.day, { endTime: event.target.value })} /></div> : <span className="text-sm text-[--muted]">Indisponible</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-end border-t border-white/10 p-4"><button type="button" className="btn btn-primary" onClick={() => void saveAvailability()} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</button></div>
            </div>
            <aside className="space-y-4">
              <div className="card"><div className="text-xs font-bold uppercase tracking-wider text-indigo-300">Fuseau horaire</div><select className="field mt-3" value={timezone} onChange={(event) => setTimezone(event.target.value)}><option value="Europe/Paris">Europe/Paris</option><option value="Africa/Niamey">Africa/Niamey</option><option value="America/Toronto">America/Toronto</option><option value="America/Montreal">America/Montréal</option></select><p className="mt-3 text-xs leading-5 text-[--muted]">Les prospects verront automatiquement les horaires dans leur propre fuseau.</p></div>
              <div className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/[0.07] p-5"><div className="text-sm font-black text-cyan-200">Anti double-réservation</div><p className="mt-2 text-xs leading-5 text-cyan-100/70">Les rendez-vous Capability et Google Agenda occupent les créneaux avant qu’ils soient proposés.</p></div>
            </aside>
          </section>
        )}
      </div>

      {showAppointment && <AppointmentDialog activeUserId={activeUserId} eventTypes={eventTypes} defaultRole={selectedUser?.role ?? me?.role ?? "CLOSER"} onClose={() => setShowAppointment(false)} onCreated={async () => { setShowAppointment(false); setNotice("Rendez-vous créé et ajouté au calendrier."); await loadCalendar(); }} />}
      {showEventType && <EventTypeDialog role={me?.role ?? "CLOSER"} onClose={() => setShowEventType(false)} onCreated={async () => { setShowEventType(false); setNotice("Lien de réservation créé."); await loadCalendar(); }} />}
    </main>
  );
}

function AppointmentDialog({ activeUserId, eventTypes, defaultRole, onClose, onCreated }: { activeUserId: string; eventTypes: BookingEventType[]; defaultRole: Role; onClose: () => void; onCreated: () => Promise<void> }) {
  const initial = new Date(Date.now() + 60 * 60_000); initial.setMinutes(0, 0, 0);
  const [title, setTitle] = useState("Entretien commercial");
  const [startsAt, setStartsAt] = useState(initial.toISOString().slice(0, 16));
  const [durationMin, setDurationMin] = useState(45);
  const [eventTypeId, setEventTypeId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try { await api.post("/calendar/appointments", { title, startsAt: new Date(startsAt).toISOString(), durationMin, userId: activeUserId, type: defaultRole === "SETTER" ? "RV0" : "RV1", bookingEventTypeId: eventTypeId || undefined, attendeeName: name || undefined, attendeeEmail: email || undefined, attendeePhone: phone || undefined, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); await onCreated(); }
    catch (caught) { setError(getErrorMessage(caught, "Création impossible.")); }
    finally { setBusy(false); }
  }
  return <ModalShell title="Nouveau rendez-vous" subtitle="Ajoutez un rendez-vous interne et synchronisez-le avec Google Agenda." onClose={onClose}><form onSubmit={submit} className="space-y-4"><label className="block"><span className="label">Titre</span><input required className="field mt-1" value={title} onChange={(event) => setTitle(event.target.value)} /></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="label">Date et heure</span><input required type="datetime-local" className="field mt-1" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label><span className="label">Durée</span><select className="field mt-1" value={durationMin} onChange={(event) => setDurationMin(Number(event.target.value))}>{[30,45,60,90].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label></div>{eventTypes.length > 0 && <label className="block"><span className="label">Type de rendez-vous</span><select className="field mt-1" value={eventTypeId} onChange={(event) => { const id = event.target.value; setEventTypeId(id); const type = eventTypes.find((item) => item.id === id); if (type) { setDurationMin(type.durationMin); setTitle(type.name); } }}><option value="">Sans lien de réservation</option>{eventTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<div className="border-t border-white/10 pt-4"><div className="mb-3 text-sm font-bold">Prospect</div><div className="grid gap-3 sm:grid-cols-2"><input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Prénom et nom" /><input type="email" className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" /></div><input className="field mt-3" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Téléphone (optionnel)" /></div>{error && <ErrorBox>{error}</ErrorBox>}<DialogActions busy={busy} onClose={onClose} action="Créer le rendez-vous" /></form></ModalShell>;
}

function EventTypeDialog({ role, onClose, onCreated }: { role: Role; onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState(role === "SETTER" ? "Appel de qualification" : "Entretien de closing");
  const [description, setDescription] = useState(""); const [durationMin, setDurationMin] = useState(45); const [locationType, setLocationType] = useState("GOOGLE_MEET"); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { await api.post("/calendar/event-types", { name, description: description || undefined, durationMin, appointmentType: role === "SETTER" ? "RV0" : "RV1", locationType, bufferAfterMin: 15, minNoticeHours: 12, maxDaysAhead: 30 }); await onCreated(); } catch (caught) { setError(getErrorMessage(caught, "Création impossible.")); } finally { setBusy(false); } }
  return <ModalShell title="Créer un lien de réservation" subtitle="Définissez l’expérience proposée à vos prospects." onClose={onClose}><form onSubmit={submit} className="space-y-4"><label className="block"><span className="label">Nom</span><input required className="field mt-1" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="block"><span className="label">Description</span><textarea className="field mt-1 min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Expliquez l’objectif de ce rendez-vous." /></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="label">Durée</span><select className="field mt-1" value={durationMin} onChange={(event) => setDurationMin(Number(event.target.value))}>{[30,45,60,90].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label><label><span className="label">Lieu</span><select className="field mt-1" value={locationType} onChange={(event) => setLocationType(event.target.value)}><option value="GOOGLE_MEET">Google Meet</option><option value="ZOOM">Zoom</option><option value="PHONE">Téléphone</option><option value="CUSTOM">Lien personnalisé</option></select></label></div>{error && <ErrorBox>{error}</ErrorBox>}<DialogActions busy={busy} onClose={onClose} action="Créer le lien" /></form></ModalShell>;
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Fermer" /><div className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-white/10 bg-[#111827] p-6 shadow-2xl sm:p-7"><button type="button" className="absolute right-5 top-5 rounded-full p-2 text-[--muted] hover:bg-white/5 hover:text-white" onClick={onClose} aria-label="Fermer">×</button><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-300">Calendrier Capability</p><h2 className="mt-1 text-2xl font-black">{title}</h2><p className="mb-6 mt-2 text-sm leading-6 text-[--muted]">{subtitle}</p>{children}</div></div>; }
function DialogActions({ busy, onClose, action }: { busy: boolean; onClose: () => void; action: string }) { return <div className="flex justify-end gap-3 pt-2"><button type="button" className="btn" onClick={onClose}>Annuler</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Enregistrement…" : action}</button></div>; }
function ErrorBox({ children }: { children: React.ReactNode }) { return <div className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{children}</div>; }

export default function CalendarPage() { return <Guard><CalendarContent /></Guard>; }

