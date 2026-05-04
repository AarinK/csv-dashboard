import { useState, useMemo, useRef, useEffect } from "react";
 

// ─── Chart.js wrapper ───────────────────────────────────────────────────────
const G = { color: "rgba(0,0,0,0.06)", drawBorder: false };
 
function CJChart({ type, data, options, height = 220 }) {
  const ref = useRef();
  const inst = useRef(null);
 
  useEffect(() => {
    const build = () => {
      if (!window.Chart) { setTimeout(build, 80); return; }
      if (inst.current) { inst.current.destroy(); inst.current = null; }
      if (!ref.current || !data?.labels?.length) return;
      window.Chart.defaults.color = "#64748b";
      window.Chart.defaults.borderColor = "#e2e8f0";
      window.Chart.defaults.font.family = "'Plus Jakarta Sans',sans-serif";
      window.Chart.defaults.font.size = 11;
      inst.current = new window.Chart(ref.current, {
        type, data,
        options: { responsive: true, maintainAspectRatio: false, ...options },
      });
    };
    build();
    return () => { if (inst.current) { inst.current.destroy(); inst.current = null; } };
  }, [type, data, options]);
 
  return <div style={{ height, position: "relative" }}><canvas ref={ref} /></div>;
}
 
// ─── Helpers ────────────────────────────────────────────────────────────────
function fmtNum(n) {
  if (n >= 1e7) return (n / 1e7).toFixed(2) + "Cr";
  if (n >= 1e5) return (n / 1e5).toFixed(1) + "L";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString();
}
 
const MSORT = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
function mkey(m) {
  if (!m) return 0;
  const p = m.split("-");
  return parseInt("20" + (p[1] || "00")) * 100 + (MSORT[p[0]] || 0);
}
 
function agg(rows, key) {
  if (!key) return [];
  const m = {};
  rows.forEach(r => {
    const k = r[key] || "—";
    if (!m[k]) m[k] = { sale: 0, uns: 0 };
    m[k].sale += r.sale; m[k].uns += r.uns;
  });
  return Object.entries(m).map(([k, v]) => ({ label: k, sale: v.sale, uns: v.uns, pct: v.sale > 0 ? v.uns / v.sale * 100 : 0 }));
}
 
function pctColor(p) { return p > 8 ? "#dc2626" : p > 4 ? "#ea580c" : p > 2 ? "#d97706" : "#16a34a"; }
function pctBg(p) { return p > 8 ? "#fee2e2" : p > 4 ? "#ffedd5" : p > 2 ? "#fef3c7" : "#dcfce7"; }
 
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) continue;
    const cols = []; let cur = "", inq = false;
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
  const lc = headers.map(h => h.toLowerCase());
  const find = (kws) => headers[lc.findIndex(h => kws.some(k => h.includes(k)))] ?? "";
  return {
    sale: find(["sale","sold","dispatch","qty","quantity","supply"]),
    uns: find(["uns","unsold","return","waste","back","reject"]),
    sorg: find(["sorg","org","dealer","agent","branch","store","outlet","code","id"]),
    publ: find(["publ","pub","paper","edition","product","title","news"]),
    location: find(["loc","city","region","state","zone","area","district"]),
    year: find(["year","yr","fy"]),
    month: find(["month","mon","period","date"]),
    channel: find(["channel","ch","type","mode","cat"]),
  };
}
 
// ─── Upload Screen ───────────────────────────────────────────────────────────
// Accepted MIME types + extensions
const ACCEPTED_EXTS = [".csv", ".xlsx", ".xls", ".xlsm", ".xlsb"];
const ACCEPTED_MIME = ".csv,.xlsx,.xls,.xlsm,.xlsb";

function isExcel(name) { return /\.(xlsx|xls|xlsm|xlsb)$/i.test(name); }
function isCSV(name)   { return /\.csv$/i.test(name); }

// Parse an Excel ArrayBuffer with SheetJS, return { sheetNames, wb }
function parseExcelBuffer(ab) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error("SheetJS not loaded yet — please try again in a moment.");
  const wb = XLSX.read(new Uint8Array(ab), { type: "array", cellDates: true });
  return { sheetNames: wb.SheetNames, wb };
}

// Convert a single worksheet to { headers, rows } matching parseCSV output format
function sheetToHeadersRows(wb, sheetName) {
  const XLSX = window.XLSX;
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if (!raw.length) return { headers: [], rows: [] };
  // Find the first non-empty row as header
  let headerIdx = 0;
  while (headerIdx < raw.length && raw[headerIdx].every(c => c === "" || c == null)) headerIdx++;
  if (headerIdx >= raw.length) return { headers: [], rows: [] };
  const headers = raw[headerIdx].map(h => String(h ?? "").trim());
  const rows = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const r = raw[i];
    if (r.every(c => c === "" || c == null)) continue;
    const padded = headers.map((_, j) => {
      const v = r[j];
      if (v == null || v === "") return "";
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v).trim();
    });
    rows.push(padded);
  }
  return { headers, rows };
}

