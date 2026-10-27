const BRIDGE_PATHS = new Set(['/oauth/popview', '/oauth/popview/', '/oauth/popview/index.html']);

// Only the PopView email/default-return page may hand off to the mobile app.
// Consent requests stay on HTTPS. OAuth client callbacks (code + state) must
// return to the assistant and are never forwarded through this mobile bridge.
export function mobileDestination(current) {
  const url = new URL(current);
  if (!BRIDGE_PATHS.has(url.pathname)) return null;
  const hash = new URLSearchParams(url.hash.slice(1));
  if (url.searchParams.has('authorization_id') || hash.has('authorization_id') ||
      url.searchParams.has('state') || hash.has('state')) return null;
  if (!url.search && !url.hash) return null;
  return 'palomitas://auth-callback' + url.search + url.hash;
}

export function runBridge(location, document) {
  const destination = mobileDestination(location.href);
  if (!destination) {
    document.getElementById('titulo').textContent = 'Abre el enlace desde PopView';
    document.getElementById('ayuda').textContent = 'Esta página recibe enlaces de cuenta. Las conexiones con asistentes deben continuar en su pantalla de permisos web.';
    return;
  }
  const link = document.getElementById('ir');
  link.href = destination;
  link.hidden = false;
  location.replace(destination);
}
