"use client";

import { useState } from "react";
import { auth, googleProvider } from "@/firebase/firebase";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.code.replace("auth/", "").replace(/-/g, " "));
    }
  };

  const handleGoogleLogin = async () => {
    setError("");

    try {
      await signInWithPopup(auth, googleProvider);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.code.replace("auth/", "").replace(/-/g, " "));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>

        <input
          className="w-full mb-3 px-3 py-2 border rounded"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full mb-3 px-3 py-2 border rounded"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleLogin}
          className="w-full py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Login
        </button>

        <button
          onClick={handleGoogleLogin}
          className="w-full py-3 mt-3 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Login with Google
        </button>

        {error && <p className="mt-4 text-red-600 text-sm">{error}</p>}

        <p className="mt-4 text-center">
          Don't have an account create now?{" "}
          <a href="/auth/signup" className="text-blue-600">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
