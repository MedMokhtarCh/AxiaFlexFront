import React from "react";
import {
  LayoutDashboard,
  Table2,
  ShoppingCart,
  Package,
  Users,
  FileText,
  Banknote,
  Settings,
  LogOut,
  BarChart3,
  ChefHat,
  Receipt,
  Clock3,
  GraduationCap,
} from "lucide-react";
import { usePOS } from "../store/POSContext";
import { CompanyType, Role } from "../types";
import AxiaFlexBrand from "./AxiaFlexBrand";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  /** false = menu masqué (plein écran sur mobile ; rabattu hors écran sur grand écran). */
  isOpen?: boolean;
}

const NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Tableau de Bord",
    icon: LayoutDashboard,
    roles: [Role.ADMIN],
  },
  {
    id: "tables",
    label: "Plan de Salle",
    icon: Table2,
    roles: [Role.ADMIN, Role.SERVER],
  },
  {
    id: "reports",
    label: "Rapports",
    icon: FileText,
    roles: [Role.ADMIN],
  },
  {
    id: "pos",
    label: "Point de Vente",
    icon: ShoppingCart,
    roles: [Role.ADMIN, Role.SERVER],
  },
  {
    id: "preorders",
    label: "Précommandes",
    icon: Clock3,
    roles: [Role.ADMIN, Role.MANAGER, Role.CASHIER, Role.SERVER],
  },
  {
    id: "training",
    label: "Autoformation",
    icon: GraduationCap,
    roles: [
      Role.ADMIN,
      Role.MANAGER,
      Role.CASHIER,
      Role.SERVER,
      Role.STOCK_MANAGER,
      Role.CHEF,
      Role.BARTENDER,
    ],
  },
  {
    id: "open-tickets",
    label: "Tickets en cours",
    icon: Receipt,
    roles: [
      Role.ADMIN,
      Role.MANAGER,
      Role.CASHIER,
      Role.SERVER,
      Role.CHEF,
      Role.BARTENDER,
    ],
  },
  {
    id: "kds",
    label: "Cuisine (KDS)",
    icon: ChefHat,
    roles: [
      Role.ADMIN,
      Role.MANAGER,
      Role.CASHIER,
      Role.CHEF,
      Role.BARTENDER,
      Role.SERVER,
    ],
  },
  {
    id: "gestion-article",
    label: "Gestion Article",
    icon: Package,
    roles: [Role.ADMIN, Role.STOCK_MANAGER],
  },
  {
    id: "gestion-categories",
    label: "Gestion Catégories",
    icon: Package,
    roles: [Role.ADMIN, Role.STOCK_MANAGER],
  },
  {
    id: "gestion-promotion",
    label: "Gestion Promotion",
    icon: BarChart3,
    roles: [Role.ADMIN, Role.STOCK_MANAGER],
  },
  {
    id: "gestion-stock",
    label: "Gestion Stock",
    icon: Banknote,
    roles: [Role.ADMIN, Role.STOCK_MANAGER],
  },
  {
    id: "achats",
    label: "Achats",
    icon: FileText,
    roles: [Role.ADMIN, Role.STOCK_MANAGER],
  },
  { id: "analytics", label: "Analyses", icon: BarChart3, roles: [Role.ADMIN] },
  {
    id: "clients",
    label: "Clients & Factures",
    icon: Users,
    roles: [Role.ADMIN],
  },
  { id: "cash", label: "Gestion Caisse", icon: Banknote, roles: [Role.ADMIN] },
  { id: "settings", label: "Paramètres", icon: Settings, roles: [Role.ADMIN] },
];

