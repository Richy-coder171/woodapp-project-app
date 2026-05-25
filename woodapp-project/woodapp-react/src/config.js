// ============================================================
// WoodApp API Configuration
// ============================================================
// IMPORTANT: Change this IP to your PC's IPv4 address.
// Find it with: ipconfig (Windows) or hostname -I (Linux/Mac)
// Your phone and PC MUST be on the same WiFi network.
// ============================================================

// Your backend server IP — update this if your IP changes!
const SERVER_IP = '192.168.184.132';
const SERVER_PORT = '3001';

export const API_BASE = `http://${SERVER_IP}:${SERVER_PORT}/api`;

// Health check function — use this to test connectivity
export async function checkServerConnection() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const res = await fetch(`http://${SERVER_IP}:${SERVER_PORT}/api/health`, {
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
        error: `Connection timed out. Make sure:\n1. Backend is running (node server.js)\n2. Your PC IP is ${SERVER_IP}\n3. Phone and PC are on the same WiFi`,
      };
    }
    return {
      connected: false,
      error: `Cannot reach server: ${err.message}\n\nMake sure:\n1. Backend is running (node server.js)\n2. Your PC IP is ${SERVER_IP}\n3. Phone and PC are on the same WiFi\n4. Windows Firewall allows port ${SERVER_PORT}`,
    };
  }
}