"use client";
import { useState, useEffect } from "react";
import { useAuth } from "../../lib/auth";
import { startAutomation, getStats } from "../../lib/api";

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] || "");
    return obj;
  });
  return { headers, rows };
}

export default function AutomationPage({ searchParams }) {
  const { user } = useAuth();
  const initial = (searchParams && searchParams.platform) || "instagram";
  const [platform, setPlatform] = useState(initial);
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [headers, setHeaders] = useState([]);
  const [leadsPreview, setLeadsPreview] = useState([]);
  const [mapping, setMapping] = useState({ name: "", role: "", company: "", jobTitle: "", username: "" });
  const [template, setTemplate] = useState("");
  const [fromName, setFromName] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [status, setStatus] = useState("");
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [polling, setPolling] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setRawText(text);

    // Try JSON
    try {
      const json = JSON.parse(text);
      let rows = [];
      if (Array.isArray(json)) rows = json;
      else if (json.items && Array.isArray(json.items)) rows = json.items;
      else rows = [json];
      const hdrs = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
      setHeaders(hdrs);
      setLeadsPreview(rows.slice(0, 5));
      // set default mapping best-effort
      setMapping(m => ({
        ...m,
        name: hdrs.includes('name') ? 'name' : (hdrs.includes('fullName') ? 'fullName' : hdrs[0] || ''),
        username: hdrs.includes('username') ? 'username' : (hdrs.includes('user') ? 'user' : ''),
        company: hdrs.includes('company') ? 'company' : (hdrs.includes('companyName') ? 'companyName' : ''),
        role: hdrs.includes('role') ? 'role' : '',
        jobTitle: hdrs.includes('title') ? 'title' : (hdrs.includes('jobTitle') ? 'jobTitle' : ''),
      }));
      return;
    } catch (e) {
      // Not JSON, try CSV
    }

    const csv = parseCSV(text);
    if (csv.rows && csv.rows.length) {
      setHeaders(csv.headers);
      setLeadsPreview(csv.rows.slice(0,5));
      setMapping(m => ({
        ...m,
        name: csv.headers.includes('name') ? 'name' : csv.headers[0] || '',
        username: csv.headers.includes('username') ? 'username' : '',
        company: csv.headers.includes('company') ? 'company' : '',
        role: csv.headers.includes('role') ? 'role' : '',
        jobTitle: csv.headers.includes('title') ? 'title' : '',
      }));
    } else {
      setStatus('Unable to parse file. Paste a JSON array or CSV.');
    }
  };

  const buildLeads = () => {
    // parse rawText as JSON or CSV and map fields
    try {
      const json = JSON.parse(rawText);
      const rows = Array.isArray(json) ? json : (json.items && Array.isArray(json.items) ? json.items : [json]);
      return rows.map(r => ({
        name: r[mapping.name] || r.name || r.fullName || "",
        role: r[mapping.role] || r.role || "",
        company: r[mapping.company] || r.company || "",
        jobTitle: r[mapping.jobTitle] || r.title || r.jobTitle || "",
        username: r[mapping.username] || r.username || r.handle || "",
        raw: r,
      }));
    } catch (e) {
      const csv = parseCSV(rawText);
      return csv.rows.map(r => ({
        name: r[mapping.name] || "",
        role: r[mapping.role] || "",
        company: r[mapping.company] || "",
        jobTitle: r[mapping.jobTitle] || "",
        username: r[mapping.username] || "",
        raw: r,
      }));
    }
  };

  const handleStart = async () => {
    if (!user) { setStatus('Please login to start automation'); return; }
    if (!rawText) { setStatus('Please upload a leads file'); return; }
    setStatus('Preparing automation...');
    const leads = buildLeads();
    if (!leads || leads.length === 0) { setStatus('No leads found after parsing'); return; }

    try {
      const token = await user.getIdToken();
      await startAutomation({ platform, leads, template, fromName, openaiKey }, token);
      setStatus('Automation queued successfully');
      // start polling logs for this user/platform
      setPolling(true);
    } catch (err) {
      console.error('startAutomation error', err);
      setStatus(err?.response?.data?.error || err?.message || 'Failed to queue automation');
    }
  };

  // Poll stats/logs while polling=true. Back off to 5s to reduce Firestore reads.
  useEffect(() => {
    if (!polling) return;
    let mounted = true;
    const iv = setInterval(async () => {
      try {
        if (!user) return;
        const token = await user.getIdToken();
        const data = await getStats(token);
        if (data && data.__quota) {
          // stop aggressive polling when quota is hit
          setStatus('Backend quota exceeded. Polling paused — try again soon.');
          setPolling(false);
          return;
        }
        const logs = data.logs || [];
        // filter by platform
        const filtered = logs.filter(l => !l.platform || l.platform === platform);
        if (mounted) setConsoleLogs(filtered);
      } catch (e) {
        console.error('poll logs error', e);
      }
    }, 5000);
    return () => { mounted = false; clearInterval(iv); };
  }, [polling, platform, user]);

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Automation</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded shadow">
          <label className="block text-sm font-medium mb-1">Platform</label>
          <select value={platform} onChange={e => setPlatform(e.target.value)} className="w-full p-2 border rounded">
            <option value="instagram">Instagram</option>
            <option value="linkedin">LinkedIn</option>
            <option value="ghl">GHL</option>
          </select>

          <label className="block text-sm font-medium mt-4 mb-1">Leads file (upload JSON array or CSV)</label>
          <input type="file" accept=".json,.csv,text/csv,application/json" onChange={e => handleFile(e.target.files?.[0])} className="w-full" />
          {fileName && <p className="text-sm text-gray-500 mt-2">Loaded: {fileName}</p>}

          <label className="block text-sm font-medium mt-4 mb-1">OpenAI API Key (optional)</label>
          <input value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} placeholder="sk-..." className="w-full p-2 border rounded" />
        </div>

        <div className="p-4 bg-white rounded shadow md:col-span-2">
          <label className="block text-sm font-medium mb-1">Message template</label>
          <textarea value={template} onChange={e => setTemplate(e.target.value)} className="w-full h-28 p-2 border rounded" placeholder="Hi {{name}}, I'd like to..." />

          <label className="block text-sm font-medium mt-4 mb-1">From name</label>
          <input value={fromName} onChange={e => setFromName(e.target.value)} className="w-full p-2 border rounded" />

          <div className="mt-4">
            <h3 className="font-semibold">Detected columns / mapping</h3>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {["name","username","role","company","jobTitle"].map((key) => (
                <div key={key} className="flex flex-col">
                  <label className="text-sm font-medium">{key}</label>
                  <select value={mapping[key]} onChange={e => setMapping(m => ({...m, [key]: e.target.value}))} className="p-2 border rounded">
                    <option value="">(none)</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <h4 className="font-medium">Preview (first rows)</h4>
              <pre className="bg-gray-50 p-3 rounded h-40 overflow-auto text-sm">{JSON.stringify(leadsPreview, null, 2)}</pre>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={handleStart} className="bg-blue-600 text-white px-4 py-2 rounded">Start Automation</button>
        <p className="text-sm text-gray-700">{status}</p>
      </div>
      {polling && (
        <div className="mt-4 bg-black/5 p-4 rounded">
          <h3 className="font-semibold mb-2">Automation Console</h3>
          <div className="h-48 overflow-auto bg-white p-3 rounded border">
            {consoleLogs.length === 0 && <p className="text-sm text-gray-500">Waiting for logs...</p>}
            {consoleLogs.map((l, i) => (
              <div key={i} className="mb-2">
                <div className="text-xs text-gray-500">{new Date(l.timestamp).toLocaleString()} — {l.platform}</div>
                <div className="text-sm">{l.status}{l.lead ? ` — ${JSON.stringify(l.lead)}` : ''}{l.message ? ` — ${l.message}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
