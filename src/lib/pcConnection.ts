/**
 * PC Connection & Target Resolution Utility
 * Ensures HP connects directly to the local PC server URL and logs exact targets.
 */

export interface PcConnectionConfig {
  ip: string;
  port: number;
  baseUrl: string;
}

const STORAGE_KEY_PC_IP = 'wifi_transfer_pc_ip';
const STORAGE_KEY_PC_PORT = 'wifi_transfer_pc_port';

/**
 * Resolve target PC base URL
 */
export function getTargetPcConfig(): PcConnectionConfig {
  let ip = '127.0.0.1';
  let port = 3000;

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const queryIp = params.get('pc_ip');
    const queryPort = params.get('pc_port');
    const queryUrl = params.get('pc_url');

    if (queryUrl) {
      try {
        const u = new URL(queryUrl);
        ip = u.hostname;
        port = parseInt(u.port, 10) || 3000;
        localStorage.setItem(STORAGE_KEY_PC_IP, ip);
        localStorage.setItem(STORAGE_KEY_PC_PORT, port.toString());
      } catch {}
    } else if (queryIp) {
      ip = queryIp;
      port = queryPort ? parseInt(queryPort, 10) : 3000;
      localStorage.setItem(STORAGE_KEY_PC_IP, ip);
      localStorage.setItem(STORAGE_KEY_PC_PORT, port.toString());
    } else {
      // Check stored
      const storedIp = localStorage.getItem(STORAGE_KEY_PC_IP);
      const storedPort = localStorage.getItem(STORAGE_KEY_PC_PORT);

      if (storedIp) {
        ip = storedIp;
        port = storedPort ? parseInt(storedPort, 10) : 3000;
      } else {
        // Fallback to current host if not a cloud preview or localhost
        const host = window.location.hostname;
        const currentPort = parseInt(window.location.port, 10) || (window.location.protocol === 'https:' ? 443 : 80);
        ip = host;
        port = currentPort;
      }
    }
  }

  // Construct baseUrl
  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:' && ip === window.location.hostname;
  const protocol = isHttps ? 'https' : 'http';
  const portSuffix = (protocol === 'http' && port === 80) || (protocol === 'https' && port === 443) ? '' : `:${port}`;
  const baseUrl = `${protocol}://${ip}${portSuffix}`;

  return { ip, port, baseUrl };
}

/**
 * Save manual PC IP/Port
 */
export function saveTargetPcConfig(ip: string, port: number = 3000): PcConnectionConfig {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_PC_IP, ip);
    localStorage.setItem(STORAGE_KEY_PC_PORT, port.toString());
  }
  return getTargetPcConfig();
}

/**
 * Build target URL for any API endpoint
 */
export function buildPcApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // If the browser is running directly on the PC server (or same origin without cloud proxying)
    if (host === 'localhost' || host === '127.0.0.1' || /^192\.168\./.test(host) || /^10\./.test(host)) {
      return cleanEndpoint;
    }
  }

  const { baseUrl } = getTargetPcConfig();
  return `${baseUrl}${cleanEndpoint}`;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  status: number;
  statusText: string;
  data?: T;
  error?: string;
  targetUrl: string;
  method: string;
  responseTimeMs: number;
}

/**
 * Log and execute a request with EXACT diagnostic output
 */
export async function pcFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const targetUrl = buildPcApiUrl(endpoint);
  const method = options.method || 'GET';

  // EXACT Console format as requested by user
  console.log(`[PC CONNECTION]\nTarget URL: ${targetUrl}\nMethod: ${method}`);

  const start = performance.now();
  try {
    const res = await fetch(targetUrl, {
      ...options,
      cache: 'no-store',
    });
    const elapsed = Math.round(performance.now() - start);

    let data: any = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      try {
        data = await res.text();
      } catch {
        data = null;
      }
    }

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      data,
      targetUrl,
      method,
      responseTimeMs: elapsed,
    };
  } catch (err: any) {
    const elapsed = Math.round(performance.now() - start);
    return {
      ok: false,
      status: 0,
      statusText: 'Network Error',
      error: err?.message || 'Gagal terhubung ke jaringan server PC',
      targetUrl,
      method,
      responseTimeMs: elapsed,
    };
  }
}
