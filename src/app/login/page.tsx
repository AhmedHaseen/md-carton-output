"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Package,
  LogIn,
  AlertCircle,
  HardHat,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";

type LoginOption = "operator" | "admin";

export default function LoginPage() {
  const [loginOption, setLoginOption] = useState<LoginOption>("operator");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [errorType, setErrorType] = useState<"invalid" | "operator_in_admin" | "admin_in_operator" | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleOptionChange = (option: LoginOption) => {
    setLoginOption(option);
    setError("");
    setErrorType(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setErrorType(null);
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        username: username.trim(),
        password,
        portal: loginOption,
        redirect: false,
      });

      if (result?.error) {
        if (result.code === "operator_in_admin_portal") {
          setErrorType("operator_in_admin");
          setError(`Access Denied: The account "${username.trim()}" is an Operator account and cannot log in through the Admin / Manager portal.`);
        } else if (result.code === "admin_in_operator_portal") {
          setErrorType("admin_in_operator");
          setError(`Notice: The account "${username.trim()}" has Admin / Manager privileges. Please use the Admin / Manager portal.`);
        } else {
          setErrorType("invalid");
          setError("Invalid username or password for this account.");
        }
      } else {
        if (typeof window !== "undefined") {
          localStorage.removeItem("md_carton_selected_date");
        }
        router.push("/");
        router.refresh();
      }
    } catch {
      setErrorType("invalid");
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-4 -m-3 sm:-m-6 lg:-m-8">
      <div className="w-full max-w-md my-6">
        {/* ─── System Branding ───────────────────────────────────────── */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-2xl shadow-blue-500/30">
            <Package size={32} className="text-white" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            MD Carton Output System
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Finished Good Warehouse (FGWH Operations)
          </p>
        </div>

        {/* ─── Login Card ────────────────────────────────────────────── */}
        <div className="bg-slate-900/85 backdrop-blur-2xl rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl">
          {/* Option Selector (2 Options) */}
          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 text-center">
              Select Login Option
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950/80 rounded-2xl border border-white/10">
              {/* Option 1: Operator / Staff */}
              <button
                type="button"
                onClick={() => handleOptionChange("operator")}
                className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl transition-all duration-200 text-center min-h-[64px] active:scale-98 cursor-pointer ${
                  loginOption === "operator"
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-600/40 font-bold border border-blue-400/40"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
                id="login-opt-operator"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <HardHat size={16} className={loginOption === "operator" ? "text-cyan-200" : "text-slate-400"} />
                  <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">
                    Option 1
                  </span>
                </div>
                <span className="text-xs sm:text-sm font-bold leading-tight">
                  Operator / Staff
                </span>
              </button>

              {/* Option 2: Admin / Manager */}
              <button
                type="button"
                onClick={() => handleOptionChange("admin")}
                className={`flex flex-col items-center justify-center py-3 px-2 rounded-xl transition-all duration-200 text-center min-h-[64px] active:scale-98 cursor-pointer ${
                  loginOption === "admin"
                    ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-600/40 font-bold border border-indigo-400/40"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
                id="login-opt-admin"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <ShieldCheck size={16} className={loginOption === "admin" ? "text-amber-200" : "text-slate-400"} />
                  <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">
                    Option 2
                  </span>
                </div>
                <span className="text-xs sm:text-sm font-bold leading-tight">
                  Admin / Manager
                </span>
              </button>
            </div>
          </div>

          {/* Context Banner based on Selected Option */}
          <div
            className={`rounded-2xl p-3.5 mb-5 border transition-all duration-200 ${
              loginOption === "operator"
                ? "bg-blue-500/10 border-blue-500/30 text-blue-200"
                : "bg-indigo-500/10 border-indigo-500/30 text-indigo-200"
            }`}
          >
            <div className="flex items-center gap-2 mb-1 font-bold text-sm text-white">
              {loginOption === "operator" ? (
                <>
                  <HardHat size={17} className="text-cyan-400 shrink-0" />
                  <span>Option 1: Operator &amp; Staff Login</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={17} className="text-amber-400 shrink-0" />
                  <span>Option 2: Admin &amp; Manager Login</span>
                </>
              )}
            </div>
            <p className="text-xs opacity-90 leading-relaxed">
              {loginOption === "operator"
                ? "For factory line operators entering hourly Metal Detector carton counts."
                : "For supervisors and management overseeing targets, analysis, reports & users."}
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={
                  loginOption === "operator"
                    ? "Enter operator username"
                    : "Enter admin username"
                }
                className="w-full h-12 px-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base transition-all"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full h-12 pl-4 pr-11 bg-white/10 border border-white/20 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3.5 bg-red-500/20 border border-red-500/35 rounded-2xl text-red-200 text-xs sm:text-sm animate-shake">
                <div className="flex items-start gap-2.5">
                  <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold leading-relaxed">{error}</p>

                    {errorType === "operator_in_admin" && (
                      <div className="mt-2.5 pt-2 border-t border-red-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-[11px] text-red-300">Switch to line operator portal:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setLoginOption("operator");
                            setError("");
                            setErrorType(null);
                          }}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-md shadow-blue-600/30 active:scale-98"
                        >
                          <HardHat size={14} />
                          <span>Switch to Option 1 (Operator / Staff)</span>
                        </button>
                      </div>
                    )}

                    {errorType === "admin_in_operator" && (
                      <div className="mt-2.5 pt-2 border-t border-red-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-[11px] text-red-300">Switch to management portal:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setLoginOption("admin");
                            setError("");
                            setErrorType(null);
                          }}
                          className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-md shadow-indigo-600/30 active:scale-98"
                        >
                          <ShieldCheck size={14} />
                          <span>Switch to Option 2 (Admin / Manager)</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full h-12 flex items-center justify-center gap-2 px-6 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-98 disabled:opacity-50 mt-2 text-white cursor-pointer ${
                loginOption === "operator"
                  ? "bg-blue-600 hover:bg-blue-700 shadow-blue-600/30"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-indigo-600/30"
              }`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  <span>
                    {loginOption === "operator"
                      ? "Sign In as Operator / Staff"
                      : "Sign In as Admin / Manager"}
                  </span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
