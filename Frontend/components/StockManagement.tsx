import React, { useEffect, useMemo, useState } from "react";
import { StockDocument } from "../types";

interface StockManagementProps {
  stockMovements: any[]; // kept for future use (e.g. movement drilldown)
  productsById: Map<string, any>;
  formatDateTimeSafe: (value: unknown) => string;
  openCreateStockMovement: () => void;
  listStockDocuments: (params?: {
    from?: number;
    to?: number;
    type?: string;
  }) => Promise<StockDocument[]>;
  onEditDocument: (doc: StockDocument) => void;
  onDeleteDocumentLine: (
    documentId: string,
    lineId: string,
  ) => Promise<StockDocument | null>;
  reloadToken: number;
}

const StockManagement: React.FC<StockManagementProps> = ({
  stockMovements,
  productsById,
  formatDateTimeSafe,
  openCreateStockMovement,
  listStockDocuments,
  onEditDocument,
  onDeleteDocumentLine,
  reloadToken,
}) => {
  const [documents, setDocuments] = useState<StockDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [selectedDoc, setSelectedDoc] = useState<StockDocument | null>(null);
  const [lineBusyId, setLineBusyId] = useState<string | null>(null);

  const loadDocuments = async () => {
    try {
      setLoadingDocs(true);
      const params: { from?: number; to?: number; type?: string } = {};
      if (fromDate) {
        params.from = new Date(fromDate + "T00:00:00").getTime();
      }
      if (toDate) {
        params.to = new Date(toDate + "T23:59:59").getTime();
      }
      if (typeFilter) {
        params.type = typeFilter;
      }
      const docs = await listStockDocuments(params);
      setDocuments(docs || []);
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, fromDate, toDate, reloadToken]);

  const filteredDocuments = documents;

  const getTypeLabel = (t: StockDocument["type"]) => {
    switch (t) {
      case "ENTRY":
        return "Entrée";
      case "OUT":
        return "Sortie";
      case "TRANSFER":
        return "Transfert";
      case "INVENTORY":
        return "Inventaire";
      default:
        return t;
    }
  };

  const getStatusChip = (status: StockDocument["status"]) => {
    if (status === "POSTED") {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
          Confirmé
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
        Brouillon
      </span>
    );
  };

  const formatDate = (value: unknown) =>
    formatDateTimeSafe(value).split(",")[0];

  const formatQtyByUnit = (lines: any[]) => {
    const byUnit = new Map<string, number>();
    for (const line of lines || []) {
      const product = productsById.get(String(line?.productId || ""));
      const unit = String(product?.baseUnit || product?.unit || "unité");
      const qty = Number(line?.quantity || 0);
      byUnit.set(unit, (byUnit.get(unit) || 0) + qty);
    }
    return Array.from(byUnit.entries())
      .map(([unit, qty]) => `${qty} ${unit}`)
      .join(" · ");
  };

  const renderTable = () => (
    <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Document
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Type
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Date
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Lignes
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Utilisateur
            </th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Statut
            </th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {loadingDocs ? (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-10 text-center text-slate-400 text-sm"
              >
                Chargement des documents...
              </td>
            </tr>
          ) : filteredDocuments.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-10 text-center text-slate-400 text-sm"
              >
                Aucun document d'inventaire trouvé.
              </td>
            </tr>
          ) : (
            filteredDocuments.map((doc) => {
              const totalLines = doc.lines.length;
              const qtyByUnit = formatQtyByUnit(doc.lines);
              return (
                <tr
                  key={doc.id}
                  className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                    {doc.code || "—"}
                    {doc.note && (
                      <div className="text-[11px] text-slate-400 line-clamp-1">
                        {doc.note}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {getTypeLabel(doc.type)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {formatDate(doc.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {totalLines} lignes
                    {qtyByUnit ? ` · ${qtyByUnit}` : ""}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {doc.userName || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {getStatusChip(doc.status)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedDoc(doc)}
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-xs font-black text-slate-700 hover:bg-slate-200"
                      >
                        Lignes
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditDocument(doc)}
                        className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-black text-indigo-700 hover:bg-indigo-100"
                      >
                        Modifier
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  const renderCards = () => (
    <div className="md:hidden space-y-3">
      {loadingDocs ? (
        <div className="text-center text-slate-400 text-sm py-6">
          Chargement des documents...
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center text-slate-400 text-sm py-6">
          Aucun document d'inventaire trouvé.
        </div>
      ) : (
        filteredDocuments.map((doc) => {
          const totalLines = doc.lines.length;
          const qtyByUnit = formatQtyByUnit(doc.lines);
          return (
            <div
              key={doc.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase">
                    {getTypeLabel(doc.type)}
                  </p>
                  <p className="text-sm font-bold text-slate-800">
                    {doc.code || "—"}
                  </p>
                </div>
                {getStatusChip(doc.status)}
              </div>
              <p className="text-[11px] text-slate-500 mb-1">
                {formatDate(doc.createdAt)}
              </p>
              {doc.note && (
                <p className="text-[11px] text-slate-500 mb-1 line-clamp-2">
                  {doc.note}
                </p>
              )}
              <p className="text-[11px] text-slate-600">
                {totalLines} lignes
                {qtyByUnit ? ` · ${qtyByUnit}` : ""}
              </p>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDoc(doc)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-xs font-black text-slate-700 hover:bg-slate-200"
                >
                  Lignes
                </button>
                <button
                  type="button"
                  onClick={() => onEditDocument(doc)}
                  className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-xs font-black text-indigo-700 hover:bg-indigo-100"
                >
                  Modifier
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <div className="touch-management-page p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 className="text-xl md:text-2xl font-bold text-slate-800">
            Documents d'inventaire
          </h3>
          <p className="text-xs md:text-sm text-slate-500">
            Toutes les entrées, sorties, transferts et inventaires sont tracés
            par des documents. Aucun stock n'est modifié directement.
          </p>
        </div>
        <button
          className="w-full md:w-auto inline-flex items-center justify-center px-4 py-3 rounded-2xl bg-indigo-600 text-white text-sm md:text-base font-semibold shadow hover:bg-indigo-700 active:scale-[0.98] transition"
          onClick={openCreateStockMovement}
        >
          + Nouveau document
        </button>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-3 py-3 md:px-4 md:py-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Date de début
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs md:text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Date de fin
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs md:text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Type de document
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs md:text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Tous</option>
              <option value="ENTRY">Entrée</option>
              <option value="OUT">Sortie</option>
              <option value="TRANSFER">Transfert</option>
              <option value="INVENTORY">Inventaire</option>
            </select>
          </div>
        </div>
      </div>

      {renderTable()}
      {renderCards()}

      {selectedDoc && (
        <div className="fixed inset-0 z-[180] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-3xl border border-slate-200 shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="app-modal-header px-5 py-4">
              <div>
                <h4 className="app-modal-title-sm">
                  Lignes document {selectedDoc.code || selectedDoc.id}
                </h4>
                <p className="text-[11px] text-slate-500">
                  Type: {getTypeLabel(selectedDoc.type)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="app-modal-btn app-modal-btn-secondary"
              >
                Fermer
              </button>
            </div>
            <div className="p-4 overflow-auto space-y-2">
              {(selectedDoc.lines || []).map((line) => {
                const p = productsById.get(String(line.productId || ""));
                const unit = String(p?.baseUnit || p?.unit || "unité");
                return (
                  <div
                    key={line.id}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <div className="md:col-span-5">
                      <p className="text-xs font-black text-slate-800">
                        {p?.name || line.productId}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {line.variantId || "-"}
                      </p>
                    </div>
                    <div className="md:col-span-3 text-xs font-bold text-slate-700">
                      {line.quantity} {unit}
                    </div>
                    <div className="md:col-span-2 text-[11px] text-slate-600">
                      {line.note || "-"}
                    </div>
                    <div className="md:col-span-2 text-right">
                      <button
                        type="button"
                        disabled={lineBusyId === line.id || (selectedDoc.lines || []).length <= 1}
                        onClick={async () => {
                          try {
                            setLineBusyId(line.id);
                            const saved = await onDeleteDocumentLine(
                              selectedDoc.id,
                              line.id,
                            );
                            if (saved) {
                              setSelectedDoc(saved);
                              await loadDocuments();
                            }
                          } finally {
                            setLineBusyId(null);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white text-[11px] font-black text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                      >
                        {lineBusyId === line.id ? "..." : "Supprimer"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockManagement;
