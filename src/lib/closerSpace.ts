import api from "@/lib/api";

export type Role = "ADMIN" | "SETTER" | "CLOSER";
export type LedgerType = "PAYMENT" | "REFUND";
export type LedgerStatus = "PAID" | "PENDING" | "OVERDUE" | "FAILED";
export type ReportOutcome = "FOLLOW_UP" | "WON" | "LOST" | "NOT_QUALIFIED";

export type CloserListItem = {
  id: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  closerSettings?: {
    commissionRate: number;
    monthlyTarget?: number | null;
  } | null;
};

export type CloserCockpit = {
  closer: Omit<CloserListItem, "closerSettings">;
  period: { from: string; to: string };
  appointments: {
    planned: number;
    honored: number;
    noShows: number;
    postponed: number;
    canceled: number;
  };
  sales: {
    proposals: number;
    contractsSigned: number;
    sales: number;
    averageBasket: number;
    closingRate: number;
  };
  cash: {
    signedRevenue: number;
    collectedRevenue: number;
    refunds: number;
    netCollected: number;
    remaining: number;
    unpaid: number;
    collectionRate: number;
  };
  commission: { rate: number; estimated: number; basis: "NET_COLLECTED" };
  objections: Array<{ label: string; count: number }>;
  contracts: Array<{
    id: string;
    leadId?: string | null;
    prospect?: {
      firstName: string;
      lastName?: string | null;
      email?: string | null;
    } | null;
    signedAt: string;
    signed: number;
    collected: number;
    refunded: number;
    remaining: number;
  }>;
  ledger: Array<{
    id: string;
    type: LedgerType;
    status: LedgerStatus;
    amount: number;
    label?: string | null;
    occurredAt: string;
    dueAt?: string | null;
    contractId?: string | null;
    lead?: { firstName: string; lastName?: string | null } | null;
  }>;
  upcoming: Array<{
    id: string;
    type: "RV1" | "RV2";
    status: string;
    scheduledAt: string;
    lead?: {
      id: string;
      firstName: string;
      lastName?: string | null;
      email?: string | null;
    } | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    description?: string | null;
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    dueAt?: string | null;
    leadId?: string | null;
    overdue: boolean;
  }>;
  leads: Array<{
    id: string;
    firstName: string;
    lastName?: string | null;
    email?: string | null;
    stage: string;
    appointments: Array<{
      id: string;
      type: "RV1" | "RV2";
      status: string;
      scheduledAt: string;
    }>;
  }>;
};

export const closerSpaceApi = {
  async closers() {
    const response = await api.get<CloserListItem[]>("/closer-space/closers");
    return response.data;
  },
  async cockpit(params: { closerId?: string; from: string; to: string }) {
    const response = await api.get<CloserCockpit>("/closer-space/cockpit", {
      params,
    });
    return response.data;
  },
  async createReport(input: {
    closerId?: string;
    leadId: string;
    appointmentId?: string;
    outcome: ReportOutcome;
    proposalMade: boolean;
    objections: string[];
    notes?: string;
  }) {
    const response = await api.post("/closer-space/reports", input);
    return response.data;
  },
  async createLedgerEntry(input: {
    closerId: string;
    leadId?: string;
    contractId: string;
    type: LedgerType;
    status: LedgerStatus;
    amount: number;
    label?: string;
    occurredAt?: string;
    dueAt?: string;
  }) {
    const response = await api.post("/closer-space/ledger", input);
    return response.data;
  },
  async updateSettings(
    closerId: string,
    input: { commissionRate: number; monthlyTarget?: number },
  ) {
    const response = await api.patch(
      `/closer-space/closers/${closerId}/settings`,
      input,
    );
    return response.data;
  },
};