const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen = true,
}) => {
  const { currentUser, logout, settings } = usePOS();

  const isRestaurantCafe =
    settings?.companyType === CompanyType.RESTAURANT_CAFE;
  const isFastFood = settings?.companyType === CompanyType.FAST_FOOD;

  const userClaims = new Set(currentUser?.claims || []);

  const ADMIN_ALWAYS_VISIBLE_ITEMS = new Set<string>(["settings", "training"]);
  const MODULE_ID_ALIASES: Record<string, string> = {
    "open_tickets": "open-tickets",
    "open tickets": "open-tickets",
    "gestion_article": "gestion-article",
    "gestion_categories": "gestion-categories",
    "gestion_promotion": "gestion-promotion",
    "gestion_stock": "gestion-stock",
    "point-de-vente": "pos",
    "point_de_vente": "pos",
    "pointdevente": "pos",
    "autoformation": "training",
    "parametres": "settings",
    "paramètres": "settings",
  };
  const knownNavIds = new Set(NAV_ITEMS.map((item) => item.id));
  const rawSaasMods = settings?.saasLicense?.enabledModules;
  const saasMods = Array.isArray(rawSaasMods)
    ? rawSaasMods
        .map((x) => String(x || "").trim())
        .map((raw) => {
          const low = raw.toLowerCase();
          const alias = MODULE_ID_ALIASES[low];
          if (alias) return alias;
          if (knownNavIds.has(raw)) return raw;
          if (knownNavIds.has(low)) return low;
          return raw;
        })
    : [];
  const saasModsSet = new Set(saasMods);
  const hasWildcardSaasModule =
    saasModsSet.has("*") ||
    saasModsSet.has("all") ||
    saasModsSet.has("ALL") ||
    saasModsSet.has("enterprise");
  const filteredItems = NAV_ITEMS.filter((item) => {
    const isAdmin = String(currentUser?.role || "").toUpperCase() === "ADMIN";
    const adminBypassSaasModuleGate =
      isAdmin && ADMIN_ALWAYS_VISIBLE_ITEMS.has(item.id);
    if (
      Array.isArray(saasMods) &&
      saasMods.length > 0 &&
      !hasWildcardSaasModule &&
      !saasModsSet.has(item.id) &&
      !adminBypassSaasModuleGate
    ) {
      return false;
    }
    if (!currentUser) return false;
    const roleOk = item.roles.includes(currentUser.role);
    const claimOk = userClaims.has(`nav:${item.id}`);
    if (!roleOk && !claimOk) return false;
    if (item.id === "tables" && !isRestaurantCafe) return false;
    if (item.id === "open-tickets" && !isRestaurantCafe) return false;
    if (item.id === "kds" && !isRestaurantCafe && !isFastFood) return false;
    return true;
  });

  return (
    <div
      id="app-main-sidebar"
      className={`w-full lg:w-64 bg-slate-900 text-white flex flex-col lg:fixed lg:left-0 lg:top-0 lg:h-screen lg:overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800 z-40 lg:transition-transform lg:duration-300 lg:ease-in-out ${
        isOpen
          ? "flex lg:translate-x-0"
          : "hidden lg:flex lg:-translate-x-full lg:pointer-events-none"
      }`}
    >
      <div className="px-4 py-4 lg:p-8">
        <h1 className="text-xl lg:text-2xl font-bold">
          <AxiaFlexBrand size="compact" />
        </h1>
      </div>

      <nav className="lg:flex-1 px-3 lg:px-4 pb-3 lg:pb-3 flex lg:block gap-2 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto scrollbar-hide min-h-0">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`shrink-0 lg:w-full flex items-center gap-3 lg:gap-4 px-3 lg:px-4 py-3 lg:py-4 rounded-2xl transition-all whitespace-nowrap ${
                isActive
                  ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon size={20} />
              <span className="font-semibold text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="hidden lg:block p-6 border-t border-slate-800">
        <div className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-2xl mb-4">
          <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden ring-2 ring-indigo-500/20">
            <img
              src={`https://picsum.photos/seed/${currentUser?.role}/40`}
              alt="Avatar"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{currentUser?.name}</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              {currentUser?.role === Role.ADMIN
                ? "Administrateur"
                : currentUser?.role === Role.MANAGER
                  ? "Manager"
                  : currentUser?.role === Role.CASHIER
                    ? "Caissier"
                    : currentUser?.role === Role.CHEF
                      ? "Chef"
                      : currentUser?.role === Role.BARTENDER
                        ? "Barman"
                        : currentUser?.role === Role.SERVER
                          ? "Serveur"
                          : "Gestionnaire Stock"}
            </p>
          </div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all font-bold text-sm"
        >
          <LogOut size={18} />
          Changer de Shift
        </button>
      </div>

      <div className="lg:hidden px-4 pb-4">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-rose-300 bg-rose-500/10 rounded-xl transition-all font-bold text-sm"
        >
          <LogOut size={16} />
          Changer de Shift
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
