import React from "react";
import AxiaFlexBrand from "./AxiaFlexBrand";

interface SplashScreenProps {
  onContinue: () => void;
}

/**
 * Écran d’accueil : logo centré, animation, clic pour ouvrir la connexion.
 */
const SplashScreen: React.FC<SplashScreenProps> = ({ onContinue }) => {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-[#020617]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.14]">
        <div className="absolute -top-32 left-1/2 h-[min(70vh,520px)] w-[min(70vh,520px)] -translate-x-1/2 rounded-full bg-cyan-400 blur-[110px]" />
        <div className="absolute bottom-[-5%] right-[-10%] h-[50%] w-[55%] rounded-full bg-indigo-600 blur-[100px]" />
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="relative z-10 flex max-h-[min(85vh,640px)] max-w-[min(92vw,420px)] flex-col items-center justify-center rounded-[2rem] px-6 py-10 outline-none transition active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-cyan-400/50 focus-visible:ring-offset-4 focus-visible:ring-offset-[#020617]"
        aria-label="Continuer vers la connexion AxiaFlex"
      >
        <AxiaFlexBrand
          size="hero"
          animated
          hint="Touchez le logo pour continuer"
        />
      </button>
    </div>
  );
};

export default SplashScreen;