function UploadScreen({ onData }) {
  const [dragging, setDragging]           = useState(false);
  const [status, setStatus]               = useState("");
  const [error, setError]                 = useState("");
  const [sheetPicker, setSheetPicker]     = useState(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const inputRef = useRef();

  const loadSheet = (wb, sheetName, filename) => {
    try {
      const { headers, rows } = sheetToHeadersRows(wb, sheetName);
      if (!rows.length) { setError(`No data rows found in sheet "${sheetName}"`); setStatus(""); return; }
      setStatus(`\u2713 Loaded ${rows.length.toLocaleString()} rows from "${sheetName}"`);
      setSheetPicker(null);
      onData({ headers, rows, filename });
    } catch (err) { setError("Error reading sheet: " + err.message); setStatus(""); }
  };

  const processFile = (file) => {
    if (!file) return;
    const name = file.name;
    if (!ACCEPTED_EXTS.some(ext => name.toLowerCase().endsWith(ext))) {
      setError("Please upload a CSV or Excel file (.csv, .xlsx, .xls, .xlsm, .xlsb)");
      return;
    }
    setStatus("Reading file\u2026"); setError(""); setSheetPicker(null);

    if (isCSV(name)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const { headers, rows } = parseCSV(e.target.result);
          if (!rows.length) { setError("No data rows found in CSV"); setStatus(""); return; }
          setStatus(`\u2713 Loaded ${rows.length.toLocaleString()} rows from CSV`);
          onData({ headers, rows, filename: name });
        } catch (err) { setError("Error parsing CSV: " + err.message); setStatus(""); }
      };
      reader.onerror = () => { setError("Could not read file"); setStatus(""); };
      reader.readAsText(file);
    } else if (isExcel(name)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          if (!window.XLSX) { setError("Excel parser still loading — please try again in a moment."); setStatus(""); return; }
          const { sheetNames, wb } = parseExcelBuffer(e.target.result);
          if (!sheetNames.length) { setError("No sheets found in workbook"); setStatus(""); return; }
          if (sheetNames.length === 1) {
            loadSheet(wb, sheetNames[0], name);
          } else {
            setStatus("");
            setSheetPicker({ sheetNames, wb, filename: name });
            setSelectedSheet(sheetNames[0]);
          }
        } catch (err) { setError("Error reading Excel file: " + err.message); setStatus(""); }
      };
      reader.onerror = () => { setError("Could not read file"); setStatus(""); };
      reader.readAsArrayBuffer(file);
    }
  };

  const confirmSheet = () => {
    if (!sheetPicker || !selectedSheet) return;
    loadSheet(sheetPicker.wb, selectedSheet, sheetPicker.filename);
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0f172a,#1e3a5f)", display:"flex", alignItems:"center", justifyContent:"center", padding:"2rem", fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ maxWidth:560, width:"100%", textAlign:"center" }}>

        <div style={{ marginBottom:32 }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
          <h1 style={{ color:"#f1f5f9", fontSize:28, fontWeight:800, margin:"0 0 8px", letterSpacing:-0.5 }}>
            CSV / Excel <span style={{ color:"#38bdf8" }}>Analytics Dashboard</span>
          </h1>
          <p style={{ color:"#64748b", fontSize:14, margin:0, lineHeight:1.6 }}>
            Upload a CSV or Excel file — columns are auto-detected and mapped in the next step.
          </p>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]); }}
          style={{ border:`2px dashed ${dragging?"#38bdf8":"rgba(56,189,248,0.3)"}`, borderRadius:16, padding:"40px 24px", cursor:"pointer", background:dragging?"rgba(56,189,248,0.08)":"rgba(255,255,255,0.04)", transition:"all 0.2s", marginBottom:16 }}
        >
          <input ref={inputRef} type="file" accept={ACCEPTED_MIME} style={{ display:"none" }}
            onChange={e => processFile(e.target.files[0])} />
          <div style={{ fontSize:36, marginBottom:12 }}>📁</div>
          <p style={{ color:"#94a3b8", fontSize:15, margin:0 }}>
            Drop file here or <span style={{ color:"#38bdf8", fontWeight:600 }}>click to browse</span>
          </p>
          <p style={{ color:"#475569", fontSize:12, marginTop:8 }}>
            Supports{" "}
            <strong style={{ color:"#94a3b8" }}>.csv</strong>,{" "}
            <strong style={{ color:"#94a3b8" }}>.xlsx</strong>,{" "}
            <strong style={{ color:"#94a3b8" }}>.xls</strong>,{" "}
            <strong style={{ color:"#94a3b8" }}>.xlsm</strong>
          </p>
        </div>

        <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:16, flexWrap:"wrap" }}>
          {[
            { icon:"📄", label:"CSV", desc:"Any delimiter" },
            { icon:"📗", label:"XLSX", desc:"Excel 2007+" },
            { icon:"📘", label:"XLS", desc:"Excel 97\u20132003" },
            { icon:"📙", label:"XLSM", desc:"Macro-enabled" },
          ].map(f => (
            <div key={f.label} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"7px 12px", display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:16 }}>{f.icon}</span>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#e2e8f0" }}>{f.label}</div>
                <div style={{ fontSize:10, color:"#475569" }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {status && <p style={{ color:"#4ade80", fontSize:14, margin:"8px 0" }}>{status}</p>}
        {error  && <p style={{ color:"#f87171", fontSize:14, margin:"8px 0" }}>{error}</p>}

        {sheetPicker && (
          <div style={{ background:"rgba(15,23,42,0.85)", backdropFilter:"blur(8px)", position:"fixed", inset:0, zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
            <div style={{ background:"#1e293b", border:"1px solid rgba(255,255,255,0.12)", borderRadius:16, padding:"28px 32px", maxWidth:420, width:"100%", textAlign:"left" }}>
              <div style={{ fontSize:28, marginBottom:8 }}>📗</div>
              <h2 style={{ color:"#f1f5f9", fontSize:17, fontWeight:800, margin:"0 0 4px" }}>Select a Sheet</h2>
              <p style={{ color:"#64748b", fontSize:13, margin:"0 0 20px" }}>
                <span style={{ color:"#38bdf8" }}>{sheetPicker.filename}</span> has {sheetPicker.sheetNames.length} sheets. Choose which one to import.
              </p>
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
                {sheetPicker.sheetNames.map(name => (
                  <label key={name} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:9, border:`1.5px solid ${selectedSheet===name?"#38bdf8":"rgba(255,255,255,0.1)"}`, background:selectedSheet===name?"rgba(56,189,248,0.08)":"rgba(255,255,255,0.03)", cursor:"pointer", transition:"all 0.15s" }}>
                    <input type="radio" name="sheet" value={name} checked={selectedSheet===name} onChange={()=>setSelectedSheet(name)} style={{ accentColor:"#38bdf8" }} />
                    <span style={{ color:selectedSheet===name?"#38bdf8":"#94a3b8", fontWeight:600, fontSize:13 }}>📄 {name}</span>
                  </label>
                ))}
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={confirmSheet}
                  style={{ flex:1, background:"#2563eb", border:"none", borderRadius:9, color:"#fff", fontSize:14, fontWeight:700, padding:"11px 0", cursor:"pointer" }}>
                  Import "{selectedSheet}"
                </button>
                <button onClick={()=>{ setSheetPicker(null); setStatus(""); }}
                  style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:9, color:"#94a3b8", fontSize:13, padding:"11px 16px", cursor:"pointer" }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
 
// ─── Column Mapper ───────────────────────────────────────────────────────────
const FIELD_DEFS = [
  { key:"sale", label:"Sale / Dispatched Qty", required:true, numeric:true },
  { key:"uns", label:"Unsold / Returns Qty", required:true, numeric:true },
  { key:"sorg", label:"Sales Org / Dealer / Branch" },
  { key:"publ", label:"Publication / Product" },
  { key:"location", label:"Location / Region" },
  { key:"year", label:"Year" },
  { key:"month", label:"Month / Period" },
  { key:"channel", label:"Channel / Type" },
];
 
function ColumnMapper({ headers, rows, filename, onMapped }) {
  const [mapping, setMapping] = useState(() => guessMapping(headers));
  const [error, setError] = useState("");
 
  const handleSubmit = () => {
    if (!mapping.sale || !mapping.uns) { setError("Sale and Unsold columns are required"); return; }
    const si = headers.indexOf(mapping.sale), ui = headers.indexOf(mapping.uns);
    const parsed = rows.map(r => {
      const obj = {}; headers.forEach((h, i) => { obj[h] = r[i] || ""; });
      obj.sale = parseFloat(r[si]) || 0; obj.uns = parseFloat(r[ui]) || 0;
      return obj;
    }).filter(r => r.sale > 0 || r.uns > 0);
    onMapped(parsed, mapping);
  };
 
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0f172a,#1e3a5f)", display:"flex", alignItems:"center", justifyContent:"center", padding:"2rem", fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ maxWidth:620, width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:20, padding:"32px 36px" }}>
        <h2 style={{ color:"#f1f5f9", fontSize:20, fontWeight:800, margin:"0 0 4px" }}>Map Your Columns</h2>
        <p style={{ color:"#64748b", fontSize:13, margin:"0 0 24px" }}><span style={{ color:"#38bdf8" }}>{filename}</span> · {rows.length.toLocaleString()} rows · {headers.length} columns</p>
        <div style={{ display:"grid", gap:12 }}>
          {FIELD_DEFS.map(f => (
            <div key={f.key} style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, alignItems:"center" }}>
              <div>
                <p style={{ color:f.required?"#38bdf8":"#94a3b8", fontSize:13, fontWeight:600, margin:0 }}>{f.label} {f.required && <span style={{ color:"#f87171" }}>*</span>}</p>
                {f.numeric && <p style={{ color:"#475569", fontSize:11, margin:0 }}>numeric</p>}
              </div>
              <select value={mapping[f.key]||""} onChange={e => setMapping(m => ({ ...m, [f.key]:e.target.value }))}
                style={{ background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, color:mapping[f.key]?"#f1f5f9":"#475569", padding:"8px 12px", fontSize:13, width:"100%" }}>
                <option value="">— skip —</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
        {error && <p style={{ color:"#f87171", fontSize:13, marginTop:16 }}>{error}</p>}
        <div style={{ marginTop:24, display:"flex", gap:12 }}>
          <button onClick={handleSubmit} style={{ flex:1, background:"#2563eb", border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:700, padding:"12px 0", cursor:"pointer" }}>Build Dashboard →</button>
          <button onClick={() => onMapped(null)} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, color:"#94a3b8", fontSize:13, padding:"12px 16px", cursor:"pointer" }}>Back</button>
        </div>
      </div>
    </div>
  );
}
 
// ─── UI Atoms ────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, accent="#2563eb", icon }) {
  return (
    <div className="kpi-card" style={{ background:"#fff", borderRadius:12, padding:"16px 18px", position:"relative", overflow:"hidden", transition:"all 0.2s cubic-bezier(0.34,1.56,0.64,1)", cursor:"default", border:"1px solid #e2e8f0", boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:accent, borderRadius:"12px 12px 0 0" }} />
      <p style={{ fontSize:10, fontWeight:700, letterSpacing:1.2, textTransform:"uppercase", color:"#64748b", margin:"0 0 6px" }}>{label}</p>
      <p style={{ fontFamily:"monospace", fontSize:22, fontWeight:700, color:"#0f172a", margin:"0 0 4px", lineHeight:1 }}>{value}</p>
      {sub && <p style={{ fontSize:11, color:"#94a3b8", margin:0 }}>{sub}</p>}
      {icon && <div style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", fontSize:22, opacity:0.1 }}>{icon}</div>}
    </div>
  );
}
 
function ChartCard({ title, sub, children }) {
  return (
    <div className="chart-card" style={{ background:"#fff", borderRadius:12, padding:"16px 18px", border:"1px solid #e2e8f0", boxShadow:"0 1px 3px rgba(0,0,0,0.05)", transition:"all 0.2s cubic-bezier(0.34,1.56,0.64,1)" }}>
      <p style={{ fontSize:11, fontWeight:800, letterSpacing:0.8, textTransform:"uppercase", color:"#334155", margin:"0 0 2px" }}>{title}</p>
      {sub && <p style={{ fontSize:11, color:"#94a3b8", margin:"0 0 10px" }}>{sub}</p>}
      {children}
    </div>
  );
}
 
const g2 = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:18 };
const g4 = { display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:18 };
 
