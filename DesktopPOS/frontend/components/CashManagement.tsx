import React, { useState, useMemo, useEffect } from "react";
import { usePOS } from "../store/POSContext";
import { getDailyInsights } from "../services/geminiService";
import { Role, ShiftSummary, FundSession } from "../types";
import {
  Wallet,
  Unlock,
  Lock,
  Sparkles,
  Receipt,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  History,
  Plus,
  X,
  Banknote,
  Landmark,
  Users,
  CircleDot,
  HelpCircle,
  Lightbulb,
} from "lucide-react";

const formatAmount = (value: unknown, digits = 3) =>
  Number(value ?? 0).toFixed(digits);
function mapShiftCloseError(message: string): string {
  if (message.includes("Fund session still open"))
    return "La session de caisse est encore ouverte pour ce shift. Allez dans « Shift & Caisse », clôturez la station (bouton « Clôturer Station »), puis réessayez la clôture serveur.";
  if (message.includes("Active orders still open"))
    return "Des commandes sont encore en cours pour ce serveur. Terminez-les ou annulez-les avant de clôturer le shift.";
  return message;
}

const formatTimeSafe = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
  }
  if (typeof value === "string") {
    const asNumber = Number(value);
    const date = !Number.isNaN(asNumber)
      ? new Date(asNumber)
      : new Date(Date.parse(value));
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
  }
  return "—";
};

