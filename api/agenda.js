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

export default async function handler(req, res) {
  try {
    const calendarUrl = process.env.AGENDA_ICS_URL || FALLBACK_ICS_URL;
    const response = await fetch(calendarUrl);
    if (!response.ok) throw new Error(`Calendário respondeu ${response.status}`);
    const text = unfold(await response.text());
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Resposta não é um calendário iCal");

    const today = todayISO();

    const events = text
      .split("BEGIN:VEVENT")
      .slice(1)
      .map((raw) => raw.split("END:VEVENT")[0])
      .map((block) => {
        const startLine = block.match(/^DTSTART[^\n]*$/m)?.[0] || "";
        const start = parseStart(startLine);
        const status = field(block, "STATUS");
        return {
          title: unescape(field(block, "SUMMARY")) || "Sem título",
          location: unescape(field(block, "LOCATION")),
          start,
          cancelled: /CANCELLED/i.test(status)
        };
      })
      .filter((e) => e.start && !e.cancelled && e.start.iso >= today)
      .sort((a, b) => (a.start.iso + a.start.time).localeCompare(b.start.iso + b.start.time))
      .slice(0, 4)
      .map((e) => {
        const [y, m, d] = e.start.iso.split("-");
        return {
          title: e.title,
          location: e.location,
          date: `${d}/${m}`,
          time: e.start.time,
          sortDate: e.start.iso
        };
      });

    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=3600");
    res.status(200).json({ events });
  } catch (error) {
    res.status(500).json({ error: "Erro ao carregar agenda", details: error.message });
  }
}
