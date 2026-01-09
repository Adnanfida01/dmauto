"use client";
import { useEffect } from "react";
import { useAuth } from "../lib/auth";
import { useRouter } from "next/navigation";

export default function WelcomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      // if the user is already logged in, redirect to dashboard
      router.replace('/dashboard');
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center px-4">
      {/* Card */}
      <div className="bg-white shadow-xl rounded-2xl p-10 max-w-xl w-full text-center border border-gray-100">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          🚀 Welcome to DM Auto
        </h1>

        <p className="text-gray-600 text-lg mb-6">
          Automate your daily messaging with speed & accuracy.  
          Please login or signup to continue.
        </p>

        <div className="flex flex-col gap-4 mt-6">
          <a href="/auth/login">
            <button className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
              Login
            </button>
          </a>

          <a href="/auth/signup">
            <button className="w-full py-3 bg-gray-900 text-white rounded-lg font-semibold hover:bg-black transition">
              Signup
            </button>
          </a>
        </div>
      </div>

      <p className="mt-6 text-gray-500 text-sm">
        DM Auto © 2026 — Automated Messaging System
      </p>
    </div>
  );
}
