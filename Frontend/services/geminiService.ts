
import { GoogleGenAI } from "@google/genai";
import { Order, PosSession } from "../types";

export const getDailyInsights = async (session: PosSession, orders: Order[]) => {
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || "").trim();
  if (!apiKey || apiKey === "undefined" || apiKey === "null") {
    return "AI insights disabled: missing Gemini API key.";
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    Analyze the following Tunisian restaurant day closing data and provide a concise summary (max 3 sentences) 
    plus 3 actionable business tips based on the performance in DT (Tunisian Dinars).
    
    Session Summary:
    - Total Sales: ${session.totalSales.toFixed(3)} DT
    - Cash Sales: ${session.cashSales.toFixed(3)} DT
    - Card Sales: ${session.cardSales.toFixed(3)} DT
    - Order Count: ${orders.length}
    - Date: ${new Date().toLocaleDateString()}
    
    Orders detail (count by type):
    - Dine-in: ${orders.filter(o => o.type === 'DINE_IN').length}
    - Delivery: ${orders.filter(o => o.type === 'DELIVERY').length}
    - Takeout: ${orders.filter(o => o.type === 'TAKE_OUT').length}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    // Fix: Directly access the .text property from the GenerateContentResponse object
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Could not generate insights at this time.";
  }
};
