"use client";
import { useState } from "react";

export default function AutomationModal({ open, onClose, onSubmit, platform }) {
  const [fileText, setFileText] = useState("");
  const [template, setTemplate] = useState("");
  const [fromName, setFromName] = useState("");
  const [parsingError, setParsingError] = useState("");

  if (!open) return null;

  const parseFile = (text) => {
    // Try JSON first
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json)) return json;
      if (json.items && Array.isArray(json.items)) return json.items;
      setParsingError("JSON must be an array of lead objects or contain an 'items' array");
      return null;
    } catch (e) {
      // Try CSV simple parse
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        setParsingError("No valid CSV/JSON detected");
        return null;
      }
      const headers = lines[0].split(",").map(h => h.trim());
      const rows = lines.slice(1).map(line => {
        const values = line.split(",").map(v => v.trim());
        const obj = {};
        headers.forEach((h, i) => obj[h] = values[i]);
        return obj;
      });
      return rows;
    }
  };

  const handleSubmit = () => {
    const leads = parseFile(fileText);
    if (!leads) return;
    onSubmit({ leads, template, fromName });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-2xl">
        <h2 className="text-xl font-bold mb-4">Start Automation for {platform}</h2>

        <label className="block text-sm font-medium mb-1">Leads file (JSON array or CSV)</label>
        <textarea value={fileText} onChange={e => setFileText(e.target.value)} className="w-full h-40 p-2 border rounded mb-2" placeholder='Paste JSON array or CSV here' />
        {parsingError && <p className="text-sm text-red-600">{parsingError}</p>}

        <label className="block text-sm font-medium mb-1">Message template</label>
        <textarea value={template} onChange={e => setTemplate(e.target.value)} className="w-full h-24 p-2 border rounded mb-2" placeholder='Hi {{firstName}}, ...' />

        <label className="block text-sm font-medium mb-1">From name</label>
        <input value={fromName} onChange={e => setFromName(e.target.value)} className="w-full p-2 border rounded mb-4" placeholder='Your name or account name' />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
          <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 text-white rounded">Start</button>
        </div>
      </div>
    </div>
  );
}
