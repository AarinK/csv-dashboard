import { useState, useCallback, useMemo, useRef, useEffect } from "react";

// ─── Tiny Chart component via Canvas ───────────────────────────────────────
function BarChart({ data, color = "#2563eb", horizontal = false, pctSuffix = false }) {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data?.length) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const max = Math.max(...data.map(d => d.value), 0.001);
    const pad = { top: 8, right: 8, bottom: horizontal ? 20 : 28, left: horizontal ? 100 : 8 };
    const barCount = data.length;
    if (horizontal) {
      const barH = Math.max(4, (H - pad.top - pad.bottom) / barCount - 4);
      data.forEach((d, i) => {
        const y = pad.top + i * ((H - pad.top - pad.bottom) / barCount);
        const barW = (d.value / max) * (W - pad.left - pad.right);
        ctx.fillStyle = "#e2e8f0";
        ctx.beginPath(); ctx.roundRect(pad.left, y + (((H - pad.top - pad.bottom) / barCount) - barH) / 2, W - pad.left - pad.right, barH, 3); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.roundRect(pad.left, y + (((H - pad.top - pad.bottom) / barCount) - barH) / 2, Math.max(2, barW), barH, 3); ctx.fill();
        ctx.fillStyle = "#64748b"; ctx.font = "10px system-ui"; ctx.textAlign = "right";
        ctx.fillText(d.label.length > 12 ? d.label.slice(0, 11) + "…" : d.label, pad.left - 4, y + (((H - pad.top - pad.bottom) / barCount)) / 2 + 4);
        ctx.fillStyle = "#334155"; ctx.textAlign = "left";
        const valStr = pctSuffix ? d.value.toFixed(2) + "%" : fmtNum(d.value);
        ctx.fillText(valStr, pad.left + barW + 4, y + (((H - pad.top - pad.bottom) / barCount)) / 2 + 4);
      });
    } else {
      const barW = Math.max(2, (W - pad.left - pad.right) / barCount - 4);
      data.forEach((d, i) => {
        const x = pad.left + i * ((W - pad.left - pad.right) / barCount);
        const barH = (d.value / max) * (H - pad.top - pad.bottom);
        ctx.fillStyle = color + "33";
        ctx.beginPath(); ctx.roundRect(x, pad.top, barW, H - pad.top - pad.bottom, 3); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.roundRect(x, H - pad.bottom - barH, barW, barH, 3); ctx.fill();
        ctx.fillStyle = "#64748b"; ctx.font = "9px system-ui"; ctx.textAlign = "center";
        ctx.fillText(d.label.length > 6 ? d.label.slice(0, 5) + "…" : d.label, x + barW / 2, H - 6);
      });
    }
  }, [data, color, horizontal, pctSuffix]);
  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

