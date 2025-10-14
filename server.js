const express = require("express");
const { execFile } = require("child_process");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => res.send("OK"));

app.post("/reencode", (req, res) => {
  const { url, clearMetadata = true, crf = 23 } = req.body || {};
  if (!url) return res.status(400).json({ error: "url required" });

  const out = path.join("/tmp", randomUUID() + ".mp4");
  const args = ["-i", url];
  if (clearMetadata) args.push("-map_metadata", "-1");
  args.push("-crf", String(crf), "-movflags", "+faststart", out);

  execFile("ffmpeg", args, (err) => {
    if (err) return res.status(500).json({ error: "ffmpeg failed", details: String(err) });
    res.sendFile(out, (sendErr) => {
      try { fs.unlinkSync(out); } catch {}
      if (sendErr) console.error(sendErr);
    });
  });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("reencode api listening on " + port));
