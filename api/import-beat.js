// Rota temporária: copia vídeos e capas do Instagram para o Vercel Blob, comprimindo os vídeos.
const { put, list, del, head } = require("@vercel/blob");
const ffmpegPath = require("ffmpeg-static");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const ALLOWED = /(^|\.)(fbcdn\.net|cdninstagram\.com)$/i;
const FOLDERS = ["30dias30beats", "bigbit"];

function run(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 20 }, (err, so, se) =>
      err ? reject(new Error(String(se).slice(-300))) : resolve()
    );
  });
}

async function compress(buf, code) {
  const src = path.join("/tmp", `${code}-in.mp4`);
  const out = path.join("/tmp", `${code}-out.mp4`);
  fs.writeFileSync(src, buf);
  await run([
    "-y", "-i", src,
    "-vf", "scale='if(gt(iw,ih),-2,min(360,iw))':'if(gt(iw,ih),min(360,ih),-2)'",
    "-c:v", "libx264", "-preset", "superfast", "-crf", "31", "-maxrate", "450k", "-bufsize", "900k", "-r", "24", "-threads", "0",
    "-c:a", "aac", "-b:a", "80k", "-movflags", "+faststart", out,
  ]);
  const data = fs.readFileSync(out);
  fs.unlinkSync(src); fs.unlinkSync(out);
  return data.length < buf.length ? data : buf;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  try {
    // GET ?purge=mp4&folder=... apaga os vídeos de uma pasta (mantém as capas)
    if (req.method === "GET" && req.query.purge === "mp4") {
      const folder = req.query.folder;
      if (!FOLDERS.includes(folder)) return res.status(400).json({ error: "folder" });
      let cursor, n = 0, bytes = 0;
      do {
        const r = await list({ prefix: folder + "/", cursor, limit: 1000 });
        const mp4 = r.blobs.filter(b => b.pathname.endsWith(".mp4"));
        if (mp4.length) { await del(mp4.map(b => b.url)); n += mp4.length; bytes += mp4.reduce((a, b) => a + b.size, 0); }
        cursor = r.hasMore ? r.cursor : null;
      } while (cursor);
      return res.status(200).json({ ok: true, deleted: n, bytes });
    }
    // GET ?usage=1 soma o tamanho de tudo
    if (req.method === "GET" && req.query.usage) {
      let cursor, n = 0, bytes = 0;
      do {
        const r = await list({ cursor, limit: 1000 });
        n += r.blobs.length; bytes += r.blobs.reduce((a, b) => a + b.size, 0);
        cursor = r.hasMore ? r.cursor : null;
      } while (cursor);
      return res.status(200).json({ ok: true, files: n, bytes });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "use POST" });

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { code, url, kind } = body;
    const folder = body.folder || "30dias30beats";
    if (!FOLDERS.includes(folder)) return res.status(400).json({ error: "folder" });
    if (!/^[A-Za-z0-9_-]{5,20}$/.test(code || "")) return res.status(400).json({ error: "code" });
    if (!["mp4", "jpg"].includes(kind)) return res.status(400).json({ error: "kind" });
    if (!ALLOWED.test(new URL(url).hostname)) return res.status(400).json({ error: "host" });

    if (kind === "mp4") {
      try { const h = await head(`${folder}/${code}.mp4`); if (h && h.size < 9 * 1024 * 1024) return res.status(200).json({ ok: true, skipped: true, original: 0, size: 0 }); } catch (e) {}
    }
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: "fetch " + r.status });
    let data = Buffer.from(await r.arrayBuffer());
    const original = data.length;
    if (kind === "mp4") data = await compress(data, code);

    await put(`${folder}/${code}.${kind}`, data, {
      access: "public",
      contentType: kind === "mp4" ? "video/mp4" : "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return res.status(200).json({ ok: true, original, size: data.length });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
