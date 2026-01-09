"use client";

import { useState } from "react";
import { auth } from "@/firebase/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSignup = async () => {
    setError("");

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.code.replace("auth/", "").replace(/-/g, " "));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h2 className="text-2xl font-bold mb-6 text-center">Create Account</h2>

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
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleSignup}
          className="w-full py-3 bg-green-600 text-white rounded hover:bg-green-700 transition"
        >
          Signup
        </button>

        {error && <p className="mt-4 text-red-600 text-sm">{error}</p>}

        <p className="mt-4 text-center">
          Already have an account?{" "}
          <a href="/auth/login" className="text-blue-600">
            Login
          </a>
        </p>
      </div>
    </div>
  );
}
