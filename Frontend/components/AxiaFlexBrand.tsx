import React, { useId } from "react";

/** Icône marque v3 : monogramme AF plus minimal et équilibré. */
export const AxiaFlexMark: React.FC<{ className?: string }> = ({
  className = "w-12 h-12",
}) => {
  const uid = useId().replace(/:/g, "");
  const outerGrad = `axiaflex-outer-${uid}`;
  const accentGrad = `axiaflex-accent-${uid}`;
  const ringGrad = `axiaflex-ring-${uid}`;
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={outerGrad} x1="10%" y1="8%" x2="92%" y2="92%">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#111827" />
        </linearGradient>
        <linearGradient id={accentGrad} x1="8%" y1="10%" x2="92%" y2="90%">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="52%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
        <linearGradient id={ringGrad} x1="16%" y1="12%" x2="86%" y2="90%">
          <stop offset="0%" stopColor="#67E8F9" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#C084FC" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      <rect x="2.5" y="2.5" width="59" height="59" rx="20" fill={`url(#${outerGrad})`} />
      <circle cx="32" cy="32" r="24" fill="#0B1120" />
      <circle cx="32" cy="32" r="22.5" stroke={`url(#${ringGrad})`} strokeWidth="2.5" />

      <path
        d="M20 43 L30.8 20.5 L41.7 43 M24.4 34 H37.2"
        stroke={`url(#${accentGrad})`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M42.5 23 H30 M42.5 23 V40.5 M42.5 31.6 H33.8"
        stroke="white"
        strokeOpacity="0.95"
        strokeWidth="2.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const Wordmark: React.FC<{
  large?: boolean;
  medium?: boolean;
  darkSurface?: boolean;
}> = ({ large, medium, darkSurface }) => (
  <span className="inline-flex flex-col items-start">
    <span
      className={`font-black tracking-tight ${
        large
          ? "text-4xl sm:text-5xl"
          : medium
            ? "text-3xl sm:text-4xl"
            : "text-xl lg:text-2xl"
      }`}
    >
      <span className={darkSurface ? "text-white" : "text-slate-900"}>Axia</span>
      <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-indigo-400 to-fuchsia-400">
        Flex
      </span>
    </span>
    <span
      className={`mt-1 font-extrabold uppercase tracking-[0.22em] ${
        large ? "text-sm sm:text-base" : medium ? "text-xs sm:text-sm" : "text-[10px] sm:text-xs"
      } ${darkSurface ? "text-cyan-200/90" : "text-indigo-700"}`}
    >
      Cloud
    </span>
  </span>
);

type BrandSize = "compact" | "hero" | "login";

/**
 * Logo AxiaFlex : splash / login (hero) ou barre latérale (compact).
 */
const AxiaFlexBrand: React.FC<{
  size?: BrandSize;
  animated?: boolean;
  className?: string;
  hint?: string;
}> = ({ size = "hero", animated = false, className = "", hint }) => {
  if (size === "login") {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <AxiaFlexMark className="w-20 h-20 sm:w-24 sm:h-24" />
        <div className="mt-4">
          <Wordmark medium darkSurface />
        </div>
      </div>
    );
  }

  if (size === "compact") {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <AxiaFlexMark className="w-9 h-9 lg:w-10 lg:h-10 shrink-0" />
        <Wordmark darkSurface />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${className}`}
    >
      <div
        className={
          animated
            ? "axiaflex-logo-animate flex flex-col items-center"
            : "flex flex-col items-center"
        }
      >
        <AxiaFlexMark className="w-28 h-28 sm:w-36 sm:h-36" />
        <div className="mt-6 sm:mt-8">
          <Wordmark large darkSurface />
        </div>
      </div>
      {hint ? (
        <p className="mt-6 text-slate-500 text-[11px] font-bold uppercase tracking-[0.35em]">
          {hint}
        </p>
      ) : null}
    </div>
  );
};

export default AxiaFlexBrand;
