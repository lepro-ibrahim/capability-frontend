"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";

type PublicEventType = {
  id: string;
  name: string;
  description?: string | null;
  durationMin: number;
  color: string;
  locationType: string;
  owner: { firstName: string; lastName?: string | null };
};

function dateKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default function PublicBookingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [eventType, setEventType] = useState<PublicEventType | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const from = new Date();
      const to = new Date(Date.now() + 14 * 86_400_000);
      const [typeResponse, slotsResponse] = await Promise.all([
        api.get<PublicEventType>(`/calendar/public/${slug}`),
        api.get<string[]>(`/calendar/public/${slug}/slots`, {
          params: { from: from.toISOString(), to: to.toISOString() },
        }),
      ]);
      setEventType(typeResponse.data);
      setSlots(slotsResponse.data);
    } catch (caught: unknown) {
      const message = (caught as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message ?? "Ce lien de réservation n’est pas disponible.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const slot of slots) {
      const key = dateKey(slot);
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.values()];
  }, [slots]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !slug) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/calendar/public/${slug}/book`, {
        startsAt: selected,
        name,
        email,
        phone: phone || undefined,
        notes: notes || undefined,
      });
      setBooked(true);
    } catch (caught: unknown) {
      const message = (caught as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(" · ") : message ?? "La réservation n’a pas pu être confirmée.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="grid min-h-screen place-items-center bg-[#090d15] text-sm text-slate-400">Recherche des créneaux…</div>;
  if (!eventType) return <div className="grid min-h-screen place-items-center bg-[#090d15] p-6 text-center text-rose-200">{error ?? "Lien introuvable"}</div>;

  if (booked && selected) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#090d15] p-5 text-white">
        <div className="w-full max-w-lg rounded-[32px] border border-emerald-400/20 bg-emerald-400/[0.07] p-8 text-center shadow-2xl">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-400 text-2xl font-black text-emerald-950">✓</div>
          <h1 className="mt-6 text-3xl font-black">Rendez-vous confirmé</h1>
          <p className="mt-3 text-emerald-100/75">
            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short" }).format(new Date(selected))}
          </p>
          <p className="mt-5 text-sm leading-6 text-slate-400">Le rendez-vous est maintenant visible dans le calendrier Capability de {eventType.owner.firstName}.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090d15] p-4 text-white sm:p-8 lg:grid lg:place-items-center">
      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-[#101621] shadow-[0_30px_90px_rgba(0,0,0,.45)] lg:grid-cols-[360px_1fr]">
        <aside className="relative overflow-hidden border-b border-white/10 bg-[linear-gradient(145deg,rgba(79,70,229,.28),rgba(8,13,23,.92)_65%)] p-7 lg:border-b-0 lg:border-r">
          <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full border border-indigo-300/15" />
          <div className="relative">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-lg font-black">C</div>
            <div className="mt-10 text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Réservation</div>
            <h1 className="mt-3 text-3xl font-black leading-tight">{eventType.name}</h1>
            <p className="mt-4 text-sm leading-6 text-slate-400">{eventType.description || "Choisissez le créneau qui vous convient le mieux."}</p>
            <dl className="mt-8 space-y-4 text-sm">
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/5">◷</span><div><dt className="text-xs text-slate-500">Durée</dt><dd className="font-bold">{eventType.durationMin} minutes</dd></div></div>
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/5">◎</span><div><dt className="text-xs text-slate-500">Avec</dt><dd className="font-bold">{eventType.owner.firstName} {eventType.owner.lastName ?? ""}</dd></div></div>
              <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/5">↗</span><div><dt className="text-xs text-slate-500">Lieu</dt><dd className="font-bold">{eventType.locationType === "GOOGLE_MEET" ? "Google Meet" : eventType.locationType === "ZOOM" ? "Zoom" : "À distance"}</dd></div></div>
            </dl>
          </div>
        </aside>

        <section className="p-5 sm:p-7">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">1. Choisissez un créneau</div>
          {grouped.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-400">Aucun créneau disponible pendant les 14 prochains jours.</div>
          ) : (
            <div className="mt-5 max-h-64 space-y-4 overflow-y-auto pr-2">
              {grouped.map((daySlots) => (
                <div key={dateKey(daySlots[0])} className="grid gap-3 sm:grid-cols-[170px_1fr]">
                  <div className="pt-2 text-sm font-bold capitalize">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(daySlots[0]))}</div>
                  <div className="flex flex-wrap gap-2">{daySlots.map((slot) => <button type="button" key={slot} onClick={() => setSelected(slot)} className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${selected === slot ? "border-indigo-400 bg-indigo-500 text-white" : "border-white/10 bg-white/[0.03] hover:border-indigo-400/40 hover:bg-indigo-400/10"}`}>{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(slot))}</button>)}</div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={submit} className={`mt-7 border-t border-white/10 pt-6 transition ${selected ? "opacity-100" : "pointer-events-none opacity-35"}`}>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">2. Vos coordonnées</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><input required className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Prénom et nom" /><input required type="email" className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" /></div>
            <input className="field mt-3" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Téléphone (optionnel)" />
            <textarea className="field mt-3 min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Que souhaitez-vous aborder ? (optionnel)" />
            {error && <div className="mt-3 rounded-xl border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">{error}</div>}
            <button type="submit" disabled={!selected || busy} className="mt-4 w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-black shadow-lg shadow-indigo-950/40 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Confirmation…" : "Confirmer le rendez-vous"}</button>
          </form>
        </section>
      </div>
    </main>
  );
}

