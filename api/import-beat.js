// Rota temporária: copia vídeos e capas do #30dias30beats do Instagram para o Vercel Blob.
// Só aceita endereços da CDN do Instagram e grava apenas em 30dias30beats/<codigo>.<ext>.
const { put } = require("@vercel/blob");

const ALLOWED = /(^|\.)(fbcdn\.net|cdninstagram\.com)$/i;

module.exports.config = { maxDuration: 60 };

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "use POST" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { code, url, kind } = body;
    if (!/^[A-Za-z0-9_-]{5,20}$/.test(code || "")) return res.status(400).json({ error: "code" });
    if (!["mp4", "jpg", "json"].includes(kind)) return res.status(400).json({ error: "kind" });

    let data, type;
    if (kind === "json") {
      data = JSON.stringify(body.data || null);
      type = "application/json";
    } else {
      const host = new URL(url).hostname;
      if (!ALLOWED.test(host)) return res.status(400).json({ error: "host" });
      const r = await fetch(url);
      if (!r.ok) return res.status(502).json({ error: "fetch " + r.status });
      data = Buffer.from(await r.arrayBuffer());
      type = kind === "mp4" ? "video/mp4" : "image/jpeg";
    }

    const blob = await put(`30dias30beats/${code}.${kind}`, data, {
      access: "public",
      contentType: type,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.status(200).json({ ok: true, url: blob.url, size: data.length });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
};
