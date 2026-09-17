import api from "./api";

export type TeamAutomationStatus = "ACTIVE" | "PAUSED";
export type TeamTaskStatus = "TODO" | "DONE" | "CANCELED";
export type TeamTaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type RecipientStrategy =
  "LEAD_SETTER" | "LEAD_CLOSER" | "ADMINS" | "SPECIFIC_USER";

export type TeamAutomationAction =
  | {
      type: "CREATE_TASK";
      title: string;
      description?: string;
      assignee: RecipientStrategy;
      userId?: string;
      dueInMinutes?: number;
      priority?: TeamTaskPriority;
    }
  | {
      type: "SEND_NOTIFICATION";
      title: string;
      message: string;
      recipient: RecipientStrategy;
      userId?: string;
    }
  | { type: "OUTGOING_WEBHOOK"; url: string };

export type TeamAutomationRule = {
  id: string;
  name: string;
  description?: string | null;
  status: TeamAutomationStatus;
  trigger: "LEAD_STAGE_CHANGED";
  triggerConfig: {
    fromStages?: string[];
    toStages?: string[];
    sources?: string[];
    tags?: string[];
  };
  actions: TeamAutomationAction[];
  updatedAt: string;
  createdBy: { id: string; firstName: string; lastName?: string | null };
  _count: { runs: number; tasks: number; notifications: number };
  runs: Array<{
    id: string;
    status: "RUNNING" | "SUCCESS" | "FAILED" | "SKIPPED";
    startedAt: string;
    finishedAt?: string | null;
    error?: string | null;
  }>;
};

export type TeamTask = {
  id: string;
  title: string;
  description?: string | null;
  status: TeamTaskStatus;
  priority: TeamTaskPriority;
  dueAt?: string | null;
  createdAt: string;
  metadata?: {
    source?: string;
    createdById?: string;
  } | null;
  assignee: {
    id: string;
    firstName: string;
    lastName?: string | null;
    role: string;
  };
  lead?: {
    id: string;
    firstName: string;
    lastName?: string | null;
    source?: string | null;
    stage: string;
  } | null;
  rule?: { id: string; name: string } | null;
};

export type TeamNotification = {
  id: string;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  readAt?: string | null;
  createdAt: string;
  rule?: { id: string; name: string } | null;
};

export type TeamAutomationCatalog = {
  stages: string[];
  users: Array<{
    id: string;
    firstName: string;
    lastName?: string | null;
    email: string;
    role: "ADMIN" | "SETTER" | "CLOSER";
  }>;
  templates: Array<{
    key: string;
    name: string;
    description: string;
    triggerConfig: { toStages: string[] };
    actions: TeamAutomationAction[];
  }>;
};

export type TeamAutomationSummary = {
  openTasks: number;
  overdueTasks: number;
  unreadNotifications: number;
  activeRules: number;
  runsToday: number;
};

export type CreateTeamAutomationRuleInput = {
  name: string;
  description?: string;
  status?: TeamAutomationStatus;
  trigger: "LEAD_STAGE_CHANGED";
  triggerConfig: {
    fromStages?: string[];
    toStages: string[];
    sources?: string[];
    tags?: string[];
  };
  actions: TeamAutomationAction[];
};

export type CreateManualTeamTaskInput = {
  title: string;
  description?: string;
  assigneeId: string;
  priority?: TeamTaskPriority;
  dueAt?: string;
  notificationMessage?: string;
};

export const teamAutomationsApi = {
  summary: () =>
    api
      .get<TeamAutomationSummary>("/team-automations/summary")
      .then((response) => response.data),
  catalog: () =>
    api
      .get<TeamAutomationCatalog>("/team-automations/catalog")
      .then((response) => response.data),
  rules: () =>
    api
      .get<TeamAutomationRule[]>("/team-automations/rules")
      .then((response) => response.data),
  createRule: (input: CreateTeamAutomationRuleInput) =>
    api
      .post<TeamAutomationRule>("/team-automations/rules", input)
      .then((response) => response.data),
  createFromTemplate: (key: string) =>
    api
      .post<TeamAutomationRule>(`/team-automations/rules/from-template/${key}`)
      .then((response) => response.data),
  updateRule: (id: string, input: Partial<CreateTeamAutomationRuleInput>) =>
    api
      .patch<TeamAutomationRule>(`/team-automations/rules/${id}`, input)
      .then((response) => response.data),
  tasks: (status?: TeamTaskStatus) =>
    api
      .get<TeamTask[]>("/team-automations/tasks", {
        params: status ? { status } : undefined,
      })
      .then((response) => response.data),
  createTask: (input: CreateManualTeamTaskInput) =>
    api
      .post<TeamTask>("/team-automations/tasks", input)
      .then((response) => response.data),
  updateTask: (id: string, status: TeamTaskStatus) =>
    api
      .patch<TeamTask>(`/team-automations/tasks/${id}`, { status })
      .then((response) => response.data),
  notifications: () =>
    api
      .get<TeamNotification[]>("/team-automations/notifications")
      .then((response) => response.data),
  markNotificationRead: (id: string) =>
    api
      .patch<TeamNotification>(`/team-automations/notifications/${id}/read`)
      .then((response) => response.data),
  markAllNotificationsRead: () =>
    api
      .post<{ ok: boolean; count: number }>(
        "/team-automations/notifications/read-all",
      )
      .then((response) => response.data),
};
