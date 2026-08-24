import { normalizeSearchText } from "./markets.js";

export const PREDICTIONS_TIME_ZONE = "America/Mexico_City";

const monthNumbers = new Map([
  ["enero", 1], ["january", 1], ["jan", 1],
  ["febrero", 2], ["february", 2], ["feb", 2],
  ["marzo", 3], ["march", 3], ["mar", 3],
  ["abril", 4], ["april", 4], ["apr", 4],
  ["mayo", 5], ["may", 5],
  ["junio", 6], ["june", 6], ["jun", 6],
  ["julio", 7], ["july", 7], ["jul", 7],
  ["agosto", 8], ["august", 8], ["aug", 8],
  ["septiembre", 9], ["setiembre", 9], ["september", 9], ["sep", 9],
  ["octubre", 10], ["october", 10], ["oct", 10],
  ["noviembre", 11], ["november", 11], ["nov", 11],
  ["diciembre", 12], ["december", 12], ["dec", 12],
]);

const weekdayNumbers = new Map([
  ["domingo", 0], ["sunday", 0],
  ["lunes", 1], ["monday", 1],
  ["martes", 2], ["tuesday", 2],
  ["miercoles", 3], ["wednesday", 3],
  ["jueves", 4], ["thursday", 4],
  ["viernes", 5], ["friday", 5],
  ["sabado", 6], ["saturday", 6],
]);

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateString(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function isValidDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function dateInTimeZone(now = new Date(), timeZone = PREDICTIONS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDays(dateString, amount) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return toDateString(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function weekdayForDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function explicitResult(date, match, raw) {
  return {
    dateRange: { kind: "explicit", from: date, to: date, timeZone: PREDICTIONS_TIME_ZONE, raw },
    match: { index: match.index, length: match[0].length, text: raw },
    error: null,
  };
}

function invalidResult(match) {
  return {
    dateRange: null,
    match: { index: match.index, length: match[0].length, text: match[0] },
    error: { code: "INVALID_DATE", message: "La fecha indicada no es válida." },
  };
}

export function parsePredictionDate(value, { now = new Date(), timeZone = PREDICTIONS_TIME_ZONE } = {}) {
  const source = String(value || "");
  const normalized = normalizeSearchText(source);
  const today = dateInTimeZone(now, timeZone);

  const relative = /\b(hoy|today|manana|tomorrow)\b/i.exec(normalized);
  if (relative) {
    const offset = ["manana", "tomorrow"].includes(relative[1].toLowerCase()) ? 1 : 0;
    return explicitResult(addDays(today, offset), relative, source.slice(relative.index, relative.index + relative[0].length));
  }

  const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(normalized);
  if (iso) {
    const [, year, month, day] = iso.map(Number);
    if (!isValidDateParts(year, month, day)) return invalidResult(iso);
    return explicitResult(toDateString(year, month, day), iso, source.slice(iso.index, iso.index + iso[0].length));
  }

  const dayFirst = /\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/.exec(normalized);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    const year = Number(dayFirst[3]);
    if (!isValidDateParts(year, month, day)) return invalidResult(dayFirst);
    return explicitResult(toDateString(year, month, day), dayFirst, source.slice(dayFirst.index, dayFirst.index + dayFirst[0].length));
  }

  const spanishMonth = /\b(\d{1,2})\s+(?:de\s+)?([a-z]+)(?:\s+de)?\s+(20\d{2})\b/i.exec(normalized);
  if (spanishMonth && monthNumbers.has(spanishMonth[2])) {
    const day = Number(spanishMonth[1]);
    const month = monthNumbers.get(spanishMonth[2]);
    const year = Number(spanishMonth[3]);
    if (!isValidDateParts(year, month, day)) return invalidResult(spanishMonth);
    return explicitResult(toDateString(year, month, day), spanishMonth, source.slice(spanishMonth.index, spanishMonth.index + spanishMonth[0].length));
  }

  const englishMonth = /\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(20\d{2})\b/i.exec(normalized);
  if (englishMonth && monthNumbers.has(englishMonth[1])) {
    const day = Number(englishMonth[2]);
    const month = monthNumbers.get(englishMonth[1]);
    const year = Number(englishMonth[3]);
    if (!isValidDateParts(year, month, day)) return invalidResult(englishMonth);
    return explicitResult(toDateString(year, month, day), englishMonth, source.slice(englishMonth.index, englishMonth.index + englishMonth[0].length));
  }

  const weekdays = [...weekdayNumbers.keys()].join("|");
  const weekdayMatch = new RegExp(`\\b(?:(?:este|this|proximo|next)\\s+)?(${weekdays})\\b`, "i").exec(normalized);
  if (weekdayMatch) {
    const target = weekdayNumbers.get(weekdayMatch[1].toLowerCase());
    const current = weekdayForDate(today);
    let offset = (target - current + 7) % 7;
    if (/\b(?:proximo|next)\b/i.test(weekdayMatch[0]) && offset === 0) offset = 7;
    return explicitResult(addDays(today, offset), weekdayMatch, source.slice(weekdayMatch.index, weekdayMatch.index + weekdayMatch[0].length));
  }

  return {
    dateRange: {
      kind: "default",
      from: today,
      to: addDays(today, 14),
      timeZone,
      raw: null,
    },
    match: null,
    error: null,
  };
}