// Chart option factories
const hBar = (xSuffix="") => ({ indexAxis:"y", scales:{ x:{ grid:G, ticks:xSuffix?{ callback:v=>v+xSuffix }:undefined }, y:{ grid:G } }, plugins:{ legend:{ display:false } } });
const vBar = () => ({ scales:{ x:{ grid:G }, y:{ grid:G } }, plugins:{ legend:{ display:false } } });
const dualY = (yLbl="Copies (L)", y2cb=v=>v+"%") => ({ scales:{ x:{ grid:G }, y:{ grid:G, title:{ display:true, text:yLbl, color:"#94a3b8", font:{ size:10 } } }, y2:{ position:"right", grid:{ drawOnChartArea:false }, ticks:{ callback:y2cb }, title:{ display:true, text:"UNS%", color:"#d97706", font:{ size:10 } } } }, plugins:{ legend:{ position:"top", labels:{ font:{ size:10 }, padding:10 } } } });
const lineOpts = (ySuffix="%") => ({ scales:{ x:{ grid:G, ticks:{ maxTicksLimit:12, font:{ size:9 } } }, y:{ grid:G, ticks:{ callback:v=>v+ySuffix }, min:0 } }, plugins:{ legend:{ position:"top", labels:{ font:{ size:10 } } } } });
 
const MONTHS12 = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YRCOLORS = ["#16a34a","#dc2626","#2563eb","#d97706","#7c3aed"];
 
// ─── Data Table ──────────────────────────────────────────────────────────────
const PAGE_SIZE = 100;

