const LOCAL_HOSTS = new Set(['', 'localhost', '127.0.0.1', '::1']);
const PRIVATE_IPV4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const PRODUCTION_API_ORIGIN = 'https://woodapp-project-app.onrender.com';
const DEPLOYED_API_ORIGIN = String(import.meta.env.VITE_API_ORIGIN || '').trim().replace(/\/+$/, '');

function getRuntimeServerIp() {
  if (import.meta.env.PROD) {
    return '';
  }

  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  // If a phone opens the Vite dev URL, reuse that same PC IP automatically.
  if (hostname && !LOCAL_HOSTS.has(hostname) && PRIVATE_IPV4.test(hostname)) {
    return hostname;
  }

  return '10.136.187.103';
}

export const SERVER_IP = getRuntimeServerIp();
export const SERVER_PORT = '3001';
export const API_ORIGIN = DEPLOYED_API_ORIGIN || (import.meta.env.PROD ? PRODUCTION_API_ORIGIN : `http://${SERVER_IP}:${SERVER_PORT}`);
export const API_BASE = `${API_ORIGIN}/api`;

function getConnectionHelp() {
  if (DEPLOYED_API_ORIGIN) {
    return `Configured API: ${API_ORIGIN}`;
  }

  return `Make sure:\n1. Backend is running (node server.js)\n2. Your PC IP is ${SERVER_IP}\n3. Phone and PC are on the same WiFi\n4. Windows Firewall allows port ${SERVER_PORT}`;
}

export async function checkServerConnection() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${API_ORIGIN}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return { connected: true, data };
    }

    return { connected: false, error: `Server returned status ${res.status}` };
  } catch (err) {
    if (err.name === 'AbortError') {
      return {
        connected: false,
        error: `Connection timed out. ${getConnectionHelp()}`,
      };
    }

    return {
      connected: false,
      error: `Cannot reach server: ${err.message}\n\n${getConnectionHelp()}`,
    };
  }
}