function LineChart({ series }) {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !series?.length) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);
    const allVals = series.flatMap(s => s.data.map(d => d.value));
    const min = 0, max = Math.max(...allVals, 0.001);
    const pad = { top: 12, right: 12, bottom: 28, left: 40 };
    const colors = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed"];
    series.forEach((s, si) => {
      if (!s.data.length) return;
      const col = colors[si % colors.length];
      const pts = s.data.map((d, i) => ({
        x: pad.left + (i / Math.max(s.data.length - 1, 1)) * (W - pad.left - pad.right),
        y: pad.top + (1 - (d.value - min) / (max - min)) * (H - pad.top - pad.bottom)
      }));
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = "round";
      ctx.beginPath(); pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.stroke();
      ctx.fillStyle = col;
      pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); });
    });
    if (series[0]?.data) {
      ctx.fillStyle = "#94a3b8"; ctx.font = "9px system-ui"; ctx.textAlign = "center";
      const step = Math.max(1, Math.floor(series[0].data.length / 8));
      series[0].data.forEach((d, i) => {
        if (i % step === 0) ctx.fillText(d.label, pad.left + (i / Math.max(series[0].data.length - 1, 1)) * (W - pad.left - pad.right), H - 6);
      });
    }
    [0, 0.5, 1].forEach(t => {
      const y = pad.top + (1 - t) * (H - pad.top - pad.bottom);
      ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.fillStyle = "#94a3b8"; ctx.font = "9px system-ui"; ctx.textAlign = "right";
      ctx.fillText((min + t * (max - min)).toFixed(1) + "%", pad.left - 3, y + 3);
    });
  }, [series]);
  return <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtNum(n) {
  if (n >= 1e7) return (n / 1e7).toFixed(2) + "Cr";
  if (n >= 1e5) return (n / 1e5).toFixed(1) + "L";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString();
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = [];
    let cur = "", inq = false;
    for (const ch of line) {
      if (ch === '"') { inq = !inq; }
      else if (ch === "," && !inq) { cols.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cols.push(cur.trim());
    if (cols.length >= 2) rows.push(cols);
  }
  return { headers, rows };
}

function guessMapping(headers) {
  const map = {};
  const lc = headers.map(h => h.toLowerCase());
  const find = (keywords) => headers[lc.findIndex(h => keywords.some(k => h.includes(k)))] ?? "";
  map.sale = find(["sale", "sold", "dispatch", "qty", "quantity", "supply"]);
  map.uns = find(["uns", "unsold", "return", "waste", "back", "reject"]);
  map.sorg = find(["sorg", "org", "dealer", "agent", "branch", "store", "outlet", "code", "id"]);
  map.publ = find(["publ", "pub", "paper", "edition", "product", "title", "news"]);
  map.location = find(["loc", "city", "region", "state", "zone", "area", "district"]);
  map.year = find(["year", "yr", "fy"]);
  map.month = find(["month", "mon", "period", "date"]);
  map.channel = find(["channel", "ch", "type", "mode", "cat"]);
  return map;
}

// ─── Upload Screen ───────────────────────────────────────────────────────────
function UploadScreen({ onData }) {
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef();

  const processFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith(".csv")) { setError("Please upload a .csv file"); return; }
    setStatus("Reading file…"); setError("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const { headers, rows } = parseCSV(e.target.result);
        if (!rows.length) { setError("No data rows found in CSV"); return; }
        setStatus(`✓ Loaded ${rows.length.toLocaleString()} rows`);
        onData({ headers, rows, filename: file.name });
      } catch (err) { setError("Error parsing CSV: " + err.message); setStatus(""); }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0f172a,#1e3a5f)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <h1 style={{ color: "#f1f5f9", fontSize: 28, fontWeight: 800, margin: "0 0 8px", letterSpacing: -0.5 }}>
            CSV Analytics <span style={{ color: "#38bdf8" }}>Dashboard</span>
          </h1>
          <p style={{ color: "#64748b", fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Upload any CSV — the dashboard auto-detects your columns and lets you map them to the right fields.
          </p>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
          style={{
            border: `2px dashed ${dragging ? "#38bdf8" : "rgba(56,189,248,0.3)"}`,
            borderRadius: 16, padding: "40px 24px", cursor: "pointer",
            background: dragging ? "rgba(56,189,248,0.08)" : "rgba(255,255,255,0.04)",
            transition: "all 0.2s", marginBottom: 16
          }}
        >
          <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => processFile(e.target.files[0])} />
          <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
          <p style={{ color: "#94a3b8", fontSize: 15, margin: 0 }}>Drop CSV here or <span style={{ color: "#38bdf8", fontWeight: 600 }}>click to browse</span></p>
          <p style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>Any CSV format — columns are mapped in the next step</p>
        </div>

        {status && <p style={{ color: "#4ade80", fontSize: 14, margin: "8px 0" }}>{status}</p>}
        {error && <p style={{ color: "#f87171", fontSize: 14, margin: "8px 0" }}>{error}</p>}

        <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "14px 18px", textAlign: "left", marginTop: 16 }}>
          <p style={{ color: "#64748b", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 6px" }}>Works with any CSV</p>
          <p style={{ color: "#475569", fontSize: 12, margin: 0, lineHeight: 1.7, fontFamily: "monospace" }}>
            Sale qty, UNS/returns, location, channel, date, product — columns are mapped by you after upload
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Column Mapper ───────────────────────────────────────────────────────────
const FIELD_DEFS = [
  { key: "sale", label: "Sale / Dispatched Qty", required: true, numeric: true },
  { key: "uns", label: "Unsold / Returns Qty", required: true, numeric: true },
  { key: "sorg", label: "Sales Org / Dealer / Branch", required: false },
  { key: "publ", label: "Publication / Product", required: false },
  { key: "location", label: "Location / Region", required: false },
  { key: "year", label: "Year", required: false },
  { key: "month", label: "Month / Period", required: false },
  { key: "channel", label: "Channel / Type", required: false },
];

function ColumnMapper({ headers, rows, filename, onMapped }) {
  const [mapping, setMapping] = useState(() => guessMapping(headers));
  const [error, setError] = useState("");

  const handleSubmit = () => {
    if (!mapping.sale || !mapping.uns) { setError("Sale and Unsold columns are required"); return; }
    const saleIdx = headers.indexOf(mapping.sale);
    const unsIdx = headers.indexOf(mapping.uns);
    const parsed = rows.map(r => {
      const sale = parseFloat(r[saleIdx]) || 0;
      const uns = parseFloat(r[unsIdx]) || 0;
      const rowObj = {};

headers.forEach((h, idx) => {
   rowObj[h] = r[idx] || "";
});

rowObj.sale = sale;
rowObj.uns = uns;

return rowObj;
    }).filter(r => r.sale > 0 || r.uns > 0);
    onMapped(parsed, mapping);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0f172a,#1e3a5f)", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ maxWidth: 620, width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "32px 36px" }}>
        <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Map Your Columns</h2>
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 24px" }}>
          <span style={{ color: "#38bdf8" }}>{filename}</span> · {rows.length.toLocaleString()} rows · {headers.length} columns detected
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          {FIELD_DEFS.map(f => (
            <div key={f.key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "center" }}>
              <div>
                <p style={{ color: f.required ? "#38bdf8" : "#94a3b8", fontSize: 13, fontWeight: 600, margin: 0 }}>
                  {f.label} {f.required && <span style={{ color: "#f87171" }}>*</span>}
                </p>
                {f.numeric && <p style={{ color: "#475569", fontSize: 11, margin: 0 }}>numeric</p>}
              </div>
              <select
                value={mapping[f.key] || ""}
                onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: mapping[f.key] ? "#f1f5f9" : "#475569", padding: "8px 12px", fontSize: 13, width: "100%" }}
              >
                <option value="">— skip —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>

        {error && <p style={{ color: "#f87171", fontSize: 13, marginTop: 16 }}>{error}</p>}

        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <button onClick={handleSubmit} style={{ flex: 1, background: "#2563eb", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700, padding: "12px 0", cursor: "pointer" }}>
            Build Dashboard →
          </button>
          <button onClick={() => onMapped(null)} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#94a3b8", fontSize: 13, padding: "12px 16px", cursor: "pointer" }}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, accent = "#2563eb", icon }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff", borderRadius: 12, padding: "16px 18px", position: "relative", overflow: "hidden",
        boxShadow: hovered ? "0 12px 28px rgba(0,0,0,0.12)" : "0 1px 3px rgba(0,0,0,0.06)",
        transform: hovered ? "translateY(-5px) scale(1.02)" : "none",
        transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)", cursor: "default", border: "1px solid #e2e8f0"
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: "12px 12px 0 0" }} />
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#64748b", margin: "0 0 6px" }}>{label}</p>
      <p style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#0f172a", margin: "0 0 4px", lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>{sub}</p>}
      {icon && <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 22, opacity: 0.1 }}>{icon}</div>}
    </div>
  );
}

