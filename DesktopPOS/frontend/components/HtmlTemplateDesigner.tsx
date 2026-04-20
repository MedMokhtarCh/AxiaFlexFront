import React, { useEffect, useMemo, useRef } from "react";
import grapesjs, { Editor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";

type Props = {
  open: boolean;
  title: string;
  initialHtml: string;
  initialCss?: string;
  logoPreviewUrl?: string;
  onClose: () => void;
  onSave: (html: string, css: string) => void;
};

const HtmlTemplateDesigner: React.FC<Props> = ({
  open,
  title,
  initialHtml,
  initialCss = "",
  logoPreviewUrl = "",
  onClose,
  onSave,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const blocksRef = useRef<HTMLDivElement | null>(null);
  const stylesRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const styleRef = useRef<string>(initialCss || "");

  const seededHtml = useMemo(() => {
    const base = initialHtml || "<div style='padding:12px'>Nouveau template</div>";
    // Replace {{logoSrc}} with actual preview URL inside the canvas
    if (logoPreviewUrl) {
      return base.replace(/\{\{\s*logoSrc\s*\}\}/g, logoPreviewUrl);
    }
    return base;
  }, [initialHtml, logoPreviewUrl]);

  useEffect(() => {
    if (
      !open ||
      !mountRef.current ||
      !blocksRef.current ||
      !stylesRef.current ||
      editorRef.current
    )
      return;
    const editor = grapesjs.init({
      container: mountRef.current,
      fromElement: false,
      height: "100%",
      width: "auto",
      storageManager: false,
      panels: { defaults: [] },
      blockManager: {
        appendTo: blocksRef.current,
      },
      styleManager: {
        appendTo: stylesRef.current,
        clearProperties: true,
      },
    });
    editorRef.current = editor;
    const bm = editor.BlockManager;
    bm.add("ticket-header", {
      label: "Header Ticket",
      category: "Ticket",
      content:
        "<div style='text-align:center;padding:8px;border-bottom:1px dashed #cbd5e1'><h2 style='margin:0'>{{restaurantName}}</h2><div>{{headerText}}</div><div>Ticket: {{ticketCode}}</div><div>Date: {{createdAt}}</div></div>",
    });
    bm.add("ticket-order-meta", {
      label: "Meta Commande",
      category: "Ticket",
      content:
        "<div style='padding:8px'><div>Commande: {{orderNumber}}</div><div>Table: {{tableNumber}}</div><div>Serveur: {{serverName}}</div><div>Type: {{orderType}}</div></div>",
    });
    bm.add("ticket-items", {
      label: "Lignes Articles",
      category: "Ticket",
      content:
        "<div style='padding:8px;border-top:1px dashed #cbd5e1;border-bottom:1px dashed #cbd5e1'><pre style='margin:0;white-space:pre-wrap'>{{itemsLines}}</pre></div>",
    });
    bm.add("ticket-totals", {
      label: "Totaux",
      category: "Ticket",
      content:
        "<div style='padding:8px'><div>Sous-total: {{subtotal}} {{currency}}</div><div>Remise: {{discount}} {{currency}}</div><div>Timbre: {{timbre}} {{currency}}</div><div style='font-weight:700'>Total: {{total}} {{currency}}</div></div>",
    });
    bm.add("ticket-footer", {
      label: "Footer",
      category: "Ticket",
      content:
        "<div style='text-align:center;padding:8px;border-top:1px dashed #cbd5e1'>{{footerText}}</div>",
    });
    bm.add("ticket-logo", {
      label: "Logo",
      category: "Ticket",
      content:
        "<div style='text-align:center;padding:6px'><img src='{{logoSrc}}' alt='logo' style='width:56px;height:56px;border-radius:50%;object-fit:cover;border:1px solid #e2e8f0' /></div>",
    });
    bm.add("kitchen-compact", {
      label: "Bon Cuisine Compact",
      category: "Production",
      content: [
        "<div style='font-family:Arial,sans-serif;font-size:12px;color:#111827;padding:8px;border:1px solid #d1d5db;border-radius:8px'>",
        "  <div style='text-align:center;font-weight:900;font-size:15px;margin-bottom:6px'>{{title}}</div>",
        "  <div style='font-size:11px;color:#374151'>Commande #{{orderRef}}</div>",
        "  <div style='font-size:11px;color:#374151'>Type: {{orderType}}</div>",
        "  <div style='font-size:11px;color:#374151'>Table: {{tableNumber}}</div>",
        "  <div style='font-size:11px;color:#374151'>Serveur: {{serverName}}</div>",
        "  <div style='font-size:11px;color:#374151'>Heure: {{createdAt}}</div>",
        "  <hr style='border:none;border-top:1px dashed #cbd5e1;margin:8px 0'/>",
        "  <pre style='margin:0;white-space:pre-wrap;font-family:Arial,sans-serif;font-weight:700'>{{itemsLines}}</pre>",
        "  <hr style='border:none;border-top:1px dashed #cbd5e1;margin:8px 0'/>",
        "  <div style='font-size:11px;color:#475569'>{{footerText}}</div>",
        "</div>",
      ].join(""),
    });
    bm.add("bar-compact", {
      label: "Bon Bar Compact",
      category: "Production",
      content: [
        "<div style='font-family:Arial,sans-serif;font-size:12px;color:#0f172a;padding:8px;border:1px solid #d1d5db;border-radius:8px'>",
        "  <div style='text-align:center;font-weight:900;font-size:15px;margin-bottom:6px'>{{title}}</div>",
        "  <div style='font-size:11px;color:#334155'>Commande #{{orderRef}}</div>",
        "  <div style='font-size:11px;color:#334155'>Type: {{orderType}}</div>",
        "  <div style='font-size:11px;color:#334155'>Table: {{tableNumber}}</div>",
        "  <div style='font-size:11px;color:#334155'>Serveur: {{serverName}}</div>",
        "  <div style='font-size:11px;color:#334155'>Heure: {{createdAt}}</div>",
        "  <hr style='border:none;border-top:1px dashed #cbd5e1;margin:8px 0'/>",
        "  <pre style='margin:0;white-space:pre-wrap;font-family:Arial,sans-serif;font-weight:700'>{{itemsLines}}</pre>",
        "  <hr style='border:none;border-top:1px dashed #cbd5e1;margin:8px 0'/>",
        "  <div style='font-size:11px;color:#475569'>{{footerText}}</div>",
        "</div>",
      ].join(""),
    });
    bm.add("client-modern-card", {
      label: "Ticket Client Moderne",
      category: "Client",
      content: [
        "<div style='font-family:Arial,sans-serif;font-size:12px;color:#0f172a;padding:10px;border:1px solid #dbe2ea;border-radius:12px'>",
        "  <div style='text-align:center'>",
        "    <div style='font-size:20px;font-weight:900'>{{restaurantName}}</div>",
        "    <div style='font-size:11px;color:#475569'>{{createdAt}}</div>",
        "    <div style='font-size:11px;color:#475569'>Ticket: {{ticketCode}}</div>",
        "    <div style='font-size:11px;color:#475569'>Table: {{tableNumber}} | Serveur: {{serverName}}</div>",
        "  </div>",
        "  <hr style='border:none;border-top:1px dashed #cbd5e1;margin:8px 0'/>",
        "  <pre style='margin:0;white-space:pre-wrap;font-family:Arial,sans-serif'>{{itemsLines}}</pre>",
        "  <hr style='border:none;border-top:1px dashed #cbd5e1;margin:8px 0'/>",
        "  <div>Sous-total: {{subtotal}} {{currency}}</div>",
        "  <div>Timbre: {{timbre}} {{currency}}</div>",
        "  <div style='font-size:15px;font-weight:900;color:#1d4ed8'>Total: {{total}} {{currency}}</div>",
        "  <div style='text-align:center;margin-top:8px;color:#475569'>{{footerText}}</div>",
        "</div>",
      ].join(""),
    });
    bm.add("items-table-client", {
      label: "Tableau Articles (Client)",
      category: "Ticket",
      content: [
        "<div style='padding:8px;font-family:Courier New, monospace;font-size:12px'>",
        "  <div style='display:flex;justify-content:space-between;font-weight:700;border-bottom:1px dashed #cbd5e1;padding-bottom:4px;margin-bottom:4px'>",
        "    <span style='width:20%'>Qte</span>",
        "    <span style='width:55%'>Designation</span>",
        "    <span style='width:25%;text-align:right'>Montant</span>",
        "  </div>",
        "  <div style='white-space:pre-wrap'>{{itemsLines}}</div>",
        "</div>",
      ].join(""),
    });
    bm.add("items-table-production", {
      label: "Tableau Articles (Prod)",
      category: "Production",
      content: [
        "<div style='padding:8px;font-family:Courier New, monospace;font-size:12px'>",
        "  <div style='display:flex;justify-content:space-between;font-weight:700;border-bottom:1px dashed #cbd5e1;padding-bottom:4px;margin-bottom:4px'>",
        "    <span style='width:20%'>Qte</span>",
        "    <span style='width:80%'>Designation / Note</span>",
        "  </div>",
        "  <div style='white-space:pre-wrap'>{{itemsLines}}</div>",
        "</div>",
      ].join(""),
    });
    bm.add("line-item-example", {
      label: "Ligne Exemple Alignée",
      category: "Ticket",
      content:
        "<div style='display:flex;justify-content:space-between;font-family:Courier New, monospace;font-size:12px'><span style='width:20%'>2</span><span style='width:55%'>Eau minerale 1L</span><span style='width:25%;text-align:right'>8.000</span></div>",
    });
    editor.setComponents(seededHtml);
    if (initialCss) editor.setStyle(initialCss);
    const style = editor.getStyle() as unknown as string;
    styleRef.current = String(style || "");
    editor.on("style:property:update", () => {
      const s = editor.getStyle() as unknown as string;
      styleRef.current = String(s || "");
    });
    editor.on("component:update", () => {
      const s = editor.getStyle() as unknown as string;
      styleRef.current = String(s || "");
    });
    return () => {
      try {
        editor.destroy();
      } catch {
        // ignore
      }
      editorRef.current = null;
    };
  }, [open, seededHtml, initialCss]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/40 p-4 sm:p-8">
      <div className="mx-auto h-full max-w-[1200px] rounded-2xl bg-white border border-slate-200 shadow-xl flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <p className="text-sm font-black text-slate-800">{title}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-black text-slate-600"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={() => {
                const editor = editorRef.current;
                if (!editor) return;
                let html = editor.getHtml();
                const css = editor.getCss();
                // Restore {{logoSrc}} placeholder (was substituted with preview URL for canvas display)
                if (logoPreviewUrl) {
                  html = String(html || "").replace(
                    new RegExp(logoPreviewUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
                    "{{logoSrc}}",
                  );
                }
                onSave(String(html || ""), String(css || styleRef.current || ""));
              }}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-black"
            >
              Enregistrer
            </button>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-slate-100 text-[11px] font-bold text-slate-500">
          Glisse les blocs "Ticket" depuis le panneau gauche (header, meta, items, totaux, footer, logo).
        </div>
        <div className="flex-1 min-h-0 grid grid-cols-12">
          <div className="col-span-3 border-r border-slate-200 min-h-0 overflow-auto">
            <div className="px-3 py-2 text-[11px] font-black uppercase text-slate-500 border-b border-slate-100">
              Blocs
            </div>
            <div ref={blocksRef} className="p-2" />
          </div>
          <div className="col-span-6 min-h-0 bg-slate-800">
            <div ref={mountRef} className="h-full" />
          </div>
          <div className="col-span-3 border-l border-slate-200 min-h-0 overflow-auto">
            <div className="px-3 py-2 text-[11px] font-black uppercase text-slate-500 border-b border-slate-100">
              Styles
            </div>
            <div ref={stylesRef} className="p-2" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HtmlTemplateDesigner;

