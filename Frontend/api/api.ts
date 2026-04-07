import { ApiResponseMap } from '../types';

const API_BASE_URL = String((import.meta as any).env?.VITE_API_URL ?? '');

// Paiement partiel avancé
export async function postPartialPayment({
  orderId,
  items,
  paymentMethod,
}: {
  orderId: string;
  items: { orderItemId: string; quantity: number }[];
  paymentMethod: string;
}) {
  const response = await fetch(`${API_BASE_URL}/payments/partial`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, items, paymentMethod }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Erreur paiement partiel');
  }
  return response.json();
}

export async function apiFetchTyped<Path extends keyof ApiResponseMap>(
  path: Path,
  options?: RequestInit & { body?: any },
): Promise<ApiResponseMap[Path]> {
  const method = String(options?.method || 'GET').toUpperCase();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...(options || {}),
    ...(method === 'GET' ? { cache: 'no-store' as RequestCache } : {}),
  } as RequestInit);

  if (!response.ok) {
    let msg = `API Error (${response.status})`;
    try {
      const ct = response.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const payload = await response.json();
        if (payload?.error) msg = String(payload.error);
      } else {
        const txt = await response.text();
        if (txt) msg = txt;
      }
    } catch {}
    throw new Error(msg);
  }

  // cast is fine because callers should use valid keys present in ApiResponseMap
  return (await response.json()) as ApiResponseMap[Path];
}

export default apiFetchTyped;
