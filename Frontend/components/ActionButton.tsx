import React, { useContext } from "react";
import { POSContext } from "../store/POSContext";

type Variant = "primary" | "ghost" | "danger" | "link";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  showGlobalBusy?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-700 border border-indigo-600",
  ghost: "bg-white text-indigo-600 border border-slate-200 hover:shadow",
  danger: "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100",
  link: "bg-transparent text-indigo-600 underline",
};

const base =
  "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all";

const ActionButton: React.FC<Props> = ({
  variant = "ghost",
  showGlobalBusy,
  children,
  className = "",
  disabled,
  ...rest
}) => {
  const pos = useContext(POSContext);
  const isMutating = Boolean(pos?.isMutating);
  const shouldShowGlobalBusy = showGlobalBusy ?? variant === "primary";
  const computedDisabled = Boolean(disabled || (shouldShowGlobalBusy && isMutating));

  return (
    <button
      className={`${base} ${variantClasses[variant]} ${className}`}
      disabled={computedDisabled}
      {...rest}
    >
      {shouldShowGlobalBusy && isMutating ? (
        <span className="inline-block h-2 w-2 rounded-full bg-current animate-pulse" />
      ) : null}
      {children}
      {shouldShowGlobalBusy && isMutating ? (
        <span className="text-[11px] font-bold opacity-85">Traitement...</span>
      ) : null}
    </button>
  );
};

export default ActionButton;
