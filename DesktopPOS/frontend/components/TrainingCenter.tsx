import React, { useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  CheckCircle2,
  Circle,
  Lightbulb,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Cloud,
  CloudOff,
  LoaderCircle,
  HardDrive,
} from "lucide-react";
import { usePOS } from "../store/POSContext";

type TrainingStep = {
  title: string;
  details: string;
  visual: string;
  visualHint: string;
};

type TrainingModule = {
  id: string;
  title: string;
  goal: string;
  steps: TrainingStep[];
};

const MODULES: TrainingModule[] = [
  {
    id: "onboarding-pos",
    title: "Prise en main POS",
    goal: "Apprendre le flux complet d'une vente.",
    steps: [
      {
        title: "Connexion avec PIN utilisateur",
        details: "Connecte-toi avec un profil ayant les droits caisse.",
        visual: "🔐",
        visualHint: "Animation de connexion",
      },
      {
        title: "Ouverture du shift",
        details: "Lance le shift puis verifie l'utilisateur serveur affecte.",
        visual: "🧑‍🍳",
        visualHint: "Affectation serveur",
      },
      {
        title: "Ouverture de la caisse",
        details: "Selectionne le fond et saisis le montant d'ouverture.",
        visual: "💰",
        visualHint: "Montant initial",
      },
      {
        title: "Creation d'une commande",
        details: "Ajoute des articles puis choisis sur place / emporter / livraison.",
        visual: "🧾",
        visualHint: "Ecran commande",
      },
      {
        title: "Encaissement et impression ticket",
        details: "Choisis le mode de paiement, valide puis imprime le ticket.",
        visual: "🖨️",
        visualHint: "Ticket client",
      },
      {
        title: "Consultation des rapports",
        details: "Controle ventes, paiements et ecarts en fin de service.",
        visual: "📊",
        visualHint: "Synthese de caisse",
      },
    ],
  },
  {
    id: "catalog",
    title: "Gestion du catalogue",
    goal: "Configurer les donnees produits rapidement.",
    steps: [
      {
        title: "Creer une categorie",
        details: "Ajoute une categorie claire pour le menu POS.",
        visual: "📂",
        visualHint: "Organisation menu",
      },
      {
        title: "Creer un article",
        details: "Renseigne nom, code, prix et categorie.",
        visual: "🍔",
        visualHint: "Formulaire article",
      },
      {
        title: "Affecter image et prix",
        details: "Ajoute une image propre et un prix coherent.",
        visual: "🖼️",
        visualHint: "Apercu visuel",
      },
      {
        title: "Activer Visible dans POS",
        details: "Active la visibilite pour le rendre disponible en caisse.",
        visual: "💡",
        visualHint: "Activation POS",
      },
      {
        title: "Verifier l'affichage caisse",
        details: "Teste l'affichage dans la grille produits du POS.",
        visual: "🛒",
        visualHint: "Controle final",
      },
    ],
  },
  {
    id: "stock",
    title: "Gestion de stock",
    goal: "Suivre les entrees, sorties et alertes.",
    steps: [
      {
        title: "Choisir le type de stock",
        details: "Definis AUCUN, SIMPLE, FIFO, SERIAL ou LOT.",
        visual: "📦",
        visualHint: "Mode de suivi",
      },
      {
        title: "Saisir le stock initial",
        details: "Renseigne la quantite de depart selon ton unite.",
        visual: "🧮",
        visualHint: "Quantite initiale",
      },
      {
        title: "Ajouter des mouvements",
        details: "Enregistre entrees et sorties avec reference de document.",
        visual: "🔁",
        visualHint: "Mouvements stock",
      },
      {
        title: "Verifier les alertes",
        details: "Surveille les niveaux critiques pour eviter les ruptures.",
        visual: "🚨",
        visualHint: "Alerte faible stock",
      },
      {
        title: "Consulter l'historique",
        details: "Trace les corrections et operations d'inventaire.",
        visual: "🗂️",
        visualHint: "Historique complet",
      },
    ],
  },
];