// ─── Chart Card ──────────────────────────────────────────────────────────────
function ChartCard({ title, sub, children, height = 220 }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: "#fff", borderRadius: 12, padding: "16px 18px", border: "1px solid #e2e8f0",
        boxShadow: hovered ? "0 10px 24px rgba(0,0,0,0.09)" : "0 1px 3px rgba(0,0,0,0.05)",
        transform: hovered ? "translateY(-4px)" : "none",
        transition: "all 0.2s cubic-bezier(0.34,1.56,0.64,1)"
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", color: "#334155", margin: "0 0 2px" }}>{title}</p>
      {sub && <p style={{ fontSize: 11, color: "#94a3b8", margin: "0 0 12px" }}>{sub}</p>}
      <div style={{ height, marginTop: sub ? 0 : 12 }}>{children}</div>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────
function Dashboard({ data, mapping, filename, onReset }) {
  const [activeTab, setActiveTab] = useState("overview");
const [filters, setFilters] = useState({});
 const uniques = useMemo(() => {

  if (!data.length) return {};

  const cols = Object.keys(data[0]);

  const result = {};

  cols.forEach(col => {
    result[col] = [
      ...new Set(
        data.map(r => r[col])
         .filter(v => v !== "" && v !== null && v !== undefined)
      )
    ].sort();
  });

  return result;

}, [data]);

  const filtered = useMemo(() => {

 return data.filter(row =>
   Object.keys(filters).every(key =>
      !filters[key] || row[key] === filters[key]
   )
 );

}, [data, filters]);

  const totSale = useMemo(() => filtered.reduce((s, r) => s + r.sale, 0), [filtered]);
  const totUns = useMemo(() => filtered.reduce((s, r) => s + r.uns, 0), [filtered]);
  const pct = totSale > 0 ? (totUns / totSale * 100) : 0;
  const nMonths = useMemo(() => new Set(filtered.map(r => r.month).filter(Boolean)).size || 1, [filtered]);
  const daily = Math.round(totUns / (nMonths * 30));

  const agg = (rows, key) => {
    const m = {};
    rows.forEach(r => {
      const k = r[key] || "—";
      if (!m[k]) m[k] = { sale: 0, uns: 0 };
      m[k].sale += r.sale; m[k].uns += r.uns;
    });
    return Object.entries(m).map(([k, v]) => ({ label: k, sale: v.sale, uns: v.uns, pct: v.sale > 0 ? v.uns / v.sale * 100 : 0 }));
  };

  const hasSorg = mapping.sorg, hasPubl = mapping.publ, hasLoc = mapping.location, hasTime = mapping.month || mapping.year, hasCh = mapping.channel;

  const byPubl = useMemo(() => agg(filtered, "publ").sort((a, b) => b.uns - a.uns), [filtered]);
  const bySorg = useMemo(() => agg(filtered, "sorg").sort((a, b) => b.uns - a.uns), [filtered]);
  const bySorgPct = useMemo(() => agg(filtered, "sorg").sort((a, b) => b.pct - a.pct), [filtered]);
  const byLoc = useMemo(() => agg(filtered, "location").sort((a, b) => b.uns - a.uns), [filtered]);
  const byMonth = useMemo(() => agg(filtered, "month"), [filtered]);
  const byCh = useMemo(() => agg(filtered, "channel").sort((a, b) => b.pct - a.pct), [filtered]);
  const byYear = useMemo(() => agg(filtered, "year").sort((a, b) => a.label.localeCompare(b.label)), [filtered]);

const filterKeys = Object.keys(uniques)
  .filter(k => uniques[k].length > 1);

  const TABS = [
    { id: "overview", label: "Overview" },
    hasPubl && { id: "publication", label: "By " + (mapping.publ || "Product") },
    hasSorg && { id: "geo", label: "By " + (mapping.sorg || "Org") },
    hasLoc && { id: "location", label: "By " + (mapping.location || "Location") },
    hasTime && { id: "trends", label: "Trends" },
  ].filter(Boolean);

  const fLabel = { sorg: mapping.sorg, publ: mapping.publ, location: mapping.location, year: "Year", month: "Month", channel: mapping.channel };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8", fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 14 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#1e293b,#0f172a,#1e3a5f)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ color: "#f8fafc", fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
            📊 <span style={{ color: "#38bdf8" }}>CSV</span> Analytics Dashboard
          </h1>
          <p style={{ color: "#475569", fontSize: 11, margin: "2px 0 0" }}>{filename} · {data.length.toLocaleString()} rows</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {[
            { v: fmtNum(totUns), l: "Total Returns", c: "#f87171" },
            { v: pct.toFixed(2) + "%", l: "Return %", c: "#fbbf24" },
            { v: "~" + fmtNum(daily), l: "Per Day", c: "#a78bfa" },
            { v: fmtNum(totSale), l: "Total Sale", c: "#4ade80" },
          ].map(k => (
            <div key={k.l} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 14px", textAlign: "center", minWidth: 80 }}>
              <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: k.c, display: "block" }}>{k.v}</span>
              <span style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.6 }}>{k.l}</span>
            </div>
          ))}
          <button onClick={onReset} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "#94a3b8", fontSize: 12, padding: "8px 12px", cursor: "pointer" }}>
            ↩ New File
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "10px 24px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>🔍 Filter</span>
        {filterKeys.map(k => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>{fLabel[k] || k}</label>
            <select
              value={filters[k]}
              onChange={e => setFilters(f => ({ ...f, [k]: e.target.value }))}
              style={{ padding: "4px 22px 4px 8px", border: "1px solid #cbd5e1", borderRadius: 7, fontSize: 12, color: "#334155", background: filters[k] ? "#dbeafe" : "#f8fafc", appearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
            >
              <option value="">All</option>
              {uniques[k].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        ))}
        {Object.values(filters).some(Boolean) && (
          <button onClick={() => setFilters({ })}
            style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 7, color: "#dc2626", fontSize: 12, fontWeight: 700, padding: "4px 12px", cursor: "pointer" }}>
            ✕ Reset
          </button>
        )}
        <div style={{ marginLeft: "auto", background: "#dbeafe", border: "1px solid #bfdbfe", borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 600, color: "#1d4ed8" }}>
          {filtered.length.toLocaleString()} records · {fmtNum(totSale)} sale · {fmtNum(totUns)} returns · {pct.toFixed(2)}%
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#1e293b", display: "flex", padding: "0 24px", borderBottom: "2px solid #0f172a" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", background: "none", border: "none", borderBottom: activeTab === t.id ? "2px solid #38bdf8" : "2px solid transparent", marginBottom: -2, color: activeTab === t.id ? "#38bdf8" : "#64748b", cursor: "pointer" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Pages */}
      <div style={{ padding: "20px 24px 32px" }}>

        {/* OVERVIEW */}
        {activeTab === "overview" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
              <KPICard label="Total Returns" value={fmtNum(totUns)} sub="Unsold / returned copies" accent="#dc2626" icon="📦" />
              <KPICard label="Return %" value={pct.toFixed(2) + "%"} sub={`${fmtNum(totSale)} total dispatched`} accent="#d97706" icon="📊" />
              <KPICard label="Total Sale" value={fmtNum(totSale)} sub="All dispatched units" accent="#2563eb" icon="📰" />
              <KPICard label="Daily Waste" value={"~" + fmtNum(daily)} sub="Avg units returned/day" accent="#16a34a" icon="⏱" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
              {hasPubl && byPubl.length > 0 && (
                <ChartCard title={`Returns by ${mapping.publ}`} sub="Volume of unsold units per category" height={220}>
                  <BarChart data={byPubl.slice(0, 10).map(d => ({ label: d.label, value: d.uns }))} color="#dc2626" />
                </ChartCard>
              )}
              {hasCh && byCh.length > 0 && (
                <ChartCard title={`Return % by ${mapping.channel}`} sub="Channel efficiency comparison" height={220}>
                  <BarChart data={byCh.slice(0, 8).map(d => ({ label: d.label, value: d.pct }))} color="#d97706" pctSuffix />
                </ChartCard>
              )}
              {!hasPubl && hasLoc && byLoc.length > 0 && (
                <ChartCard title={`Returns by ${mapping.location}`} sub="Top locations by return volume" height={220}>
                  <BarChart data={byLoc.slice(0, 8).map(d => ({ label: d.label, value: d.uns }))} color="#7c3aed" horizontal />
                </ChartCard>
              )}
              {!hasCh && hasSorg && bySorg.length > 0 && (
                <ChartCard title={`Top ${mapping.sorg} by Returns`} sub="Highest return volume" height={220}>
                  <BarChart data={bySorg.slice(0, 8).map(d => ({ label: d.label, value: d.uns }))} color="#2563eb" horizontal />
                </ChartCard>
              )}
            </div>
            {hasTime && byYear.length > 1 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <ChartCard title="Year-on-Year Returns" sub="Total returns per year" height={200}>
                  <BarChart data={byYear.map(d => ({ label: d.label, value: d.uns }))} color="#7c3aed" />
                </ChartCard>
                <ChartCard title="Year-on-Year Return %" sub="Return rate trend" height={200}>
                  <BarChart data={byYear.map(d => ({ label: d.label, value: d.pct }))} color="#d97706" pctSuffix />
                </ChartCard>
              </div>
            )}
          </>
        )}

        {/* BY PUBLICATION / PRODUCT */}
        {activeTab === "publication" && hasPubl && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
              {byPubl.slice(0, 4).map((d, i) => (
                <KPICard key={d.label} label={d.label} value={fmtNum(d.uns)}
                  sub={`${d.pct.toFixed(2)}% return rate`}
                  accent={["#d97706", "#dc2626", "#16a34a", "#7c3aed"][i % 4]} />
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <ChartCard title={`Daily Returns by ${mapping.publ}`} sub="Average units returned per day" height={240}>
                <BarChart data={byPubl.map(d => ({ label: d.label, value: Math.round(d.uns / (nMonths * 30)) }))} color="#d97706" />
              </ChartCard>
              <ChartCard title={`Return % by ${mapping.publ}`} sub="Efficiency ranking" height={240}>
                <BarChart data={[...byPubl].sort((a, b) => b.pct - a.pct).map(d => ({ label: d.label, value: d.pct }))} color="#dc2626" pctSuffix horizontal />
              </ChartCard>
              {hasCh && (
                <ChartCard title={`${mapping.publ} × ${mapping.channel}`} sub="Return % by product and channel" height={240}>
                  <BarChart
                    data={Object.entries(
                      filtered.reduce((m, r) => {
                        const k = `${r.publ} / ${r.channel}`;
                        if (!m[k]) m[k] = { sale: 0, uns: 0 };
                        m[k].sale += r.sale; m[k].uns += r.uns;
                        return m;
                      }, {})
                    ).map(([k, v]) => ({ label: k, value: v.sale > 0 ? v.uns / v.sale * 100 : 0 })).sort((a, b) => b.value - a.value).slice(0, 8)}
                    color="#7c3aed" pctSuffix horizontal />
                </ChartCard>
              )}
            </div>
          </>
        )}

        {/* BY SORG */}
        {activeTab === "geo" && hasSorg && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
              <ChartCard title={`Top 10 ${mapping.sorg} — Return Volume`} sub="Absolute unsold units" height={280}>
                <BarChart data={bySorg.slice(0, 10).map(d => ({ label: d.label, value: d.uns }))} color="#7c3aed" horizontal />
              </ChartCard>
              <ChartCard title={`Top 10 ${mapping.sorg} — Return %`} sub="Structurally over-supplied" height={280}>
                <BarChart data={bySorgPct.slice(0, 10).map(d => ({ label: d.label, value: d.pct }))} color="#dc2626" pctSuffix horizontal />
              </ChartCard>
            </div>
            <ChartCard title={`All ${mapping.sorg} — Complete Ranking`} sub="Sorted by return % descending" height={Math.max(200, bySorgPct.length * 22)}>
              <div style={{ overflowY: "auto", height: Math.max(200, bySorgPct.length * 22) }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                      {["#", mapping.sorg, "Sale", "Returns", "Return %", "Status"].map(h => (
                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: "#64748b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bySorgPct.map((d, i) => {
                      const col = d.pct > 8 ? "#dc2626" : d.pct > 4 ? "#ea580c" : d.pct > 2 ? "#d97706" : "#16a34a";
                      const bg = d.pct > 8 ? "#fee2e2" : d.pct > 4 ? "#ffedd5" : d.pct > 2 ? "#fef3c7" : "#dcfce7";
                      const status = d.pct > 8 ? "🔴 Critical" : d.pct > 4 ? "🟠 High" : d.pct > 2 ? "🟡 Watch" : "🟢 Good";
                      return (
                        <tr key={d.label} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "6px 10px", color: "#94a3b8" }}>{i + 1}</td>
                          <td style={{ padding: "6px 10px", fontWeight: 600, color: "#0f172a" }}>{d.label}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#475569" }}>{fmtNum(d.sale)}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace", color: "#475569" }}>{fmtNum(d.uns)}</td>
                          <td style={{ padding: "6px 10px" }}>
                            <span style={{ background: bg, color: col, border: `1px solid ${col}40`, borderRadius: 20, padding: "2px 8px", fontFamily: "monospace", fontSize: 11, fontWeight: 600 }}>{d.pct.toFixed(2)}%</span>
                          </td>
                          <td style={{ padding: "6px 10px", fontSize: 11 }}>{status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </>
        )}

        {/* BY LOCATION */}
        {activeTab === "location" && hasLoc && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <ChartCard title={`${mapping.location} — Return Volume`} sub="Absolute unsold units" height={280}>
              <BarChart data={byLoc.slice(0, 10).map(d => ({ label: d.label, value: d.uns }))} color="#d97706" horizontal />
            </ChartCard>
            <ChartCard title={`${mapping.location} — Return %`} sub="Return rate by region" height={280}>
              <BarChart data={[...byLoc].sort((a, b) => b.pct - a.pct).slice(0, 10).map(d => ({ label: d.label, value: d.pct }))} color="#dc2626" pctSuffix horizontal />
            </ChartCard>
          </div>
        )}

        {/* TRENDS */}
        {activeTab === "trends" && hasTime && (
          <>
            {byMonth.length > 1 && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
                  {byYear.slice(-4).map((d, i) => (
                    <KPICard key={d.label} label={d.label + " Daily Returns"} value={"~" + fmtNum(Math.round(d.uns / (30 * Math.max(1, new Set(filtered.filter(r => r.year === d.label).map(r => r.month)).size))))}
                      sub={d.pct.toFixed(2) + "% return rate"}
                      accent={["#16a34a", "#dc2626", "#d97706", "#7c3aed"][i % 4]} />
                  ))}
                </div>
                <ChartCard title="Return % Trend" sub="Monthly return rate over time" height={240}>
                  <LineChart series={[{
                    data: byMonth.sort((a, b) => a.label.localeCompare(b.label)).map(d => ({ label: d.label, value: d.pct }))
                  }]} />
                </ChartCard>
                <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <ChartCard title="Monthly Return Volume" sub="Absolute returns per period" height={220}>
                    <BarChart data={byMonth.sort((a, b) => a.label.localeCompare(b.label)).map(d => ({ label: d.label, value: d.uns }))} color="#dc2626" />
                  </ChartCard>
                  <ChartCard title="Monthly Daily Average" sub="Estimated returns per day" height={220}>
                    <BarChart data={byMonth.sort((a, b) => a.label.localeCompare(b.label)).map(d => ({ label: d.label, value: Math.round(d.uns / 30) }))} color="#7c3aed" />
                  </ChartCard>
                </div>
              </>
            )}
            {byYear.length > 1 && (
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <ChartCard title="Year-on-Year Returns" sub="Total unsold per year" height={220}>
                  <BarChart data={byYear.map(d => ({ label: d.label, value: d.uns }))} color="#2563eb" />
                </ChartCard>
                <ChartCard title="Year-on-Year Sale" sub="Total dispatched per year" height={220}>
                  <BarChart data={byYear.map(d => ({ label: d.label, value: d.sale }))} color="#16a34a" />
                </ChartCard>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── App Root ────────────────────────────────────────────────────────────────
export default function App() {
  const [stage, setStage] = useState("upload"); // upload | map | dashboard
  const [csvData, setCsvData] = useState(null);
  const [mappedData, setMappedData] = useState(null);
  const [mapping, setMapping] = useState(null);

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      {stage === "upload" && (
        <UploadScreen onData={(d) => { setCsvData(d); setStage("map"); }} />
      )}
      {stage === "map" && csvData && (
        <ColumnMapper
          headers={csvData.headers}
          rows={csvData.rows}
          filename={csvData.filename}
          onMapped={(parsed, m) => {
            if (!parsed) { setStage("upload"); return; }
            setMappedData(parsed); setMapping(m); setStage("dashboard");
          }}
        />
      )}
      {stage === "dashboard" && mappedData && (
        <Dashboard
          data={mappedData}
          mapping={mapping}
          filename={csvData.filename}
          onReset={() => { setStage("upload"); setCsvData(null); setMappedData(null); setMapping(null); }}
        />
      )}
    </>
  );
}
