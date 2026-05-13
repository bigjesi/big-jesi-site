export default async function handler(req, res) {
  try {
    const calendarUrl =
      "https://calendar.google.com/calendar/ical/a5704bb24f37cb197e391843ac7494499f925ff83116ecfb6d88cc88eee93767%40group.calendar.google.com/private-db778302a3ea7298959f1f32f348a0dd/basic.ics";


    const response = await fetch(calendarUrl);
    const text = await response.text();


    const events = text
      .split("BEGIN:VEVENT")
      .slice(1)
      .map((event) => {
        const title = event.match(/SUMMARY:(.*)/)?.[1] || "Sem título";
        const location = event.match(/LOCATION:(.*)/)?.[1] || "";
        const dateRaw = event.match(/DTSTART(?:;VALUE=DATE)?:([0-9T]+)/)?.[1] || "";


        return {
          title: title.replace(/\\,/g, ","),
          location: location.replace(/\\,/g, ","),
          dateRaw
        };
      })
      .filter(event => event.dateRaw)
      .map(event => {
        const year = event.dateRaw.slice(0, 4);
        const month = event.dateRaw.slice(4, 6);
        const day = event.dateRaw.slice(6, 8);


        return {
          ...event,
          date: `${day}/${month}`,
          sortDate: `${year}-${month}-${day}`
        };
      })
      .filter(event => event.sortDate >= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.sortDate.localeCompare(b.sortDate))
      .slice(0, 4);


    res.status(200).json({ events });
  } catch (error) {
    res.status(500).json({
      error: "Erro ao carregar agenda",
      details: error.message
    });
  }
}