const CashManagement: React.FC = () => {
  const {
    session,
    activeShift,
    activeFundSession,
    openShift,
    closeShift,
    listShifts,
    getShiftSummaries,
    listFundSessions,
    openFundSession,
    closeFundSession,
    getFundMovements,
    addCashMovement,
    funds,
    getFunds,
    allUsers,
    currentUser,
    orders,
    settings,
  } = usePOS();

  // State pour l'ouverture
  const [fundAmount, setFundAmount] = useState("200.000");
  const [shiftOpeningFund, setShiftOpeningFund] = useState("125.000");

  // Shift / Fund setup
  const [shiftNotes, setShiftNotes] = useState("");
  const [shiftError, setShiftError] = useState("");
  const [fundError, setFundError] = useState("");
  const [selectedCashierId, setSelectedCashierId] = useState("");
  const [selectedFundId, setSelectedFundId] = useState("");
  const [fundMovements, setFundMovements] = useState<any[]>([]);
  const [openShifts, setOpenShifts] = useState<any[]>([]);
  const [shiftSummaries, setShiftSummaries] = useState<ShiftSummary[]>([]);
  const [fundSessionHistory, setFundSessionHistory] = useState<FundSession[]>(
    [],
  );
  const [fundHistoryDate, setFundHistoryDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [fundHistoryLoading, setFundHistoryLoading] = useState(false);
  const [closingFunds, setClosingFunds] = useState<Record<string, string>>({});
  const [openingShift, setOpeningShift] = useState(false);
  const [closingShift, setClosingShift] = useState(false);
  const [closingServerShiftId, setClosingServerShiftId] = useState<
    string | null
  >(null);

  // State pour les mouvements IN/OUT
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movementType, setMovementType] = useState<"IN" | "OUT">("OUT");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");

  // State pour la clôture détaillée
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [closingCount, setClosingCount] = useState({
    "50dt": 0,
    "20dt": 0,
    "10dt": 0,
    "5dt": 0,
    "1dt": 0,
    "0.5dt": 0,
    "0.2dt": 0,
    "0.1dt": 0,
  });

  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [cashView, setCashView] = useState<
    "operations" | "servers" | "history" | "insights"
  >("operations");
  const [showFormHelp, setShowFormHelp] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const tourGlowClass = (stepIndex: number) =>
    showFormHelp && tourStep === stepIndex
      ? "rounded-2xl border border-amber-300 bg-amber-50/60 shadow-[0_0_0_4px_rgba(251,191,36,0.22)]"
      : "";
  const goToTourStep = (nextStep: number) => {
    const next = Math.max(0, Math.min(2, nextStep));
    setTourStep(next);
    if (next === 0) setCashView("operations");
    if (next === 1) setCashView("servers");
    if (next === 2) setCashView("history");
  };

  const defaultFundRoles = [Role.ADMIN, Role.MANAGER, Role.CASHIER];
  const defaultShiftRoles = [
    Role.ADMIN,
    Role.MANAGER,
    Role.CASHIER,
    Role.SERVER,
  ];
  const canManageShift = Boolean(
    currentUser && defaultShiftRoles.includes(currentUser.role),
  );
  /** Manager / caissier : peut ouvrir des shifts pour plusieurs serveurs en parallèle (le formulaire reste visible). */
  const canOpenShiftForOtherServers = Boolean(
    currentUser &&
      [Role.ADMIN, Role.MANAGER, Role.CASHIER].includes(currentUser.role),
  );
  const canManageFund = Boolean(
    currentUser &&
    (currentUser.canManageFund === true ||
      ((currentUser.canManageFund === undefined ||
        currentUser.canManageFund === null) &&
        defaultFundRoles.includes(currentUser.role))),
  );

  useEffect(() => {
    getFunds().catch(() => undefined);
  }, [getFunds]);

  useEffect(() => {
    if (!activeFundSession?.id) {
      setFundMovements([]);
      return;
    }
    getFundMovements(activeFundSession.id)
      .then((list) => setFundMovements(list || []))
      .catch(() => setFundMovements([]));
  }, [activeFundSession?.id, getFundMovements]);

  const refreshOpenShifts = async () => {
    try {
      const list = await listShifts();
      let open = (list || []).filter(
        (s: any) => String(s?.status ?? "").toUpperCase() === "OPEN",
      );
      const tid = String(settings?.terminalId ?? "").trim();
      if (tid) {
        open = open.filter((s: any) => {
          const stid =
            s?.terminalId != null ? String(s.terminalId).trim() : "";
          return !stid || stid === tid;
        });
      }
      setOpenShifts(open);
    } catch {
      setOpenShifts([]);
    }
  };

  useEffect(() => {
    refreshOpenShifts();
  }, [listShifts, settings?.terminalId]);

  useEffect(() => {
    if (cashView !== "servers") return;
    getShiftSummaries()
      .then((rows) => setShiftSummaries(rows || []))
      .catch(() => setShiftSummaries([]));
  }, [cashView, getShiftSummaries]);

  useEffect(() => {
    if (cashView !== "history") return;
    if (!fundHistoryDate) return;
    const start = new Date(fundHistoryDate);
    start.setHours(0, 0, 0, 0);
    const from = start.getTime();
    const to = from + 24 * 60 * 60 * 1000;
    setFundHistoryLoading(true);
    listFundSessions({ from, to, status: "CLOSED" })
      .then((rows) => setFundSessionHistory(rows || []))
      .catch(() => setFundSessionHistory([]))
      .finally(() => setFundHistoryLoading(false));
  }, [cashView, fundHistoryDate, listFundSessions]);

  // Calculs financiers
  const totalMovementsIn = useMemo(
    () =>
      (fundMovements || [])
        .filter((m) => m.type === "IN")
        .reduce((sum, m) => sum + Number(m.amount || 0), 0),
    [fundMovements],
  );

  const totalMovementsOut = useMemo(
    () =>
      (fundMovements || [])
        .filter((m) => m.type === "OUT")
        .reduce((sum, m) => sum + Number(m.amount || 0), 0),
    [fundMovements],
  );

  /** Montant attendu dans le tiroir uniquement (ouverture + ventes espèces + mouvements caisse). La carte n’entre pas dans ce calcul. */
  const expectedCashTotal = useMemo(() => {
    if (!activeFundSession) return 0;
    return (
      Number(activeFundSession.openingBalance || 0) +
      Number(activeFundSession.cashSales || 0) +
      totalMovementsIn -
      totalMovementsOut
    );
  }, [activeFundSession, totalMovementsIn, totalMovementsOut]);

  /** Montant carte enregistré en POS (à déclarer / rapprocher avec le relevé TPE, pas compté en espèces). */
  const expectedCardTheoretical = useMemo(() => {
    if (!activeFundSession) return 0;
    return Number(activeFundSession.cardSales || 0);
  }, [activeFundSession]);

  const actualCashTotal = useMemo(() => {
    return (
      closingCount["50dt"] * 50 +
      closingCount["20dt"] * 20 +
      closingCount["10dt"] * 10 +
      closingCount["5dt"] * 5 +
      closingCount["1dt"] * 1 +
      closingCount["0.5dt"] * 0.5 +
      closingCount["0.2dt"] * 0.2 +
      closingCount["0.1dt"] * 0.1
    );
  }, [closingCount]);

  const difference = actualCashTotal - expectedCashTotal;
  /** Restaurant multi-crénaux : fermer tous les shifts serveur avant la station (paramètre ou type société). */
  const shiftHandoverMode = settings.cashClosingMode === "SHIFT_HANDOVER";
  const openServerShiftCount = openShifts.length;
  /** Bloque la station tant qu’il reste plus d’une équipe ; la dernière peut fermer la caisse puis son shift. */
  const blockStationCloseForOpenShifts =
    shiftHandoverMode && openServerShiftCount > 1;

  const shiftSummaryById = useMemo(() => {
    const map = new Map<string, ShiftSummary>();
    (shiftSummaries || []).forEach((s) => {
      if (s.shift && s.shift.id) {
        map.set(s.shift.id, s);
      }
    });
    return map;
  }, [shiftSummaries]);

  const todayServerTotals = useMemo(() => {
    if (!shiftSummaries || shiftSummaries.length === 0) {
      return null;
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const endMs = startMs + 24 * 60 * 60 * 1000;

    let totalOpening = 0;
    let totalCashSales = 0;
    let totalCardSales = 0;
    let totalExpected = 0;
    let totalReturned = 0;
    let count = 0;

    for (const summary of shiftSummaries) {
      const s = summary.shift;
      if (!s) continue;
      const openedAt = Number(s.openedAt || 0);
      if (!Number.isFinite(openedAt)) continue;
      if (openedAt < startMs || openedAt >= endMs) continue;

      const openingFund = Number(s.openingFund || 0);
      const cashSales = Number(summary.totals.cashSales || 0);
      const cardSales = Number(summary.totals.cardSales || 0);
      const expected = openingFund + cashSales;
      const closingFund = Number(s.closingFund || 0);

      totalOpening += openingFund;
      totalCashSales += cashSales;
      totalCardSales += cardSales;
      totalExpected += expected;
      totalReturned += closingFund;
      count += 1;
    }

    if (count === 0) return null;
    const diff = totalReturned - totalExpected;
    return {
      count,
      totalOpening,
      totalCashSales,
      totalCardSales,
      totalExpected,
      totalReturned,
      diff,
    };
  }, [shiftSummaries]);

  const dailyFundRows = useMemo(() => {
    if (!fundSessionHistory || fundSessionHistory.length === 0) return [];
    const byFund = new Map<
      string,
      {
        fundId: string;
        openingTotal: number;
        closingTotal: number;
        cashSalesTotal: number;
        cardSalesTotal: number;
        totalSalesTotal: number;
        sessionCount: number;
        shiftIds: string[];
      }
    >();

    const start = new Date(fundHistoryDate);
    start.setHours(0, 0, 0, 0);
    const from = start.getTime();
    const to = from + 24 * 60 * 60 * 1000;

    const fiscalByShift = new Map<string, { signed: number; rejected: number }>();
    for (const o of orders || []) {
      const shiftId = String((o as any)?.shiftId || "").trim();
      if (!shiftId) continue;
      const createdAt = Number((o as any)?.createdAt || 0);
      if (!Number.isFinite(createdAt) || createdAt < from || createdAt >= to) continue;
      const st = String((o as any)?.fiscalStatus || "").trim().toUpperCase();
      if (st !== "SIGNED" && st !== "REJECTED") continue;
      const current = fiscalByShift.get(shiftId) || { signed: 0, rejected: 0 };
      if (st === "SIGNED") current.signed += 1;
      if (st === "REJECTED") current.rejected += 1;
      fiscalByShift.set(shiftId, current);
    }

    for (const s of fundSessionHistory) {
      const key = s.fundId;
      const existing = byFund.get(key) || {
        fundId: key,
        openingTotal: 0,
        closingTotal: 0,
        cashSalesTotal: 0,
        cardSalesTotal: 0,
        totalSalesTotal: 0,
        sessionCount: 0,
        shiftIds: [],
      };
      existing.openingTotal += Number(s.openingBalance || 0);
      existing.closingTotal += Number(s.closingBalance || 0);
      existing.cashSalesTotal += Number(s.cashSales || 0);
      existing.cardSalesTotal += Number(s.cardSales || 0);
      existing.totalSalesTotal += Number(s.totalSales || 0);
      existing.sessionCount += 1;
      const shiftId = String((s as any).shiftId || "").trim();
      if (shiftId && !existing.shiftIds.includes(shiftId)) {
        existing.shiftIds.push(shiftId);
      }
      byFund.set(key, existing);
    }

    return Array.from(byFund.values()).map((row) => {
      const fund = funds.find((f) => f.id === row.fundId);
      const fiscal = row.shiftIds.reduce(
        (acc, sid) => {
          const c = fiscalByShift.get(sid);
          if (!c) return acc;
          acc.signed += c.signed;
          acc.rejected += c.rejected;
          return acc;
        },
        { signed: 0, rejected: 0 },
      );
      return {
        ...row,
        fundName: fund?.name || row.fundId,
        currency: fund?.currency || settings.currency || "DT",
        fiscalSigned: fiscal.signed,
        fiscalRejected: fiscal.rejected,
      } as {
        fundId: string;
        fundName: string;
        currency: string;
        openingTotal: number;
        closingTotal: number;
        cashSalesTotal: number;
        cardSalesTotal: number;
        totalSalesTotal: number;
        sessionCount: number;
        fiscalSigned: number;
        fiscalRejected: number;
      };
    });
  }, [fundSessionHistory, funds, settings.currency, orders, fundHistoryDate]);
  const shiftForFund = useMemo(() => {
    if (activeShift) return activeShift as any;
    const opened = (openShifts || []).filter((s: any) => s?.status === "OPEN");
    if (opened.length === 0) return null;
    if (selectedCashierId) {
      const match = opened.find(
        (s: any) =>
          String(s?.cashierId || s?.userId || "") === selectedCashierId,
      );
      if (match) return match;
    }
    return opened[0] || null;
  }, [activeShift, openShifts, selectedCashierId]);
  const isFundOpen = Boolean(activeFundSession?.status === "OPEN");

  /** Fil conducteur UX : où en est l’ouverture / la journée caisse. */
  const cashFlowGuide = useMemo(() => {
    const shiftsOk = openServerShiftCount > 0;
    const stationOk = isFundOpen;
    const phase: "shifts" | "station" | "live" = !shiftsOk
      ? "shifts"
      : !stationOk
        ? "station"
        : "live";
    const steps = [
      {
        n: 1,
        title: "Shifts serveurs",
        hint: "Un shift par serveur qui travaille. Lie la caisse « physique » du service au bon collaborateur.",
        Icon: Users,
        status:
          (shiftsOk ? "done" : phase === "shifts" ? "current" : "upcoming") as
            | "done"
            | "current"
            | "upcoming",
      },
      {
        n: 2,
        title: "Ouvrir la station",
        hint: "Montant dans le tiroir + lien avec le shift actif (voir encadré ci-dessous).",
        Icon: Banknote,
        status:
          (stationOk ? "done" : phase === "station" ? "current" : "upcoming") as
            | "done"
            | "current"
            | "upcoming",
      },
      {
        n: 3,
        title: "Encaissements",
        hint: "Ventes, apports et dépenses. La carte reste hors tiroir (relevé TPE).",
        Icon: CircleDot,
        status: (stationOk ? "current" : "upcoming") as
          | "done"
          | "current"
          | "upcoming",
      },
    ];
    return { phase, steps, shiftsOk, stationOk };
  }, [openServerShiftCount, isFundOpen]);

  const shiftForFundLabel = useMemo(() => {
    if (!shiftForFund) return null;
    const name = String(
      shiftForFund.cashierName ||
        shiftForFund.userName ||
        shiftForFund.cashierId ||
        "",
    ).trim();
    return name || null;
  }, [shiftForFund]);

  const aiSession = session
    ? session
    : activeFundSession
      ? {
          id: activeFundSession.id,
          isOpen: isFundOpen,
          openedAt: activeFundSession.openedAt,
          openingBalance: Number(activeFundSession.openingBalance || 0),
          closingBalance: Number(activeFundSession.closingBalance || 0),
          cashSales: Number(activeFundSession.cashSales || 0),
          cardSales: Number(activeFundSession.cardSales || 0),
          totalSales: Number(activeFundSession.totalSales || 0),
          movements: fundMovements,
        }
      : null;

  useEffect(() => {
    if (!selectedCashierId && currentUser?.role === Role.CASHIER) {
      setSelectedCashierId(currentUser.id);
    }
  }, [currentUser, selectedCashierId]);

  useEffect(() => {
    if (selectedFundId || funds.length === 0) return;
    if (settings.terminalId) {
      const match = funds.find(
        (f) => f.terminalId === settings.terminalId && f.isActive,
      );
      if (match) {
        setSelectedFundId(match.id);
        return;
      }
    }
    if (funds.length === 1) setSelectedFundId(funds[0].id);
  }, [funds, selectedFundId, settings.terminalId]);

  const handleOpenShift = async () => {
    if (!canManageShift || !currentUser || openingShift) return;
    setShiftError("");
    const cashier = allUsers.find((u) => u.id === selectedCashierId);
    if (!cashier) {
      setShiftError("Choisissez un serveur.");
      return;
    }
    const hasOpenShift = openShifts.some(
      (shift) =>
        shift?.status === "OPEN" &&
        String(shift?.cashierId || shift?.userId || "") === cashier.id,
    );
    if (hasOpenShift) {
      setShiftError("Ce serveur a déjà un shift ouvert (sur ce poste).");
      return;
    }
    const fund = funds.find((f) => f.id === selectedFundId);
    setOpeningShift(true);
    try {
      await openShift({
        cashierId: cashier.id,
        cashierName: cashier.name,
        fundId: fund?.id,
        fundName: fund?.name,
        openedById: currentUser.id,
        openedByName: currentUser.name,
        role: cashier.role,
        notes: shiftNotes.trim() || undefined,
        openingFund: Number.parseFloat(shiftOpeningFund || "0"),
      });
      setShiftNotes("");
      refreshOpenShifts();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Impossible d'ouvrir le shift.";
      setShiftError(message || "Impossible d'ouvrir le shift.");
    } finally {
      setOpeningShift(false);
    }
  };

  const handleOpenFund = async () => {
    if (!currentUser) return;
    if (!canManageFund) {
      setFundError("Acces refuse.");
      return;
    }
    setFundError("");
    if (!shiftForFund?.id) {
      setFundError("Ouvrez un shift avant la caisse.");
      return;
    }
    const fundId = shiftForFund.fundId || selectedFundId;
    if (!fundId) {
      setFundError("Choisissez une caisse.");
      return;
    }
    try {
      await openFundSession({
        fundId,
        shiftId: shiftForFund.id,
        cashierId: currentUser.id,
        cashierName: currentUser.name,
        openingBalance: parseFloat(fundAmount),
        notes: shiftNotes.trim() || undefined,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Impossible d'ouvrir la caisse.";
      setFundError(message || "Impossible d'ouvrir la caisse.");
    }
  };

  const handleAddMovement = () => {
    const amount = parseFloat(movementAmount);
    if (!amount || !movementReason) return;
    addCashMovement({ type: movementType, amount, reason: movementReason });
    setMovementAmount("");
    setMovementReason("");
    setShowMovementModal(false);
  };

  const handleCloseFund = async () => {
    if (!activeFundSession || !currentUser) {
      setFundError("Aucune caisse ouverte.");
      return;
    }
    if (blockStationCloseForOpenShifts) {
      setFundError(
        `Mode équipes : ${openServerShiftCount} shifts ouverts — terminez les relèves jusqu’à une seule équipe, puis clôturez la station.`,
      );
      return;
    }
    setFundError("");
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (apiKey && aiSession) {
      setLoadingAi(true);
      const insights = await getDailyInsights(aiSession as any, orders);
      setAiInsights(insights);
      setLoadingAi(false);
    } else {
      setAiInsights("AI insights disabled: missing Gemini API key.");
    }

    try {
      await closeFundSession({
        sessionId: activeFundSession.id,
        cashierId: currentUser.id,
        closingBalance: actualCashTotal,
      });
      setShowClosingModal(false);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Clôture impossible.";
      setFundError(raw);
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift || closingShift) return;
    if (activeFundSession) {
      setShiftError("Cloturez d'abord la caisse.");
      return;
    }
    setClosingShift(true);
    try {
      await closeShift({ shiftId: activeShift.id });
      refreshOpenShifts();
    } catch (error) {
      const raw =
        error instanceof Error
          ? error.message
          : "Impossible de cloturer le shift.";
      setShiftError(mapShiftCloseError(raw || "Impossible de cloturer le shift."));
    } finally {
      setClosingShift(false);
    }
  };

  const handleCloseServerShift = async (shiftId: string) => {
    if (closingServerShiftId) return;
    const rawAmount = closingFunds[shiftId] || "0";
    const parsed = Number.parseFloat(rawAmount);
    const closingFund = Number.isFinite(parsed) ? parsed : 0;
    setClosingServerShiftId(shiftId);
    try {
      await closeShift({ shiftId, closingFund });
      setClosingFunds((prev) => ({ ...prev, [shiftId]: "" }));
      refreshOpenShifts();
    } catch (error) {
      const raw =
        error instanceof Error
          ? error.message
          : "Impossible de cloturer le shift.";
      setShiftError(
        mapShiftCloseError(raw || "Impossible de cloturer le shift."),
      );
    } finally {
      setClosingServerShiftId(null);
    }
  };

  return (
    <div className="touch-cash-page max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="rounded-[2rem] border border-slate-100 bg-gradient-to-br from-slate-50 to-white px-8 py-7 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
              <Wallet size={28} strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                Caisse & équipes
              </h1>
              <p className="text-sm text-slate-500 font-bold mt-1 max-w-xl leading-snug">
                Trois idées :{" "}
                <strong className="text-slate-700">shift serveur</strong> (qui
                travaille),{" "}
                <strong className="text-slate-700">station</strong> (argent
                dans le tiroir),{" "}
                <strong className="text-slate-700">clôture</strong> (servir puis
                fermer dans le bon ordre).
              </p>
            </div>
          </div>
          {cashView === "operations" && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-600">
              <span
                className={`h-2 w-2 rounded-full ${cashFlowGuide.phase === "live" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`}
              />
              {cashFlowGuide.phase === "shifts" && "Étape 1 — Ouvrir les shifts"}
              {cashFlowGuide.phase === "station" &&
                "Étape 2 — Ouvrir la station"}
              {cashFlowGuide.phase === "live" && "Station active — encaissements"}
            </div>
          )}
        </div>
      </header>

      <nav
        className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition ${tourGlowClass(
          tourStep,
        )}`}
        aria-label="Sections caisse"
      >
        <button
          type="button"
          onClick={() => setCashView("operations")}
          className={`text-left rounded-2xl border p-4 transition-all ${cashView === "operations" ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200" : "border-slate-100 bg-white hover:border-slate-200"} ${showFormHelp && tourStep === 0 ? "ring-4 ring-amber-200" : ""}`}
        >
          <div className="flex items-center gap-2 text-indigo-600">
            <Wallet size={18} />
            <span className="font-black text-[10px] uppercase tracking-widest">
              Shift &amp; station
            </span>
          </div>
          <p className="text-[11px] font-bold text-slate-500 mt-2 leading-snug">
            Ouvrir shifts, fond caisse, mouvements et clôture de la station.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setCashView("servers")}
          className={`text-left rounded-2xl border p-4 transition-all ${cashView === "servers" ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200" : "border-slate-100 bg-white hover:border-slate-200"} ${showFormHelp && tourStep === 1 ? "ring-4 ring-amber-200" : ""}`}
        >
          <div className="flex items-center gap-2 text-indigo-600">
            <Users size={18} />
            <span className="font-black text-[10px] uppercase tracking-widest">
              Clôture serveurs
            </span>
          </div>
          <p className="text-[11px] font-bold text-slate-500 mt-2 leading-snug">
            Retour de fond et fin de shift pour chaque serveur.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setCashView("history")}
          className={`text-left rounded-2xl border p-4 transition-all ${cashView === "history" ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200" : "border-slate-100 bg-white hover:border-slate-200"} ${showFormHelp && tourStep === 2 ? "ring-4 ring-amber-200" : ""}`}
        >
          <div className="flex items-center gap-2 text-indigo-600">
            <History size={18} />
            <span className="font-black text-[10px] uppercase tracking-widest">
              Historique
            </span>
          </div>
          <p className="text-[11px] font-bold text-slate-500 mt-2 leading-snug">
            Mouvements manuels et caisses clôturées par date.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setCashView("insights")}
          className={`text-left rounded-2xl border p-4 transition-all ${cashView === "insights" ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200" : "border-slate-100 bg-white hover:border-slate-200"}`}
        >
          <div className="flex items-center gap-2 text-indigo-600">
            <Sparkles size={18} />
            <span className="font-black text-[10px] uppercase tracking-widest">
              IA &amp; tickets
            </span>
          </div>
          <p className="text-[11px] font-bold text-slate-500 mt-2 leading-snug">
            Aperçu intelligent sur les derniers tickets (si configuré).
          </p>
        </button>
      </nav>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
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
        <div className="rounded-2xl border border-indigo-200 bg-white shadow-sm p-4 space-y-3 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {[
              "Etape 1: ouvrir les shifts serveurs.",
              "Etape 2: ouvrir puis suivre la station caisse.",
              "Etape 3: cloturer station et equipes dans l'ordre.",
            ].map((step, index) => (
              <button
                key={step}
                type="button"
                onClick={() => goToTourStep(index)}
                className={`text-left rounded-xl border px-3 py-2 transition ${
                  tourStep === index
                    ? "border-amber-300 bg-amber-50"
                    : "border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/60"
                }`}
              >
                <p className="text-[11px] font-black text-slate-700">{step}</p>
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2">
            <Lightbulb size={14} className="text-amber-600 animate-pulse" />
            <p className="text-[11px] font-black text-amber-700">
              Etape actuelle: {tourStep + 1}/3
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goToTourStep(tourStep - 1)}
              disabled={tourStep <= 0}
              className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-xs font-black text-indigo-700 disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              type="button"
              onClick={() => goToTourStep(tourStep + 1)}
              disabled={tourStep >= 2}
              className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-black text-indigo-700 disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {cashView === "operations" && (
        <>
          <section
            className="rounded-[2rem] border border-slate-100 bg-white p-6 md:p-8 shadow-sm"
            aria-label="Progression ouverture caisse"
          >
            <p className="font-black text-slate-800 text-xs uppercase tracking-widest mb-6">
              Par où commencer ?
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4">
              {cashFlowGuide.steps.map((step) => {
                const Icon = step.Icon;
                const isDone = step.status === "done";
                const isCurrent = step.status === "current";
                return (
                  <div key={step.n} className="relative flex gap-4 md:block">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 md:mb-4 ${
                        isDone
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                          : isCurrent
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-4 ring-indigo-100"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 size={22} strokeWidth={2.5} />
                      ) : (
                        <Icon size={22} strokeWidth={2} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-6 md:pb-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {step.n}/3
                        </span>
                        <h2 className="text-sm font-black text-slate-800">
                          {step.title}
                        </h2>
                      </div>
                      <p className="text-xs font-bold text-slate-500 mt-2 leading-relaxed">
                        {step.hint}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/90 p-5 text-sm text-slate-700 shadow-sm">
          <p className="font-black text-indigo-900 text-[10px] uppercase tracking-widest mb-2">
            {shiftHandoverMode
              ? "Flux équipes (restaurant / café — paramétrable)"
              : "Ordre de clôture (commerce rapide / param. indépendant)"}
          </p>
          {shiftHandoverMode ? (
            <ol className="list-decimal list-inside space-y-1.5 font-bold text-xs leading-relaxed">
              <li>
                S’il y a <strong>plusieurs équipes</strong> : <strong>Cloture Serveurs</strong> pour
                chaque relève ; la caisse passe automatiquement sur le shift de l’équipe suivante si
                elle est déjà ouverte.
              </li>
              <li>
                Quand il ne reste <strong>qu’une seule</strong> équipe : revenez ici,{" "}
                <strong>Clôturer Station</strong> (comptage), puis clôturez ce dernier shift dans{" "}
                <strong>Cloture Serveurs</strong> ou ci-dessus.
              </li>
            </ol>
          ) : (
            <ol className="list-decimal list-inside space-y-1.5 font-bold text-xs leading-relaxed">
              <li>
                <strong>Shift &amp; Caisse</strong> : avec <strong>Station Active</strong>, bloc rose{" "}
                <strong>Clôturer Station</strong>.
              </li>
              <li>
                Puis <strong>Clôturer Shift</strong> ou <strong>Cloture Serveurs</strong> selon votre
                organisation.
              </li>
            </ol>
          )}
          <p className="mt-3 text-[10px] text-slate-500 font-bold">
            Réglage : Paramètres → Général → <strong>Clôture caisse (équipes)</strong>.
          </p>
          {!canManageFund && (
            <p className="mt-3 text-[11px] font-bold text-amber-800 border-t border-indigo-100/80 pt-3">
              Votre rôle ne gère pas la station : demandez à un{" "}
              <strong>caissier</strong> ou <strong>manager</strong> pour la clôture station.
            </p>
          )}
          </div>
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Status & Quick Actions */}
        <div
          className={`${cashView === "insights" ? "hidden" : "lg:col-span-3"} space-y-6`}
        >
          {cashView === "operations" && (
            <>
              <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <span className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white">
                      Étape 1 · Service
                    </span>
                    <h3 className="text-xl font-black text-slate-800 mt-3">
                      Shifts serveurs
                    </h3>
                    <p className="text-xs text-slate-500 font-bold mt-1 max-w-lg leading-relaxed">
                      Chaque serveur qui prend des commandes doit avoir{" "}
                      <strong className="text-slate-700">son propre shift</strong>{" "}
                      (ouvrez-en un par personne). La caisse enregistrée en bas
                      sera reliée au shift sélectionné ici ou au shift de votre
                      session.
                    </p>
                  </div>
                  {activeShift && canManageShift && (
                    <button
                      onClick={handleCloseShift}
                      disabled={closingShift}
                      className="px-4 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest"
                    >
                      {closingShift ? "Cloture..." : "Cloturer Shift"}
                    </button>
                  )}
                </div>

                {shiftError && (
                  <p className="mt-4 text-sm font-bold text-rose-600">
                    {shiftError}
                  </p>
                )}

                {activeShift && (
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase">
                        Shift actif (session)
                      </p>
                      <p className="text-sm font-black text-slate-700">
                        {activeShift.cashierName || activeShift.userName}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase">
                        Caisse
                      </p>
                      <p className="text-sm font-black text-slate-700">
                        {activeShift.fundName || "-"}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase">
                        Ouvert
                      </p>
                      <p className="text-sm font-black text-slate-700">
                        {formatTimeSafe(activeShift.openedAt)}
                      </p>
                    </div>
                  </div>
                )}

                {(canOpenShiftForOtherServers || !activeShift) && (
                  <div
                    className={`grid grid-cols-1 md:grid-cols-4 gap-4 ${activeShift ? "mt-8 border-t border-slate-100 pt-8" : "mt-6"}`}
                  >
                    {canOpenShiftForOtherServers && activeShift && (
                      <p className="md:col-span-4 text-[10px] font-bold text-slate-500">
                        Ouvrir un autre shift : choisissez un autre serveur (chaque
                        serveur ne peut avoir qu’un seul shift ouvert à la fois).
                      </p>
                    )}
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase">
                        Serveur
                      </label>
                      <select
                        value={selectedCashierId}
                        onChange={(e) => setSelectedCashierId(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                      >
                        <option value="">Selectionner</option>
                        {allUsers
                          .filter((u) => u.role === Role.SERVER)
                          .map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.role})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase">
                        Caisse (affectation)
                      </label>
                      <p className="text-[9px] font-bold text-slate-400 mt-1 mb-1 leading-snug">
                        Fonds utilisé pour le compte de ce shift (souvent une caisse par poste).
                      </p>
                      <select
                        value={selectedFundId}
                        onChange={(e) => setSelectedFundId(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                      >
                        <option value="">Selectionner</option>
                        {funds.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase">
                        Fond de départ (tiroir serveur)
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        value={shiftOpeningFund}
                        onChange={(e) => setShiftOpeningFund(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                        placeholder="125.000"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase">
                        Notes
                      </label>
                      <input
                        value={shiftNotes}
                        onChange={(e) => setShiftNotes(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                        placeholder="Optionnel"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <button
                        onClick={handleOpenShift}
                        disabled={!canManageShift || openingShift}
                        className={`w-full md:w-auto px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest ${
                          canManageShift && !openingShift
                            ? "bg-slate-900 text-white"
                            : "bg-slate-200 text-slate-400"
                        }`}
                      >
                        {openingShift ? "Ouverture..." : "Ouvrir Shift"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 relative overflow-hidden">
                <div
                  className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full opacity-10 ${isFundOpen ? "bg-emerald-500" : "bg-rose-500"}`}
                ></div>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                  <div className="flex items-start gap-5">
                    <div
                      className={`w-16 h-16 rounded-2xl flex shrink-0 items-center justify-center shadow-lg ${isFundOpen ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}
                    >
                      {isFundOpen ? <Unlock size={32} /> : <Lock size={32} />}
                    </div>
                    <div>
                      <span className="inline-flex items-center rounded-full bg-indigo-600 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white">
                        Étape 2 · Tiroir caisse
                      </span>
                      <h3 className="text-2xl font-black text-slate-800 tracking-tight mt-2">
                        Station de caisse
                      </h3>
                      <p className="text-xs text-slate-500 font-bold mt-2 max-w-lg leading-relaxed">
                        Ici vous déclarez le <strong>fond d’ouverture</strong> réellement
                        dans le tiroir. C’est distinct du fond « serveur » de l’étape 1 : la
                        station enregistre les espèces et la carte côté POS.
                      </p>
                      <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest flex items-center gap-2 mt-2">
                        {isFundOpen ? (
                          <>
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>{" "}
                            Station ouverte — encaissements actifs
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-full bg-rose-400"></span> Fermée —
                            ouvrez après au moins un shift
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {isFundOpen && (
                    <div className="flex gap-3 w-full md:w-auto">
                      <button
                        onClick={() => {
                          setMovementType("IN");
                          setShowMovementModal(true);
                        }}
                        className="flex-1 md:flex-none bg-slate-900 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all shadow-xl"
                      >
                        <ArrowUpRight size={18} /> Apport
                      </button>
                      <button
                        onClick={() => {
                          setMovementType("OUT");
                          setShowMovementModal(true);
                        }}
                        className="flex-1 md:flex-none bg-white border border-slate-200 text-slate-700 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-rose-50 hover:text-rose-600 transition-all shadow-sm"
                      >
                        <ArrowDownLeft size={18} /> Dépense
                      </button>
                    </div>
                  )}
                </div>

                {isFundOpen && fundError && (
                  <p className="mt-4 text-sm font-bold text-rose-600 px-1">
                    {fundError}
                  </p>
                )}

                {!isFundOpen && shiftForFundLabel && (
                  <div className="mt-6 relative z-10 rounded-2xl border border-indigo-200 bg-indigo-50/90 px-5 py-4 text-sm font-bold text-indigo-950">
                    <span className="font-black uppercase tracking-widest text-[10px] text-indigo-600 block mb-1">
                      Lien avec le shift
                    </span>
                    Cette ouverture de station sera rattachée au shift de{" "}
                    <strong>{shiftForFundLabel}</strong>. Pour en lier une autre, choisissez
                    d’abord le serveur dans l’<strong>étape 1</strong> (liste déroulante),
                    puis revenez ici.
                  </div>
                )}

                {!isFundOpen && !shiftForFundLabel && (
                  <div className="mt-6 relative z-10 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-950">
                    <strong className="font-black">Attente :</strong> ouvrez au moins un shift
                    serveur ci-dessus avant de pouvoir déverrouiller la station.
                  </div>
                )}

                {!isFundOpen ? (
                  <div className="mt-12 p-8 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex flex-col md:flex-row items-center gap-8">
                    <div className="flex-1 w-full space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">
                        Montant d’ouverture dans le tiroir (espèces)
                      </label>
                      <div className="relative">
                        <Banknote
                          className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400"
                          size={24}
                        />
                        <input
                          type="number"
                          step="0.001"
                          value={fundAmount}
                          onChange={(e) => setFundAmount(e.target.value)}
                          className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[2rem] focus:ring-4 focus:ring-indigo-500/10 outline-none font-black text-xl text-slate-800"
                        />
                      </div>
                      {fundError && (
                        <p className="mt-3 text-[10px] font-black text-rose-600 uppercase tracking-widest">
                          {fundError}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={handleOpenFund}
                      disabled={!shiftForFund || !canManageFund}
                      className={`w-full md:w-auto font-black px-12 py-5 rounded-[2rem] transition-all shadow-2xl text-xs uppercase tracking-[0.2em] ${
                        !shiftForFund || !canManageFund
                          ? "bg-slate-200 text-slate-400"
                          : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100"
                      }`}
                    >
                      Ouvrir la caisse
                    </button>
                  </div>
                ) : (
                  <div className="mt-10 space-y-4">
                    {blockStationCloseForOpenShifts && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900">
                        <span className="font-black uppercase tracking-widest text-[10px] block mb-1">
                          Plusieurs équipes actives ({openServerShiftCount} shifts)
                        </span>
                        Réduisez à une seule équipe via <strong>Cloture Serveurs</strong>, puis vous
                        pourrez <strong>Clôturer Station</strong>.
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                          Espèces théoriques (tiroir)
                        </p>
                        <h4 className="text-xl font-black text-slate-800 tracking-tighter">
                          {formatAmount(expectedCashTotal)} DT
                        </h4>
                        <p className="text-[9px] font-bold text-slate-400 mt-2 leading-snug">
                          Fond + ventes cash + entrées/sorties caisse
                        </p>
                      </div>
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
                          Carte théorique (déclaration)
                        </p>
                        <h4 className="text-xl font-black text-indigo-600 tracking-tighter">
                          {formatAmount(expectedCardTheoretical)} DT
                        </h4>
                        <p className="text-[9px] font-bold text-slate-400 mt-2 leading-snug">
                          Encaissements carte POS — à rapprocher du relevé
                          terminal
                        </p>
                      </div>
                      <button
                        type="button"
                        id="cash-cloturer-station-btn"
                        title={
                          blockStationCloseForOpenShifts
                            ? "Terminez les relèves jusqu’à une seule équipe"
                            : "Clôturer la station de caisse"
                        }
                        disabled={blockStationCloseForOpenShifts}
                        onClick={() => {
                          if (blockStationCloseForOpenShifts) {
                            setFundError(
                              `${openServerShiftCount} shifts ouverts : cloturez les relèves jusqu’à une équipe, puis la station.`,
                            );
                            return;
                          }
                          setFundError("");
                          setShowClosingModal(true);
                        }}
                        className={`text-white p-6 rounded-3xl shadow-xl flex flex-col items-center justify-center gap-1 group transition-all ring-offset-2 ${
                          blockStationCloseForOpenShifts
                            ? "bg-slate-400 cursor-not-allowed opacity-70 ring-0 shadow-none"
                            : "bg-rose-600 shadow-rose-100 active:scale-95 ring-2 ring-rose-300/60"
                        }`}
                      >
                        <Lock
                          size={20}
                          className={
                            blockStationCloseForOpenShifts
                              ? ""
                              : "group-hover:rotate-12 transition-transform"
                          }
                        />
                        <span className="font-black text-[10px] uppercase tracking-widest">
                          Clôturer Station
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {cashView === "servers" && (
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 mb-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                  Fin de service
                </p>
                <p className="text-sm font-bold text-slate-700 leading-relaxed">
                  Saisissez le <strong>montant rendu</strong> (espèces que le serveur
                  remet) puis clôturez. En mode équipes, faites les relèves ici avant de{" "}
                  <strong>Clôturer Station</strong> si plusieurs shifts sont encore ouverts.
                  Une seule équipe restante : vous pouvez d’abord clôturer la station puis
                  le dernier shift.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-800">
                    Clôture serveurs
                  </h3>
                  <p className="text-xs text-slate-500 font-bold">
                    Un bloc par shift ouvert — chaque serveur est indépendant.
                  </p>
                </div>
                <button
                  onClick={refreshOpenShifts}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800"
                >
                  Rafraichir
                </button>
              </div>

              {openShifts.length === 0 ? (
                <p className="mt-6 text-sm text-slate-400 font-bold">
                  Aucun shift serveur ouvert.
                </p>
              ) : (
                <>
                  <div className="mt-6 space-y-3">
                    {openShifts.map((shift) => (
                      <div
                        key={shift.id}
                        className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100"
                      >
                        <div>
                          <p className="text-sm font-black text-slate-700">
                            {shift.userName}
                          </p>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Ouverture: {formatAmount(shift.openingFund)} DT
                          </p>
                          {(() => {
                            const summary = shiftSummaryById.get(shift.id);
                            const openingFund = Number(shift.openingFund || 0);
                            const cashSales = Number(
                              summary?.totals.cashSales || 0,
                            );
                            const cardSalesSrv = Number(
                              summary?.totals.cardSales || 0,
                            );
                            const expectedClosing = openingFund + cashSales;
                            const closingRaw = closingFunds[shift.id] || "0";
                            const closingParsed = Number.parseFloat(closingRaw);
                            const closingValue = Number.isFinite(closingParsed)
                              ? closingParsed
                              : 0;
                            const diff = closingValue - expectedClosing;
                            return (
                              <>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  Ventes Cash: {formatAmount(cashSales)} DT
                                </p>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  Carte théorique: {formatAmount(cardSalesSrv)}{" "}
                                  DT
                                </p>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  Théorique espèces (tiroir):{" "}
                                  {formatAmount(expectedClosing)} DT
                                </p>
                                {closingRaw && (
                                  <p
                                    className={`text-[10px] font-black uppercase tracking-widest ${
                                      Math.abs(diff) < 0.001
                                        ? "text-emerald-600"
                                        : diff > 0
                                          ? "text-amber-600"
                                          : "text-rose-600"
                                    }`}
                                  >
                                    Écart: {formatAmount(diff)} DT
                                  </p>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-3">
                          <input
                            type="number"
                            step="0.001"
                            value={closingFunds[shift.id] || ""}
                            onChange={(e) =>
                              setClosingFunds((prev) => ({
                                ...prev,
                                [shift.id]: e.target.value,
                              }))
                            }
                            className="w-36 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                            placeholder="Montant rendu"
                          />
                          <button
                            onClick={() => handleCloseServerShift(shift.id)}
                            disabled={closingServerShiftId !== null}
                            className="px-4 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest"
                          >
                            {closingServerShiftId === shift.id
                              ? "Cloture..."
                              : "Cloturer"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {todayServerTotals && (
                    <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900 text-white rounded-[2.5rem] p-6">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 mb-1">
                          Shifts fermés aujourd'hui
                        </p>
                        <p className="text-2xl font-black">
                          {todayServerTotals.count}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 mb-1">
                          Fonds de départ serveurs
                        </p>
                        <p className="text-xl font-black">
                          {formatAmount(todayServerTotals.totalOpening)} DT
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 mb-1">
                          Ventes Cash serveurs
                        </p>
                        <p className="text-xl font-black">
                          {formatAmount(todayServerTotals.totalCashSales)} DT
                        </p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 mt-1">
                          Carte:{" "}
                          {formatAmount(todayServerTotals.totalCardSales)} DT
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 mb-1">
                          Espèces théoriques (fonds + cash)
                        </p>
                        <p className="text-xl font-black">
                          {formatAmount(todayServerTotals.totalExpected)} DT
                        </p>
                        <p className="text-[8px] font-bold text-slate-500 mt-1">
                          Carte séparée (ligne précédente), hors tiroir serveur
                        </p>
                        <p
                          className={`text-[9px] font-black uppercase tracking-widest mt-1 ${
                            Math.abs(todayServerTotals.diff) < 0.001
                              ? "text-emerald-300"
                              : todayServerTotals.diff > 0
                                ? "text-amber-300"
                                : "text-rose-300"
                          }`}
                        >
                          Écart global: {formatAmount(todayServerTotals.diff)}{" "}
                          DT
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Detailed Movement History */}
          {cashView === "history" && (
            <div className="bg-white rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-8 border-b border-slate-50 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                    <History size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800">
                      Flux de Caisse
                    </h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Mouvements manuels de la station active & synthèse par
                      caisse
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Jour de travail
                  </label>
                  <input
                    type="date"
                    value={fundHistoryDate}
                    onChange={(e) => setFundHistoryDate(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                  />
                  <div className="flex gap-2 mt-1">
                    <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full border border-emerald-100">
                      +{formatAmount(totalMovementsIn)} Apports
                    </span>
                    <span className="text-[9px] font-black bg-rose-50 text-rose-600 px-3 py-1 rounded-full border border-rose-100">
                      -{formatAmount(totalMovementsOut)} Sorties
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-8 pt-4 pb-2 border-b border-slate-50">
                {fundHistoryLoading ? (
                  <p className="text-xs text-slate-400 font-bold">
                    Chargement des caisses...
                  </p>
                ) : dailyFundRows.length === 0 ? (
                  <p className="text-xs text-slate-400 font-bold">
                    Aucune caisse cloturée pour cette date.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {dailyFundRows.map((row) => {
                      const expectedClosing =
                        row.openingTotal + row.cashSalesTotal;
                      const diff = row.closingTotal - expectedClosing;
                      return (
                        <div
                          key={row.fundId}
                          className="bg-slate-50 rounded-2xl border border-slate-100 p-4 flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-black text-slate-800">
                              {row.fundName}
                            </p>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              {row.sessionCount} session(s)
                            </span>
                          </div>
                          <p className="text-[10px] font-black text-slate-500">
                            Ouverture: {formatAmount(row.openingTotal)}{" "}
                            {row.currency}
                          </p>
                          <p className="text-[10px] font-black text-slate-500">
                            Ventes Cash: {formatAmount(row.cashSalesTotal)}{" "}
                            {row.currency}
                          </p>
                          <p className="text-[10px] font-black text-slate-500">
                            Carte théorique: {formatAmount(row.cardSalesTotal)}{" "}
                            {row.currency}
                          </p>
                          <p className="text-[10px] font-black text-slate-500">
                            Clôture tiroir déclarée: {formatAmount(row.closingTotal)}{" "}
                            {row.currency}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">
                              NACEF SIGNED: {row.fiscalSigned}
                            </span>
                            <span className="text-[9px] font-black bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-100">
                              NACEF REJECTED: {row.fiscalRejected}
                            </span>
                          </div>
                          <p
                            className={`text-[10px] font-black uppercase tracking-widest ${
                              Math.abs(diff) < 0.001
                                ? "text-emerald-600"
                                : diff > 0
                                  ? "text-amber-600"
                                  : "text-rose-600"
                            }`}
                          >
                            Écart espèces: {formatAmount(diff)} {row.currency}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="p-4 max-h-[400px] overflow-y-auto scrollbar-hide">
                {fundMovements.length === 0 && (
                  <p className="text-center py-20 text-slate-300 font-bold text-sm italic">
                    Aucun mouvement manuel enregistré.
                  </p>
                )}
                <div className="space-y-3">
                  {fundMovements
                    .slice()
                    .reverse()
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-5 bg-slate-50 rounded-[2rem] border border-transparent hover:border-slate-200 transition-all"
                      >
                        <div className="flex items-center gap-5">
                          <div
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center ${m.type === "IN" ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}
                          >
                            {m.type === "IN" ? (
                              <ArrowUpRight size={20} />
                            ) : (
                              <ArrowDownLeft size={20} />
                            )}
                          </div>
                          <div>
                            <p className="font-black text-slate-800 text-sm tracking-tight">
                              {m.reason}
                            </p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                              {formatTimeSafe(m.createdAt)} • Par {m.userName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-black text-lg ${m.type === "IN" ? "text-emerald-600" : "text-rose-600"}`}
                          >
                            {m.type === "IN" ? "+" : "-"}
                            {formatAmount(m.amount)} DT
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* AI Insights & Stats */}
        <div
          className={`${cashView === "insights" ? "lg:col-span-3 space-y-8" : "hidden"}`}
        >
          <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/20 rounded-full -mr-20 -mt-20 blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-indigo-400 shadow-inner">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight">
                    Intelligence
                  </h3>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                    Rapport de clôture IA
                  </p>
                </div>
              </div>

              {loadingAi ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
                  <RefreshCw
                    className="animate-spin text-indigo-500"
                    size={48}
                  />
                  <p className="text-indigo-200 font-bold animate-pulse text-sm">
                    Génération de l'analyse...
                  </p>
                </div>
              ) : aiInsights ? (
                <div className="flex-1 space-y-6">
                  <div className="text-indigo-100/90 text-sm font-medium leading-relaxed italic border-l-2 border-indigo-500/30 pl-6 py-2">
                    {aiInsights}
                  </div>
                  <button
                    onClick={() => setAiInsights(null)}
                    className="text-[10px] font-black text-indigo-400 uppercase tracking-widest hover:text-white transition-colors"
                  >
                    Relancer l'analyse
                  </button>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center gap-6">
                  <p className="text-indigo-200/60 text-sm font-medium leading-relaxed">
                    Prêt pour l'analyse de fin de journée. L'IA étudiera vos
                    ventes, flux et rentabilité.
                  </p>
                  <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/5">
                    <div>
                      <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-1">
                        Total Net
                      </p>
                      <p className="text-xl font-black">
                        {formatAmount(aiSession?.totalSales || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-1">
                        Tickets
                      </p>
                      <p className="text-xl font-black">{orders.length}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col gap-8">
            <h3 className="font-black text-slate-800 flex items-center gap-3">
              <Receipt size={20} className="text-indigo-500" /> Derniers Tickets
            </h3>
            <div className="space-y-4">
              {orders
                .slice(-4)
                .reverse()
                .map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-200 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-colors shadow-sm">
                        <Calculator size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-black text-slate-800">
                          #{order.id.slice(-4)}
                        </p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                          {new Date(order.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <p className="font-black text-sm text-slate-900">
                      {formatAmount(order.total)}
                    </p>
                  </div>
                ))}
              {orders.length === 0 && (
                <p className="text-center py-10 text-slate-300 font-bold text-xs italic">
                  Aucune vente enregistrée.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: Cash In/Out */}
      {showMovementModal && (
        <div className="touch-cash-modal fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-6">
          <div className="touch-cash-modal-panel bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div
              className={`p-8 border-b flex justify-between items-center ${movementType === "IN" ? "bg-emerald-50" : "bg-rose-50"}`}
            >
              <div>
                <h3
                  className={`text-xl font-black tracking-tight ${movementType === "IN" ? "text-emerald-700" : "text-rose-700"}`}
                >
                  {movementType === "IN"
                    ? "Entrée de Caisse"
                    : "Sortie de Caisse"}
                </h3>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-1">
                  Enregistrement manuel
                </p>
              </div>
              <button
                onClick={() => setShowMovementModal(false)}
                className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-800"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-10 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">
                  Montant ({settings.currency})
                </label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="0.000"
                  value={movementAmount}
                  onChange={(e) => setMovementAmount(e.target.value)}
                  className="w-full px-6 py-5 bg-slate-50 border border-slate-100 rounded-[2rem] font-black text-2xl outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">
                  Motif / Justificatif
                </label>
                <input
                  type="text"
                  placeholder="ex: Achat Pain, Fond supplémentaire..."
                  value={movementReason}
                  onChange={(e) => setMovementReason(e.target.value)}
                  className="w-full px-6 py-5 bg-slate-50 border border-slate-100 rounded-[2rem] font-bold text-sm outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"
                />
              </div>
              <button
                onClick={handleAddMovement}
                className={`w-full py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 ${movementType === "IN" ? "bg-emerald-600 text-white shadow-emerald-100 hover:bg-emerald-700" : "bg-rose-600 text-white shadow-rose-100 hover:bg-rose-700"}`}
              >
                Confirmer le Mouvement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Detailed Closing (Z-Report style) */}
      {showClosingModal && (
        <div className="touch-cash-modal fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[250] flex items-center justify-center p-4">
          <div className="touch-cash-modal-panel bg-white w-full max-w-4xl rounded-[4rem] shadow-2xl overflow-hidden flex flex-col h-full max-h-[90vh] animate-in slide-in-from-bottom-20 duration-500">
            <div className="p-10 border-b bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
              <div>
                <h2 className="text-3xl font-black text-slate-800 tracking-tighter italic">
                  Clôture Financière
                </h2>
                <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.3em] mt-1">
                  Comptage tiroir — la carte se déclare à part (relevé TPE)
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3 md:gap-4">
                <div className="bg-white px-6 py-4 rounded-[2rem] border border-slate-200 shadow-sm text-center min-w-[140px]">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Théorique espèces
                  </p>
                  <p className="text-xl font-black text-slate-800 tracking-tight">
                    {formatAmount(expectedCashTotal)} DT
                  </p>
                </div>
                <div className="bg-white px-6 py-4 rounded-[2rem] border border-indigo-100 shadow-sm text-center min-w-[140px]">
                  <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest mb-1">
                    Théorique carte
                  </p>
                  <p className="text-xl font-black text-indigo-700 tracking-tight">
                    {formatAmount(expectedCardTheoretical)} DT
                  </p>
                </div>
                <div
                  className={`px-6 py-4 rounded-[2rem] border shadow-sm text-center min-w-[140px] transition-all ${difference === 0 ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200"}`}
                >
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">
                    Écart tiroir
                  </p>
                  <p
                    className={`text-xl font-black tracking-tight ${difference === 0 ? "text-emerald-600" : "text-rose-600"}`}
                  >
                    {formatAmount(difference)} DT
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-10 grid grid-cols-1 md:grid-cols-2 gap-12 scrollbar-hide">
              {/* Numpad/Counter for Monnaie */}
              <div className="space-y-8">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-3 uppercase tracking-widest">
                  <Landmark size={20} className="text-indigo-600" /> Décompte
                  Détail
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {Object.keys(closingCount).map((denom) => (
                    <div
                      key={denom}
                      className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex items-center justify-between"
                    >
                      <span className="font-black text-xs text-slate-400">
                        {denom}
                      </span>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            setClosingCount((prev) => ({
                              ...prev,
                              [denom]: Math.max(0, (prev as any)[denom] - 1),
                            }))
                          }
                          className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-black text-slate-800">
                          {(closingCount as any)[denom]}
                        </span>
                        <button
                          onClick={() =>
                            setClosingCount((prev) => ({
                              ...prev,
                              [denom]: (prev as any)[denom] + 1,
                            }))
                          }
                          className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary & Final Button */}
              <div className="flex flex-col h-full">
                <div className="flex-1 bg-slate-900 rounded-[3rem] p-10 text-white space-y-8 shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
                  <h3 className="text-xl font-black italic tracking-tight relative z-10 flex items-center gap-3">
                    <CheckCircle2 size={24} className="text-emerald-400" />{" "}
                    Résumé de Station
                  </h3>

                  <div className="space-y-6 relative z-10">
                    <div className="flex justify-between items-center py-4 border-b border-white/10">
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                        Total compté (tiroir)
                      </span>
                      <span className="text-3xl font-black">
                        {formatAmount(actualCashTotal)} DT
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/10 text-sm">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Attendu en tiroir
                      </span>
                      <span className="font-black text-emerald-300">
                        {formatAmount(expectedCashTotal)} DT
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-8 pt-4">
                      <div className="space-y-1">
                        <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">
                          Fond Ouverture
                        </p>
                        <p className="text-lg font-black">
                          {formatAmount(activeFundSession?.openingBalance || 0)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">
                          Ventes Espèces
                        </p>
                        <p className="text-lg font-black">
                          {formatAmount(activeFundSession?.cashSales || 0)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">
                          Entrées/Sorties
                        </p>
                        <p
                          className={`text-lg font-black ${totalMovementsIn - totalMovementsOut >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                        >
                          {formatAmount(totalMovementsIn - totalMovementsOut)}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">
                          Carte théorique
                        </p>
                        <p className="text-lg font-black">
                          {formatAmount(expectedCardTheoretical)}
                        </p>
                        <p className="text-[8px] font-bold text-slate-500 leading-snug">
                          Non incluse dans le décompte espèces
                        </p>
                      </div>
                    </div>
                  </div>

                  {difference !== 0 && (
                    <div className="bg-rose-500/10 border border-rose-500/20 p-6 rounded-[2rem] flex items-center gap-4 relative z-10 mt-auto animate-pulse">
                      <AlertTriangle
                        className="text-rose-500 shrink-0"
                        size={32}
                      />
                      <div>
                        <p className="text-xs font-black text-rose-500 uppercase tracking-widest">
                          Alerte Écart de Caisse
                        </p>
                        <p className="text-[10px] font-medium text-rose-200 leading-snug">
                          Écart sur les espèces uniquement ({formatAmount(difference)}{" "}
                          DT). Les écarts carte se vérifient sur le relevé TPE.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-8 flex gap-4">
                  <button
                    onClick={() => setShowClosingModal(false)}
                    className="flex-1 py-5 bg-slate-50 border border-slate-200 rounded-[2rem] font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-100 transition-all"
                  >
                    Retour
                  </button>
                  <button
                    onClick={handleCloseFund}
                    className="flex-[2] py-5 bg-indigo-600 text-white font-black rounded-[2rem] text-xs uppercase tracking-[0.2em] shadow-2xl shadow-indigo-200 hover:bg-indigo-700 transition-all"
                  >
                    Valider la Clôture Z
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashManagement;
