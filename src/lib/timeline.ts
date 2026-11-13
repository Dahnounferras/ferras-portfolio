/**
 * Turns role start/end dates into a to-scale timeline.
 * Everything is computed at build time, so durations and bar lengths
 * refresh on every deploy.
 */
export interface Role {
  title: string;
  start: string; // ISO date
  end: string | null; // null = present
}

export interface PlacedRole extends Role {
  left: number; // % from axis start
  width: number; // % of axis
  current: boolean;
  range: string; // "MAR 2026 — PRESENT"
  duration: string; // "8 MOS"
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY = 86_400_000;
const MONTH_DAYS = 30.4375;

const fmt = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

function duration(from: Date, to: Date) {
  const months = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY / MONTH_DAYS));
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts = [y && `${y} YR${y > 1 ? 'S' : ''}`, m && `${m} MO${m > 1 ? 'S' : ''}`].filter(Boolean);
  return parts.join(' ');
}

export function buildTimeline(roles: Role[], now = new Date()) {
  const starts = roles.map((r) => new Date(r.start));
  const axisStart = new Date(Math.min(...starts.map((d) => d.getTime())));
  axisStart.setUTCDate(1);
  const span = now.getTime() - axisStart.getTime();
  const pct = (d: Date) => ((d.getTime() - axisStart.getTime()) / span) * 100;

  const placed: PlacedRole[] = roles.map((r) => {
    const s = new Date(r.start);
    const e = r.end ? new Date(r.end) : now;
    return {
      ...r,
      left: pct(s),
      width: Math.max(pct(e) - pct(s), 1),
      current: !r.end,
      range: `${fmt(s)} — ${r.end ? fmt(e) : 'PRESENT'}`,
      duration: duration(s, e),
    };
  });

  // Year ticks: the start month, then every January.
  const ticks = [{ label: `${MONTHS[axisStart.getUTCMonth()]} ’${String(axisStart.getUTCFullYear()).slice(2)}`, left: 0 }];
  for (let y = axisStart.getUTCFullYear() + 1; y <= now.getUTCFullYear(); y++) {
    const left = pct(new Date(Date.UTC(y, 0, 1)));
    if (left < 92) ticks.push({ label: String(y), left });
  }

  const totalMonths = span / DAY / MONTH_DAYS;
  return {
    roles: [...placed].reverse(), // newest first
    ticks,
    monthStep: 100 / totalMonths, // % width of one month, for tick marks
    axisLabel: `${fmt(axisStart)} → today`,
  };
}
