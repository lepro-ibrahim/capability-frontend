import api from "@/lib/api";

export type DashboardVisibility = "PERSONAL" | "ORGANIZATION";
export type AnalyticsCardType = "KPI" | "LINE" | "FUNNEL";
export type AnalyticsValueFormat = "NUMBER" | "CURRENCY" | "PERCENTAGE";
export type AnalyticsComparison = "NONE" | "PREVIOUS_PERIOD";

export type AnalyticsMetricKey =
  | "LEADS_RECEIVED" | "CALL_REQUESTED" | "CALL_ATTEMPT" | "CALL_ANSWERED"
  | "RV0_PLANNED" | "RV0_HONORED" | "RV1_PLANNED" | "RV1_HONORED"
  | "CONTRACT_SIGNED" | "WON" | "REVENUE" | "CASH_IN" | "AD_SPEND"
  | "CLOSING_RATE" | "SHOW_RATE" | "ROAS" | "PIPELINE_FUNNEL";

export type CardLayout = { x: number; y: number; w: number; h: number };

export type AnalyticsCardFilters = {
  sources?: string[];
  excludeSources?: string[];
  setterIds?: string[];
  closerIds?: string[];
  tags?: string[];
};

export type AnalyticsCard = {
  id: string;
  dashboardId: string;
  title: string;
  subtitle?: string | null;
  type: AnalyticsCardType;
  metricKey: AnalyticsMetricKey;
  valueFormat: AnalyticsValueFormat;
  comparison: AnalyticsComparison;
  filters?: AnalyticsCardFilters | null;
  layout: CardLayout;
  sortOrder: number;
};

export type AnalyticsDashboard = {
  id: string;
  name: string;
  description?: string | null;
  visibility: DashboardVisibility;
  roleScope?: "ADMIN" | "SETTER" | "CLOSER" | null;
  isDefault: boolean;
  ownerId: string;
  cards: AnalyticsCard[];
};

export type MetricDefinition = {
  key: AnalyticsMetricKey;
  label: string;
  description: string;
  format: AnalyticsValueFormat;
  visualizations: AnalyticsCardType[];
  adminOnly: boolean;
};

export type MetricResult = {
  value: number;
  previous: number | null;
  delta: number | null;
  series?: Array<{ date: string; value: number }>;
  segments?: Array<{ key: string; label: string; value: number }>;
};

export type AnalyticsQueryResponse = {
  period: { from: string; to: string };
  results: Record<string, MetricResult>;
};

export type CreateCardInput = Omit<AnalyticsCard, "id" | "dashboardId">;

export const analyticsApi = {
  catalog: () => api.get<MetricDefinition[]>("/analytics/catalog").then((response) => response.data),
  dashboards: () => api.get<AnalyticsDashboard[]>("/analytics/dashboards").then((response) => response.data),
  createDashboard: (input: { name: string; description?: string; visibility?: DashboardVisibility }) =>
    api.post<AnalyticsDashboard>("/analytics/dashboards", input).then((response) => response.data),
  duplicateDashboard: (id: string) =>
    api.post<AnalyticsDashboard>(`/analytics/dashboards/${id}/duplicate`).then((response) => response.data),
  createCard: (dashboardId: string, input: CreateCardInput) =>
    api.post<AnalyticsCard>(`/analytics/dashboards/${dashboardId}/cards`, input).then((response) => response.data),
  updateCard: (id: string, input: Partial<CreateCardInput>) =>
    api.patch<AnalyticsCard>(`/analytics/cards/${id}`, input).then((response) => response.data),
  deleteCard: (id: string) => api.delete(`/analytics/cards/${id}`).then((response) => response.data),
  query: (input: {
    from: string;
    to: string;
    cards: Array<{
      id: string;
      metricKey: AnalyticsMetricKey;
      comparison: AnalyticsComparison;
      filters?: AnalyticsCardFilters;
    }>;
    filters?: { sources?: string[]; excludeSources?: string[] };
  }) => api.post<AnalyticsQueryResponse>("/analytics/query", input).then((response) => response.data),
};
