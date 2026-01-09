"use client";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useAuth } from "../lib/auth";

export default function Navbar() {
  const { user, loading } = useAuth();

  return (
    <nav className="bg-white shadow p-4 flex justify-between items-center">
      <Link href="/" className="text-xl font-bold">DMAuto</Link>
      <div>
        {!loading && user ? (
          <button
            className="bg-red-500 text-white px-3 py-1 rounded"
            onClick={() => signOut(auth)}
          >
            Logout
          </button>
        ) : (
          !loading && (
            <Link href="/auth/login" className="bg-blue-500 text-white px-3 py-1 rounded">
              Login Now
            </Link>
          )
        )}
      </div>
    </nav>
  );
}
