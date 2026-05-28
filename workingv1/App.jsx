import React, { useState, useRef } from "react";

export default function App() {
  const [id, setId] = useState("");
  const [cookie, setCookie] = useState("");

  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const [jobId, setJobId] = useState(null);

  const abortRef = useRef(null);

  /* ===============================
     RUN EXPORT (STREAMING)
  ============================== */
  const run = async () => {
    if (!id || !cookie) {
      alert("Please enter Org ID and Cookie");
      return;
    }

    setProgress(0);
    setStatus("Running...");
    setResult(null);
    setJobId(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/run-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id,
          cookie: cookie.trim() // ✅ critical fix
        }),
        signal: controller.signal
      });

      const job = res.headers.get("X-Job-Id");
      if (job) setJobId(job);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep incomplete chunk

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const msg = JSON.parse(line);

            if (msg.type === "progress") {
              setProgress(msg.value);
            }

            if (msg.type === "result") {
              setResult(msg.data);
              setStatus("✅ Completed");
            }

            if (msg.type === "status") {
              setStatus(msg.message);
            }

          } catch {
            // ignore malformed chunk
          }
        }
      }

    } catch (err) {
      if (err.name === "AbortError") {
        setStatus("🛑 Cancelled");
      } else {
        setStatus("❌ Error: " + err.message);
      }
    }
  };

  /* ===============================
     CANCEL JOB
  ============================== */
  const cancel = async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    if (jobId) {
      try {
        await fetch("/api/cancel", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ jobId })
        });
      } catch {}
    }

    setStatus("🛑 Cancelling...");
    setProgress(0);
  };

  /* ===============================
     DOWNLOAD CSV
  ============================== */
  const downloadCSV = async () => {
    if (!id || !cookie) {
      alert("Missing Org ID or Cookie");
      return;
    }

    try {
      const res = await fetch("/api/run-csv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id,
          cookie: cookie.trim()
        })
      });

      const blob = await res.blob();

      if (!blob || blob.size === 0) {
        setStatus("❌ CSV download failed");
        return;
      }

      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `org_${id}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      URL.revokeObjectURL(url);

      setStatus("✅ CSV downloaded");

    } catch (err) {
      setStatus("❌ CSV Error: " + err.message);
    }
  };

  /* ===============================
     UI
  ============================== */
  return (
    <div style={{
      padding: 24,
      maxWidth: 900,
      margin: "auto",
      fontFamily: "Arial"
    }}>
      <h2>Org Exporter Tool</h2>

      {/* INPUTS */}
      <div style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="Enter Org ID (e.g. 5430)"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />

        <textarea
          placeholder="Paste Cookie"
          value={cookie}
          onChange={(e) => setCookie(e.target.value)}
          rows={4}
        />
      </div>

      {/* BUTTONS */}
      <div style={{
        marginTop: 12,
        display: "flex",
        gap: 10,
        flexWrap: "wrap"
      }}>
        <button onClick={run}>Run Export</button>
        <button onClick={cancel}>Cancel</button>
        <button onClick={downloadCSV}>Download CSV</button>
      </div>

      {/* PROGRESS */}
      <div style={{ marginTop: 15 }}>
        <div>Progress: {progress}%</div>

        <div style={{
          height: 12,
          background: "#ddd",
          borderRadius: 6,
          marginTop: 5
        }}>
          <div style={{
            width: `${progress}%`,
            height: "100%",
            background: "green",
            borderRadius: 6,
            transition: "width 0.2s"
          }} />
        </div>
      </div>

      {/* STATUS */}
      <div style={{ marginTop: 10 }}>
        {status}
      </div>

      {/* JOB ID */}
      {jobId && (
        <div style={{
          marginTop: 6,
          fontSize: 12,
          color: "#888"
        }}>
          Job ID: {jobId}
        </div>
      )}

      {/* RESULT */}
      {result && (
        <pre style={{
          marginTop: 20,
          background: "#f6f6f6",
          padding: 12,
          overflow: "auto",
          maxHeight: 400,
          fontSize: 12
        }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}