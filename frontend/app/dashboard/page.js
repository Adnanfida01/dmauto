"use client";
import { useEffect, useState } from "react";
import StatsCard from "../../components/StatsCard";
import LogsTable from "../../components/LogsTable";
import ConnectButton from "../../components/ConnectButton";
import { getStats } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState({ count: 0 });
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchStats = async () => {
    if (!user) return;
    const token = await user.getIdToken();
    try {
      const data = await getStats(token);
      if (data && data.__error === "network") {
        setStats({ count: 0 });
        setLogs([]);
        setError("Unable to reach backend API. Is the backend server running?");
        return;
      }
      if (data && data.__quota) {
        setStats({ count: 0 });
        setLogs([]);
        setError("Backend Firestore quota exceeded — try again in a minute.");
        return;
      }
      setStats(data || { count: 0 });
      setLogs((data && data.logs) || []);
    } catch (err) {
      setError(err.message || "Failed to load stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      if (user) {
        fetchStats();
      } else {
        setLoading(false);
      }
    }
  }, [user, authLoading]);

  if (loading || authLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="animate-pulse bg-gray-100 h-28 rounded-lg" />
          <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
              <div className="h-32 bg-gray-100 rounded" />
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
              <div className="h-32 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center mt-10">
        <p className="text-red-600 font-semibold mb-2">{error}</p>
        <p className="text-sm text-gray-600">Please start the backend server and refresh the page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard title="Total Automations" value={stats.count || 0} />
        <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConnectButton platform="instagram" label="Instagram" />
          <ConnectButton platform="linkedin" label="LinkedIn" />
        </div>
      </div>
      <div>
        <h2 className="text-xl font-bold mb-2">Recent Logs</h2>
        <LogsTable logs={logs} />
      </div>
    </div>
  );
}