const TrainingCenter: React.FC = () => {
  const { currentUser } = usePOS();
  const [activeModuleId, setActiveModuleId] = useState(MODULES[0].id);
  const [activeStep, setActiveStep] = useState(0);
  const [doneByModule, setDoneByModule] = useState<Record<string, number[]>>({});
  const [syncState, setSyncState] = useState<"local" | "syncing" | "synced" | "offline">(
    "local",
  );
  const storageKey = useMemo(
    () => `pos.training-center.progress.${currentUser?.id || "guest"}`,
    [currentUser?.id],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        activeModuleId?: string;
        activeStep?: number;
        doneByModule?: Record<string, number[]>;
      };
      if (
        parsed.activeModuleId &&
        MODULES.some((module) => module.id === parsed.activeModuleId)
      ) {
        setActiveModuleId(parsed.activeModuleId);
      } else {
        setActiveModuleId(MODULES[0].id);
      }
      setActiveStep(Math.max(0, Number(parsed.activeStep || 0)));
      setDoneByModule(parsed.doneByModule || {});
    } catch {
      setActiveModuleId(MODULES[0].id);
      setActiveStep(0);
      setDoneByModule({});
    }
  }, [storageKey]);

  useEffect(() => {
    let active = true;
    const userId = String(currentUser?.id || "").trim();
    if (!userId) {
      setSyncState("local");
      return;
    }
    (async () => {
      try {
        setSyncState("syncing");
        const response = await fetch(
          `/pos/training/progress/${encodeURIComponent(userId)}`,
        );
        if (!response.ok) {
          if (active) setSyncState("offline");
          return;
        }
        const row = await response.json();
        const payload = row?.payload;
        if (!active || !payload || typeof payload !== "object") {
          if (active) setSyncState("synced");
          return;
        }
        const moduleId = String(payload.activeModuleId || "");
        if (moduleId && MODULES.some((m) => m.id === moduleId)) {
          setActiveModuleId(moduleId);
        }
        setActiveStep(Math.max(0, Number(payload.activeStep || 0)));
        setDoneByModule(
          payload.doneByModule && typeof payload.doneByModule === "object"
            ? payload.doneByModule
            : {},
        );
        if (active) setSyncState("synced");
      } catch {
        if (active) setSyncState("offline");
      }
    })();
    return () => {
      active = false;
    };
  }, [currentUser?.id]);

  useEffect(() => {
    const payload = {
      activeModuleId,
      activeStep,
      doneByModule,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore localStorage failures (private mode / quota)
    }
  }, [storageKey, activeModuleId, activeStep, doneByModule]);

  useEffect(() => {
    const userId = String(currentUser?.id || "").trim();
    if (!userId) {
      setSyncState("local");
      return;
    }
    const timer = window.setTimeout(() => {
      setSyncState("syncing");
      void fetch(`/pos/training/progress/${encodeURIComponent(userId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeModuleId,
          activeStep,
          doneByModule,
        }),
      })
        .then((response) => {
          setSyncState(response.ok ? "synced" : "offline");
        })
        .catch(() => {
          setSyncState("offline");
        });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [currentUser?.id, activeModuleId, activeStep, doneByModule]);

  const syncBadge =
    syncState === "syncing"
      ? {
          label: "Synchronisation...",
          className: "border-indigo-200 bg-indigo-50 text-indigo-700",
          icon: <LoaderCircle size={13} className="animate-spin" />,
        }
      : syncState === "synced"
        ? {
            label: "Synchronise au serveur",
            className: "border-emerald-200 bg-emerald-50 text-emerald-700",
            icon: <Cloud size={13} />,
          }
        : syncState === "offline"
          ? {
              label: "Hors ligne (cache local)",
              className: "border-rose-200 bg-rose-50 text-rose-700",
              icon: <CloudOff size={13} />,
            }
          : {
              label: "Mode local",
              className: "border-slate-200 bg-slate-50 text-slate-700",
              icon: <HardDrive size={13} />,
            };

  const activeModule = useMemo(
    () => MODULES.find((m) => m.id === activeModuleId) || MODULES[0],
    [activeModuleId],
  );

  const completedSteps = doneByModule[activeModule.id] || [];
  const totalSteps = activeModule.steps.length;
  const percent = Math.round((completedSteps.length / Math.max(1, totalSteps)) * 100);

  const switchModule = (moduleId: string) => {
    setActiveModuleId(moduleId);
    setActiveStep(0);
  };

  const toggleStepDone = (index: number) => {
    setDoneByModule((prev) => {
      const current = prev[activeModule.id] || [];
      const next = current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index];
      return { ...prev, [activeModule.id]: next };
    });
  };

  const goToStep = (index: number) => {
    const next = Math.max(0, Math.min(totalSteps - 1, index));
    setActiveStep(next);
  };

  const isStepDone = (index: number) => completedSteps.includes(index);

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <GraduationCap size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                Autoformation guidee
              </h2>
              <p className="text-sm text-slate-500 font-medium">
                Parcours visuel, etape par etape, pour web et desktop.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 inline-flex items-center gap-2">
              <Lightbulb size={15} className="text-amber-600 animate-pulse" />
              <p className="text-xs font-black text-amber-700">
                Etape active: {activeStep + 1}/{totalSteps}
              </p>
            </div>
            <div
              className={`rounded-xl border px-3 py-1.5 text-[11px] font-black inline-flex items-center gap-1.5 ${syncBadge.className}`}
            >
              {syncBadge.icon}
              {syncBadge.label}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
        <div className="bg-white rounded-3xl border border-slate-200 p-4 space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">
            Parcours disponibles
          </h3>
          {MODULES.map((module) => {
            const completed = doneByModule[module.id]?.length || 0;
            const modulePercent = Math.round((completed / Math.max(1, module.steps.length)) * 100);
            const selected = module.id === activeModule.id;
            return (
              <button
                key={module.id}
                type="button"
                onClick={() => switchModule(module.id)}
                className={`w-full text-left rounded-2xl border p-3 transition ${
                  selected
                    ? "border-indigo-300 bg-indigo-50 shadow-sm"
                    : "border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/50"
                }`}
              >
                <p className="text-sm font-black text-slate-800">{module.title}</p>
                <p className="text-xs text-slate-500 mt-1">{module.goal}</p>
                <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${modulePercent}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] font-semibold text-slate-600">
                  Progression: {modulePercent}%
                </p>
              </button>
            );
          })}
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-slate-800">{activeModule.title}</h3>
              <p className="text-sm text-slate-500">{activeModule.goal}</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5">
              <Trophy size={14} className="text-indigo-600" />
              <p className="text-xs font-black text-indigo-700">{percent}% termine</p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
            <Sparkles size={16} className="text-amber-600 mt-0.5 animate-pulse" />
            <div>
              <p className="text-xs font-black text-amber-700">Maintenant</p>
              <p className="text-sm font-semibold text-amber-800">
                Etape {activeStep + 1}: {activeModule.steps[activeStep]?.title}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                {activeModule.steps[activeStep]?.details}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-[11px] uppercase tracking-widest font-black text-indigo-600">
              Illustration etape
            </p>
            <div className="mt-2 rounded-2xl border border-indigo-200 bg-white p-4 flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 text-3xl flex items-center justify-center animate-pulse">
                {activeModule.steps[activeStep]?.visual}
              </div>
              <div>
                <p className="text-sm font-black text-slate-800">
                  {activeModule.steps[activeStep]?.visualHint}
                </p>
                <p className="text-xs text-slate-500">
                  Zone visuelle guidee pour aider l'utilisateur sur l'action en cours.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {activeModule.steps.map((step, index) => {
              const active = index === activeStep;
              const done = isStepDone(index);
              return (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => goToStep(index)}
                  className={`w-full text-left flex items-center gap-3 rounded-2xl border p-3 transition ${
                    active
                      ? "border-amber-300 bg-amber-50 shadow-[0_0_0_4px_rgba(251,191,36,0.22)]"
                      : "border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/50"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="text-emerald-600" size={18} />
                  ) : (
                    <Circle className={active ? "text-amber-500" : "text-slate-400"} size={18} />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700">
                      Etape {index + 1}: {step.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{step.details}</p>
                    {active && (
                      <p className="text-[11px] font-black text-amber-700">Etape active</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => goToStep(activeStep - 1)}
              disabled={activeStep <= 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-black text-slate-700 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Precedent
            </button>
            <button
              type="button"
              onClick={() => toggleStepDone(activeStep)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                isStepDone(activeStep)
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-indigo-300 bg-indigo-50 text-indigo-700"
              }`}
            >
              {isStepDone(activeStep) ? "Marquer non fait" : "Marquer fait"}
            </button>
            <button
              type="button"
              onClick={() => goToStep(activeStep + 1)}
              disabled={activeStep >= totalSteps - 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-black text-indigo-700 disabled:opacity-40"
            >
              Suivant
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default TrainingCenter;
