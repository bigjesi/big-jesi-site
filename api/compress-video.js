// Rota temporária: comprime um vídeo já guardado no Blob e substitui pelo arquivo menor.
const { put, del, head } = require("@vercel/blob");
const ffmpegPath = require("ffmpeg-static");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const FOLDERS = ["30dias30beats", "bigbit"];

function run(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 1024 * 1024 * 20 }, (err, stdout, stderr) =>
      err ? reject(new Error(String(stderr).slice(-400))) : resolve()
    );
  });
}

module.exports = async function handler(req, res) {
  try {
    const { folder, code } = req.query;
    if (!FOLDERS.includes(folder)) return res.status(400).json({ error: "folder" });
    if (!/^[A-Za-z0-9_-]{5,20}$/.test(code || "")) return res.status(400).json({ error: "code" });

    const pathname = `${folder}/${code}.mp4`;
    const info = await head(pathname);
    const before = info.size;
    if (before < 2.5 * 1024 * 1024) return res.status(200).json({ ok: true, skipped: true, before });

    const r = await fetch(info.url);
    const src = path.join("/tmp", `${code}-in.mp4`);
    const out = path.join("/tmp", `${code}-out.mp4`);
    fs.writeFileSync(src, Buffer.from(await r.arrayBuffer()));

    await run([
      "-y", "-i", src,
      "-vf", "scale='if(gt(iw,ih),-2,min(540,iw))':'if(gt(iw,ih),min(540,ih),-2)'",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "29",
      "-c:a", "aac", "-b:a", "96k",
      "-movflags", "+faststart",
      out,
    ]);
    const data = fs.readFileSync(out);
    fs.unlinkSync(src);
    fs.unlinkSync(out);

    if (data.length >= before) return res.status(200).json({ ok: true, kept: true, before, after: data.length });

    await del(info.url);
    let saved = null, lastErr = null;
    for (let i = 0; i < 3 && !saved; i++) {
      try {
        saved = await put(pathname, data, { access: "public", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true });
      } catch (e) { lastErr = e; }
    }
    if (!saved) return res.status(500).json({ error: "put " + (lastErr && lastErr.message) });
    return res.status(200).json({ ok: true, before, after: data.length });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
};
