"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { setAccessToken } from "@/lib/auth";

type Role = "ADMIN" | "SETTER" | "CLOSER";

type SessionUser = {
  id: string;
  email: string;
  role: Role;
  firstName?: string | null;
  lastName?: string | null;
  impersonation?: {
    sessionId: string;
    actor: {
      id: string;
      email: string;
      role: "ADMIN";
      firstName?: string | null;
      lastName?: string | null;
    };
  };
};

const roleLabel: Record<Role, string> = {
  ADMIN: "administrateur",
  CLOSER: "closer",
  SETTER: "setter",
};

function displayName(user: SessionUser) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return fullName || user.email;
}

export default function ImpersonationBanner() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<SessionUser>("/auth/me")
      .then((response) => {
        if (!cancelled) setUser(response.data);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user?.impersonation) return null;

  async function stopImpersonation() {
    setStopping(true);
    setError(null);
    try {
      const response = await api.post<{ access_token: string }>(
        "/auth/impersonation/stop",
      );
      setAccessToken(response.data.access_token);
      window.location.assign("/users");
    } catch (caught: unknown) {
      const message =
        typeof caught === "object" &&
        caught !== null &&
        "response" in caught &&
        typeof caught.response === "object" &&
        caught.response !== null &&
        "data" in caught.response &&
        typeof caught.response.data === "object" &&
        caught.response.data !== null &&
        "message" in caught.response.data &&
        typeof caught.response.data.message === "string"
          ? caught.response.data.message
          : "Impossible de revenir à la vue administrateur.";
      setError(message);
      setStopping(false);
    }
  }

  return (
    <div className="sticky top-0 z-50 border-b border-amber-300/25 bg-amber-400/15 px-4 py-2.5 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-amber-200/25 bg-amber-300/15 text-amber-100">
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8m-7 8a7 7 0 0 1 14 0zm14-8v-2h-2V8h2V6h2v2h2v2h-2v2z"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-amber-50">
              Vue active : {displayName(user)}
            </div>
            <div className="truncate text-xs text-amber-100/70">
              Vous consultez et modifiez Capability comme ce {roleLabel[user.role]}.
              Vos actions sont enregistrées au nom de l’administrateur.
            </div>
          </div>
        </div>
        <div className="sm:ml-auto">
          <button
            type="button"
            onClick={stopImpersonation}
            disabled={stopping}
            className="rounded-lg border border-amber-100/25 bg-amber-50/10 px-3 py-1.5 text-sm font-medium text-amber-50 transition hover:bg-amber-50/20 disabled:cursor-wait disabled:opacity-60"
          >
            {stopping ? "Retour en cours…" : "Revenir à ma vue administrateur"}
          </button>
          {error && <div className="mt-1 text-xs text-red-300">{error}</div>}
        </div>
      </div>
    </div>
  );
}
