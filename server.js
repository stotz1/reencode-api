const express = require("express");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

function downloadToFile(fileUrl, outPath) {
  return new Promise((resolve, reject) => {
    const doReq = (url, redirects = 0) => {
      const lib = url.startsWith("https") ? https : http;
      const req = lib.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects > 5) return reject(new Error("Too many redirects"));
          return doReq(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) return reject(new Error("Download failed with status " + res.statusCode));
        const file = fs.createWriteStream(outPath);
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", (e) => reject(e));
      });
      req.on("error", reject);
    };
    doReq(fileUrl);
  });
}

const app = express();
app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) => res.send("OK"));

app.post("/reencode", async (req, res) => {
  const { url, clearMetadata = true, crf = 23 } = req.body || {};
  if (!url) return res.status(400).json({ error: "url required" });

  const inPath = path.join("/tmp", randomUUID() + "_in.mp4");
  try {
    await downloadToFile(url, inPath);
  } catch (e) {
    return res.status(500).json({ error: "download failed", details: String(e && e.message || e) });
  }

  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", 'attachment; filename="out.mp4"');
  res.setHeader("Cache-Control", "no-store");
  if (res.flushHeaders) res.flushHeaders();
  res.setTimeout(0);

  const args = ["-hide_banner", "-loglevel", "error", "-i", inPath];
  if (clearMetadata) args.push("-map_metadata", "-1");
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart", "-f", "mp4", "pipe:1");

  const ff = spawn("ffmpeg", args);
  ff.stdout.pipe(res);

  let finished = false;
  ff.on("close", (code) => {
    try { fs.unlinkSync(inPath); } catch {}
    if (!finished && code !== 0) {
      try { res.end(); } catch {}
    }
  });
  res.on("close", () => {
    finished = true;
    try { ff.kill("SIGKILL"); } catch {}
    try { fs.unlinkSync(inPath); } catch {}
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("reencode api v3 streaming on " + port));
