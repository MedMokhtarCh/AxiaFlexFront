import React, { useEffect, useMemo, useState } from "react";
import { usePOS } from "../store/POSContext";
import { notifyError, notifySuccess } from "../utils/notify";
import { HelpCircle, Lightbulb, Sparkles } from "lucide-react";

const formatAmount = (value: unknown) => Number(value ?? 0).toFixed(3);

const PreorderManagement: React.FC = () => {
  const { listPreorderMenu, listPreorders, createPreorder, updatePreorderStatus } = usePOS();
  const [menu, setMenu] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [mode, setMode] = useState<"DELIVERY" | "PICKUP" | "DINE_LATER">("PICKUP");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [cart, setCart] = useState<Array<{ productId: string; quantity: number }>>([]);
  const [showFormHelp, setShowFormHelp] = useState(false);
  const [tourStep, setTourStep] = useState(0);

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([listPreorderMenu(), listPreorders()]);
      setMenu(m || []);
      setRows(p || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  const menuById = useMemo(
    () => new Map((menu || []).map((p: any) => [String(p.id), p])),
    [menu],
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce((sum, line) => {
        const p = menuById.get(String(line.productId || ""));
        return sum + Number(p?.price || 0) * Number(line.quantity || 0);
      }, 0),
    [cart, menuById],
  );

  const addLine = () => {
    const pid = String(selectedProductId || "").trim();
    const q = Math.max(1, Math.floor(Number(quantity || 0)));
    if (!pid || q <= 0) return;
    setCart((prev) => [...prev, { productId: pid, quantity: q }]);
    setSelectedProductId("");
    setQuantity("1");
  };

  const submit = async () => {
    if (!customerName.trim()) {
      notifyError("Nom client requis.");
      return;
    }
    if (!cart.length) {
      notifyError("Ajoute au moins un article.");
      return;
    }
    try {
      await createPreorder({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || null,
        mode,
        items: cart,
      });
      notifySuccess("Précommande créée.");
      setCustomerName("");
      setCustomerPhone("");
      setMode("PICKUP");
      setCart([]);
      await refreshAll();
    } catch (e: any) {
      notifyError(e?.message || "Création précommande impossible.");
    }
  };

  const setStatus = async (
    preorderId: string,
    status: "PENDING" | "CONFIRMED" | "READY" | "COMPLETED" | "CANCELLED",
  ) => {
    try {
      await updatePreorderStatus(preorderId, status);
      notifySuccess("Statut mis à jour.");
      await refreshAll();
    } catch (e: any) {
      notifyError(e?.message || "Mise à jour statut impossible.");
    }
  };

  const TOUR_STEPS = [
    "Renseigner client et mode de retrait.",
    "Ajouter les articles et quantites.",
    "Verifier total puis valider la precommande.",
  ];

  const isTourStepActive = (stepIndex: number) =>
    Boolean(showFormHelp && tourStep === stepIndex);

  const tourGlowClass = (stepIndex: number) =>
    isTourStepActive(stepIndex)
      ? "rounded-2xl border border-amber-300 bg-amber-50/60 shadow-[0_0_0_4px_rgba(251,191,36,0.22)]"
      : "";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-5">
        <h3 className="text-lg font-black text-slate-800">Nouvelle précommande</h3>
        <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-indigo-700 font-semibold">
            Besoin d'aide pour compléter ce formulaire ?
          </div>
          <button
            type="button"
            onClick={() => setShowFormHelp((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-indigo-200 bg-white text-indigo-700 text-xs font-black hover:bg-indigo-50"
          >
            <HelpCircle size={14} />
            {showFormHelp ? "Masquer l'aide" : "Aide guidée"}
          </button>
        </div>
        {showFormHelp && (
          <div className="mt-3 rounded-2xl border border-indigo-200 bg-white shadow-sm p-4 space-y-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-600 animate-pulse" />
              <p className="text-sm font-black text-slate-800">Guide de creation - Precommande</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {TOUR_STEPS.map((step, index) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setTourStep(index)}
                  className={`text-left rounded-xl border px-3 py-2 transition ${
                    isTourStepActive(index)
                      ? "border-amber-300 bg-amber-50"
                      : "border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/60"
                  }`}
                >
                  <p className="text-[11px] font-black text-slate-700">
                    Etape {index + 1}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">{step}</p>
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2">
              <Lightbulb size={14} className="text-amber-600 animate-pulse" />
              <p className="text-[11px] font-black text-amber-700">
                Etape actuelle: {tourStep + 1}/{TOUR_STEPS.length}
              </p>
            </div>
          </div>
        )}
        <div className={`grid grid-cols-1 md:grid-cols-4 gap-3 mt-3 p-2 transition ${tourGlowClass(0)}`}>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
            placeholder="Nom client"
          />
          <input
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
            placeholder="Téléphone"
          />
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
          >
            <option value="DELIVERY">Livraison</option>
            <option value="PICKUP">À emporter plus tard</option>
            <option value="DINE_LATER">Sur place plus tard</option>
          </select>
          <button
            type="button"
            onClick={submit}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-black"
          >
            Valider précommande
          </button>
        </div>
        <div className={`grid grid-cols-1 md:grid-cols-4 gap-3 mt-3 p-2 transition ${tourGlowClass(1)}`}>
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm md:col-span-2"
          >
            <option value="">Sélectionner un article…</option>
            {menu.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatAmount(p.price)} DT
              </option>
            ))}
          </select>
          <input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
            type="number"
            min={1}
          />
          <button
            type="button"
            onClick={addLine}
            className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-black"
          >
            Ajouter ligne
          </button>
        </div>
        <div className="mt-3 space-y-1">
          {cart.map((line, idx) => {
            const p = menuById.get(String(line.productId || ""));
            return (
              <p key={`${line.productId}-${idx}`} className="text-sm text-slate-700">
                - {p?.name || line.productId} x{line.quantity}
              </p>
            );
          })}
          {cart.length > 0 && (
            <p
              className={`text-sm font-black text-indigo-700 mt-2 inline-flex items-center gap-2 px-2 py-1 rounded-lg ${
                isTourStepActive(2) ? "bg-amber-100 text-amber-800" : ""
              }`}
            >
              Total: {formatAmount(cartTotal)} DT
              {isTourStepActive(2) && (
                <Lightbulb size={12} className="animate-pulse" />
              )}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-5">
        <h3 className="text-lg font-black text-slate-800 mb-3">Précommandes</h3>
        {loading ? (
          <p className="text-sm text-slate-400">Chargement…</p>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-auto">
            {rows.map((r: any) => (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-sm font-black text-slate-800">
                  {r.code} — {r.customerName}
                </p>
                <p className="text-xs text-slate-500">
                  {r.mode} · {r.status} · {formatAmount(r.total)} DT
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => void setStatus(r.id, "CONFIRMED")} className="px-2 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-black">Confirmer</button>
                  <button type="button" onClick={() => void setStatus(r.id, "READY")} className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-black">Prête</button>
                  <button type="button" onClick={() => void setStatus(r.id, "COMPLETED")} className="px-2 py-1 rounded-lg bg-slate-800 text-white text-[11px] font-black">Terminée</button>
                  <button type="button" onClick={() => void setStatus(r.id, "CANCELLED")} className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-black">Annuler</button>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="text-sm text-slate-400">Aucune précommande.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PreorderManagement;
