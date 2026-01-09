"use client";
import { useEffect, useState } from "react";
import { getSession, saveSession } from "../../../lib/api";
import { auth } from "../../../lib/firebase";

export default function ConnectPlatformPage({ params }) {
  const platform = params.platform; // 'instagram', 'linkedin', 'ghl'
  const [status, setStatus] = useState("");

  const handleConnect = async () => {
    if (!auth.currentUser) return;
    const token = await auth.currentUser.getIdToken();
    setStatus(`Opening ${platform} login...`);

    // In real app, this opens backend automation interactive login
    // Placeholder: simulate connection
    const sessionData = { cookies: [], localStorage: {} };
    await saveSession(platform, sessionData, token);
    setStatus(`${platform} connected successfully!`);
  };

  useEffect(() => {
    setStatus(`Not connected to ${platform}`);
  }, [platform]);

  return (
    <div className="max-w-md mx-auto mt-10 p-4 bg-white shadow rounded text-center">
      <h1 className="text-2xl font-bold mb-4">Connect {platform}</h1>
      <button
        onClick={handleConnect}
        className="bg-green-500 text-white px-4 py-2 rounded"
      >
        Connect {platform}
      </button>
      <p className="mt-4 text-gray-700">{status}</p>
    </div>
  );
}
