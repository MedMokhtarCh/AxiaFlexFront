import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Search,
  Filter,
  Package,
  Image as ImageIcon,
  Tags,
  ChefHat,
} from "lucide-react";
import {
  Product,
  Category,
  ProductStockType,
  Warehouse,
  StockMovement,
  Printer,
} from "../types";
import { isReceiptPrinter, printerBonProfile } from "../utils/printerUtils";

interface ProductManagementProps {
  products: Product[];
  categories: Category[];
  warehouses: Warehouse[];
  stockMovements: StockMovement[];
  settings: any;
  printers: Printer[];
  addProduct: (p: any) => Promise<void>;
  updateProduct: (id: string, p: any) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  uploadProductImage: (file: File) => Promise<string | null>;
  showToast: (msg: string, kind?: "success" | "error" | "info") => void;
}

const ProductManagement: React.FC<ProductManagementProps> = ({
  products,
  categories,
  warehouses,
  stockMovements,
  settings,
  printers,
  addProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  showToast,
}) => {
  // List state
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [onlyVisible, setOnlyVisible] = useState(false);
  const [warehouseFilterId, setWarehouseFilterId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [page, setPage] = useState(1);
  const pageSize = 18;
  const [sortBy, setSortBy] = useState<
    "name-asc" | "name-desc" | "price-asc" | "price-desc" | "stock-asc" | "stock-desc"
  >("name-asc");
  const FILTERS_STORAGE_KEY = "pos.productManagement.filters.v1";

  // Modal + form state
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isPack, setIsPack] = useState(false);
  const [manageStock, setManageStock] = useState(true);
  const [visibleInPos, setVisibleInPos] = useState(true);
  const [favorite, setFavorite] = useState(false);
  const [unit, setUnit] = useState<string>("unit");
  const [baseUnit, setBaseUnit] = useState<string>("unit");
  const [alertLevel, setAlertLevel] = useState<string>("");
  const [promotionPrice, setPromotionPrice] = useState<string>("");
  const [promoStart, setPromoStart] = useState<string>("");
  const [promoEnd, setPromoEnd] = useState<string>("");

  // Stock configuration
  const [stockType, setStockType] = useState<ProductStockType>("AUCUN");
  const [initialQty, setInitialQty] = useState<string>("0");
  const [serialNumbers, setSerialNumbers] = useState<string[]>([]);
  const [lotNumber, setLotNumber] = useState<string>("");
  const [lotCreation, setLotCreation] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [lotExpiry, setLotExpiry] = useState<string>("");
  const [fifoBatches, setFifoBatches] = useState<
    {
      date: string;
      quantity: string;
      expiry?: string;
    }[]
  >([]);

  // Recipe (ingredients) & variants
  const [recipeItems, setRecipeItems] = useState<
    {
      ingredientProductId: string;
      quantity: string;
      unit: string;
    }[]
  >([]);
  const [useVariants, setUseVariants] = useState(false);
  const [variants, setVariants] = useState<
    {
      id?: string;
      name: string;
      price: string;
    }[]
  >([]);

  const [errors, setErrors] = useState<{ [k: string]: string }>({});
  /** Imprimantes cuisine/bar sur lesquelles imprimer les bons de préparation pour cet article. */
  const [prepPrinterIds, setPrepPrinterIds] = useState<string[]>([]);

  const productionPrinters = useMemo(
    () => (printers || []).filter((p) => !isReceiptPrinter(p)),
    [printers],
  );
  const prepPrintersByPoste = useMemo(() => {
    const m = new Map<string, Printer[]>();
    for (const pr of productionPrinters) {
      const label = String(pr.type || "Poste").trim() || "Poste";
      if (!m.has(label)) m.set(label, []);
      m.get(label)!.push(pr);
    }
    return Array.from(m.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "fr"),
    );
  }, [productionPrinters]);

  const togglePrepPrinter = (printerId: string) => {
    setPrepPrinterIds((prev) =>
      prev.includes(printerId)
        ? prev.filter((id) => id !== printerId)
        : [...prev, printerId],
    );
  };

  const resetForm = () => {
    setCode("");
    setName("");
    setPrice("");
    setCategoryId("");
    setImageUrl("");
    setIsPack(false);
    setManageStock(true);
    setVisibleInPos(true);
    setFavorite(false);
    setUnit("unit");
    setBaseUnit("unit");
    setAlertLevel("");
    setPromotionPrice("");
    setPromoStart("");
    setPromoEnd("");
    setStockType("AUCUN");
    setInitialQty("0");
    setSerialNumbers([]);
    setLotNumber("");
    setLotCreation(new Date().toISOString().slice(0, 10));
    setLotExpiry("");
    setFifoBatches([]);
    setRecipeItems([]);
    setUseVariants(false);
    setVariants([]);
    setPrepPrinterIds([]);
    setErrors({});
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setCode(p.code || "");
    setName(p.name || "");
    setPrice(p.price != null ? String(p.price) : "");
    setCategoryId(p.category || "");
    setImageUrl(p.imageUrl || "");
    setIsPack(!!p.isPack);
    setManageStock(!!p.manageStock);
    setStockType(p.stockType || (p.manageStock ? "SIMPLE" : "AUCUN"));
    setInitialQty(
      p.stock !== undefined && p.stock !== null ? String(p.stock) : "0",
    );
    setVisibleInPos(p.visibleInPos ?? true);
    setFavorite(!!p.favorite);
    setUnit(p.unit || "unit");
    setBaseUnit(p.baseUnit || p.unit || "unit");
    setAlertLevel(
      p.alertLevel !== undefined && p.alertLevel !== null
        ? String(p.alertLevel)
        : "",
    );
    setPromotionPrice(
      p.promotionPrice !== undefined && p.promotionPrice !== null
        ? String(p.promotionPrice)
        : "",
    );
    setPromoStart(
      p.promoStart ? new Date(p.promoStart).toISOString().slice(0, 16) : "",
    );
    setPromoEnd(
      p.promoEnd ? new Date(p.promoEnd).toISOString().slice(0, 16) : "",
    );
    setSerialNumbers([]);
    setLotNumber("");
    setLotCreation(new Date().toISOString().slice(0, 10));
    setLotExpiry("");
    setFifoBatches([]);
    setRecipeItems(
      (p.recipe || []).map((r) => ({
        ingredientProductId: r.ingredientProductId,
        quantity: String(r.quantity),
        unit: r.unit,
      })),
    );
    setUseVariants(!!(p.variants && p.variants.length > 0));
    setVariants(
      (p.variants || []).map((v) => ({
        id: v.id,
        name: v.name,
        price: String(v.price),
      })),
    );
    setPrepPrinterIds(
      Array.isArray(p.printerIds) ? [...p.printerIds] : [],
    );
    setErrors({});
    setShowModal(true);
  };

  const filteredProducts = useMemo(() => {
    const rows = products
      .filter((p) =>
        search
          ? (p.name + (p.code || ""))
              .toLowerCase()
              .includes(search.toLowerCase())
          : true,
      )
      .filter((p) => (categoryFilter ? p.category === categoryFilter : true))
      .filter((p) => (onlyVisible ? p.visibleInPos !== false : true))
      // Quand un dépôt est sélectionné, on ne montre que les articles suivis en stock.
      .filter((p) => (warehouseFilterId ? Boolean(p.manageStock) : true));
    rows.sort((a, b) => {
      if (sortBy === "name-asc") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sortBy === "name-desc") return String(b.name || "").localeCompare(String(a.name || ""));
      if (sortBy === "price-asc") return Number(a.price || 0) - Number(b.price || 0);
      if (sortBy === "price-desc") return Number(b.price || 0) - Number(a.price || 0);
      if (sortBy === "stock-asc") return Number(a.stock || 0) - Number(b.stock || 0);
      if (sortBy === "stock-desc") return Number(b.stock || 0) - Number(a.stock || 0);
      return 0;
    });
    return rows;
  }, [products, search, categoryFilter, onlyVisible, warehouseFilterId, sortBy]);
  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, onlyVisible, warehouseFilterId, sortBy, viewMode]);
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const pagedProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page]);

  const stockByProductWarehouse = useMemo(() => {
    const map = new Map<string, number>();
    for (const mv of stockMovements || []) {
      const pid = String(mv.productId || "");
      if (!pid) continue;
      const wid = String(mv.warehouseId || "");
      const key = `${pid}::${wid}`;
      const qty = Number(mv.quantity || 0);
      const signed = String(mv.type || "").toUpperCase() === "OUT" ? -qty : qty;
      map.set(key, Number((map.get(key) || 0) + signed));
    }
    return map;
  }, [stockMovements]);

  const getWarehouseStock = (productId: string, warehouseId: string) => {
    const key = `${productId}::${warehouseId}`;
    return Number(stockByProductWarehouse.get(key) || 0);
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setSearch(String(parsed.search || ""));
      setCategoryFilter(String(parsed.categoryFilter || ""));
      setOnlyVisible(Boolean(parsed.onlyVisible));
      setWarehouseFilterId(String(parsed.warehouseFilterId || ""));
      setSortBy(
        ([
          "name-asc",
          "name-desc",
          "price-asc",
          "price-desc",
          "stock-asc",
          "stock-desc",
        ] as const).includes(parsed.sortBy)
          ? parsed.sortBy
          : "name-asc",
      );
      setViewMode(parsed.viewMode === "cards" ? "cards" : "table");
    } catch {
      // ignore persisted filters parse errors
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      FILTERS_STORAGE_KEY,
      JSON.stringify({
        search,
        categoryFilter,
        onlyVisible,
        warehouseFilterId,
        sortBy,
        viewMode,
      }),
    );
  }, [search, categoryFilter, onlyVisible, warehouseFilterId, sortBy, viewMode]);

  const validateForm = () => {
    const newErrors: { [k: string]: string } = {};
    if (!name.trim()) newErrors.name = "Nom requis";
    if (!price.trim() || isNaN(Number(price)))
      newErrors.price = "Prix invalide";

    // Stock validation
    const qty = Number(initialQty || "0");
    const minAlertNum = Number(alertLevel || "0");

    if (stockType !== "AUCUN") {
      if (isNaN(qty) || qty < 0) {
        newErrors.initialQty = "Quantité initiale invalide";
      }
      if (isNaN(minAlertNum) || minAlertNum < 0) {
        newErrors.alertLevel = "Seuil minimum invalide";
      } else if (!newErrors.initialQty && minAlertNum > qty) {
        newErrors.alertLevel = "Le seuil doit être ≤ quantité initiale";
      }
    }

    if (stockType === "SERIAL") {
      const expected = Math.max(0, qty);
      if (!newErrors.initialQty && expected <= 0) {
        newErrors.initialQty =
          "Quantité initiale > 0 requise pour les numéros de série";
      }
      const trimmed = serialNumbers.map((s) => s.trim());
      if (trimmed.length !== expected) {
        newErrors.serials = `Vous devez saisir ${expected} numéros de série`;
      } else if (trimmed.some((s) => !s)) {
        newErrors.serials = "Tous les numéros de série sont requis";
      } else {
        const set = new Set(trimmed);
        if (set.size !== trimmed.length) {
          newErrors.serials = "Les numéros de série doivent être uniques";
        }
      }
    }

    if (stockType === "LOT") {
      if (!lotNumber.trim()) newErrors.lotNumber = "Numéro de lot requis";
      if (!lotCreation) newErrors.lotCreation = "Date de création requise";
      if (!lotExpiry) newErrors.lotExpiry = "Date d'expiration requise";
      if (lotCreation && lotExpiry) {
        if (new Date(lotExpiry) <= new Date(lotCreation)) {
          newErrors.lotExpiry =
            "La date d'expiration doit être après la date de création";
        }
      }
    }

    if (stockType === "FIFO") {
      if (!fifoBatches.length) {
        newErrors.fifo = "Au moins un lot est requis";
      }
      let total = 0;
      fifoBatches.forEach((b, idx) => {
        const q = Number(b.quantity || "0");
        if (!b.date) newErrors[`fifo_date_${idx}`] = "Date requise";
        if (isNaN(q) || q <= 0)
          newErrors[`fifo_qty_${idx}`] = "Quantité invalide";
        total += isNaN(q) ? 0 : q;
      });
      if (!newErrors.initialQty && total !== qty) {
        newErrors.fifoTotal = `Total des lots (${total}) différent de la quantité initiale (${qty})`;
      }
    }

    // Recipe validation
    if (recipeItems.length) {
      recipeItems.forEach((item, idx) => {
        if (!item.ingredientProductId) {
          newErrors[`recipe_product_${idx}`] = "Ingrédient requis";
        }
        const q = Number(item.quantity || "0");
        if (isNaN(q) || q <= 0) {
          newErrors[`recipe_qty_${idx}`] = "Quantité invalide";
        }
        if (!item.unit.trim()) {
          newErrors[`recipe_unit_${idx}`] = "Unité requise";
        }
        if (
          editingProduct &&
          item.ingredientProductId &&
          item.ingredientProductId === editingProduct.id
        ) {
          newErrors.recipe =
            "Un article ne peut pas être utilisé comme ingrédient de lui-même";
        }
      });
    }

    // Variants validation
    if (useVariants) {
      if (!variants.length) {
        newErrors.variants = "Ajoutez au moins une variante";
      }
      variants.forEach((v, idx) => {
        if (!v.name.trim()) {
          newErrors[`variant_name_${idx}`] = "Nom requis";
        }
        const vp = Number(v.price || "0");
        if (isNaN(vp) || vp < 0) {
          newErrors[`variant_price_${idx}`] = "Prix invalide";
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    const qty = Number(initialQty || "0");
    const payload: any = {
      code: code || undefined,
      name: name.trim(),
      price: Number(price) || 0,
      category: categoryId || "",
      imageUrl,
      isPack,
      manageStock: stockType !== "AUCUN",
      stockType,
      stock: stockType === "AUCUN" ? 0 : qty,
      visibleInPos,
      favorite,
      unit,
      baseUnit,
      alertLevel:
        stockType === "AUCUN" || !alertLevel ? null : Number(alertLevel),
      promotionPrice: promotionPrice ? Number(promotionPrice) : undefined,
      promoStart: promoStart ? new Date(promoStart).getTime() : undefined,
      promoEnd: promoEnd ? new Date(promoEnd).getTime() : undefined,
      printerIds: prepPrinterIds.filter((id) =>
        productionPrinters.some((pr) => pr.id === id),
      ),
      initialSerialNumbers:
        stockType === "SERIAL" ? serialNumbers.map((s) => s.trim()) : undefined,
      initialLot:
        stockType === "LOT"
          ? {
              lotNumber: lotNumber.trim(),
              creationDate: lotCreation,
              expiryDate: lotExpiry,
              quantity: qty,
            }
          : undefined,
      initialFifoBatches:
        stockType === "FIFO"
          ? fifoBatches.map((b) => ({
              date: b.date,
              quantity: Number(b.quantity || "0"),
              expiry: b.expiry || null,
            }))
          : undefined,
      recipe:
        recipeItems.length > 0
          ? recipeItems
              .filter((r) => r.ingredientProductId)
              .map((r) => ({
                ingredientProductId: r.ingredientProductId,
                quantity: Number(r.quantity || "0"),
                unit: r.unit,
              }))
          : [],
      variants: useVariants
        ? variants
            .filter((v) => v.name.trim())
            .map((v, idx) => ({
              id:
                v.id ||
                `var-${editingProduct ? editingProduct.id : "new"}-${idx}`,
              name: v.name.trim(),
              price: Number(v.price || "0"),
            }))
        : [],
    };

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
        showToast("Article mis à jour", "success");
      } else {
        await addProduct(payload);
        showToast("Article créé", "success");
      }
      setShowModal(false);
      resetForm();
    } catch (err) {
      showToast("Erreur lors de l'enregistrement", "error");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProduct(id);
      showToast("Article supprimé", "success");
    } catch (err) {
      showToast("Erreur lors de la suppression", "error");
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      setUploadingImage(true);
      const url = await uploadProductImage(file);
      if (url) {
        setImageUrl(url);
        showToast("Image uploadée", "success");
      } else {
        showToast("Upload échoué", "error");
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Upload échoué";
      showToast(msg, "error");
    } finally {
      setUploadingImage(false);
    }
  };

  const currentCategoryName = (catId: string) =>
    categories.find((c) => c.id === catId)?.name || "-";

  return (
    <div className="touch-management-page p-6 space-y-4">
      {/* Header / Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="text-indigo-600" />
            Articles
          </h3>
          <p className="text-sm text-slate-500">
            Gérez votre catalogue produits, visuels et promotions.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom ou code"
              className="pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-w-55"
            />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-w-35"
            >
              <option value="">Toutes catégories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            >
              <option value="name-asc">Nom A→Z</option>
              <option value="name-desc">Nom Z→A</option>
              <option value="price-asc">Prix croissant</option>
              <option value="price-desc">Prix décroissant</option>
              <option value="stock-asc">Stock croissant</option>
              <option value="stock-desc">Stock décroissant</option>
            </select>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={onlyVisible}
                onChange={(e) => setOnlyVisible(e.target.checked)}
                className="rounded"
              />
              Visible dans POS
            </label>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCategoryFilter("");
                setOnlyVisible(false);
                setWarehouseFilterId("");
                setSortBy("name-asc");
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              Réinitialiser
            </button>
          </div>
          <button
            onClick={openCreateModal}
            className="sm:ml-2 inline-flex items-center justify-center px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow hover:bg-indigo-700 transition"
          >
            + Nouvel article
          </button>
          <select
            value={warehouseFilterId}
            onChange={(e) => setWarehouseFilterId(e.target.value)}
            className="sm:ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
          >
            <option value="">Vue globale (tous dépôts)</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} - {w.name}
              </option>
            ))}
          </select>
          <div className="sm:ml-2 inline-flex rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`px-3 py-2 rounded-lg text-xs font-black ${viewMode === "table" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Tableau
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`px-3 py-2 rounded-lg text-xs font-black ${viewMode === "cards" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Cartes
            </button>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 font-bold">
          {filteredProducts.length} article(s)
        </span>
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold"
          >
            Recherche: {search} ×
          </button>
        ) : null}
        {categoryFilter ? (
          <button
            type="button"
            onClick={() => setCategoryFilter("")}
            className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold"
          >
            Catégorie: {currentCategoryName(categoryFilter)} ×
          </button>
        ) : null}
        {onlyVisible ? (
          <button
            type="button"
            onClick={() => setOnlyVisible(false)}
            className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold"
          >
            Visible POS ×
          </button>
        ) : null}
        {warehouseFilterId ? (
          <button
            type="button"
            onClick={() => setWarehouseFilterId("")}
            className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold"
          >
            Dépôt: {warehouses.find((w) => w.id === warehouseFilterId)?.code || "?"} ×
          </button>
        ) : null}
        {warehouseFilterId ? (
          <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 font-bold">
            Articles suivis en stock uniquement
          </span>
        ) : null}
      </div>

      {/* Table */}
      {viewMode === "table" && (
      <div className="touch-management-table overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Produit
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Catégorie
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Prix
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Stock
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                POS
              </th>
              <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-slate-400 text-sm"
                >
                  Aucun article ne correspond à votre recherche.
                </td>
              </tr>
            ) : (
              pagedProducts.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon size={18} className="text-slate-400" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800 line-clamp-1">
                          {p.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {p.code || "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {currentCategoryName(p.category)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-slate-800">
                    {Number(p.price ?? 0).toFixed(2)}
                    <span className="text-[11px] text-slate-400 ml-1">
                      {settings.currency || "DT"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {p.manageStock && p.stock !== undefined ? (
                      <div
                        className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium ${
                          p.stock <= (p.alertLevel || 0)
                            ? "bg-red-50 text-red-600"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        Total: {p.stock} {p.baseUnit || p.unit || "unité"}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        Stock non suivi
                      </span>
                    )}
                    {p.manageStock && p.stock !== undefined && warehouseFilterId ? (
                      <div className="mt-1 text-[10px] font-black text-indigo-600">
                        Dépôt: {getWarehouseStock(p.id, warehouseFilterId)}{" "}
                        {p.baseUnit || p.unit || "unité"}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {p.visibleInPos === false ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500">
                        Caché
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700">
                        Visible
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-black hover:bg-indigo-100"
                        onClick={() => openEditModal(p)}
                      >
                        Modifier
                      </button>
                      <button
                        className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-black hover:bg-rose-100"
                        onClick={() => handleDelete(p.id)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}
      {viewMode === "cards" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {pagedProducts.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border border-slate-100 bg-white shadow-sm p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={18} className="text-slate-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-800 truncate">{p.name}</p>
                  <p className="text-[11px] text-slate-400">{p.code || "—"}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{currentCategoryName(p.category)}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-sm font-black text-slate-800">
                  {Number(p.price ?? 0).toFixed(2)}{" "}
                  <span className="text-[11px] text-slate-400">{settings.currency || "DT"}</span>
                </p>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium ${p.visibleInPos === false ? "bg-slate-100 text-slate-500" : "bg-indigo-50 text-indigo-700"}`}>
                  {p.visibleInPos === false ? "Caché" : "Visible"}
                </span>
              </div>
              <div className="mt-2 text-[11px]">
                {p.manageStock && p.stock !== undefined ? (
                  <>
                    <span className={`font-bold ${p.stock <= (p.alertLevel || 0) ? "text-red-600" : "text-emerald-700"}`}>
                      Total: {p.stock} {p.baseUnit || p.unit || "unité"}
                    </span>
                    {warehouseFilterId ? (
                      <p className="font-black text-indigo-600 mt-1">
                        Dépôt: {getWarehouseStock(p.id, warehouseFilterId)} {p.baseUnit || p.unit || "unité"}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <span className="text-slate-400">Stock non suivi</span>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  className="px-3 py-2 rounded-xl text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200"
                  onClick={() => openEditModal(p)}
                >
                  Modifier
                </button>
                <button
                  className="px-3 py-2 rounded-xl text-xs font-black bg-rose-50 text-rose-600 hover:bg-rose-100"
                  onClick={() => handleDelete(p.id)}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {filteredProducts.length > pageSize && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Page {page}/{totalPages} - {filteredProducts.length} articles
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40">Prec</button>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded border border-slate-200 disabled:opacity-40">Suiv</button>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="touch-management-modal fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg p-4">
          <div className="touch-management-modal-panel bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
            <div className="app-modal-header">
              <h3 className="app-modal-title">
                <Tags className="text-indigo-600" />
                {editingProduct ? "Modifier l'article" : "Nouvel article"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="app-modal-close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col md:flex-row gap-6 p-6 overflow-auto">
              {/* Left: Form */}
              <div className="flex-1 space-y-6">
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-sm font-semibold text-slate-700">
                        Nom *
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={`w-full px-4 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                          errors.name ? "border-red-300" : "border-slate-200"
                        }`}
                        placeholder="Nom de l'article"
                      />
                      {errors.name && (
                        <p className="mt-1 text-xs text-red-500">
                          {errors.name}
                        </p>
                      )}
                    </div>
                    <div className="w-40">
                      <label className="block text-sm font-semibold text-slate-700">
                        Code
                      </label>
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="w-full px-3 py-3 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="SKU / PLU"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="w-40">
                      <label className="block text-sm font-semibold text-slate-700">
                        Prix *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className={`w-full px-3 py-3 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                          errors.price ? "border-red-300" : "border-slate-200"
                        }`}
                      />
                      {errors.price && (
                        <p className="mt-1 text-xs text-red-500">
                          {errors.price}
                        </p>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-semibold text-slate-700">
                        Catégorie
                      </label>
                      <select
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                        className="w-full px-3 py-3 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      >
                        <option value="">Aucune</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-700">
                      Gestion du stock & POS
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: "AUCUN", label: "Aucun" },
                        { id: "SIMPLE", label: "En stock" },
                        { id: "FIFO", label: "FIFO" },
                        { id: "SERIAL", label: "Numéros de série" },
                        { id: "LOT", label: "Lot" },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setStockType(opt.id as ProductStockType);
                            setManageStock(opt.id !== "AUCUN");
                          }}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                            stockType === opt.id
                              ? "bg-indigo-600 text-white border-indigo-600"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3 items-center mt-1">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={visibleInPos}
                          onChange={(e) => setVisibleInPos(e.target.checked)}
                          className="rounded"
                        />
                        Visible dans POS
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={favorite}
                          onChange={(e) => setFavorite(e.target.checked)}
                          className="rounded"
                        />
                        Article favori
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={isPack}
                          onChange={(e) => setIsPack(e.target.checked)}
                          className="rounded"
                        />
                        Article pack
                      </label>
                    </div>
                    <div className="pt-3 mt-2 border-t border-slate-100 space-y-2">
                      <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <ChefHat size={16} className="text-amber-600" />
                        Préparation (postes d&apos;impression)
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Cochez les imprimantes sur lesquelles envoyer ce produit.
                        Les postes et modèles de bon sont configurés dans
                        Paramètres → Matériel.
                      </p>
                      {prepPrintersByPoste.length === 0 ? (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                          Aucune imprimante de préparation. Ajoutez des postes
                          (Cuisine, Bar, Terrasse, etc.) dans Paramètres →
                          Matériel.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {prepPrintersByPoste.map(([poste, list]) => (
                            <div
                              key={poste}
                              className="rounded-xl border border-slate-200 bg-white p-3 space-y-2"
                            >
                              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                                <ChefHat size={14} className="text-amber-600" />
                                {poste}
                              </p>
                              <div className="space-y-1.5">
                                {list.map((pr) => (
                                  <label
                                    key={pr.id}
                                    className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      className="rounded border-slate-300"
                                      checked={prepPrinterIds.includes(pr.id)}
                                      onChange={() =>
                                        togglePrepPrinter(pr.id)
                                      }
                                    />
                                    <span className="truncate flex-1">
                                      {pr.name}
                                    </span>
                                    <span className="text-[10px] text-slate-400 shrink-0">
                                      {printerBonProfile(pr) === "bar"
                                        ? "bon bar"
                                        : "bon cuisine"}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stock configuration */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700">
                    Gestion du stock
                  </h4>
                  {stockType === "AUCUN" ? (
                    <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                      Ce produit ne sera pas suivi en inventaire.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600">
                            Quantité initiale *
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={initialQty}
                            onChange={(e) => {
                              const value = e.target.value;
                              setInitialQty(value);
                              if (stockType === "SERIAL") {
                                const n = Math.max(0, Number(value || "0"));
                                setSerialNumbers((prev) => {
                                  const copy = [...prev];
                                  if (n > copy.length) {
                                    while (copy.length < n) copy.push("");
                                  } else if (n < copy.length) {
                                    copy.length = n;
                                  }
                                  return copy;
                                });
                              }
                              if (
                                stockType === "FIFO" &&
                                fifoBatches.length === 0
                              ) {
                                const today = new Date()
                                  .toISOString()
                                  .slice(0, 10);
                                setFifoBatches([
                                  {
                                    date: today,
                                    quantity: value,
                                  },
                                ]);
                              }
                            }}
                            className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                              errors.initialQty
                                ? "border-red-300"
                                : "border-slate-200"
                            }`}
                          />
                          {errors.initialQty && (
                            <p className="mt-1 text-xs text-red-500">
                              {errors.initialQty}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600">
                            Seuil minimum *
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={alertLevel}
                            onChange={(e) => setAlertLevel(e.target.value)}
                            className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                              errors.alertLevel
                                ? "border-red-300"
                                : "border-slate-200"
                            }`}
                          />
                          {errors.alertLevel && (
                            <p className="mt-1 text-xs text-red-500">
                              {errors.alertLevel}
                            </p>
                          )}
                        </div>
                      </div>

                      {stockType === "SERIAL" && (
                        <div className="space-y-2">
                          <p className="text-xs text-slate-500">
                            Saisissez un numéro de série par unité en stock.
                          </p>
                          <div className="max-h-40 overflow-auto border border-slate-100 rounded-xl p-3 bg-slate-50">
                            {serialNumbers.map((s, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-2 mb-2 last:mb-0"
                              >
                                <span className="w-6 text-[11px] text-slate-500">
                                  #{idx + 1}
                                </span>
                                <input
                                  type="text"
                                  value={s}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setSerialNumbers((prev) => {
                                      const copy = [...prev];
                                      copy[idx] = value;
                                      return copy;
                                    });
                                  }}
                                  className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
                                  placeholder="Numéro de série"
                                />
                              </div>
                            ))}
                          </div>
                          {errors.serials && (
                            <p className="mt-1 text-xs text-red-500">
                              {errors.serials}
                            </p>
                          )}
                        </div>
                      )}

                      {stockType === "LOT" && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600">
                              Numéro de lot *
                            </label>
                            <input
                              type="text"
                              value={lotNumber}
                              onChange={(e) => setLotNumber(e.target.value)}
                              className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                                errors.lotNumber
                                  ? "border-red-300"
                                  : "border-slate-200"
                              }`}
                            />
                            {errors.lotNumber && (
                              <p className="mt-1 text-xs text-red-500">
                                {errors.lotNumber}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600">
                              Date de création *
                            </label>
                            <input
                              type="date"
                              value={lotCreation}
                              onChange={(e) => setLotCreation(e.target.value)}
                              className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                                errors.lotCreation
                                  ? "border-red-300"
                                  : "border-slate-200"
                              }`}
                            />
                            {errors.lotCreation && (
                              <p className="mt-1 text-xs text-red-500">
                                {errors.lotCreation}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600">
                              Date d'expiration *
                            </label>
                            <input
                              type="date"
                              value={lotExpiry}
                              onChange={(e) => setLotExpiry(e.target.value)}
                              className={`w-full px-3 py-2 rounded-xl border text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                                errors.lotExpiry
                                  ? "border-red-300"
                                  : "border-slate-200"
                              }`}
                            />
                            {errors.lotExpiry && (
                              <p className="mt-1 text-xs text-red-500">
                                {errors.lotExpiry}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {stockType === "FIFO" && (
                        <div className="space-y-2 mt-2">
                          <div className="flex items-center justify-between text-xs text-slate-600">
                            <span>Lots FIFO</span>
                            <button
                              type="button"
                              onClick={() => {
                                const today = new Date()
                                  .toISOString()
                                  .slice(0, 10);
                                setFifoBatches((prev) => [
                                  ...prev,
                                  { date: today, quantity: "0" },
                                ]);
                              }}
                              className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold"
                            >
                              + Ajouter un lot
                            </button>
                          </div>
                          <div className="max-h-40 overflow-auto border border-slate-100 rounded-xl bg-slate-50">
                            {fifoBatches.map((b, idx) => (
                              <div
                                key={idx}
                                className="grid grid-cols-7 gap-2 px-3 py-2 items-center border-b border-slate-100 last:border-0"
                              >
                                <input
                                  type="date"
                                  value={b.date}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setFifoBatches((prev) => {
                                      const copy = [...prev];
                                      copy[idx] = { ...copy[idx], date: value };
                                      return copy;
                                    });
                                  }}
                                  className={`col-span-3 px-2 py-1.5 rounded-lg border text-[11px] outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent ${
                                    errors[`fifo_date_${idx}`]
                                      ? "border-red-300"
                                      : "border-slate-200"
                                  }`}
                                />
                                <input
                                  type="number"
                                  min="0"
                                  value={b.quantity}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setFifoBatches((prev) => {
                                      const copy = [...prev];
                                      copy[idx] = {
                                        ...copy[idx],
                                        quantity: value,
                                      };
                                      return copy;
                                    });
                                  }}
                                  className={`col-span-2 px-2 py-1.5 rounded-lg border text-[11px] outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent text-right ${
                                    errors[`fifo_qty_${idx}`]
                                      ? "border-red-300"
                                      : "border-slate-200"
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFifoBatches((prev) =>
                                      prev.filter((_, i) => i !== idx),
                                    );
                                  }}
                                  className="col-span-2 text-[11px] text-red-600 hover:underline text-right"
                                >
                                  Supprimer
                                </button>
                              </div>
                            ))}
                          </div>
                          {errors.fifo && (
                            <p className="mt-1 text-xs text-red-500">
                              {errors.fifo}
                            </p>
                          )}
                          {errors.fifoTotal && (
                            <p className="mt-1 text-xs text-red-500">
                              {errors.fifoTotal}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700">
                    Paramètres avancés
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Unité
                      </label>
                      <input
                        type="text"
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="ex: unité, kg, L"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Unité de base
                      </label>
                      <input
                        type="text"
                        value={baseUnit}
                        onChange={(e) => setBaseUnit(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Recipe / Ingredients */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700">
                    Composition (recette)
                  </h4>
                  <p className="text-xs text-slate-500">
                    Définissez les ingrédients utilisés pour préparer cet
                    article (coûts et stocks).
                  </p>
                  {errors.recipe && (
                    <p className="mt-1 text-xs text-red-500">{errors.recipe}</p>
                  )}
                  <div className="space-y-2">
                    {recipeItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                      >
                        <div className="sm:col-span-6">
                          <label className="block text-[11px] font-semibold text-slate-600">
                            Ingrédient
                          </label>
                          <select
                            value={item.ingredientProductId}
                            onChange={(e) => {
                              const value = e.target.value;
                              setRecipeItems((prev) => {
                                const copy = [...prev];
                                copy[idx] = {
                                  ...copy[idx],
                                  ingredientProductId: value,
                                };
                                return copy;
                              });
                            }}
                            className={`w-full px-3 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                              errors[`recipe_product_${idx}`]
                                ? "border-red-300"
                                : "border-slate-200"
                            }`}
                          >
                            <option value="">Sélectionner un ingrédient</option>
                            {products
                              .filter(
                                (p) =>
                                  !editingProduct || p.id !== editingProduct.id,
                              )
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                          {errors[`recipe_product_${idx}`] && (
                            <p className="mt-1 text-[11px] text-red-500">
                              {errors[`recipe_product_${idx}`]}
                            </p>
                          )}
                        </div>
                        <div className="sm:col-span-3">
                          <label className="block text-[11px] font-semibold text-slate-600">
                            Quantité
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={item.quantity}
                            onChange={(e) => {
                              const value = e.target.value;
                              setRecipeItems((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], quantity: value };
                                return copy;
                              });
                            }}
                            className={`w-full px-3 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                              errors[`recipe_qty_${idx}`]
                                ? "border-red-300"
                                : "border-slate-200"
                            }`}
                          />
                          {errors[`recipe_qty_${idx}`] && (
                            <p className="mt-1 text-[11px] text-red-500">
                              {errors[`recipe_qty_${idx}`]}
                            </p>
                          )}
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-semibold text-slate-600">
                            Unité
                          </label>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => {
                              const value = e.target.value;
                              setRecipeItems((prev) => {
                                const copy = [...prev];
                                copy[idx] = { ...copy[idx], unit: value };
                                return copy;
                              });
                            }}
                            className={`w-full px-3 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                              errors[`recipe_unit_${idx}`]
                                ? "border-red-300"
                                : "border-slate-200"
                            }`}
                          />
                          {errors[`recipe_unit_${idx}`] && (
                            <p className="mt-1 text-[11px] text-red-500">
                              {errors[`recipe_unit_${idx}`]}
                            </p>
                          )}
                        </div>
                        <div className="sm:col-span-1 flex justify-end pt-5 sm:pt-0">
                          <button
                            type="button"
                            onClick={() =>
                              setRecipeItems((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                            className="text-[11px] text-red-600 hover:underline"
                          >
                            Retirer
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setRecipeItems((prev) => [
                          ...prev,
                          {
                            ingredientProductId: "",
                            quantity: "1",
                            unit: unit || baseUnit || "unit",
                          },
                        ])
                      }
                      className="px-3 py-2 rounded-xl border border-dashed border-slate-300 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      + Ajouter un ingrédient
                    </button>
                  </div>
                </div>

                {/* Variants */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-700">
                      Variantes
                    </h4>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={useVariants}
                        onChange={(e) => setUseVariants(e.target.checked)}
                        className="rounded"
                      />
                      Activer les variantes
                    </label>
                  </div>
                  {useVariants && (
                    <>
                      <p className="text-xs text-slate-500">
                        Ajoutez des tailles ou options (ex: Petit, Moyen, Grand)
                        avec un prix spécifique.
                      </p>
                      {errors.variants && (
                        <p className="mt-1 text-xs text-red-500">
                          {errors.variants}
                        </p>
                      )}
                      <div className="space-y-2">
                        {variants.map((v, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                          >
                            <div className="sm:col-span-7">
                              <label className="block text-[11px] font-semibold text-slate-600">
                                Nom de la variante
                              </label>
                              <input
                                type="text"
                                value={v.name}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setVariants((prev) => {
                                    const copy = [...prev];
                                    copy[idx] = { ...copy[idx], name: value };
                                    return copy;
                                  });
                                }}
                                className={`w-full px-3 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                                  errors[`variant_name_${idx}`]
                                    ? "border-red-300"
                                    : "border-slate-200"
                                }`}
                              />
                              {errors[`variant_name_${idx}`] && (
                                <p className="mt-1 text-[11px] text-red-500">
                                  {errors[`variant_name_${idx}`]}
                                </p>
                              )}
                            </div>
                            <div className="sm:col-span-3">
                              <label className="block text-[11px] font-semibold text-slate-600">
                                Prix
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={v.price}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setVariants((prev) => {
                                    const copy = [...prev];
                                    copy[idx] = { ...copy[idx], price: value };
                                    return copy;
                                  });
                                }}
                                className={`w-full px-3 py-2 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                                  errors[`variant_price_${idx}`]
                                    ? "border-red-300"
                                    : "border-slate-200"
                                }`}
                              />
                              {errors[`variant_price_${idx}`] && (
                                <p className="mt-1 text-[11px] text-red-500">
                                  {errors[`variant_price_${idx}`]}
                                </p>
                              )}
                            </div>
                            <div className="sm:col-span-2 flex justify-end pt-5 sm:pt-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setVariants((prev) =>
                                    prev.filter((_, i) => i !== idx),
                                  )
                                }
                                className="text-[11px] text-red-600 hover:underline"
                              >
                                Retirer
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setVariants((prev) => [
                              ...prev,
                              {
                                id: undefined,
                                name: "",
                                price: price || "0",
                              },
                            ])
                          }
                          className="px-3 py-2 rounded-xl border border-dashed border-slate-300 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          + Ajouter une variante
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700">
                    Prix promotionnel
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Prix promo
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={promotionPrice}
                        onChange={(e) => setPromotionPrice(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Début promo
                      </label>
                      <input
                        type="datetime-local"
                        value={promoStart}
                        onChange={(e) => setPromoStart(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600">
                        Fin promo
                      </label>
                      <input
                        type="datetime-local"
                        value={promoEnd}
                        onChange={(e) => setPromoEnd(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Preview & Image */}
              <div className="w-full md:w-80 bg-indigo-50 rounded-2xl p-5 flex flex-col gap-4 shadow-lg">
                <h4 className="text-sm font-bold text-indigo-700 mb-1">
                  Aperçu POS
                </h4>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center overflow-hidden shadow-sm">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon size={28} className="text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-base font-bold text-slate-800 line-clamp-1">
                      {name || "Nom de l'article"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {currentCategoryName(categoryId)}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">
                      {price ? Number(price).toFixed(2) : "0.00"}
                      <span className="text-[11px] text-slate-400 ml-1">
                        {settings.currency || "DT"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 space-y-2">
                  <div className="text-xs text-slate-600 flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium ${
                        visibleInPos
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {visibleInPos ? "Visible dans POS" : "Caché dans POS"}
                    </span>
                    {manageStock && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700">
                        Stock: {Number(initialQty || 0)} {baseUnit || unit || "unité"}
                      </span>
                    )}
                    {promotionPrice && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-[11px] font-medium bg-fuchsia-50 text-fuchsia-700">
                        Promo active
                      </span>
                    )}
                  </div>
                  {useVariants && variants.length > 0 && (
                    <div className="text-[11px] text-slate-600">
                      Variantes: {variants.length}{" "}
                      {variants
                        .slice(0, 2)
                        .map((v) => v.name.trim())
                        .filter(Boolean)
                        .join(", ") && (
                        <span>
                          {" "}
                          -{" "}
                          {variants
                            .slice(0, 2)
                            .map((v) => v.name.trim())
                            .filter(Boolean)
                            .join(", ")}
                          {variants.length > 2 ? "…" : ""}
                        </span>
                      )}
                    </div>
                  )}
                  {recipeItems.length > 0 && (
                    <div className="text-[11px] text-slate-600">
                      Recette: {recipeItems.length} ingrédient
                      {recipeItems.length > 1 ? "s" : ""}
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-indigo-100 pt-3 space-y-2">
                  <label className="block text-xs font-semibold text-indigo-700">
                    Image produit
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f);
                    }}
                    className="text-[11px] text-slate-600"
                  />
                  {uploadingImage && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Upload en cours...
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="app-modal-footer sticky bottom-0">
              <button
                className="app-modal-btn app-modal-btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Annuler
              </button>
              <button
                className="app-modal-btn app-modal-btn-primary"
                onClick={handleSave}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductManagement;
