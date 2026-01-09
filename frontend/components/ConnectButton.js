"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { getSession, startInteractiveLogin } from "../lib/api";
import { useRouter } from "next/navigation";

export default function ConnectButton({ platform, label }) {
	const { user, loading: authLoading } = useAuth();
	const [connected, setConnected] = useState(false);
	const [loading, setLoading] = useState(false);
	const [statusMsg, setStatusMsg] = useState("");

	const router = useRouter();

	useEffect(() => {
		let mounted = true;
		const check = async () => {
			if (!user) return setConnected(false);
			const token = await user.getIdToken();
			try {
				const session = await getSession(platform, token);
				if (mounted) setConnected(!!session);
			} catch (e) {
				console.error("getSession error:", e);
				if (mounted) setConnected(false);
				if (mounted) setStatusMsg(e?.response?.data?.error || e.message || "Failed to check session");
			}
		};
		check();
		return () => (mounted = false);
	}, [user, platform]);

	const handleConnect = async () => {
		if (authLoading) return setStatusMsg("Checking authentication...");
		if (!user) return setStatusMsg("Please login first");
		setLoading(true);
		setStatusMsg("");
		try {
			const token = await user.getIdToken();
			setStatusMsg("Opening browser for login... please complete login in the opened window.");
			await startInteractiveLogin(platform, token);
			// after interactive login, check session
			const session = await getSession(platform, token);
			setConnected(!!session);
			if (session) setStatusMsg("Connected");
		} catch (err) {
			setStatusMsg(err?.response?.data?.error || err.message || "Login failed");
		} finally {
			setLoading(false);
		}
	};

	const handleRun = async () => {
		// Navigate to full Automation page where user can upload leads
		router.push(`/automation?platform=${platform}`);
	};

	return (
		<div className="bg-white p-4 rounded-lg shadow-md flex flex-col items-center space-y-3 w-full max-w-sm">
			<div className="flex items-center justify-between w-full">
				<h3 className="font-semibold">{label}</h3>
				<div className={`px-3 py-1 rounded-full text-sm ${connected ? 'bg-green-100 text-green-800 animate-pulse' : 'bg-gray-100 text-gray-700'}`}>
					{connected ? 'Connected' : 'Not connected'}
				</div>
			</div>

			<p className="text-sm text-gray-500 text-center">{statusMsg}</p>

			<div className="flex gap-2 w-full">
				{!connected ? (
					<button
						onClick={handleConnect}
						disabled={loading}
						className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded transform transition hover:scale-105 relative overflow-hidden"
					>
						{loading ? (
							<span className="flex items-center justify-center gap-2">
								<span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
								Connecting...
							</span>
						) : (
							'Connect'
						)}
					</button>
				) : (
					<>
						<button
							onClick={handleRun}
							disabled={loading}
							className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded transform transition hover:scale-105"
						>
							{loading ? (
								<span className="flex items-center justify-center gap-2">
									<span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
									Queueing...
								</span>
							) : (
								'Start Automation'
							)}
						</button>
					</>
				)}
			</div>

		</div>
	);
}
