import React, { useState, useEffect, useRef, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import OrderScreen from "./components/OrderScreen";
import TableLayout from "./components/TableLayout";
import InventoryManager from "./components/InventoryManager";
import CashManagement from "./components/CashManagement";
import ClientManager from "./components/ClientManager";
import LoginScreen from "./components/LoginScreen";
import SuperAdminDashboard from "./components/SuperAdminDashboard";
import SplashScreen from "./components/SplashScreen";
import SettingsManager from "./components/SettingsManager";
import AnalyticsManager from "./components/AnalyticsManager";
import OrderListView from "./components/OrderListView";
import OpenTicketsBoard from "./components/OpenTicketsBoard";
import KitchenDisplay from "./components/KitchenDisplay";
import ClientKdsView from "./components/ClientKdsView";
import ClientPortal from "./components/ClientPortal";
import PurchaseManagement from "./components/PurchaseManagement";
import ReportsPage from "./components/ReportsPage";
import DashboardContent from "./components/DashboardContent";
import PreorderManagement from "./components/PreorderManagement";
import TrainingCenter from "./components/TrainingCenter";
import { POSProvider, usePOS } from "./store/POSContext";
import { Role, OrderType, CompanyType } from "./types";
import {
  Search,
  User,
  Wifi,
  WifiOff,
  Truck,
  ShoppingBag,
  UtensilsCrossed,
  ChevronLeft,
  X,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import {
  NOTIFY_EVENT_NAME,
  type NotifyKind,
  type NotifyPayload,
} from "./utils/notify";
import {
  CONFIRM_REQUEST_EVENT_NAME,
  CONFIRM_RESPONSE_EVENT_NAME,
  type ConfirmPayload,
  type ConfirmResponsePayload,
} from "./utils/confirm";

const formatAmount = (value: unknown, digits = 3) =>
  Number(value ?? 0).toFixed(digits);

type AppToast = {
  id: number;
  message: string;
  kind: NotifyKind;
};

const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const timersRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    const onNotify = (event: Event) => {
      const customEvent = event as CustomEvent<NotifyPayload>;
      const message = String(customEvent.detail?.message || "").trim();
      if (!message) return;

      const kind: NotifyKind = customEvent.detail?.kind || "info";
      const id = Date.now() + Math.floor(Math.random() * 1000);

      setToasts((prev) => [...prev, { id, message, kind }].slice(-4));

      const timeout = window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        timersRef.current.delete(id);
      }, 3200);

      timersRef.current.set(id, timeout);
    };

    window.addEventListener(NOTIFY_EVENT_NAME, onNotify as EventListener);
    return () => {
      window.removeEventListener(NOTIFY_EVENT_NAME, onNotify as EventListener);
      timersRef.current.forEach((timeout) => window.clearTimeout(timeout));
      timersRef.current.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-4 py-3 rounded-xl shadow-lg border text-sm font-bold pointer-events-auto ${
            toast.kind === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : toast.kind === "error"
                ? "bg-rose-50 border-rose-200 text-rose-700"
                : "bg-indigo-50 border-indigo-200 text-indigo-700"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
};

const ConfirmHost: React.FC = () => {
  const [request, setRequest] = useState<ConfirmPayload | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleIdRef = useRef(
    `confirm-title-${Math.random().toString(36).slice(2)}`,
  );
  const messageIdRef = useRef(
    `confirm-message-${Math.random().toString(36).slice(2)}`,
  );

  useEffect(() => {
    const onRequest = (event: Event) => {
      const customEvent = event as CustomEvent<ConfirmPayload>;
      if (!customEvent.detail?.id || !customEvent.detail?.message) return;
      setRequest(customEvent.detail);
    };

    window.addEventListener(
      CONFIRM_REQUEST_EVENT_NAME,
      onRequest as EventListener,
    );

    return () => {
      window.removeEventListener(
        CONFIRM_REQUEST_EVENT_NAME,
        onRequest as EventListener,
      );
    };
  }, []);

  const close = (confirmed: boolean) => {
    if (!request) return;
    window.dispatchEvent(
      new CustomEvent<ConfirmResponsePayload>(CONFIRM_RESPONSE_EVENT_NAME, {
        detail: {
          id: request.id,
          confirmed,
        },
      }),
    );
    setRequest(null);
  };

  useEffect(() => {
    if (!request) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const focusInitial = window.setTimeout(() => {
      cancelButtonRef.current?.focus();
    }, 0);

    const getFocusable = () => {
      const root = dialogRef.current;
      if (!root) return [] as HTMLElement[];
      const nodes = root.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
      );
      return Array.from(nodes).filter(
        (el) => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"),
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!request) return;

      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }

      if (event.key === "Enter") {
        const active = document.activeElement as HTMLElement | null;
        const activeTag = (active?.tagName || "").toLowerCase();
        const allowNativeEnter =
          activeTag === "textarea" ||
          activeTag === "input" ||
          activeTag === "select" ||
          active?.isContentEditable;
        if (!allowNativeEnter) {
          event.preventDefault();
          close(true);
          return;
        }
      }

      if (event.key === "Tab") {
        const focusable = getFocusable();
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
          if (
            !active ||
            active === first ||
            !dialogRef.current?.contains(active)
          ) {
            event.preventDefault();
            last.focus();
          }
        } else if (
          !active ||
          active === last ||
          !dialogRef.current?.contains(active)
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusInitial);
      window.removeEventListener("keydown", onKeyDown);
      previousActive?.focus?.();
    };
  }, [request]);

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-900/30 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleIdRef.current}
        aria-describedby={messageIdRef.current}
        className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 space-y-4"
      >
        <div>
          <h3
            id={titleIdRef.current}
            className="text-base font-black text-slate-800"
          >
            {request.title || "Confirmation"}
          </h3>
          <p id={messageIdRef.current} className="mt-2 text-sm text-slate-600">
            {request.message}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            onClick={() => close(false)}
            className="px-4 py-2 rounded-xl text-sm font-black bg-slate-100 text-slate-700"
          >
            {request.cancelText || "Cancel"}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={() => close(true)}
            className={`px-4 py-2 rounded-xl text-sm font-black text-white ${
              request.tone === "danger" ? "bg-rose-600" : "bg-indigo-600"
            }`}
          >
            {request.confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
};

