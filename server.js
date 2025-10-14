const express = require("express");
const { execFile } = require("child_process");
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
  try {
    const { url, clearMetadata = true, crf = 23 } = req.body || {};
    if (!url) return res.status(400).json({ error: "url required" });

    const inPath = path.join("/tmp", randomUUID() + "_in.mp4");
    const outPath = path.join("/tmp", randomUUID() + "_out.mp4");

    await downloadToFile(url, inPath);

    const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", inPath];
    if (clearMetadata) args.push("-map_metadata", "-1");
    args.push("-crf", String(crf), "-movflags", "+faststart", outPath);

    execFile("ffmpeg", args, (err) => {
      try { fs.unlinkSync(inPath); } catch {}
      if (err) return res.status(500).json({ error: "ffmpeg failed", details: String(err) });
      res.sendFile(outPath, (sendErr) => {
        try { fs.unlinkSync(outPath); } catch {}
        if (sendErr) console.error(sendErr);
      });
    });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("reencode api v2 listening on " + port));
