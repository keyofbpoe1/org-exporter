import React, { useState, useRef } from "react";

export default function App() {
  const [id, setId] = useState("");
  const [cookie, setCookie] = useState("");

  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [nodes, setNodes] = useState({});
  const [loading, setLoading] = useState(false);

  const abortRef = useRef(null);

  /* ===============================
     RUN STREAM (REAL-TIME)
  ============================== */
  const run = async () => {
    if (!id || !cookie) {
      alert("Enter Org ID and Cookie");
      return;
    }

    setLoading(true);
    setStatus("Starting...");
    setProgress(0);
    setNodes({});

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
          cookie: cookie.trim()
        }),
        signal: controller.signal
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = {};
      let textBuffer = "";

      // ✅ LOCAL MAP (avoid excessive re-renders)
      let localNodes = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        const lines = textBuffer.split("\n");
        textBuffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const msg = JSON.parse(line);

            /* ✅ NODE EVENT */
            if (msg.type === "node") {
              const { parent, data } = msg;
              const cid = data.userId || data.id;

              if (!cid) continue;

              const newNode = {
                ...data,
                children: []
              };

              localNodes[cid] = newNode;

              if (localNodes[parent]) {
                localNodes[parent].children.push(newNode);
              }
            }

            /* ✅ PROGRESS */
            if (msg.type === "progress") {
              setProgress(msg.value);

              // ✅ batch UI updates (avoid lag)
              if (msg.value % 5 === 0) {
                setNodes({ ...localNodes });
              }
            }

            /* ✅ DONE */
            if (msg.type === "done") {
              setNodes({ ...localNodes });
              setStatus("✅ Completed");
              setLoading(false);
            }

          } catch {
            // ignore partial JSON fragments
          }
        }
      }

    } catch (err) {
      setLoading(false);

      if (err.name === "AbortError") {
        setStatus("🛑 Cancelled");
      } else {
        setStatus("❌ Error: " + err.message);
      }
    }
  };

  /* ===============================
     CANCEL
  ============================== */
  const cancel = () => {
    abortRef.current?.abort();
    setLoading(false);
    setStatus("🛑 Cancelling...");
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
      setStatus("Generating CSV...");

      const res = await fetch("/api/run-csv", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ id, cookie: cookie.trim() })
      });

      const blob = await res.blob();

      if (!blob || blob.size === 0) {
        throw new Error("Empty file");
      }

      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "org.csv";

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
     CLEAR
  ============================== */
  const clear = () => {
    setNodes({});
    setProgress(0);
    setStatus("");
  };

  /* ===============================
     UI
  ============================== */
  return (
    <div style={{
      padding: 24,
      maxWidth: 1000,
      margin: "auto",
      fontFamily: "Arial"
    }}>
      <h2>🚀 Org Explorer (Max Performance)</h2>

      {/* INPUTS */}
      <div style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="Org ID"
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
      <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
        <button onClick={run} disabled={loading}>
          {loading ? "Running..." : "Run"}
        </button>

        <button onClick={cancel}>
          Cancel
        </button>

        <button onClick={downloadCSV}>
          CSV
        </button>

        <button onClick={clear}>
          Clear
        </button>
      </div>

      {/* PROGRESS */}
      <div style={{ marginTop: 16 }}>
        <div>Progress: {progress}</div>

        <div style={{
          height: 12,
          background: "#ddd",
          borderRadius: 6,
          marginTop: 5
        }}>
          <div style={{
            width: `${Math.min(progress, 100)}%`,
            height: "100%",
            background: "green",
            borderRadius: 6
          }} />
        </div>
      </div>

      {/* STATUS */}
      <div style={{ marginTop: 10 }}>
        {status}
      </div>

      {/* RESULT SIZE */}
      <div style={{ marginTop: 10 }}>
        Nodes loaded: {Object.keys(nodes).length}
      </div>

      {/* DEBUG OUTPUT */}
      <pre style={{
        marginTop: 20,
        background: "#f6f6f6",
        padding: 12,
        maxHeight: 400,
        overflow: "auto",
        fontSize: 12
      }}>
        {JSON.stringify(nodes, null, 2)}
      </pre>
    </div>
  );
}