const ModeSelector: React.FC<{
  onSelect: (type: OrderType) => void;
  /** Réservé au type société Restaurant / Café (plan de salle). */
  showDineIn: boolean;
}> = ({ onSelect, showDineIn }) => {
  return (
    <div className="h-full flex flex-col items-center justify-center space-y-12 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center space-y-2">
        <h2 className="text-4xl font-black text-slate-800 tracking-tighter">
          Choisissez le Mode
        </h2>
        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
          Point de Vente Actif
        </p>
      </div>

      <div
        className={`grid grid-cols-1 gap-8 w-full px-6 ${showDineIn ? "md:grid-cols-3 max-w-5xl" : "md:grid-cols-2 max-w-3xl"}`}
      >
        {showDineIn && (
          <button
            onClick={() => onSelect(OrderType.DINE_IN)}
            className="group bg-white p-10 rounded-[3rem] border-4 border-slate-100 hover:border-indigo-600 hover:shadow-2xl hover:shadow-indigo-100 transition-all flex flex-col items-center gap-6"
          >
            <div className="w-24 h-24 rounded-[2rem] bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
              <UtensilsCrossed size={48} />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                SUR PLACE
              </h3>
              <p className="text-sm font-bold text-slate-400 mt-1">
                Gestion Plan de Salle
              </p>
            </div>
          </button>
        )}

        <button
          onClick={() => onSelect(OrderType.DELIVERY)}
          className="group bg-white p-10 rounded-[3rem] border-4 border-slate-100 hover:border-emerald-600 hover:shadow-2xl hover:shadow-emerald-100 transition-all flex flex-col items-center gap-6"
        >
          <div className="w-24 h-24 rounded-[2rem] bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all">
            <Truck size={48} />
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">
              LIVRAISON
            </h3>
            <p className="text-sm font-bold text-slate-400 mt-1">
              Gérer les Livraisons
            </p>
          </div>
        </button>

        <button
          onClick={() => onSelect(OrderType.TAKE_OUT)}
          className="group bg-white p-10 rounded-[3rem] border-4 border-slate-100 hover:border-amber-600 hover:shadow-2xl hover:shadow-amber-100 transition-all flex flex-col items-center gap-6"
        >
          <div className="w-24 h-24 rounded-[2rem] bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-all">
            <ShoppingBag size={48} />
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">
              A EMPORTER
            </h3>
            <p className="text-sm font-bold text-slate-400 mt-1">
              Ventes Comptoir
            </p>
          </div>
        </button>
      </div>
    </div>
  );
};

