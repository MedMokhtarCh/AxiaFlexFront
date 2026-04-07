import { configureStore } from "@reduxjs/toolkit";
import orderDetailReducer from "./orderDetailSlice";

export const store = configureStore({
  reducer: {
    orderDetail: orderDetailReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
