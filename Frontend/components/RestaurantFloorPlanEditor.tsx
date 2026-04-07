import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TableConfig, Zone } from "../types";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LayoutGrid,
  Minus,
  MousePointer2,
  Palette,
  Plus,
  Sparkles,
  Square,
  StretchHorizontal,
  Trash2,
} from "lucide-react";
import {
  floorRoomInnerClassName,
  floorRoomOuterClassName,
  floorVignetteClassName,
  floorWoodBackgroundStyle,
  FloorPlanChairHints,
} from "./floorPlanTheme";

/** Propositions de position (% du canevas) pour une nouvelle table dans une zone. */
export function suggestTablePlanLayout(
  tables: TableConfig[],
  zoneId: string,
  capacity: number,
): Pick<TableConfig, "planX" | "planY" | "planW" | "planH" | "planShape"> {
  const inZone = tables.filter((t) => t.zoneId === zoneId);
  const placed = inZone.filter(
    (t) =>
      t.planX != null &&
      t.planY != null &&
      t.planW != null &&
      t.planH != null,
  );
  const n = placed.length;
  const col = n % 6;
  const row = Math.floor(n / 6);
  const shape = capacity > 4 ? "rect" : "square";
  const w = shape === "rect" ? 16 : 10;
  const h = shape === "rect" ? 9 : 10;
  return {
    planX: Math.min(88 - w, 4 + col * 14),
    planY: Math.min(88 - h, 8 + row * 16),
    planW: w,
    planH: h,
    planShape: shape,
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Props = {
  zones: Zone[];
  tables: TableConfig[];
  selectedZoneId: string;
  patchTableLayout: (
    id: string,
    updates: Partial<
      Pick<
        TableConfig,
        "planX" | "planY" | "planW" | "planH" | "planShape"
      >
    >,
  ) => Promise<TableConfig | null>;
  patchZoneLayout: (
    id: string,
    updates: Partial<
      Pick<Zone, "planX" | "planY" | "planW" | "planH" | "planFill">
    >,
  ) => Promise<Zone | null>;
  deleteTable: (id: string) => Promise<void>;
};

const dimsForTable = (t: TableConfig) => {
  const cap = Number(t.capacity || 4);
  const shape =
    t.planShape === "rect" || t.planShape === "square"
      ? t.planShape
      : cap > 4
        ? "rect"
        : "square";
  const w =
    t.planW != null && t.planW > 0
      ? t.planW
      : shape === "rect"
        ? 16
        : 10;
  const h =
    t.planH != null && t.planH > 0
      ? t.planH
      : shape === "rect"
        ? 9
        : 10;
  return { w, h, shape };
};

/** Couleurs prêtes à l’emploi pour les zones (cuisine, comptoir, terrasse…). */
const ZONE_PALETTE: { hex: string; label: string }[] = [
  { hex: "#e7e5e4", label: "Ivoire" },
  { hex: "#cbd5e1", label: "Ardoise clair" },
  { hex: "#94a3b8", label: "Gris bleu" },
  { hex: "#bfdbfe", label: "Bleu ciel" },
  { hex: "#c4b5fd", label: "Lavande" },
  { hex: "#fbcfe8", label: "Rose" },
  { hex: "#bbf7d0", label: "Menthe" },
  { hex: "#fde68a", label: "Beurre" },
  { hex: "#fed7aa", label: "Pêche" },
  { hex: "#78716c", label: "Taupe" },
  { hex: "#44403c", label: "Charbon clair" },
  { hex: "#fafaf9", label: "Blanc cassé" },
];

const BtnPad: React.FC<{
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}> = ({ onClick, label, children, className = "" }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 active:scale-95 ${className}`}
  >
    {children}
  </button>
);

const RestaurantFloorPlanEditor: React.FC<Props> = ({
  zones,
  tables,
  selectedZoneId,
  patchTableLayout,
  patchZoneLayout,
  deleteTable,
}) => {
  const [moveStep, setMoveStep] = useState(2);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [zoneEditId, setZoneEditId] = useState<string>("");
  const [ze, setZe] = useState({
    planX: 2,
    planY: 2,
    planW: 32,
    planH: 24,
    planFill: ZONE_PALETTE[0].hex,
  });

  const tablesOnPlan = useMemo(
    () =>
      tables.filter(
        (t) =>
          t.planX != null &&
          t.planY != null &&
          t.planW != null &&
          t.planH != null,
      ),
    [tables],
  );

  const selectedTable = useMemo(
    () => tables.find((t) => t.id === selectedTableId) || null,
    [tables, selectedTableId],
  );

  const zoneBeingEdited = useMemo(
    () => zones.find((z) => z.id === zoneEditId),
    [zones, zoneEditId],
  );

  const zoneOnPlan = Boolean(
    zoneBeingEdited &&
      zoneBeingEdited.planX != null &&
      zoneBeingEdited.planY != null &&
      zoneBeingEdited.planW != null &&
      zoneBeingEdited.planH != null,
  );

  useEffect(() => {
    const z = zones.find((x) => x.id === zoneEditId);
    if (!z) return;
    setZe({
      planX: z.planX ?? 2,
      planY: z.planY ?? 2,
      planW: z.planW ?? 32,
      planH: z.planH ?? 24,
      planFill: z.planFill || ZONE_PALETTE[0].hex,
    });
  }, [zoneEditId, zones]);

  const placeUnplaced = useCallback(
    async (t: TableConfig) => {
      const lay = suggestTablePlanLayout(tables, t.zoneId, t.capacity);
      await patchTableLayout(t.id, lay);
    },
    [tables, patchTableLayout],
  );

  const onTableActivate = useCallback(
    (t: TableConfig) => {
      setSelectedTableId(t.id);
      if (
        t.planX == null ||
        t.planY == null ||
        t.planW == null ||
        t.planH == null
      ) {
        void placeUnplaced(t);
      }
    },
    [placeUnplaced],
  );

  const nudgeSelectedTable = useCallback(
    async (dx: number, dy: number) => {
      if (!selectedTable) return;
      if (
        selectedTable.planX == null ||
        selectedTable.planY == null ||
        selectedTable.planW == null ||
        selectedTable.planH == null
      ) {
        await placeUnplaced(selectedTable);
        return;
      }
      const { w, h } = dimsForTable(selectedTable);
      const nx = clamp((selectedTable.planX ?? 0) + dx, 0, 100 - w);
      const ny = clamp((selectedTable.planY ?? 0) + dy, 0, 100 - h);
      await patchTableLayout(selectedTable.id, { planX: nx, planY: ny });
    },
    [selectedTable, patchTableLayout, placeUnplaced],
  );

  const resizeSelectedTable = useCallback(
    async (deltaW: number, deltaH: number) => {
      if (!selectedTable) return;
      if (
        selectedTable.planW == null ||
        selectedTable.planH == null ||
        selectedTable.planX == null ||
        selectedTable.planY == null
      ) {
        await placeUnplaced(selectedTable);
        return;
      }
      let nw = (selectedTable.planW ?? 10) + deltaW;
      let nh = (selectedTable.planH ?? 10) + deltaH;
      nw = clamp(nw, 7, 42);
      nh = clamp(nh, 6, 38);
      const nx = clamp(selectedTable.planX ?? 0, 0, 100 - nw);
      const ny = clamp(selectedTable.planY ?? 0, 0, 100 - nh);
      await patchTableLayout(selectedTable.id, {
        planW: nw,
        planH: nh,
        planX: nx,
        planY: ny,
      });
    },
    [selectedTable, patchTableLayout, placeUnplaced],
  );

  const setShapeForSelected = async (shape: "square" | "rect") => {
    if (!selectedTable) return;
    const w = shape === "rect" ? 16 : 10;
    const h = shape === "rect" ? 9 : 10;
    const upd: Partial<TableConfig> = {
      planShape: shape,
      planW: w,
      planH: h,
    };
    if (
      selectedTable.planX != null &&
      selectedTable.planY != null
    ) {
      upd.planX = clamp(selectedTable.planX, 0, 100 - w);
      upd.planY = clamp(selectedTable.planY, 0, 100 - h);
    }
    await patchTableLayout(selectedTable.id, upd);
  };

  const saveZonePartial = async (
    patch: Partial<{
      planX: number;
      planY: number;
      planW: number;
      planH: number;
      planFill: string | null;
    }>,
  ) => {
    if (!zoneEditId) return;
    const next = {
      planX: patch.planX ?? ze.planX,
      planY: patch.planY ?? ze.planY,
      planW: patch.planW ?? ze.planW,
      planH: patch.planH ?? ze.planH,
      planFill: patch.planFill !== undefined ? patch.planFill : ze.planFill,
    };
    next.planX = clamp(next.planX, 0, 100 - next.planW);
    next.planY = clamp(next.planY, 0, 100 - next.planH);
    next.planW = clamp(next.planW, 10, 90);
    next.planH = clamp(next.planH, 8, 88);
    setZe((s) => ({ ...s, ...next }));
    await patchZoneLayout(zoneEditId, {
      planX: next.planX,
      planY: next.planY,
      planW: next.planW,
      planH: next.planH,
      planFill: next.planFill || null,
    });
  };

  const startZoneOnPlan = async (fill?: string) => {
    if (!zoneEditId) return;
    const f = fill ?? ze.planFill;
    const next = {
      planX: 2,
      planY: 2,
      planW: 32,
      planH: 24,
      planFill: f,
    };
    setZe((s) => ({ ...s, ...next }));
    await patchZoneLayout(zoneEditId, {
      planX: next.planX,
      planY: next.planY,
      planW: next.planW,
      planH: next.planH,
      planFill: f,
    });
  };

  const moveZoneBy = (dx: number, dy: number) => {
    void saveZonePartial({
      planX: ze.planX + dx,
      planY: ze.planY + dy,
    });
  };

  const resizeZoneBy = (dW: number, dH: number) => {
    void saveZonePartial({
      planW: ze.planW + dW,
      planH: ze.planH + dH,
    });
  };

  const pickZoneColor = (hex: string) => {
    setZe((s) => ({ ...s, planFill: hex }));
    if (zoneOnPlan && zoneEditId) {
      void patchZoneLayout(zoneEditId, { planFill: hex });
    }
  };

  const clearZoneGeom = async () => {
    if (!zoneEditId) return;
    await patchZoneLayout(zoneEditId, {
      planX: null,
      planY: null,
      planW: null,
      planH: null,
      planFill: null,
    });
  };

  const unplaced = useMemo(
    () =>
      tables.filter(
        (t) =>
          t.planX == null ||
          t.planY == null ||
          t.planW == null ||
          t.planH == null,
      ),
    [tables],
  );

  useEffect(() => {
    if (!selectedTable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLSelectElement) return;
      const s = moveStep;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        void nudgeSelectedTable(-s, 0);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        void nudgeSelectedTable(s, 0);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        void nudgeSelectedTable(0, -s);
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        void nudgeSelectedTable(0, s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedTable, moveStep, nudgeSelectedTable]);

  const step = moveStep;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/90 to-indigo-50/40 p-4 sm:p-5 shadow-[0_4px_24px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <Sparkles size={22} strokeWidth={2.2} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600/90">
              Plan simple
            </p>
            <p className="text-sm font-bold text-slate-700">
              Cliquez une table puis utilisez les boutons (ou les flèches du
              clavier) — sans glisser-déposer.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <LayoutGrid size={15} className="text-indigo-500" />
            <span>Pas</span>
            <select
              value={moveStep}
              onChange={(e) => setMoveStep(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold normal-case text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value={1}>Fin (1 %)</option>
              <option value={2}>Normal (2 %)</option>
              <option value={4}>Large (4 %)</option>
            </select>
          </div>
          <div className="hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />
          <p className="text-[10px] font-bold text-slate-400">
            Légende : libre · occupée · réservée
          </p>
        </div>
      </div>

      <div className={floorRoomOuterClassName}>
        <div
          className={`${floorRoomInnerClassName} min-h-[440px] sm:min-h-[480px] select-none`}
          style={floorWoodBackgroundStyle}
        >
          <div className={floorVignetteClassName} aria-hidden />

        {zones.map((z) => {
          if (
            z.planX == null ||
            z.planY == null ||
            z.planW == null ||
            z.planH == null
          )
            return null;
          return (
            <div
              key={z.id}
              className="pointer-events-none absolute overflow-hidden rounded-2xl border border-white/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_24px_rgba(0,0,0,0.12)] ring-1 ring-black/10"
              style={{
                left: `${z.planX}%`,
                top: `${z.planY}%`,
                width: `${z.planW}%`,
                height: `${z.planH}%`,
                background: z.planFill || "rgba(255,255,255,0.22)",
              }}
              title={z.name}
            >
              <span className="absolute left-3 top-2 max-w-[calc(100%-1rem)] truncate rounded-lg bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-700 shadow-sm backdrop-blur-sm">
                {z.name}
              </span>
            </div>
          );
        })}

        {tablesOnPlan.map((t) => {
          const { w, h, shape } = dimsForTable(t);
          const px = t.planX ?? 5;
          const py = t.planY ?? 5;
          const muted =
            selectedZoneId && t.zoneId !== selectedZoneId;
          const isSel = selectedTableId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTableActivate(t)}
              title={`Table ${t.number} — cliquez pour la sélectionner`}
              className={`group absolute overflow-hidden rounded-2xl border-[3px] border-emerald-500/95 bg-gradient-to-b from-white to-stone-50 text-slate-800 shadow-[0_12px_28px_rgba(30,27,75,0.18),0_2px_0_rgba(255,255,255,0.8)_inset] transition-all duration-200 hover:z-30 hover:scale-[1.02] hover:border-emerald-400 ${
                muted ? "opacity-40 grayscale" : "opacity-100"
              } ${
                isSel
                  ? "z-20 scale-[1.02] border-indigo-500 ring-4 ring-indigo-400/80 ring-offset-2 ring-offset-amber-100/40"
                  : "z-10"
              } cursor-pointer`}
              style={{
                left: `${px}%`,
                top: `${py}%`,
                width: `${w}%`,
                height: `${h}%`,
                minHeight: 40,
              }}
            >
              <div className="absolute inset-x-[12%] top-[18%] bottom-[26%] rounded-lg bg-gradient-to-b from-amber-50/90 via-orange-50/70 to-amber-100/80 opacity-90 shadow-inner ring-1 ring-amber-900/10" />
              <FloorPlanChairHints
                shape={shape === "rect" ? "rect" : "square"}
                capacity={t.capacity}
              />
              <div className="relative z-[1] flex h-full flex-col items-center justify-center gap-0.5 px-1">
                <MousePointer2
                  size={13}
                  className={`shrink-0 ${isSel ? "text-indigo-500" : "text-slate-400/90"}`}
                  strokeWidth={2.2}
                />
                <span className="text-sm font-black leading-none tracking-tight text-slate-800 drop-shadow-sm">
                  {t.number}
                </span>
                <span className="text-[8px] font-bold uppercase tracking-wider text-slate-500">
                  {t.capacity} pers.
                </span>
              </div>
            </button>
          );
        })}

        {tablesOnPlan.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/35 shadow-inner ring-1 ring-white/40 backdrop-blur-md">
              <LayoutGrid className="text-slate-700/70" size={32} />
            </div>
            <p className="max-w-sm text-sm font-bold leading-relaxed text-slate-800/85">
              {tables.length === 0
                ? "Ajoutez des tables avec le formulaire ci-dessus."
                : "Utilisez « Placer » pour mettre une table sur le plan, puis les boutons en dessous pour la déplacer."}
            </p>
          </div>
        )}
        </div>
      </div>

      {unplaced.length > 0 && (
        <div className="rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-orange-50/50 to-white p-5 shadow-[0_8px_30px_rgba(180,83,9,0.12)]">
          <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-900">
            Tables pas encore sur le plan
          </p>
          <div className="flex flex-wrap gap-2">
            {unplaced.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void placeUnplaced(t)}
                className="rounded-2xl border border-amber-200/90 bg-white px-4 py-2.5 text-xs font-black text-amber-950 shadow-sm transition hover:border-amber-300 hover:shadow-md"
              >
                Table {t.number} — Placer
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <MousePointer2 size={14} className="text-indigo-500" />
            Table sélectionnée
          </p>
          {selectedTable ? (
            <>
              <p className="text-sm font-bold text-slate-800">
                N° {selectedTable.number} — {selectedTable.capacity} pers.
              </p>
              <p className="text-[11px] text-slate-500">
                Déplacer
              </p>
              <div className="flex flex-col items-center gap-1">
                <BtnPad
                  label="Haut"
                  onClick={() => void nudgeSelectedTable(0, -step)}
                >
                  <ChevronUp size={22} />
                </BtnPad>
                <div className="flex gap-1">
                  <BtnPad
                    label="Gauche"
                    onClick={() => void nudgeSelectedTable(-step, 0)}
                  >
                    <ChevronLeft size={22} />
                  </BtnPad>
                  <BtnPad
                    label="Droite"
                    onClick={() => void nudgeSelectedTable(step, 0)}
                  >
                    <ChevronRight size={22} />
                  </BtnPad>
                </div>
                <BtnPad
                  label="Bas"
                  onClick={() => void nudgeSelectedTable(0, step)}
                >
                  <ChevronDown size={22} />
                </BtnPad>
              </div>
              <p className="pt-2 text-[11px] text-slate-500">
                Taille de la table
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void resizeSelectedTable(-2, -1)}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border-2 border-slate-200 bg-slate-50 py-2.5 text-[10px] font-black uppercase text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-white min-[420px]:flex-initial min-[420px]:px-4"
                >
                  <Minus size={16} />
                  Réduire
                </button>
                <button
                  type="button"
                  onClick={() => void resizeSelectedTable(2, 1)}
                  className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border-2 border-indigo-200 bg-indigo-50 py-2.5 text-[10px] font-black uppercase text-indigo-900 shadow-sm transition hover:bg-indigo-100 min-[420px]:flex-initial min-[420px]:px-4"
                >
                  <Plus size={16} />
                  Agrandir
                </button>
              </div>
              <p className="pt-1 text-[11px] text-slate-500">Forme</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void setShapeForSelected("square")}
                  className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white py-3 text-[10px] font-black uppercase text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <Square size={18} />
                  Carrée
                </button>
                <button
                  type="button"
                  onClick={() => void setShapeForSelected("rect")}
                  className="inline-flex flex-1 min-w-[120px] items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white py-3 text-[10px] font-black uppercase text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50"
                >
                  <StretchHorizontal size={18} />
                  Rectangle
                </button>
              </div>
              <button
                type="button"
                onClick={() => void deleteTable(selectedTable.id)}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-[10px] font-black uppercase text-rose-700 transition hover:border-rose-300"
              >
                <Trash2 size={14} />
                Supprimer cette table
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-400">
              Cliquez une table sur le plan pour la déplacer ou changer sa
              taille et sa forme.
            </p>
          )}
        </div>

        <div className="space-y-4 rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Palette size={14} className="text-violet-500" />
            Zone sur le plan (cuisine, comptoir…)
          </p>
          <select
            value={zoneEditId}
            onChange={(e) => setZoneEditId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold shadow-inner outline-none focus:ring-2 focus:ring-violet-200"
          >
            <option value="">Choisir une zone…</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>

          {zoneEditId ? (
            <>
              {!zoneOnPlan && (
                <div className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/60 p-4">
                  <p className="mb-3 text-xs font-bold text-violet-900">
                    Cette zone n&apos;apparaît pas encore sur le plan. Un clic
                    suffit :
                  </p>
                  <button
                    type="button"
                    onClick={() => void startZoneOnPlan()}
                    className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-violet-500/25"
                  >
                    Afficher la zone sur le plan
                  </button>
                </div>
              )}

              <p className="text-[11px] font-bold text-slate-500">
                Couleur de la zone
              </p>
              <div className="flex flex-wrap gap-2">
                {ZONE_PALETTE.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.label}
                    aria-label={c.label}
                    onClick={() => pickZoneColor(c.hex)}
                    className={`h-10 w-10 rounded-xl border-2 shadow-sm transition hover:scale-110 hover:shadow-md ${
                      ze.planFill === c.hex
                        ? "border-indigo-600 ring-2 ring-indigo-300"
                        : "border-white ring-1 ring-slate-200/80"
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
              <p className="mt-3 text-[10px] text-slate-400">
                {ZONE_PALETTE.find((p) => p.hex === ze.planFill)?.label ??
                  "Couleur personnalisée"}
              </p>

              {zoneOnPlan && (
                <>
                  <p className="pt-2 text-[11px] text-slate-500">
                    Déplacer la zone
                  </p>
                  <div className="flex flex-col items-center gap-1">
                    <BtnPad
                      label="Zone vers le haut"
                      onClick={() => moveZoneBy(0, -step)}
                    >
                      <ChevronUp size={22} />
                    </BtnPad>
                    <div className="flex gap-1">
                      <BtnPad
                        label="Zone vers la gauche"
                        onClick={() => moveZoneBy(-step, 0)}
                      >
                        <ChevronLeft size={22} />
                      </BtnPad>
                      <BtnPad
                        label="Zone vers la droite"
                        onClick={() => moveZoneBy(step, 0)}
                      >
                        <ChevronRight size={22} />
                      </BtnPad>
                    </div>
                    <BtnPad
                      label="Zone vers le bas"
                      onClick={() => moveZoneBy(0, step)}
                    >
                      <ChevronDown size={22} />
                    </BtnPad>
                  </div>

                  <p className="pt-2 text-[11px] text-slate-500">
                    Taille de la zone
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => resizeZoneBy(-4, 0)}
                      className="rounded-xl border border-slate-200 bg-white py-2 text-[10px] font-black uppercase text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      − Largeur
                    </button>
                    <button
                      type="button"
                      onClick={() => resizeZoneBy(4, 0)}
                      className="rounded-xl border border-slate-200 bg-white py-2 text-[10px] font-black uppercase text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      + Largeur
                    </button>
                    <button
                      type="button"
                      onClick={() => resizeZoneBy(0, -3)}
                      className="rounded-xl border border-slate-200 bg-white py-2 text-[10px] font-black uppercase text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      − Hauteur
                    </button>
                    <button
                      type="button"
                      onClick={() => resizeZoneBy(0, 3)}
                      className="rounded-xl border border-slate-200 bg-white py-2 text-[10px] font-black uppercase text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      + Hauteur
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void clearZoneGeom()}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white py-2.5 text-[10px] font-black uppercase text-slate-600"
                  >
                    Retirer la zone du plan
                  </button>
                </>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-400">
              Choisissez une zone pour lui donner une couleur et une place sur
              le plan.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RestaurantFloorPlanEditor;
