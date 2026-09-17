import api from "@/lib/api";

export type IntegrationAuthType = "API_KEY" | "OAUTH" | "WEBHOOK";

export type IntegrationCatalogItem = {
  provider: string;
  name: string;
  category: string;
  description: string;
  authType: IntegrationAuthType;
  available: boolean;
  configured: boolean;
};

export type IntegrationConnection = {
  id: string;
  provider: string;
  category: string;
  scope: "USER" | "WORKSPACE";
  status: "CONNECTED" | "ERROR" | "PAUSED";
  displayName?: string | null;
  accountEmail?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  inboundWebhookUrl: string;
  hasSecret: boolean;
  user: {
    id: string;
    firstName: string;
    lastName?: string | null;
    email: string;
  };
};

export async function getIntegrationHub() {
  const [catalog, connections] = await Promise.all([
    api.get<IntegrationCatalogItem[]>("/integration-hub/catalog"),
    api.get<IntegrationConnection[]>("/integration-hub/connections"),
  ]);
  return { catalog: catalog.data, connections: connections.data };
}

export async function startIntegrationOAuth(provider: string) {
  const response = await api.post<{ url: string }>(
    `/integration-hub/oauth/${provider.toLowerCase()}/start`,
  );
  return response.data.url;
}

