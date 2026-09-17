import api from "@/lib/api";

export type CalendarAppointment = {
  id: string;
  provider: string;
  type: "RV0" | "RV1" | "RV2";
  status:
    | "SCHEDULED"
    | "HONORED"
    | "POSTPONED"
    | "CANCELED"
    | "NO_SHOW"
    | "NOT_QUALIFIED";
  title: string;
  description?: string | null;
  scheduledAt: string;
  endAt?: string | null;
  timezone: string;
  attendeeName?: string | null;
  attendeeEmail?: string | null;
  attendeePhone?: string | null;
  meetingUrl?: string | null;
  bookingEventType?: {
    id: string;
    name: string;
    color: string;
    durationMin: number;
  } | null;
  user?: {
    id: string;
    firstName: string;
    lastName?: string | null;
    email: string;
    role: string;
  } | null;
  lead?: {
    id: string;
    firstName: string;
    lastName?: string | null;
    email?: string | null;
  } | null;
};

export type BookingEventType = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  durationMin: number;
  color: string;
  appointmentType: "RV0" | "RV1" | "RV2";
  locationType: "GOOGLE_MEET" | "ZOOM" | "PHONE" | "CUSTOM";
  locationValue?: string | null;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  isActive: boolean;
};

export type AvailabilityRule = {
  id?: string;
  day: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  startTime: string;
  endTime: string;
  isActive: boolean;
};

export function startOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function getCalendarRange(weekStart: Date) {
  const from = new Date(weekStart);
  const to = addDays(weekStart, 7);
  to.setMilliseconds(-1);
  return { from, to };
}

export async function getCalendarOverview(
  weekStart: Date,
  userId?: string,
) {
  const { from, to } = getCalendarRange(weekStart);
  const response = await api.get<{
    userId: string;
    appointments: CalendarAppointment[];
  }>("/calendar/overview", {
    params: { from: from.toISOString(), to: to.toISOString(), userId },
  });
  return response.data;
}