function DataTable({ rows, columns, totals, aggPct }) {
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc"); // "asc" | "desc"

  // Reset to page 0 whenever rows change (filter update)
  const prevRowsLen = useRef(rows.length);
  useEffect(() => {
    if (rows.length !== prevRowsLen.current) { setPage(0); prevRowsLen.current = rows.length; }
  }, [rows.length]);

  // Sorted rows (memoised — only re-sorts when sort state or rows change)
  const sorted = useMemo(() => {
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortCol] ?? "", bv = b[sortCol] ?? "";
      // Numeric sort if both values are numbers
      const an = parseFloat(av), bn = parseFloat(bv);
      const cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages - 1);
  const pageRows   = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  // Download filtered data as CSV
  const downloadCSV = () => {
    const header = columns.join(",");
    const body = rows.map(r => columns.map(c => {
      const v = String(r[c] ?? "").replace(/"/g, '""');
      return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v}"` : v;
    }).join(",")).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "filtered_data.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <span style={{ opacity:0.3, marginLeft:4 }}>⇅</span>;
    return <span style={{ marginLeft:4, color:"#2563eb" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const paginationBtn = (label, onClick, disabled, active=false) => (
    <button onClick={onClick} disabled={disabled}
      style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${active?"#2563eb":"#e2e8f0"}`, background:active?"#2563eb":disabled?"#f8fafc":"#fff", color:active?"#fff":disabled?"#cbd5e1":"#334155", fontSize:12, fontWeight:active?700:500, cursor:disabled?"not-allowed":"pointer", minWidth:32 }}>
      {label}
    </button>
  );

  // Build page window: always show first, last, current ±2
  const pageWindow = () => {
    const pages = new Set([0, totalPages-1, safePage, safePage-1, safePage-2, safePage+1, safePage+2].filter(p=>p>=0 && p<totalPages));
    const sorted = [...pages].sort((a,b)=>a-b);
    const result = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - sorted[i-1] > 1) result.push("…");
      result.push(p);
    });
    return result;
  };

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:13, fontWeight:600, color:"#334155" }}>
            {rows.length.toLocaleString()} rows
            {sortCol && <span style={{ fontSize:11, color:"#64748b", marginLeft:6 }}>· sorted by <strong>{sortCol}</strong> {sortDir}</span>}
          </span>
          {sortCol && (
            <button onClick={()=>{setSortCol(null);setSortDir("asc");}} style={{ fontSize:11, color:"#64748b", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:5, padding:"2px 8px", cursor:"pointer" }}>
              ✕ clear sort
            </button>
          )}
        </div>
        <button onClick={downloadCSV}
          style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 14px", background:"#2563eb", border:"none", borderRadius:7, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
          ⬇ Export CSV
        </button>
      </div>

      {/* Table */}
      <div style={{ overflowX:"auto", borderRadius:10, border:"1px solid #e2e8f0", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12, whiteSpace:"nowrap" }}>
          <thead>
            <tr style={{ background:"#f1f5f9", position:"sticky", top:0, zIndex:2 }}>
              <th style={{ padding:"9px 12px", textAlign:"left", color:"#64748b", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap", minWidth:40 }}>#</th>
              {columns.map(col=>(
                <th key={col} onClick={()=>toggleSort(col)}
                  style={{ padding:"9px 12px", textAlign:"left", color:"#64748b", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, borderBottom:"2px solid #e2e8f0", whiteSpace:"nowrap", cursor:"pointer", userSelect:"none", background: sortCol===col?"#e8f0fe":"#f1f5f9", transition:"background 0.15s" }}>
                  {col}<SortIcon col={col} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Totals row */}
            {totals && (
              <tr style={{ borderBottom:"2px solid #bfdbfe", background:"#dbeafe", fontWeight:700, position:"sticky", top:37, zIndex:1 }}>
                <td style={{ padding:"8px 12px", color:"#1d4ed8", fontFamily:"monospace", fontSize:11, fontWeight:800 }}>Σ</td>
                {columns.map(col => {
                  const val = totals[col];
                  const isNum = col === "sale" || col === "uns";
                  if (val == null) return <td key={col} style={{ padding:"8px 12px", color:"#93c5fd", fontSize:11 }}>—</td>;
                  return (
                    <td key={col} style={{ padding:"8px 12px", color:"#1d4ed8", fontFamily: isNum?"monospace":"inherit", fontSize:12, fontWeight:800 }}>
                      {isNum ? Number(val).toLocaleString() : val}
                      {col === "uns" && aggPct != null && (
                        <span style={{ marginLeft:8, background:"#fef3c7", color:"#b45309", border:"1px solid #fcd34d", borderRadius:20, padding:"1px 8px", fontFamily:"monospace", fontSize:11, fontWeight:700 }}>
                          {aggPct.toFixed(2)}%
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            )}
            {pageRows.map((row, i) => {
              const globalIdx = safePage * PAGE_SIZE + i;
              return (
                <tr key={globalIdx} style={{ borderBottom:"1px solid #f1f5f9", background:i%2===0?"#fff":"#fafbfc" }}
                  onMouseEnter={e=>e.currentTarget.style.background="#f0f7ff"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"#fff":"#fafbfc"}>
                  <td style={{ padding:"7px 12px", color:"#94a3b8", fontFamily:"monospace", fontSize:11 }}>{(globalIdx+1).toLocaleString()}</td>
                  {columns.map(col => {
                    const v = row[col];
                    const isNum = col === "sale" || col === "uns";
                    return (
                      <td key={col} style={{ padding:"7px 12px", color: isNum?"#1d4ed8":"#334155", fontFamily: isNum?"monospace":"inherit", maxWidth:200, overflow:"hidden", textOverflow:"ellipsis" }}>
                        {isNum ? Number(v).toLocaleString() : (v ?? "")}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:14, flexWrap:"wrap", gap:8 }}>
          <span style={{ fontSize:12, color:"#64748b" }}>
            Showing {(safePage*PAGE_SIZE+1).toLocaleString()}–{Math.min((safePage+1)*PAGE_SIZE, sorted.length).toLocaleString()} of {sorted.length.toLocaleString()}
          </span>
          <div style={{ display:"flex", gap:4, alignItems:"center", flexWrap:"wrap" }}>
            {paginationBtn("«", ()=>setPage(0), safePage===0)}
            {paginationBtn("‹", ()=>setPage(p=>Math.max(0,p-1)), safePage===0)}
            {pageWindow().map((p, i) =>
              p === "…"
                ? <span key={`ellipsis-${i}`} style={{ padding:"0 4px", color:"#94a3b8", fontSize:13 }}>…</span>
                : paginationBtn(p+1, ()=>setPage(p), false, p===safePage)
            )}
            {paginationBtn("›", ()=>setPage(p=>Math.min(totalPages-1,p+1)), safePage===totalPages-1)}
            {paginationBtn("»", ()=>setPage(totalPages-1), safePage===totalPages-1)}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:12, color:"#64748b" }}>Go to page</span>
            <input type="number" min={1} max={totalPages} defaultValue={safePage+1}
              onKeyDown={e=>{ if(e.key==="Enter"){ const v=parseInt(e.target.value); if(v>=1&&v<=totalPages) setPage(v-1); }}}
              style={{ width:52, padding:"4px 6px", border:"1px solid #e2e8f0", borderRadius:6, fontSize:12, textAlign:"center" }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
function Dashboard({ data, mapping, filename, onReset }) {
  const [activeTab, setActiveTab] = useState("data");
  const [filters, setFilters] = useState({});
  // Lazy-load state for Data tab: false = not yet revealed, true = shown
  // Once shown, stays shown and auto-updates with filter changes
  const [dataShown, setDataShown] = useState(false);
 
  const hasSorg = !!mapping.sorg, hasPubl = !!mapping.publ, hasLoc = !!mapping.location;
  const hasTime = !!(mapping.month || mapping.year), hasCh = !!mapping.channel;
 
  const allFilterCols = useMemo(() => {
    if (!data.length) return [];
    return Object.keys(data[0]).filter(col => {
      if (col === "sale" || col === "uns") return false;
      const s = new Set(data.map(r => r[col]).filter(v => v !== "" && v != null));
      return s.size > 1 && s.size <= 500;
    });
  }, [data]);
 
  const filtered = useMemo(() => {
    const active = Object.entries(filters).filter(([,v]) => v !== "" && v != null);
    return active.length ? data.filter(row => active.every(([k,v]) => row[k] === v)) : data;
  }, [data, filters]);
 
  const uniques = useMemo(() => {
    const active = Object.fromEntries(Object.entries(filters).filter(([,v]) => v !== "" && v != null));
    const res = {};
    allFilterCols.forEach(col => {
      const others = Object.entries(active).filter(([k]) => k !== col);
      const src = others.length ? data.filter(row => others.every(([k,v]) => row[k]===v)) : data;
      res[col] = [...new Set(src.map(r => r[col]).filter(v => v !== "" && v != null))].sort();
    });
    return res;
  }, [data, allFilterCols, filters]);
 
  useEffect(() => {
    setFilters(prev => {
      const next = { ...prev }; let ch = false;
      Object.keys(next).forEach(k => { if (next[k] && uniques[k] && !uniques[k].includes(next[k])) { next[k]=""; ch=true; } });
      return ch ? next : prev;
    });
  }, [uniques]);
 
  // Aggregations
  const totSale = useMemo(() => filtered.reduce((s,r) => s+r.sale, 0), [filtered]);
  const totUns  = useMemo(() => filtered.reduce((s,r) => s+r.uns, 0), [filtered]);
  const totSold = useMemo(() => totSale - totUns, [totSale, totUns]);
  const pct = useMemo(() => totSale > 0 ? totUns/totSale*100 : 0, [totSale, totUns]);
  const soldPct = useMemo(() => totSale > 0 ? totSold/totSale*100 : 0, [totSale, totSold]);
  const nMonths = useMemo(() => new Set(filtered.map(r=>r[mapping.month]).filter(Boolean)).size || 1, [filtered, mapping.month]);
  const daily = useMemo(() => Math.round(totUns / (nMonths * 30)), [totUns, nMonths]);
 
  const byPubl    = useMemo(() => agg(filtered, mapping.publ).sort((a,b)=>b.uns-a.uns), [filtered, mapping.publ]);
  const bySorgAll = useMemo(() => agg(filtered, mapping.sorg), [filtered, mapping.sorg]);
  const bySorg    = useMemo(() => [...bySorgAll].sort((a,b)=>b.uns-a.uns), [bySorgAll]);
  const bySorgPct = useMemo(() => [...bySorgAll].sort((a,b)=>b.pct-a.pct), [bySorgAll]);
  const byLoc     = useMemo(() => agg(filtered, mapping.location).sort((a,b)=>b.uns-a.uns), [filtered, mapping.location]);
  const byLocPct  = useMemo(() => [...byLoc].sort((a,b)=>b.pct-a.pct), [byLoc]);
  const byMonth   = useMemo(() => agg(filtered, mapping.month).sort((a,b)=>mkey(a.label)-mkey(b.label)), [filtered, mapping.month]);
  const byCh      = useMemo(() => agg(filtered, mapping.channel).sort((a,b)=>b.pct-a.pct), [filtered, mapping.channel]);
  const byYear    = useMemo(() => agg(filtered, mapping.year).sort((a,b)=>a.label.localeCompare(b.label)), [filtered, mapping.year]);
  const byPublPct = useMemo(() => [...byPubl].sort((a,b)=>b.pct-a.pct), [byPubl]);
 
  const byPublCh = useMemo(() => {
    if (!hasCh || !hasPubl) return [];
    const m = {};
    filtered.forEach(r => {
      const k = `${r[mapping.publ]} / ${r[mapping.channel]}`;
      if (!m[k]) m[k]={sale:0,uns:0};
      m[k].sale+=r.sale; m[k].uns+=r.uns;
    });
    return Object.entries(m).map(([k,v])=>({ label:k, value:v.sale>0?v.uns/v.sale*100:0 }))
      .sort((a,b)=>b.value-a.value).slice(0,10);
  }, [filtered, mapping, hasCh, hasPubl]);
 
  const years = useMemo(() => [...new Set(filtered.map(r=>r[mapping.year]).filter(Boolean))].sort(), [filtered, mapping.year]);
 
  const monthMap = useMemo(() => {
    const m = {};
    filtered.forEach(r => {
      const k = r[mapping.month]; if (!k) return;
      if (!m[k]) m[k]={sale:0,uns:0};
      m[k].sale+=r.sale; m[k].uns+=r.uns;
    });
    return m;
  }, [filtered, mapping.month]);
 
  const filterKeys = allFilterCols.filter(k => uniques[k]?.length > 1);

  // All columns to show in data table (original header order, exclude synthesised dupes)
  const tableColumns = useMemo(() => {
    if (!data.length) return [];
    const keys = Object.keys(data[0]);
    // Show all original columns; put sale/uns last as they're the most important numerics
    const numeric = ["sale","uns"];
    return [...keys.filter(k=>!numeric.includes(k)), ...numeric.filter(k=>keys.includes(k))];
  }, [data]);
 
  const TABS = [
    { id:"data", label:"📋 Data" },
    { id:"overview", label:"Overview" },
    hasPubl && { id:"publication", label:"By "+(mapping.publ||"Product") },
    hasSorg && { id:"geo", label:"By "+(mapping.sorg||"Org") },
    hasLoc && { id:"location", label:"By "+(mapping.location||"Location") },
    hasTime && { id:"trends", label:"Trends" },
  ].filter(Boolean);
 
  // ── Chart data ─────────────────────────────────────────────────────────────
  const pubOvData = useMemo(() => ({
    labels: byPubl.map(d=>d.label),
    datasets:[
      { label:"Sale (L)", data:byPubl.map(d=>+(d.sale/1e5).toFixed(1)), backgroundColor:"rgba(37,99,235,0.15)", borderColor:"#2563eb", borderWidth:2, borderRadius:6, yAxisID:"y" },
      { label:"UNS (L)", data:byPubl.map(d=>+(d.uns/1e5).toFixed(1)),  backgroundColor:"rgba(220,38,38,0.3)",  borderColor:"#dc2626", borderWidth:2, borderRadius:6, yAxisID:"y" },
      { label:"UNS%", data:byPubl.map(d=>+d.pct.toFixed(2)), type:"line", borderColor:"#d97706", backgroundColor:"rgba(217,119,6,0.08)", borderWidth:2.5, pointRadius:5, fill:true, yAxisID:"y2", tension:0.3 },
    ],
  }), [byPubl]);
 
  const chOvData = useMemo(() => ({
    labels: byCh.map(d=>d.label),
    datasets:[
      { label:"Sale (Cr)", data:byCh.map(d=>+(d.sale/1e7).toFixed(1)), backgroundColor:["rgba(37,99,235,0.2)","rgba(124,58,237,0.2)","rgba(22,163,74,0.2)"], borderColor:["#2563eb","#7c3aed","#16a34a"], borderWidth:2, borderRadius:8, yAxisID:"y" },
      { label:"UNS%", data:byCh.map(d=>+d.pct.toFixed(2)), type:"line", borderColor:"#dc2626", backgroundColor:"rgba(220,38,38,0.06)", borderWidth:2.5, pointRadius:8, fill:true, yAxisID:"y2" },
    ],
  }), [byCh]);
 
  const yoyOvData = useMemo(() => ({
    labels: byYear.map(d=>d.label),
    datasets:[
      { label:"Sale (Cr)", data:byYear.map(d=>+(d.sale/1e7).toFixed(1)), backgroundColor:byYear.map((_,i)=>["rgba(22,163,74,0.25)","rgba(220,38,38,0.2)","rgba(217,119,6,0.2)","rgba(37,99,235,0.2)"][i%4]), borderColor:byYear.map((_,i)=>["#16a34a","#dc2626","#d97706","#2563eb"][i%4]), borderWidth:2, borderRadius:8, yAxisID:"y" },
      { label:"UNS (L)", data:byYear.map(d=>+(d.uns/1e5).toFixed(1)), type:"line", borderColor:"#7c3aed", backgroundColor:"rgba(124,58,237,0.07)", borderWidth:2.5, pointRadius:6, fill:true, yAxisID:"y2" },
    ],
  }), [byYear]);
 
  const pubDailyData = useMemo(() => ({
    labels: byPubl.map(d=>d.label),
    datasets:[{ label:"Avg Daily UNS", data:byPubl.map(d=>Math.round(d.uns/(nMonths*30))), backgroundColor:["rgba(217,119,6,0.45)","rgba(37,99,235,0.35)","rgba(220,38,38,0.45)","rgba(22,163,74,0.4)","rgba(124,58,237,0.3)"], borderColor:["#d97706","#2563eb","#dc2626","#16a34a","#7c3aed"], borderWidth:2, borderRadius:8 }],
  }), [byPubl, nMonths]);
 
  const pubPctData = useMemo(() => ({
    labels: byPublPct.map(d=>d.label),
    datasets:[{ label:"UNS%", data:byPublPct.map(d=>+d.pct.toFixed(2)), backgroundColor:byPublPct.map(d=>pctBg(d.pct)+"aa"), borderColor:byPublPct.map(d=>pctColor(d.pct)), borderWidth:2, borderRadius:6 }],
  }), [byPublPct]);
 
  const pubChData = useMemo(() => ({
    labels: byPublCh.map(d=>d.label),
    datasets:[{ label:"UNS%", data:byPublCh.map(d=>+d.value.toFixed(2)), backgroundColor:byPublCh.map(d=>pctBg(d.value)+"aa"), borderColor:byPublCh.map(d=>pctColor(d.value)), borderWidth:2, borderRadius:6 }],
  }), [byPublCh]);
 
  const sorgVolData = useMemo(() => ({
    labels: bySorg.slice(0,10).map(d=>d.label),
    datasets:[{ label:"UNS (L)", data:bySorg.slice(0,10).map(d=>+(d.uns/1e5).toFixed(1)), backgroundColor:"rgba(124,58,237,0.3)", borderColor:"#7c3aed", borderWidth:2, borderRadius:6 }],
  }), [bySorg]);
 
  const sorgPctData = useMemo(() => ({
    labels: bySorgPct.slice(0,10).map(d=>d.label),
    datasets:[{ label:"UNS%", data:bySorgPct.slice(0,10).map(d=>+d.pct.toFixed(2)), backgroundColor:bySorgPct.slice(0,10).map(d=>pctBg(d.pct)+"aa"), borderColor:bySorgPct.slice(0,10).map(d=>pctColor(d.pct)), borderWidth:2, borderRadius:6 }],
  }), [bySorgPct]);
 
  const locVolData = useMemo(() => ({
    labels: byLoc.slice(0,12).map(d=>d.label),
    datasets:[{ label:"UNS (L)", data:byLoc.slice(0,12).map(d=>+(d.uns/1e5).toFixed(1)), backgroundColor:"rgba(217,119,6,0.35)", borderColor:"#d97706", borderWidth:2, borderRadius:6 }],
  }), [byLoc]);
 
  const locPctData = useMemo(() => ({
    labels: byLocPct.slice(0,12).map(d=>d.label),
    datasets:[{ label:"UNS%", data:byLocPct.slice(0,12).map(d=>+d.pct.toFixed(2)), backgroundColor:byLocPct.slice(0,12).map(d=>pctBg(d.pct)+"aa"), borderColor:byLocPct.slice(0,12).map(d=>pctColor(d.pct)), borderWidth:2, borderRadius:6 }],
  }), [byLocPct]);
 
  const trendData = useMemo(() => ({
    labels: byMonth.map(d=>d.label),
    datasets:[
      { label:"UNS%", data:byMonth.map(d=>+d.pct.toFixed(2)), borderColor:"#2563eb", backgroundColor:"rgba(37,99,235,0.05)", borderWidth:2, pointRadius:byMonth.map(d=>d.pct>2.7?5:2), pointBackgroundColor:byMonth.map(d=>d.pct>2.7?"#dc2626":d.pct<2.0?"#16a34a":"#d97706"), fill:true, tension:0.4 },
      { label:"2.0% Target", data:byMonth.map(()=>2.0), borderColor:"rgba(22,163,74,0.5)", borderDash:[5,5], borderWidth:1.5, pointRadius:0, fill:false },
    ],
  }), [byMonth]);
 
  const yoyOverlay = useMemo(() => ({
    labels: MONTHS12,
    datasets: years.slice(-4).map((yr,i)=>({
      label: yr,
      data: MONTHS12.map(mn=>{ const k=`${mn}-${String(yr).slice(2)}`; return monthMap[k] ? +(monthMap[k].uns/1e5).toFixed(1) : null; }),
      borderColor: YRCOLORS[i%YRCOLORS.length], backgroundColor:"transparent",
      borderWidth:2, pointRadius:3, tension:0.3, spanGaps:true,
    })),
  }), [years, monthMap]);
 
  const seasonalData = useMemo(() => {
    const avgs = MONTHS12.map(mn => {
      const vals = years.map(yr=>{ const k=`${mn}-${String(yr).slice(2)}`; return monthMap[k]?.sale>0 ? monthMap[k].uns/monthMap[k].sale*100 : null; }).filter(v=>v!==null);
      return vals.length ? +(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2) : 0;
    });
    return { labels:MONTHS12, datasets:[{ label:"Avg UNS%", data:avgs, backgroundColor:avgs.map(v=>v>2.6?"rgba(220,38,38,0.5)":v>2.3?"rgba(217,119,6,0.45)":"rgba(22,163,74,0.4)"), borderColor:avgs.map(v=>v>2.6?"#dc2626":v>2.3?"#d97706":"#16a34a"), borderWidth:2, borderRadius:5 }] };
  }, [years, monthMap]);
 
  const dailyWaste = useMemo(() => ({
    labels: byMonth.map(d=>d.label),
    datasets:[
      { label:"Daily UNS Copies", data:byMonth.map(d=>Math.round(d.uns/30)), borderColor:"#dc2626", backgroundColor:"rgba(220,38,38,0.07)", borderWidth:2, pointRadius:2, fill:true, tension:0.4 },
      { label:"50K Target", data:byMonth.map(()=>50000), borderColor:"rgba(22,163,74,0.5)", borderDash:[5,5], borderWidth:1.5, pointRadius:0, fill:false },
    ],
  }), [byMonth]);
 
  return (
    <div style={{ minHeight:"100vh", background:"#f0f4f8", fontFamily:"'Plus Jakarta Sans',sans-serif", fontSize:14 }}>
 
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#1e293b,#0f172a,#1e3a5f)", padding:"16px 24px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <h1 style={{ color:"#f8fafc", fontSize:22, fontWeight:800, margin:0 }}>📊 <span style={{ color:"#38bdf8" }}>CSV</span> Analytics Dashboard</h1>
          <p style={{ color:"#475569", fontSize:11, margin:"2px 0 0" }}>{filename} · {data.length.toLocaleString()} rows</p>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          {[{ v:fmtNum(totSold), l:"Sold", c:"#4ade80" },{ v:soldPct.toFixed(2)+"%", l:"Sold %", c:"#86efac" },{ v:fmtNum(totUns), l:"Unsold", c:"#f87171" },{ v:pct.toFixed(2)+"%", l:"UNS %", c:"#fbbf24" },{ v:"~"+fmtNum(daily), l:"Per Day", c:"#a78bfa" },{ v:fmtNum(totSale), l:"Dispatched", c:"#93c5fd" }].map(k=>(
            <div key={k.l} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"8px 14px", textAlign:"center", minWidth:80 }}>
              <span style={{ fontFamily:"monospace", fontSize:16, fontWeight:700, color:k.c, display:"block" }}>{k.v}</span>
              <span style={{ fontSize:10, color:"#64748b", textTransform:"uppercase", letterSpacing:0.6 }}>{k.l}</span>
            </div>
          ))}
          <button onClick={onReset} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, color:"#94a3b8", fontSize:12, padding:"8px 12px", cursor:"pointer" }}>↩ New File</button>
        </div>
      </div>
 
      {/* Filter bar */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e2e8f0", padding:"10px 24px", display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
        <span style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:1 }}>🔍 Filter</span>
        {filterKeys.map(k=>(
          <div key={k} style={{ display:"flex", alignItems:"center", gap:6 }}>
            <label style={{ fontSize:11, fontWeight:600, color:"#94a3b8" }}>{k}</label>
            <select value={filters[k]||""} onChange={e=>setFilters(f=>({ ...f, [k]:e.target.value }))}
              style={{ padding:"4px 22px 4px 8px", border:`1px solid ${filters[k]?"#2563eb":"#cbd5e1"}`, borderRadius:7, fontSize:12, color:"#334155", background:filters[k]?"#dbeafe":"#f8fafc", appearance:"none", backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat:"no-repeat", backgroundPosition:"right 6px center" }}>
              <option value="">All</option>
              {(uniques[k]||[]).map(v=><option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        ))}
        {Object.values(filters).some(Boolean) && (
          <button onClick={()=>setFilters({})} style={{ background:"#fee2e2", border:"1px solid #fca5a5", borderRadius:7, color:"#dc2626", fontSize:12, fontWeight:700, padding:"4px 12px", cursor:"pointer" }}>✕ Reset</button>
        )}
        <div style={{ marginLeft:"auto", background:"#dbeafe", border:"1px solid #bfdbfe", borderRadius:20, padding:"3px 12px", fontSize:11, fontWeight:600, color:"#1d4ed8" }}>
          {filtered.length.toLocaleString()} records · {fmtNum(totSale)} dispatched · {fmtNum(totSold)} sold ({soldPct.toFixed(2)}%) · {fmtNum(totUns)} UNS ({pct.toFixed(2)}%)
        </div>
      </div>
 
      {/* Tabs */}
      <div style={{ background:"#1e293b", display:"flex", padding:"0 24px", borderBottom:"2px solid #0f172a" }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setActiveTab(t.id)}
            style={{ padding:"10px 16px", fontSize:11, fontWeight:700, letterSpacing:1, textTransform:"uppercase", background:"none", border:"none", borderBottom:activeTab===t.id?"2px solid #38bdf8":"2px solid transparent", marginBottom:-2, color:activeTab===t.id?"#38bdf8":"#64748b", cursor:"pointer" }}>
            {t.label}
          </button>
        ))}
      </div>
 
      <div style={{ padding:"20px 24px 32px" }}>
 
        {/* ── OVERVIEW ── */}
        {activeTab==="overview" && (<>
          {/* Aggregate summary strip */}
          <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:"16px 22px", marginBottom:18, boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>
              📊 Aggregate Summary — Filtered Data ({filtered.length.toLocaleString()} records)
            </div>
            <div style={{ display:"flex", gap:0, flexWrap:"wrap", borderRadius:10, overflow:"hidden", border:"1px solid #e2e8f0" }}>
              {[
                { label:"Total Dispatched", value:fmtNum(totSale), pctLabel:null, pctVal:null, bg:"#f8fafc", border:"#e2e8f0", color:"#1d4ed8" },
                { label:"Sold Copies", value:fmtNum(totSold), pctLabel:"Sold %", pctVal:soldPct.toFixed(2)+"%", bg:"#f0fdf4", border:"#bbf7d0", color:"#16a34a" },
                { label:"Unsold Copies", value:fmtNum(totUns),  pctLabel:"UNS %",  pctVal:pct.toFixed(2)+"%",    bg:"#fff7ed", border:"#fed7aa", color:"#ea580c" },
                { label:"Daily Waste", value:"~"+fmtNum(daily), pctLabel:"Per Day", pctVal:null, bg:"#fdf4ff", border:"#e9d5ff", color:"#7c3aed" },
              ].map((item, i, arr) => (
                <div key={item.label} style={{ flex:"1 1 160px", padding:"14px 18px", background:item.bg, borderRight: i < arr.length-1 ? `1px solid ${item.border}` : "none" }}>
                  <div style={{ fontSize:11, color:"#64748b", fontWeight:600, marginBottom:4 }}>{item.label}</div>
                  <div style={{ fontFamily:"monospace", fontSize:22, fontWeight:800, color:item.color, lineHeight:1 }}>{item.value}</div>
                  {item.pctLabel && (
                    <div style={{ marginTop:6, display:"inline-flex", alignItems:"center", gap:6, background: item.color+"18", borderRadius:20, padding:"2px 10px" }}>
                      <span style={{ fontSize:10, color:item.color, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5 }}>{item.pctLabel}</span>
                      <span style={{ fontFamily:"monospace", fontSize:13, fontWeight:800, color:item.color }}>{item.pctVal}</span>
                    </div>
                  )}
                  {!item.pctLabel && item.label === "Daily Waste" && (
                    <div style={{ marginTop:6, fontSize:11, color:"#94a3b8" }}>copies/day avg</div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop:10, fontSize:11, color:"#94a3b8", fontStyle:"italic" }}>
              Sold% = (Dispatched − Unsold) ÷ Dispatched × 100 &nbsp;|&nbsp; UNS% = Unsold ÷ Dispatched × 100
            </div>
          </div>
          <div style={g4}>
            <KPICard label="Total UNS Copies" value={fmtNum(totUns)} sub={`${pct.toFixed(2)}% of dispatched`} accent="#dc2626" icon="📦" />
            <KPICard label="UNS %" value={pct.toFixed(2)+"%"} sub={`${fmtNum(totUns)} ÷ ${fmtNum(totSale)}`} accent="#d97706" icon="📊" />
            <KPICard label="Sold Copies" value={fmtNum(totSold)} sub={`${soldPct.toFixed(2)}% sell-through`} accent="#16a34a" icon="✅" />
            <KPICard label="Daily Waste" value={"~"+fmtNum(daily)} sub="Copies returned per day" accent="#7c3aed" icon="⏱" />
          </div>
          <div style={g2}>
            {hasPubl && byPubl.length>0 && (
              <ChartCard title={`UNS by ${mapping.publ} — Filtered`} sub="Volume, sale and UNS% per publication">
                <CJChart type="bar" data={pubOvData} options={dualY("Copies (L)")} height={240} />
              </ChartCard>
            )}
            {hasCh && byCh.length>0 && (
              <ChartCard title="Channel — Sale vs UNS%" sub="UPC vs Local channel efficiency">
                <CJChart type="bar" data={chOvData} options={dualY("Sale (Cr)")} height={240} />
              </ChartCard>
            )}
            {!hasPubl && hasLoc && byLoc.length>0 && (
              <ChartCard title={`UNS by ${mapping.location}`} sub="Top locations by return volume">
                <CJChart type="bar" data={locVolData} options={hBar("L")} height={240} />
              </ChartCard>
            )}
            {!hasCh && hasSorg && bySorg.length>0 && (
              <ChartCard title={`Top ${mapping.sorg} by UNS`} sub="Highest return volume">
                <CJChart type="bar" data={sorgVolData} options={hBar("L")} height={240} />
              </ChartCard>
            )}
          </div>
          {hasTime && byYear.length>1 && (
            <div style={g2}>
              <ChartCard title="Year-on-Year — Sale vs UNS" sub="Annual totals">
                <CJChart type="bar" data={yoyOvData} options={dualY("Sale (Cr)")} height={210} />
              </ChartCard>
              <ChartCard title="Monthly UNS% Trend" sub="Return rate over time with 2% target">
                <CJChart type="line" data={trendData} options={lineOpts()} height={210} />
              </ChartCard>
            </div>
          )}
        </>)}
 
        {/* ── BY PUBLICATION ── */}
        {activeTab==="publication" && hasPubl && (<>
          <div style={g4}>
            {byPubl.slice(0,4).map((d,i)=>(
              <KPICard key={d.label} label={d.label} value={fmtNum(d.uns)} sub={`${d.pct.toFixed(2)}% UNS rate`} accent={["#d97706","#dc2626","#16a34a","#7c3aed"][i%4]} />
            ))}
          </div>
          <div style={g2}>
            <ChartCard title={`Daily UNS by ${mapping.publ}`} sub="Average copies returned per day">
              <CJChart type="bar" data={pubDailyData} options={vBar()} height={250} />
            </ChartCard>
            <ChartCard title={`UNS% by ${mapping.publ}`} sub="Efficiency ranking — worst first">
              <CJChart type="bar" data={pubPctData} options={hBar("%")} height={250} />
            </ChartCard>
          </div>
          {hasCh && byPublCh.length>0 && (
            <ChartCard title={`${mapping.publ} × ${mapping.channel} — UNS%`} sub="Return rate by product and channel combination">
              <CJChart type="bar" data={pubChData} options={hBar("%")} height={Math.max(200, byPublCh.length*34)} />
            </ChartCard>
          )}
        </>)}
 
        {/* ── BY SORG ── */}
        {activeTab==="geo" && hasSorg && (<>
          <div style={g2}>
            <ChartCard title={`Top 10 ${mapping.sorg} — UNS Volume`} sub="Absolute unsold copies (L)">
              <CJChart type="bar" data={sorgVolData} options={hBar("L")} height={280} />
            </ChartCard>
            <ChartCard title={`Top 10 ${mapping.sorg} — UNS%`} sub="Structurally over-supplied">
              <CJChart type="bar" data={sorgPctData} options={hBar("%")} height={280} />
            </ChartCard>
          </div>
          <ChartCard title={`All ${mapping.sorg} — Complete Ranking`} sub="Sorted by UNS% descending">
            <div style={{ overflowY:"auto", maxHeight:420, marginTop:10, borderRadius:8, border:"1px solid #e2e8f0" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"#f1f5f9" }}>
                    {["#", mapping.sorg, "Sale", "UNS", "UNS%", "Status"].map(h=>(
                      <th key={h} style={{ padding:"8px 12px", textAlign:"left", color:"#64748b", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:0.8, whiteSpace:"nowrap", borderBottom:"2px solid #e2e8f0" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bySorgPct.map((d,i)=>{
                    const col=pctColor(d.pct), bg=pctBg(d.pct);
                    const status=d.pct>8?"🔴 Critical":d.pct>4?"🟠 High":d.pct>2?"🟡 Watch":"🟢 Good";
                    return (
                      <tr key={d.label} style={{ borderBottom:"1px solid #f1f5f9" }}>
                        <td style={{ padding:"7px 12px", color:"#94a3b8", fontFamily:"monospace" }}>{i+1}</td>
                        <td style={{ padding:"7px 12px", fontWeight:600, color:"#0f172a" }}>{d.label}</td>
                        <td style={{ padding:"7px 12px", fontFamily:"monospace", color:"#475569" }}>{fmtNum(d.sale)}</td>
                        <td style={{ padding:"7px 12px", fontFamily:"monospace", color:"#475569" }}>{fmtNum(d.uns)}</td>
                        <td style={{ padding:"7px 12px" }}>
                          <span style={{ background:bg, color:col, border:`1px solid ${col}40`, borderRadius:20, padding:"2px 8px", fontFamily:"monospace", fontSize:11, fontWeight:600 }}>{d.pct.toFixed(2)}%</span>
                        </td>
                        <td style={{ padding:"7px 12px", fontSize:11 }}>{status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>)}
 
        {/* ── BY LOCATION ── */}
        {activeTab==="location" && hasLoc && (
          <div style={g2}>
            <ChartCard title={`${mapping.location} — UNS Volume`} sub="Absolute unsold copies (L)">
              <CJChart type="bar" data={locVolData} options={hBar("L")} height={280} />
            </ChartCard>
            <ChartCard title={`${mapping.location} — UNS%`} sub="Return rate by region">
              <CJChart type="bar" data={locPctData} options={hBar("%")} height={280} />
            </ChartCard>
          </div>
        )}
 
        {/* ── TRENDS ── */}
        {activeTab==="trends" && hasTime && (<>
          {byYear.length>0 && (
            <div style={g4}>
              {byYear.slice(-4).map((d,i)=>(
                <KPICard key={d.label} label={`${d.label} Daily UNS`}
                  value={"~"+fmtNum(Math.round(d.uns/(30*Math.max(1,new Set(filtered.filter(r=>r[mapping.year]===d.label).map(r=>r[mapping.month])).size))))}
                  sub={d.pct.toFixed(2)+"% UNS rate"}
                  accent={["#16a34a","#dc2626","#d97706","#7c3aed"][i%4]} />
              ))}
            </div>
          )}
          {byMonth.length>1 && (<>
            <div style={{ marginBottom:18 }}>
              <ChartCard title="36-Month UNS% Trend — Filtered" sub="Monthly return rate · red dots above 2.7% · green target at 2.0%">
                <CJChart type="line" data={trendData} options={lineOpts()} height={260} />
              </ChartCard>
            </div>
            <div style={g2}>
              {years.length>1 && (
                <ChartCard title="Year Overlay — Monthly UNS (L)" sub="Multi-year comparison of monthly unsold volumes">
                  <CJChart type="line" data={yoyOverlay} options={{ scales:{ x:{ grid:G }, y:{ grid:G, title:{ display:true, text:"UNS (L)", color:"#94a3b8", font:{ size:10 } } } }, plugins:{ legend:{ position:"top", labels:{ font:{ size:10 } } } } }} height={240} />
                </ChartCard>
              )}
              <ChartCard title="Seasonal Pattern — Avg UNS% by Month" sub="Multi-year average · monsoon months typically worst">
                <CJChart type="bar" data={seasonalData} options={{ scales:{ x:{ grid:G }, y:{ grid:G, ticks:{ callback:v=>v+"%" }, min:0 } }, plugins:{ legend:{ display:false } } }} height={240} />
              </ChartCard>
            </div>
            <ChartCard title="Daily Copies Wasted — Month by Month" sub="Absolute copies wasted per day · target at 50,000">
              <CJChart type="line" data={dailyWaste} options={{ scales:{ x:{ grid:G, ticks:{ maxTicksLimit:12, font:{ size:9 } } }, y:{ grid:G, ticks:{ callback:v=>(v/1000)+"K" }, min:0 } }, plugins:{ legend:{ position:"top", labels:{ font:{ size:10 } } } } }} height={210} />
            </ChartCard>
          </>)}
        </>)}

        {/* ── DATA TABLE ── */}
        {activeTab==="data" && (
          <div>
            {/* Stats bar */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div>
                <h2 style={{ fontSize:15, fontWeight:800, color:"#0f172a", margin:"0 0 2px" }}>Raw Data — Filtered View</h2>
                <p style={{ fontSize:12, color:"#64748b", margin:0 }}>
                  {filtered.length.toLocaleString()} rows · {tableColumns.length} columns
                  {Object.values(filters).some(Boolean) && <span style={{ marginLeft:6, color:"#2563eb", fontWeight:600 }}>· filters active</span>}
                </p>
              </div>
              {!dataShown && (
                <button onClick={()=>setDataShown(true)}
                  style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 22px", background:"linear-gradient(135deg,#2563eb,#1d4ed8)", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 12px rgba(37,99,235,0.35)" }}>
                  <span style={{ fontSize:16 }}>👁</span> Show Data
                </button>
              )}
            </div>

            {!dataShown ? (
              /* Placeholder — data intentionally not rendered yet */
              <div style={{ background:"#fff", border:"2px dashed #e2e8f0", borderRadius:14, padding:"60px 24px", textAlign:"center" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
                <p style={{ fontSize:16, fontWeight:700, color:"#334155", margin:"0 0 6px" }}>Table not loaded yet</p>
                <p style={{ fontSize:13, color:"#64748b", margin:"0 0 24px", maxWidth:420, marginLeft:"auto", marginRight:"auto" }}>
                  Click <strong>Show Data</strong> to render {filtered.length.toLocaleString()} rows. Once shown, the table auto-updates whenever you change filters above.
                </p>
                <button onClick={()=>setDataShown(true)}
                  style={{ padding:"11px 28px", background:"#2563eb", border:"none", borderRadius:9, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 12px rgba(37,99,235,0.3)" }}>
                  👁 Show Data
                </button>
              </div>
            ) : (
              <div style={{ background:"#fff", borderRadius:12, padding:"18px 20px", border:"1px solid #e2e8f0", boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
                <DataTable rows={filtered} columns={tableColumns} aggPct={pct} totals={tableColumns.reduce((acc, col) => {
                    if (col === "sale") acc[col] = totSale;
                    else if (col === "uns") acc[col] = totUns;
                    else acc[col] = null;
                    return acc;
                  }, {})} />
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
 
// ─── App Root ────────────────────────────────────────────────────────────────
export default function App() {
  const [stage, setStage] = useState("upload");
  const [csvData, setCsvData] = useState(null);
  const [mappedData, setMappedData] = useState(null);
  const [mapping, setMapping] = useState(null);
 
  return (
    <>
      {stage==="upload" && <UploadScreen onData={d=>{ setCsvData(d); setStage("map"); }} />}
      {stage==="map" && csvData && (
        <ColumnMapper headers={csvData.headers} rows={csvData.rows} filename={csvData.filename}
          onMapped={(parsed,m)=>{ if(!parsed){setStage("upload");return;} setMappedData(parsed); setMapping(m); setStage("dashboard"); }} />
      )}
      {stage==="dashboard" && mappedData && (
        <Dashboard data={mappedData} mapping={mapping} filename={csvData.filename}
          onReset={()=>{ setStage("upload"); setCsvData(null); setMappedData(null); setMapping(null); }} />
      )}
    </>
  );
}