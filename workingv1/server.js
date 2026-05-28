const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PYTHON_CMD = process.platform === "win32" ? "python" : "python3";

/* ===============================
   STREAM RUN (STABLE)
================================ */
app.post("/api/run-stream", (req, res) => {
  const { id, cookie } = req.body;

  if (!id || !cookie) {
    return res.status(400).json({ error: "Missing id or cookie" });
  }

  console.log("✅ Run request");

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Transfer-Encoding", "chunked");

  const jobId = Date.now().toString();
  res.setHeader("X-Job-Id", jobId);

  const py = spawn(PYTHON_CMD, [
    path.join(__dirname, "../OrgExporter.py"),
    "--id", id,
    "--cookie", cookie,
    "--pretty"
  ]);

  let buffer = "";

  py.stdout.on("data", (chunk) => {
    buffer += chunk.toString();

    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;

      // ✅ PROGRESS EVENTS
      const match = line.match(/PROGRESS:(\d+)/);
      if (match) {
        res.write(JSON.stringify({
          type: "progress",
          value: Math.min(parseInt(match[1], 10), 100)
        }) + "\n");
      }

      // ✅ RESULT JSON
      if (line.trim().startsWith("{")) {
        try {
          const json = JSON.parse(line);

          res.write(JSON.stringify({
            type: "result",
            data: json
          }) + "\n");

        } catch {}
      }
    }
  });

  py.stderr.on("data", (err) => {
    console.error("PY ERROR:", err.toString());

    res.write(JSON.stringify({
      type: "status",
      message: err.toString()
    }) + "\n");
  });

  py.on("close", () => {
    console.log("✅ Run complete");
    res.end();
  });
});


/* ===============================
   ✅ CSV DOWNLOAD (FINAL)
================================ */
app.post("/api/run-csv", (req, res) => {
  const { id, cookie } = req.body;

  if (!id || !cookie) {
    return res.status(400).json({ error: "Missing id or cookie" });
  }

  console.log("📥 CSV request");

  const py = spawn(PYTHON_CMD, [
    path.join(__dirname, "../OrgExporter.py"),
    "--id", id,
    "--cookie", cookie,
    "--pretty"
  ]);

  let raw = "";

  py.stdout.on("data", (chunk) => {
    raw += chunk.toString();
  });

  py.stderr.on("data", (err) => {
    console.error("CSV ERROR:", err.toString());
  });

  py.on("close", () => {
    try {
      /* ✅ Remove PROGRESS lines */
      const cleaned = raw
        .split("\n")
        .filter(line => !line.startsWith("PROGRESS:"))
        .join("\n")
        .trim();

      /* ✅ Extract JSON safely */
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");

      const jsonText = cleaned.slice(start, end + 1);

      const data = JSON.parse(jsonText);

      /* ✅ CSV BUILD */
      const rows = [];

      function extractEmail(node) {
        const fields = node.userCardFields || [];

        for (const f of fields) {
          if (f.label === "Email") {
            if (typeof f.value === "object") {
              return f.value.label || "";
            }
          }
        }
        return "";
      }

      function walk(node) {
        (node.directReports || []).forEach(c => {
          const n = c.node;

          rows.push({
            displayName: n.displayName || "",
            jobTitle: n.jobTitle || "",
            Email: extractEmail(n)
          });

          walk(c);
        });
      }

      walk(data);

      const csv =
        "displayName,jobTitle,Email\n" +
        rows.map(r =>
          `"${r.displayName}","${r.jobTitle}","${r.Email}"`
        ).join("\n");

      /* ✅ SEND TO BROWSER */
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=org_${id}.csv`
      );
      res.setHeader("Content-Type", "text/csv");

      res.send(csv);

      console.log("✅ CSV sent");

    } catch (err) {
      console.error("❌ CSV build error:", err);
      res.status(500).json({ error: "CSV generation failed" });
    }
  });
});


/* ===============================
   SERVE FRONTEND
================================ */
const distPath = path.join(__dirname, "../client/dist");

if (fs.existsSync(path.join(distPath, "index.html"))) {
  app.use(express.static(distPath));

  app.get("*", (_, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  console.log("✅ Serving frontend");
} else {
  console.log("⚠️ Run: cd client && npm run build");
}


/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});