export function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function monthInTimezone(timezone: string): string {
  return todayInTimezone(timezone).slice(0, 7);
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function addMonths(month: string, amount: number): string {
  const value = new Date(`${month}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + amount);
  return value.toISOString().slice(0, 7);
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));
}

export function localDateTimeInput(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function dateTimeInputInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}

export function zonedLocalToISO(value: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("日期與時間格式無效。");
  const [, year, month, day, hour, minute] = match;
  const wallClockUTC = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let instant = wallClockUTC;
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const zoneName = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    }).formatToParts(new Date(instant)).find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
    const offset = /GMT([+-])(\d{2}):(\d{2})/.exec(zoneName);
    const minutes = offset ? (offset[1] === "+" ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3])) : 0;
    instant = wallClockUTC - minutes * 60_000;
  }
  return new Date(instant).toISOString();
}
