export function resolveAssetUrl(rawUrl: string | null | undefined): string {
  const value = String(rawUrl || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  const apiBase = String((import.meta as any).env?.VITE_API_URL ?? "").trim().replace(/\/+$/, "");
  if (value.startsWith("/")) {
    return apiBase ? `${apiBase}${value}` : value;
  }
  return apiBase ? `${apiBase}/${value}` : value;
}

