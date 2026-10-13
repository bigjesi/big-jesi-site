// Lê o calendário público/privado do Google (formato iCal) e devolve as próximas datas.
// O endereço do calendário deve ficar na variável de ambiente AGENDA_ICS_URL (Vercel > Settings > Environment Variables).
const FALLBACK_ICS_URL =
  "https://calendar.google.com/calendar/ical/a5704bb24f37cb197e391843ac7494499f925ff83116ecfb6d88cc88eee93767%40group.calendar.google.com/private-db778302a3ea7298959f1f32f348a0dd/basic.ics";

const TZ = "America/Fortaleza";

// Desfaz as quebras de linha do formato iCal (linhas que começam com espaço continuam a anterior)
function unfold(text) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescape(v) {
  return (v || "")
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

// Data de hoje no fuso de Fortaleza, no formato AAAA-MM-DD
function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Converte DTSTART (com ou sem TZID, com Z, ou só data) para AAAA-MM-DD e HH:MM no fuso local
function parseStart(line) {
  // line exemplo: "DTSTART;TZID=America/Fortaleza:20261020T190000" ou "DTSTART:20261020T220000Z" ou "DTSTART;VALUE=DATE:20261020"
  const m = line.match(/^DTSTART([^:]*):(\d{8})(T(\d{6})(Z)?)?/);
  if (!m) return null;
  const d = m[2];
  const y = d.slice(0, 4), mo = d.slice(4, 6), da = d.slice(6, 8);
  if (!m[3]) return { iso: `${y}-${mo}-${da}`, time: "" };
  const t = m[4];
  const hh = t.slice(0, 2), mi = t.slice(2, 4);
  if (m[5]) {
    // horário em UTC: converte para Fortaleza
    const dt = new Date(Date.UTC(+y, +mo - 1, +da, +hh, +mi));
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(dt);
    const g = (k) => parts.find((p) => p.type === k).value;
    return { iso: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour")}:${g("minute")}`.replace(/^24/, "00") };
  }
  return { iso: `${y}-${mo}-${da}`, time: `${hh}:${mi}` };
}

function field(block, name) {
  const re = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "m");
  return block.match(re)?.[1] || "";
}

// Soma dias a uma data AAAA-MM-DD
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function addMonths(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Gera as próximas ocorrências de um evento recorrente (RRULE) a partir de hoje
function expandRule(startIso, rule, exdates, today, limit) {
  const r = Object.fromEntries(rule.split(";").map((kv) => kv.split("=")));
  const freq = r.FREQ;
  const interval = parseInt(r.INTERVAL || "1", 10);
  const count = r.COUNT ? parseInt(r.COUNT, 10) : Infinity;
  const until = r.UNTIL ? `${r.UNTIL.slice(0, 4)}-${r.UNTIL.slice(4, 6)}-${r.UNTIL.slice(6, 8)}` : "9999-12-31";
  const byday = r.BYDAY ? r.BYDAY.split(",").map((x) => WEEKDAYS[x.slice(-2)]).filter((x) => x !== undefined) : null;
  const out = [];
  let n = 0;
  let guard = 0;
  let cursor = startIso;
  while (n < count && cursor <= until && out.length < limit && guard < 2000) {
    guard++;
    let candidates = [cursor];
    if (freq === "WEEKLY" && byday) {
      const base = new Date(cursor + "T12:00:00Z");
      const sunday = addDays(cursor, -base.getUTCDay());
      candidates = byday.map((wd) => addDays(sunday, wd)).filter((d) => d >= startIso).sort();
    }
    for (const c of candidates) {
      if (n >= count || c > until) break;
      n++;
      if (c >= today && !exdates.has(c)) out.push(c);
      if (out.length >= limit) break;
    }
    if (freq === "DAILY") cursor = addDays(cursor, interval);
    else if (freq === "WEEKLY") cursor = addDays(cursor, 7 * interval);
    else if (freq === "MONTHLY") cursor = addMonths(cursor, interval);
    else if (freq === "YEARLY") cursor = addMonths(cursor, 12 * interval);
    else break;
  }
  return out;
}

export default async function handler(req, res) {
  try {
    const calendarUrl = process.env.AGENDA_ICS_URL || FALLBACK_ICS_URL;
    const response = await fetch(calendarUrl);
    if (!response.ok) throw new Error(`Calendário respondeu ${response.status}`);
    const text = unfold(await response.text());
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Resposta não é um calendário iCal");

    const today = todayISO();
    const blocks = text.split("BEGIN:VEVENT").slice(1).map((raw) => raw.split("END:VEVENT")[0]);

    // Ocorrências alteradas individualmente (RECURRENCE-ID) substituem a original
    const overridden = new Set();
    for (const b of blocks) {
      const rid = b.match(/^RECURRENCE-ID[^\n]*$/m)?.[0];
      if (rid) {
        const st = parseStart(rid.replace(/^RECURRENCE-ID/, "DTSTART"));
        if (st) overridden.add(field(b, "UID") + "|" + st.iso);
      }
    }

    const occurrences = [];
    for (const block of blocks) {
      const start = parseStart(block.match(/^DTSTART[^\n]*$/m)?.[0] || "");
      if (!start) continue;
      if (/CANCELLED/i.test(field(block, "STATUS"))) continue;
      // Eventos marcados como "Particular" no Google Agenda não aparecem no site
      if (/PRIVATE|CONFIDENTIAL/i.test(field(block, "CLASS"))) continue;
      const base = {
        title: unescape(field(block, "SUMMARY")) || "Sem título",
        location: unescape(field(block, "LOCATION")),
        time: start.time
      };
      const uid = field(block, "UID");
      const rrule = field(block, "RRULE");
      if (rrule && !/^RECURRENCE-ID/m.test(block)) {
        const ex = new Set();
        for (const line of block.match(/^EXDATE[^\n]*$/gm) || []) {
          for (const v of line.split(":")[1].split(",")) {
            const st = parseStart("DTSTART:" + v.trim());
            if (st) ex.add(st.iso);
          }
        }
        for (const iso of expandRule(start.iso, rrule, ex, today, 8)) {
          if (!overridden.has(uid + "|" + iso)) occurrences.push({ ...base, iso });
        }
      } else if (start.iso >= today) {
        occurrences.push({ ...base, iso: start.iso });
      }
    }

    const events = occurrences
      .sort((a, b) => (a.iso + a.time).localeCompare(b.iso + b.time))
      .slice(0, 4)
      .map((e) => {
        const [y, m, d] = e.iso.split("-");
        return { title: e.title, location: e.location, date: `${d}/${m}`, time: e.time, sortDate: e.iso };
      });

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    res.status(200).json({ events });
  } catch (error) {
    res.status(500).json({ error: "Erro ao carregar agenda", details: error.message });
  }
}
