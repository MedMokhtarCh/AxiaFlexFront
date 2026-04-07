import React from "react";
import type { CSSProperties } from "react";

/** Fond type parquet / lounge (plusieurs calques CSS). */
export const floorWoodBackgroundStyle: CSSProperties = {
  backgroundColor: "#b8956a",
  backgroundImage: [
    "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, transparent 32%, rgba(45,28,15,0.18) 100%)",
    "repeating-linear-gradient(92deg, transparent 0px, transparent 4px, rgba(62,39,22,0.07) 4px, rgba(62,39,22,0.07) 5px)",
    "repeating-linear-gradient(0deg, transparent 0px, transparent 52px, rgba(30,18,8,0.09) 52px, rgba(30,18,8,0.09) 53px)",
    "linear-gradient(122deg, #f3e5d2 0%, #e0c9a8 18%, #cfa574 42%, #b88958 72%, #9d7149 100%)",
  ].join(", "),
};

export const floorVignetteClassName =
  "pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_120px_rgba(45,28,15,0.28),inset_0_0_40px_rgba(0,0,0,0.12)]";

export const floorRoomOuterClassName =
  "rounded-[2rem] sm:rounded-[2.25rem] p-[6px] sm:p-2 bg-gradient-to-br from-slate-600 via-slate-800 to-slate-950 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.06)_inset]";

export const floorRoomInnerClassName =
  "relative h-full min-h-[inherit] w-full overflow-hidden rounded-[1.65rem] sm:rounded-[1.85rem] ring-1 ring-black/20 shadow-[inset_0_2px_24px_rgba(0,0,0,0.2)]";

const chair =
  "absolute rounded-md bg-gradient-to-b from-indigo-400/90 to-indigo-600/95 shadow-[0_2px_4px_rgba(30,27,75,0.35)] ring-1 ring-white/25";

/** Sièges vus du dessus (décor, comme un plan d’architecte). */
export function FloorPlanChairHints({
  shape,
  capacity,
}: {
  shape: "square" | "rect";
  capacity: number;
}) {
  const n = Math.min(8, Math.max(2, capacity));
  if (shape === "rect" || n >= 5) {
    return (
      <>
        <span
          className={`${chair} left-[8%] top-1/2 w-[11%] max-w-[14px] h-[22%] -translate-y-1/2`}
        />
        <span
          className={`${chair} right-[8%] top-1/2 w-[11%] max-w-[14px] h-[22%] -translate-y-1/2`}
        />
        <span
          className={`${chair} left-[22%] top-[6%] w-[18%] h-[14%] max-h-[12px]`}
        />
        <span
          className={`${chair} right-[22%] top-[6%] w-[18%] h-[14%] max-h-[12px]`}
        />
        <span
          className={`${chair} left-[22%] bottom-[6%] w-[18%] h-[14%] max-h-[12px]`}
        />
        <span
          className={`${chair} right-[22%] bottom-[6%] w-[18%] h-[14%] max-h-[12px]`}
        />
      </>
    );
  }
  return (
    <>
      <span
        className={`${chair} left-1/2 top-[5%] w-[22%] max-w-[18px] h-[16%] -translate-x-1/2`}
      />
      <span
        className={`${chair} left-1/2 bottom-[5%] w-[22%] max-w-[18px] h-[16%] -translate-x-1/2`}
      />
      <span
        className={`${chair} left-[6%] top-1/2 w-[14%] max-w-[12px] h-[22%] -translate-y-1/2`}
      />
      <span
        className={`${chair} right-[6%] top-1/2 w-[14%] max-w-[12px] h-[22%] -translate-y-1/2`}
      />
    </>
  );
}
