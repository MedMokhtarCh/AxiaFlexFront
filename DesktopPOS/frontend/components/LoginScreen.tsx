import React, { useState, useEffect, useRef } from "react";
import { usePOS } from "../store/POSContext";
import {
  Lock,
  UserCircle2,
  Shield,
  X,
} from "lucide-react";
import { AxiaFlexMark } from "./AxiaFlexBrand";

interface LoginScreenProps {
  onClientView?: () => void;
  /** Accès espace Super Admin SaaS (après code valide). */
  onSuperAdmin?: (token: string) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({
  onClientView,
  onSuperAdmin,
}) => {
  const { loginByPin, allUsers } = usePOS();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [identifiedUser, setIdentifiedUser] = useState<string | null>(null);
  const attemptRef = useRef(0);
  const [saasModalOpen, setSaasModalOpen] = useState(false);
  const [saasCode, setSaasCode] = useState("");
  const [saasErr, setSaasErr] = useState("");
  const [saasLoading, setSaasLoading] = useState(false);

  useEffect(() => {
    const matched = allUsers.find((u) => u.pin === pin);
    setIdentifiedUser(matched ? matched.name : null);
  }, [pin, allUsers]);

  /** Accès Super Admin : raccourci clavier uniquement (pas de bouton visible). */
  useEffect(() => {
    if (!onSuperAdmin) return;
    const openSaasModal = () => {
      setSaasModalOpen(true);
      setSaasErr("");
      setSaasCode("");
    };
    const onKey = (e: KeyboardEvent) => {
      if (saasModalOpen) return;
      const l = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (
        e.ctrlKey &&
        e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        l === "l"
      ) {
        e.preventDefault();
        openSaasModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSuperAdmin, saasModalOpen]);

  useEffect(() => {
    if (pin.length !== 4) return;
    const id = ++attemptRef.current;
    let cancelled = false;
    setError(false);
    (async () => {
      const ok = await loginByPin(pin);
      if (cancelled) return;
      if (id !== attemptRef.current) return;
      if (!ok) {
        setError(true);
        window.setTimeout(() => {
          setPin("");
          setError(false);
        }, 800);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pin, loginByPin]);

  const handleNumpadClick = (val: string) => {
    if (pin.length < 4) setPin((prev) => prev + val);
  };

  const handleClear = () => setPin("");

  const API_BASE =
    String(
      (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env
        ?.VITE_API_URL ?? "",
    ).replace(/\/$/, "") || "";

  const submitSuperAdmin = async () => {
    setSaasErr("");
    const code = saasCode.trim();
    if (code.length < 4) {
      setSaasErr("Minimum 4 caractères.");
      return;
    }
    setSaasLoading(true);
    try {
      const r = await fetch(`${API_BASE}/saas/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.token) {
        setSaasErr(String(j?.error || "Code invalide."));
        return;
      }
      onSuperAdmin?.(String(j.token));
      setSaasModalOpen(false);
      setSaasCode("");
    } catch {
      setSaasErr("Impossible de joindre le serveur.");
    } finally {
      setSaasLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid h-[100dvh] w-full place-items-center overflow-hidden bg-[#0f172a]">
      <div className="pointer-events-none absolute inset-0 opacity-10">
        <div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-indigo-500 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-violet-600 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-5xl px-4 sm:px-6">
        <div className="flex items-center justify-center gap-6 lg:gap-10">
          <div className="hidden md:flex w-52 shrink-0 flex-col items-center">
            <AxiaFlexMark className="h-36 w-36 lg:h-40 lg:w-40" />
            <p className="mt-4 text-center text-2xl font-black tracking-tight">
              <span className="text-white">Axia</span>
              <span className="bg-gradient-to-r from-cyan-300 via-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">
                Flex
              </span>
            </p>
            <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
              Point de vente
            </p>
          </div>
          <div
            className={`w-full max-w-md ${
              error ? "rounded-3xl ring-2 ring-rose-500/30" : ""
            }`}
          >
          <div
            className={`w-full rounded-[1.75rem] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-2xl sm:p-6 ${
              error ? "translate-x-0.5" : ""
            } transition-transform`}
          >
            <div className="w-full">
              <div className="mb-4 flex flex-col items-center md:hidden">
                <AxiaFlexMark className="h-20 w-20" />
                <p className="mt-2 text-center text-lg font-black tracking-tight">
                  <span className="text-white">Axia</span>
                  <span className="bg-gradient-to-r from-cyan-300 via-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">
                    Flex
                  </span>
                </p>
              </div>
                <div className="mb-4 text-center sm:mb-5">
                  {identifiedUser ? (
                    <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
                      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-lg sm:h-14 sm:w-14">
                        <UserCircle2 size={28} />
                      </div>
                      <p className="text-base font-black tracking-tight text-emerald-400 sm:text-lg">
                        {identifiedUser}
                      </p>
                      <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                        Saisie en cours…
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/25">
                        <Lock size={26} />
                      </div>
                      <p className="text-base font-black tracking-tight text-slate-200 sm:text-lg">
                        Authentification
                      </p>
                      <p className="mt-1 text-[10px] font-bold uppercase text-slate-500">
                        Code PIN à 4 chiffres
                      </p>
                    </div>
                  )}
                </div>

                <div className="mb-4 flex justify-center gap-2.5 sm:mb-5 sm:gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-3 w-3 rounded-full transition-all duration-300 sm:h-3.5 sm:w-3.5 ${
                        pin.length > i
                          ? error
                            ? "scale-125 bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.45)]"
                            : "scale-125 bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.45)]"
                          : "bg-white/10"
                      }`}
                    />
                  ))}
                </div>
                <div className="grid w-full grid-cols-3 gap-2 sm:gap-2.5">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "X"].map(
                    (val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => {
                          if (val === "C") handleClear();
                          else if (val === "X") setPin((prev) => prev.slice(0, -1));
                          else handleNumpadClick(val);
                        }}
                        className={`flex h-12 items-center justify-center rounded-2xl text-lg font-black transition-all active:scale-95 sm:h-[3.25rem] sm:text-xl ${
                          val === "C"
                            ? "border border-rose-500/20 bg-rose-500/10 text-rose-400"
                            : val === "X"
                              ? "border border-slate-500/20 bg-slate-500/10 text-xs text-slate-400 sm:text-sm"
                              : "border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10"
                        }`}
                      >
                        {val === "X" ? "SUPPR" : val}
                      </button>
                    ),
                  )}
                </div>

                {onClientView && (
                  <button
                    type="button"
                    onClick={onClientView}
                    className="mt-4 w-full min-h-11 rounded-2xl bg-indigo-600 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-xl transition hover:bg-indigo-500 sm:mt-5 sm:py-3"
                  >
                    Suivi commande client
                  </button>
                )}
            </div>
          </div>
        </div>
        </div>
      </div>
      {saasModalOpen && onSuperAdmin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white">
                  <Shield size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Super Admin</h2>
                  <p className="text-[10px] font-bold uppercase text-slate-500">
                    Code d’accès SaaS
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSaasModalOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-white/10"
                aria-label="Fermer"
              >
                <X size={20} />
              </button>
            </div>
            <input
              type="password"
              autoComplete="off"
              value={saasCode}
              onChange={(e) => setSaasCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSuperAdmin()}
              placeholder="Code confidentiel"
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white font-bold outline-none focus:ring-2 focus:ring-violet-500"
            />
            {saasErr && (
              <p className="mt-2 text-sm font-bold text-rose-400">{saasErr}</p>
            )}
            <button
              type="button"
              disabled={saasLoading}
              onClick={submitSuperAdmin}
              className="mt-4 w-full rounded-2xl bg-violet-600 py-3 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-50"
            >
              {saasLoading ? "Vérification…" : "Accéder au tableau de bord"}
            </button>
          </div>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">
        AxiaFlex · session sécurisée
      </p>
    </div>
  );
};

export default LoginScreen;
