/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { ShieldAlert, LogIn, Lock, Mail, Sparkles } from "lucide-react";

interface LoginProps {
  onLoading: (isLoading: boolean) => void;
}

export default function Login({ onLoading }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleDemoBypass = () => {
    localStorage.setItem("isOfflineMode", "true");
    const demoUser = {
      uid: "offline-demo-user",
      email: email.trim() || "demo@dm-access.com",
      emailVerified: true
    };
    localStorage.setItem("offline_user", JSON.stringify(demoUser));
    onLoading(true);
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setError(null);
    onLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      onLoading(false);
      setError(err.message || "Invalid Email or Password.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto w-full max-w-md">
        <div className="flex justify-center">
          <div className="bg-blue-600 p-3 rounded-2xl shadow-lg text-white">
            <Lock className="h-8 w-8" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          Planner Login
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Dept. Resource &amp; Quality Planner
        </p>
      </div>

      <div className="mt-8 sm:mx-auto w-full max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-xl sm:px-10 border border-gray-100">
          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
              <div className="flex items-start">
                <div className="flex-shrink-0 text-red-500">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="ml-3">
                  <p className="text-sm font-semibold text-red-850 break-words">{error}</p>
                  {(error.toLowerCase().includes("referer") || 
                    error.toLowerCase().includes("blocked") || 
                    error.toLowerCase().includes("auth") || 
                    error.toLowerCase().includes("network")) && (
                    <div className="mt-4 pt-4 border-t border-red-200/50">
                      <p className="text-xs text-red-700 leading-normal mb-3">
                        <strong>Environment Domain Blocked:</strong> Firebase Auth is restricting HTTP referrers in Google Cloud Console. 
                        To run/test the planner instantly without GCP configurations, click below to use <strong>Local Offline Storage mode</strong>.
                      </p>
                      <button
                        type="button"
                        onClick={handleDemoBypass}
                        className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-xs font-black rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none transition-colors cursor-pointer uppercase shadow-3xs"
                      >
                        Enter Demo Mode (Local Storage)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-gray-700"
              >
                Email Address
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all animate-none"
                  placeholder="name@dm-access.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-gray-700"
              >
                Password
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <button
                type="submit"
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors cursor-pointer"
              >
                <LogIn className="mr-2 h-5 w-5" />
                Sign In
              </button>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink mx-4 text-xs text-gray-400 font-bold uppercase tracking-wider">or</span>
                <div className="flex-grow border-t border-gray-200"></div>
              </div>

              <button
                type="button"
                onClick={handleDemoBypass}
                className="w-full flex items-center justify-center py-3 px-4 border border-gray-300 rounded-lg text-sm font-bold text-gray-700 bg-white hover:bg-gray-50 hover:text-gray-900 transition-all cursor-pointer shadow-3xs hover:border-gray-400"
              >
                <Sparkles className="mr-2 h-5 w-5 text-amber-500 fill-amber-300" />
                Demo Offline Bypass Mode
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
