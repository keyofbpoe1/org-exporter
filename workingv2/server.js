// ===============================// ✅ IMPORTS (CLEAN + SAFE)
// ===============================
const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const compression = require("compression");
const fs = require("fs");

// ===============================
// ✅ APP SETUP
// ===============================
const app = express();

app.use(express.json());
app.use(compression());

const PORT = process.env.PORT || 3000;


// ===============================
// ✅ STREAM ORG DATA (FASTEST PATH)
// ===============================
app.post("/api/run-stream", (req, res) => {
  const { id, cookie } = req.body;

  if (!id || !cookie) {
    return res.status(400).json({ error: "Missing id or cookie" });
  }

  console.log("🚀 Starting org export:", id);

  const py = spawn("python", [
    path.join(__dirname, "../OrgExporter.py"),
    "--id", id,
    "--cookie", cookie
  ]);

  // ✅ streaming headers
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");

  // ✅ direct passthrough (zero buffering)
  py.stdout.pipe(res);

  // ✅ error logging
  py.stderr.on("data", (err) => {
    console.error("🐍 Python error:", err.toString());
  });

  py.on("error", (err) => {
    console.error("❌ Failed to start Python:", err);
    res.end();
  });

  py.on("close", (code) => {
    console.log(`✅ Python finished (exit ${code})`);
    res.end();
  });
});


// ===============================
// ✅ CSV EXPORT (STREAM‑BASED)
// ===============================
app.post("/api/run-csv", (req, res) => {
  const { id, cookie } = req.body;

  if (!id || !cookie) {
    return res.status(400).json({ error: "Missing id or cookie" });
  }

  console.log("📥 CSV request");

  const py = spawn("python", [
    path.join(__dirname, "../OrgExporter.py"),
    "--id", id,
    "--cookie", cookie
  ]);

  let buffer = "";
  const nodes = {};

  // ✅ collect streamed nodes
  py.stdout.on("data", (chunk) => {
    buffer += chunk.toString();

    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const msg = JSON.parse(line);

        if (msg.type === "node") {
          const n = msg.data;
          const nid = n.userId || n.id;

          if (nid) {
            nodes[nid] = n;
          }
        }

      } catch {
        // ignore partial JSON lines
      }
    }
  });

  py.stderr.on("data", (err) => {
    console.error("🐍 CSV error:", err.toString());
  });

  py.on("close", () => {
    try {
      // ✅ extract email field
      function extractEmail(node) {
        const fields = node.userCardFields || [];

        for (const f of fields) {
          if (f.label === "Email" && typeof f.value === "object") {
            return f.value.label || "";
          }
        }

        return "";
      }

      // ✅ build CSV
      const rows = Object.values(nodes).map(n => ({
        name: n.displayName || "",
        title: n.jobTitle || "",
        email: extractEmail(n)
      }));

      const csv =
        "Name,Title,Email\n" +
        rows.map(r =>
          `"${r.name}","${r.title}","${r.email}"`
        ).join("\n");

      // ✅ send to browser
      res.setHeader("Content-Disposition", "attachment; filename=org.csv");
      res.setHeader("Content-Type", "text/csv");

      res.send(csv);

      console.log("✅ CSV generated");

    } catch (err) {
      console.error("❌ CSV build error:", err);
      res.status(500).json({ error: "CSV failed" });
    }
  });
});


// ===============================
// ✅ SERVE FRONTEND
// ===============================
const distPath = path.join(__dirname, "../client/dist");

if (fs.existsSync(path.join(distPath, "index.html"))) {
  app.use(express.static(distPath));

  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  console.log("✅ Serving frontend build");
} else {
  console.log("⚠️ Frontend not built yet");
}


// ===============================
// ✅ START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