const MainLayout: React.FC = () => {
  const { currentUser, isOffline, paymentRequests, dismissPaymentRequest, settings } =
    usePOS();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [orderMode, setOrderMode] = useState<OrderType | null>(null);
  const [activeOrderContext, setActiveOrderContext] = useState<{
    tableNum?: string;
    zoneId?: string;
    mode?: OrderType;
    id?: string;
  } | null>(null);
  const [isCreatingNewOrder, setIsCreatingNewOrder] = useState(false);
  /** Ouvre le modal « Règlement » du POS après sélection table avec commande (même UI que caisse). */
  const [openPaymentAfterTableSelect, setOpenPaymentAfterTableSelect] =
    useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (currentUser?.role === Role.SERVER) setActiveTab("pos");
    else if (
      currentUser?.role === Role.CHEF ||
      currentUser?.role === Role.BARTENDER
    )
      setActiveTab("kds");
    else if (currentUser?.role === Role.STOCK_MANAGER)
      setActiveTab("inventory");
  }, [currentUser]);

  const companyType = settings?.companyType;
  const isFastFood = companyType === CompanyType.FAST_FOOD;
  const isShop =
    companyType === CompanyType.SHOP_SINGLE || companyType === CompanyType.SHOP_MULTI;
  const isRestaurantCafe = companyType === CompanyType.RESTAURANT_CAFE;

  useEffect(() => {
    if (
      (currentUser?.role === Role.CHEF ||
        currentUser?.role === Role.BARTENDER) &&
      activeTab !== "kds"
    ) {
      setActiveTab("kds");
    }
  }, [activeTab, currentUser?.role]);

  useEffect(() => {
    if (activeTab === "tables" && !isRestaurantCafe) {
      setActiveTab(currentUser?.role === Role.SERVER ? "pos" : "dashboard");
    }
  }, [activeTab, isRestaurantCafe, currentUser?.role]);

  useEffect(() => {
    if (activeTab === "open-tickets" && !isRestaurantCafe) {
      setActiveTab(currentUser?.role === Role.SERVER ? "pos" : "dashboard");
    }
  }, [activeTab, isRestaurantCafe, currentUser?.role]);

  useEffect(() => {
    if (activeTab === "kds" && !isRestaurantCafe && !isFastFood) {
      setActiveTab(currentUser?.role === Role.SERVER ? "pos" : "dashboard");
    }
  }, [activeTab, isRestaurantCafe, isFastFood, currentUser?.role]);

  useEffect(() => {
    if (
      activeTab === "pos" &&
      !isFastFood &&
      !isShop &&
      orderMode === OrderType.DINE_IN &&
      !activeOrderContext &&
      !isRestaurantCafe
    ) {
      setOrderMode(null);
    }
  }, [
    activeTab,
    isFastFood,
    isShop,
    orderMode,
    activeOrderContext,
    isRestaurantCafe,
  ]);

  const resetPos = () => {
    setOrderMode(null);
    setActiveOrderContext(null);
    setIsCreatingNewOrder(false);
    setOpenPaymentAfterTableSelect(false);
  };

  const openOrderInPos = (order: Order) => {
    setOrderMode(order.type);
    setActiveOrderContext({
      id: order.id,
      tableNum: order.tableNumber,
      zoneId: order.zoneId,
      mode: order.type,
    });
    setIsCreatingNewOrder(false);
    setActiveTab("pos");
  };

  const handleSelectTable = (
    tableNum: string,
    existingOrderId?: string,
    zoneId?: string,
    options?: { openPayment?: boolean },
  ) => {
    setOrderMode(OrderType.DINE_IN);
    setActiveTab("pos");
    setActiveOrderContext({
      tableNum,
      zoneId,
      mode: OrderType.DINE_IN,
      id: existingOrderId,
    });
    setIsCreatingNewOrder(!existingOrderId);
    setOpenPaymentAfterTableSelect(
      Boolean(options?.openPayment && existingOrderId),
    );
  };

  const handleConsumedInitialOpenPayment = useCallback(() => {
    setOpenPaymentAfterTableSelect(false);
  }, []);

  const handleSelectExistingOrder = (orderId: string) => {
    setActiveOrderContext({ id: orderId, mode: orderMode || undefined });
    setIsCreatingNewOrder(false);
  };

  const renderContent = () => {
    // Si on est dans l'onglet POS
    if (activeTab === "pos") {
      if (isFastFood) {
        return (
          <OrderScreen
            initialMode={OrderType.TAKE_OUT}
            existingOrderId={activeOrderContext?.id}
            onBack={() => {
              if (activeOrderContext?.id) setActiveOrderContext(null);
            }}
          />
        );
      }
      if (isShop) {
        return (
          <OrderScreen
            initialMode={OrderType.TAKE_OUT}
            existingOrderId={activeOrderContext?.id}
            onBack={() => {
              if (activeOrderContext?.id) setActiveOrderContext(null);
            }}
          />
        );
      }
      if (!orderMode) {
        return (
          <ModeSelector
            showDineIn={isRestaurantCafe}
            onSelect={(mode) => setOrderMode(mode)}
          />
        );
      }

      // SUR PLACE — plan de salle (uniquement Restaurant / Café)
      if (
        isRestaurantCafe &&
        orderMode === OrderType.DINE_IN &&
        !activeOrderContext
      ) {
        return (
          <div className="h-full flex flex-col gap-4">
            <button
              onClick={() => setOrderMode(null)}
              className="w-max flex items-center gap-2 text-slate-400 font-bold hover:text-indigo-600 transition-all mb-2"
            >
              <ChevronLeft size={18} /> Retour aux modes
            </button>
            <TableLayout
              onSelectTable={handleSelectTable}
              enableReservations={false}
            />
          </div>
        );
      }

      // LIVRAISON / EMPORTER - Order List
      if (
        (orderMode === OrderType.DELIVERY ||
          orderMode === OrderType.TAKE_OUT) &&
        !activeOrderContext &&
        !isCreatingNewOrder
      ) {
        return (
          <div className="h-full flex flex-col gap-4">
            <button
              onClick={() => setOrderMode(null)}
              className="w-max flex items-center gap-2 text-slate-400 font-bold hover:text-indigo-600 transition-all mb-2"
            >
              <ChevronLeft size={18} /> Retour aux modes
            </button>
            <OrderListView
              type={orderMode}
              onSelectOrder={handleSelectExistingOrder}
              onCreateNew={() => setIsCreatingNewOrder(true)}
              onBack={() => setOrderMode(null)}
            />
          </div>
        );
      }

      // ORDER SCREEN (Edit or New)
      return (
        <OrderScreen
          initialTable={activeOrderContext?.tableNum}
          initialZoneId={activeOrderContext?.zoneId}
          initialMode={orderMode}
          existingOrderId={activeOrderContext?.id}
          initialOpenPayment={openPaymentAfterTableSelect}
          onConsumedInitialOpenPayment={handleConsumedInitialOpenPayment}
          onBack={() => {
            setActiveOrderContext(null);
            setIsCreatingNewOrder(false);
            setOpenPaymentAfterTableSelect(false);
          }}
        />
      );
    }

    // Gestion des autres onglets (accessibles quel que soit le type de société)
    switch (activeTab) {
      case "dashboard":
        return <DashboardContent />;
      case "tables":
        if (!isRestaurantCafe) {
          return (
            <div className="p-10 max-w-lg mx-auto bg-white rounded-3xl border border-slate-200 text-center">
              <p className="text-slate-800 font-black text-lg mb-2">
                Plan de salle
              </p>
              <p className="text-slate-500 text-sm font-medium">
                Disponible uniquement lorsque le type de société est{" "}
                <strong>Restaurant / Café</strong> (paramètres).
              </p>
            </div>
          );
        }
        return (
          <TableLayout
            onSelectTable={handleSelectTable}
            enableReservations={true}
          />
        );
      case "gestion-article":
        return <InventoryManager initialView="items" />;
      case "gestion-categories":
        return <InventoryManager initialView="categories" />;
      case "gestion-promotion":
        return <InventoryManager initialView="promotions" />;
      case "gestion-stock":
        return <InventoryManager initialView="stock" />;
      case "achats":
        return <PurchaseManagement />;
      case "preorders":
        return <PreorderManagement />;
      case "training":
        return <TrainingCenter />;
      case "analytics":
        return <AnalyticsManager />;
      case "reports":
        return <ReportsPage />;
      case "kds":
        if (!isRestaurantCafe && !isFastFood) {
          return (
            <div className="p-10 max-w-lg mx-auto bg-white rounded-3xl border border-slate-200 text-center">
              <p className="text-slate-800 font-black text-lg mb-2">
                Cuisine (KDS)
              </p>
              <p className="text-slate-500 text-sm font-medium">
                Disponible uniquement lorsque le type de société est{" "}
                <strong>Restaurant / Café</strong> ou <strong>Fast-food</strong>.
              </p>
            </div>
          );
        }
        return <KitchenDisplay />;
      case "open-tickets":
        if (!isRestaurantCafe) {
          return (
            <div className="p-10 max-w-lg mx-auto bg-white rounded-3xl border border-slate-200 text-center">
              <p className="text-slate-800 font-black text-lg mb-2">
                Tickets en cours
              </p>
              <p className="text-slate-500 text-sm font-medium">
                Disponible uniquement lorsque le type de société est{" "}
                <strong>Restaurant / Café</strong> (paramètres).
              </p>
            </div>
          );
        }
        return <OpenTicketsBoard onOpenOrder={openOrderInPos} />;
      case "cash":
        return <CashManagement />;
      case "clients":
        return <ClientManager />;
      case "settings":
        return <SettingsManager />;
      default:
        return (
          <div className="p-10 text-center text-slate-400">
            Section en cours de chargement...
          </div>
        );
    }
  };

  const getTitle = (id: string) => {
    switch (id) {
      case "dashboard":
        return "Tableau de Bord";
      case "pos":
        return orderMode ? `POS - ${orderMode}` : "Point de Vente";
      case "tables":
        return "Plan de Salle (Temps Réel)";
      case "inventory":
        return "Inventaire";
      case "analytics":
        return "Analyses IA";
      case "reports":
        return "Rapports de ventes";
      case "open-tickets":
        return "Tickets en cours";
      case "cash":
        return "Gestion Caisse";
      case "clients":
        return "Clients & Facturation";
      case "achats":
        return "Achats & Réceptions";
      case "preorders":
        return "Précommandes";
      case "training":
        return "Autoformation";
      case "settings":
        return "Paramètres";
      default:
        return id;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden lg:flex">
      <Sidebar
        activeTab={activeTab}
        isOpen={sidebarOpen}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          resetPos();
        }}
      />
      <main
        className={`flex-1 p-4 sm:p-6 lg:p-10 flex flex-col transition-[margin] duration-300 ease-in-out ${
          sidebarOpen ? "lg:ml-64" : "lg:ml-0"
        } ${activeTab === "pos" ? "h-screen overflow-hidden" : "min-h-screen"}`}
      >
        <header className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 lg:mb-10 gap-4 shrink-0">
          <div className="flex items-start sm:items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-expanded={sidebarOpen}
              aria-controls="app-main-sidebar"
              title={sidebarOpen ? "Masquer le menu" : "Afficher le menu"}
              className="shrink-0 mt-1 sm:mt-0 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              {sidebarOpen ? (
                <PanelLeftClose size={22} aria-hidden />
              ) : (
                <PanelLeft size={22} aria-hidden />
              )}
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-800 tracking-tighter">
                {getTitle(activeTab)}
              </h1>
              <p className="text-slate-400 font-bold text-xs sm:text-sm">
                Station #1 • {currentUser?.name}
              </p>
            </div>
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl border ${isOffline ? "bg-amber-50 border-amber-100 text-amber-600" : "bg-emerald-50 border-emerald-100 text-emerald-600"}`}
            >
              {isOffline ? <WifiOff size={16} /> : <Wifi size={16} />}
              <span className="text-[10px] font-black uppercase tracking-widest">
                {isOffline ? "Offline" : "Online"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 w-full lg:w-auto">
            <div className="relative w-full lg:w-auto">
              <input
                type="text"
                placeholder="Rechercher..."
                className="bg-white border border-slate-200 pl-12 pr-6 py-3 sm:py-4 rounded-[2rem] text-sm focus:ring-4 focus:ring-indigo-500/10 outline-none w-full lg:w-80 shadow-sm"
              />
              <Search
                className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
            </div>
          </div>
        </header>
        {paymentRequests.length > 0 && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                Demandes addition client
              </p>
              <span className="text-[10px] font-black text-amber-700">
                {paymentRequests.length}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {paymentRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white border border-amber-100 rounded-xl px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-black text-slate-800">
                      Table {req.tableNumber || "-"}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      {req.zoneId ? `Zone ${req.zoneId}` : "Client"}
                    </p>
                  </div>
                  <button
                    onClick={() => dismissPaymentRequest(req.id)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
                  >
                    OK
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div
          className={`flex-1 min-h-0 ${
            activeTab === "pos" ? "overflow-hidden" : "overflow-y-auto"
          }`}
        >
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { currentUser, settings } = usePOS();
  const [clientView, setClientView] = useState(false);
  const [saasToken, setSaasToken] = useState<string | null>(() =>
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("saas_token")
      : null,
  );
  /** Après le splash : afficher l’écran PIN (une seule page sans scroll). */
  const [authStep, setAuthStep] = useState<"splash" | "login">("splash");

  useEffect(() => {
    const on = Boolean(settings?.touchUiMode);
    document.body.classList.toggle("touch-ui-mode", on);
    return () => {
      document.body.classList.remove("touch-ui-mode");
    };
  }, [settings?.touchUiMode]);

  useEffect(() => {
    if (!currentUser) setAuthStep("splash");
  }, [currentUser]);

  const params = new URLSearchParams(window.location.search);
  const tableToken = params.get("tableToken") || params.get("t");
  if (tableToken) return <ClientPortal tableToken={tableToken} />;
  if (clientView) return <ClientKdsView onBack={() => setClientView(false)} />;
  if (saasToken) {
    return (
      <SuperAdminDashboard
        token={saasToken}
        onExit={() => {
          sessionStorage.removeItem("saas_token");
          setSaasToken(null);
        }}
      />
    );
  }
  if (currentUser) return <MainLayout />;

  if (authStep === "splash") {
    return <SplashScreen onContinue={() => setAuthStep("login")} />;
  }
  return (
    <LoginScreen
      onClientView={() => setClientView(true)}
      onSuperAdmin={(token) => {
        sessionStorage.setItem("saas_token", token);
        setSaasToken(token);
      }}
    />
  );
};

const App: React.FC = () => {
  return (
    <POSProvider>
      <AppContent />
      <ToastHost />
      <ConfirmHost />
    </POSProvider>
  );
};

export default App;
