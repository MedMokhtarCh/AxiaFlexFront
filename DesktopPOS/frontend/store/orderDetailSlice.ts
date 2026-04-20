import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { Order, OrderItem } from "../types";

let API_BASE_URL = "";

async function apiFetch(path: string, options?: any) {
  const method = String(options?.method || "GET").toUpperCase();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...(options || {}),
    ...(method === "GET" ? { cache: "no-store" as RequestCache } : {}),
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API Error (${response.status})`);
  }
  return await response.json();
}

export const fetchOrderById = createAsyncThunk<
  Order,
  string
>("orderDetail/fetchOrderById", async (id: string) => {
  return await apiFetch(`/pos/orders/${id}`);
});

export const patchOrderItems = createAsyncThunk<
  Order,
  { id: string; items: OrderItem[]; total: number; discount: number }
>("orderDetail/patchOrderItems", async ({ id, items, total, discount }) => {
  return await apiFetch(`/pos/orders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ items, total, discount }),
  });
});

export const patchOrderStatus = createAsyncThunk<
  Order,
  { id: string; status: string }
>("orderDetail/patchOrderStatus", async ({ id, status }) => {
  return await apiFetch(`/pos/orders/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
});

export const addPayment = createAsyncThunk<
  Order,
  { id: string; method: string; amount: number; items?: { id: string; quantity: number }[] }
>("orderDetail/addPayment", async ({ id, method, amount, items }) => {
  const payload: any = { method, amount, createdAt: Date.now() };
  if (Array.isArray(items) && items.length > 0) payload.items = items;
  return await apiFetch(`/pos/orders/${id}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
});

type State = {
  order: Order | null;
  loading: boolean;
  error: string | null;
};

const initialState: State = {
  order: null,
  loading: false,
  error: null,
};

const orderDetailSlice = createSlice({
  name: "orderDetail",
  initialState,
  reducers: {
    clearOrder(state) {
      state.order = null;
      state.error = null;
      state.loading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOrderById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchOrderById.fulfilled, (state, action) => {
        state.loading = false;
        state.order = action.payload;
      })
      .addCase(fetchOrderById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Failed to fetch order";
      })
      .addCase(patchOrderItems.fulfilled, (state, action) => {
        state.order = action.payload;
      })
      .addCase(patchOrderStatus.fulfilled, (state, action) => {
        state.order = action.payload;
      })
      .addCase(addPayment.fulfilled, (state, action) => {
        state.order = action.payload;
      });
  },
});

export const { clearOrder } = orderDetailSlice.actions;
export default orderDetailSlice.reducer;
