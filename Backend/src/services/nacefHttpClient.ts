type HttpMethod = 'GET' | 'POST';

function normalizeBaseUrl(raw: unknown) {
  return String(raw || '').trim().replace(/\/+$/, '');
}

async function call<T>(
  baseUrlRaw: unknown,
  path: string,
  method: HttpMethod,
  body?: unknown,
): Promise<T> {
  const baseUrl = normalizeBaseUrl(baseUrlRaw);
  if (!baseUrl) {
    throw new Error('NACEF remote: baseUrl manquant.');
  }
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `NACEF remote ${method} ${path} a échoué (${res.status}): ${String(
        (json as any)?.message || (json as any)?.error || res.statusText,
      )}`,
    );
  }
  return json as T;
}

export async function fetchManifestRemote(baseUrl: string) {
  return call<any>(baseUrl, '/sic/external/manifest', 'GET');
}

export async function requestCertificateRemote(baseUrl: string, payload: unknown) {
  return call<any>(baseUrl, '/sic/external/certificate/request', 'POST', payload);
}

export async function synchronizeRemote(baseUrl: string, payload: unknown) {
  return call<any>(baseUrl, '/sic/external/sync/request', 'POST', payload);
}

export async function signTicketRemote(baseUrl: string, payload: unknown) {
  return call<any>(baseUrl, '/sic/external/sign/request', 'POST', payload);
}

export async function pushLogRemote(baseUrl: string, payload: unknown) {
  return call<any>(baseUrl, '/sic/external/log/', 'POST', payload);
}
