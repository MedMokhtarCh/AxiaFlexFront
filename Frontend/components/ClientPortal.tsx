import React, { useEffect, useState } from "react";
import { usePOS } from "../store/POSContext";
import { Order, OrderType, TableStatus } from "../types";
import OrderScreen from "./OrderScreen";
import ClientKdsView from "./ClientKdsView";
import { ArrowLeft, RefreshCw } from "lucide-react";

interface ClientPortalProps {
  tableToken: string;
}

type ViewMode = "menu" | "kds";

const ClientPortal: React.FC<ClientPortalProps> = ({ tableToken }) => {
  const { getClientTable, settings } = usePOS();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableInfo, setTableInfo] = useState<any>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [view, setView] = useState<ViewMode>("menu");

  const loadTable = async () => {
    try {
      setError(null);
      setLoading(true);
      const data = await getClientTable(tableToken);
      if (!data) {
        setError("Table introuvable");
        setTableInfo(null);
        setActiveOrder(null);
        return;
      }
      setTableInfo(data.table);
      setActiveOrder(data.activeOrder || null);
    } catch (err) {
      setError("Impossible de charger la table");
      setTableInfo(null);
      setActiveOrder(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTable();
  }, [tableToken]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        Chargement...
      </div>
    );
  }

  if (error || !tableInfo) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-black">{error || "Erreur"}</p>
        <button
          onClick={loadTable}
          className="px-6 py-3 rounded-full bg-white/10 text-xs font-black uppercase tracking-widest"
        >
          Reessayer
        </button>
      </div>
    );
  }

  if (tableInfo.status === TableStatus.RESERVED) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
          {settings?.restaurantName || "Restaurant"}
        </p>
        <h1 className="text-2xl font-black">Table reservee</h1>
        <p className="text-slate-400 text-sm">
          Cette table est reservee. Merci de voir un serveur.
        </p>
        <button
          onClick={loadTable}
          className="px-6 py-3 rounded-full bg-white/10 text-xs font-black uppercase tracking-widest"
        >
          Actualiser
        </button>
      </div>
    );
  }

  if (view === "kds") {
    return (
      <ClientKdsView
        onBack={() => setView("menu")}
        tableToken={tableToken}
        tableNumber={tableInfo.number}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {settings?.restaurantName || "Restaurant"}
            </p>
            <h1 className="text-2xl font-black text-slate-900">
              Table {tableInfo.number}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadTable}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
            >
              <RefreshCw size={14} /> Actualiser
            </button>
            <button
              onClick={() => setView("kds")}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
            >
              <ArrowLeft size={14} /> Suivi
            </button>
          </div>
        </div>
      </div>
      <OrderScreen
        clientMode
        clientToken={tableToken}
        initialTable={tableInfo.number}
        initialZoneId={tableInfo.zoneId}
        initialMode={OrderType.DINE_IN}
        initialOrder={activeOrder}
        onBack={() => setView("kds")}
      />
    </div>
  );
};

export default ClientPortal;
