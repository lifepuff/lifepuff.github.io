// Project identity is fixed by the published route, never by client names or
// user supplied issuer URLs. Public metadata must agree before using the SDK.
export const APPS = Object.freeze({
  lifepuff: Object.freeze({ name: 'LifePuff', project: 'ozaeottpolihdynydnht', key: 'sb_publishable_imeQhxtGq-DF6vbhQ31jBw_VlfbK0j8', route: '/oauth/consent/', resourcePath: 'lifepuff', table: 'mcp_grants' }),
  popview: Object.freeze({ name: 'PopView', project: 'nisudvyjfdxutlddroww', key: 'sb_publishable_k9CJrxECgvWKSvnoBKigXA_9kAQphJF', route: '/oauth/popview/consent/', resourcePath: 'palomitas', table: 'palomitas_ai_grants' }),
});

export function appForPath(path) {
  const route = path.replace(/index\.html$/, '').replace(/\/?$/, '/');
  const app = Object.values(APPS).find(app => app.route === route);
  if (!app) throw Error('Ruta de consentimiento desconocida.');
  return app;
}
export const issuerFor = app => `https://${app.project}.supabase.co/auth/v1`;
export async function verifyMetadata(app, fetcher = fetch) {
  const issuer = issuerFor(app);
  const resource = `https://${app.project}.supabase.co/functions/v1/${app.resourcePath}/mcp`;
  const read = async url => {
    const response = await fetcher(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('No se pudieron verificar los metadatos OAuth.');
    return response.json();
  };
  const [auth, protectedResource] = await Promise.all([
    read(`${issuer}/.well-known/oauth-authorization-server`),
    read(resource.replace(/\/mcp$/, '/.well-known/oauth-protected-resource')),
  ]);
  if (auth.issuer !== issuer || auth.authorization_endpoint !== `${issuer}/oauth/authorize` ||
      auth.token_endpoint !== `${issuer}/oauth/token` || protectedResource.resource !== resource ||
      protectedResource.authorization_servers?.length !== 1 || protectedResource.authorization_servers[0] !== issuer) {
    throw Error('Los metadatos no corresponden a esta aplicación.');
  }
}

export function callbackUrl(value, expected) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
      ['access_token','refresh_token','id_token'].some(key => url.searchParams.has(key)) || url.hash ||
      (url.origin === 'https://lifepuff.github.io' && ['/', '/index.html', '/oauth/popview', '/oauth/popview/', '/oauth/popview/index.html'].includes(url.pathname))) {
    throw Error('Dirección de vuelta no válida. Reinicia la conexión desde el asistente.');
  }
  if (expected) {
    const original = new URL(expected);
    if (url.origin !== original.origin || url.pathname !== original.pathname ||
        [...original.searchParams].some(([key, val]) => url.searchParams.get(key) !== val)) {
      throw Error('La dirección de vuelta no coincide con la solicitud OAuth.');
    }
  }
  return url.href; // Do not reconstruct code/state/PKCE parameters.
}

export function validateSelection(app, scopes, allowed) {
  if (!Array.isArray(scopes) || scopes.some(scope => !allowed.includes(scope)) || new Set(scopes).size !== scopes.length) throw Error('Permisos no válidos.');
  if (app === APPS.popview && ((scopes.includes('palomitas:write') && !scopes.includes('palomitas:read')) ||
      (scopes.some(scope => ['palomitas:photos', 'palomitas:delete'].includes(scope)) &&
       !['palomitas:read', 'palomitas:write'].every(scope => scopes.includes(scope))))) {
    throw Error('Para cambiar necesitas ver; para añadir portadas o borrar necesitas ver y cambiar. Marca esos permisos si quieres concederlos.');
  }
}

export async function saveGrant(api, app, user, client, scopes, allowed, authorizationId) {
  validateSelection(app, scopes, allowed);
  if (!user?.id || !client?.id || scopes.some(scope => !allowed.includes(scope)) || new Set(scopes).size !== scopes.length) throw Error('Permisos no válidos.');
  const { data, error: userError } = await api.auth.getUser();
  if (userError || data?.user?.id !== user.id) throw Error('La cuenta cambió. Reinicia la conexión.');
  if (app === APPS.popview) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(authorizationId ?? '')) throw Error('Solicitud no válida.');
    const { data, error } = await api.rpc('popview_guardar_permisos_oauth', { p_authorization_id: authorizationId, p_scopes: scopes });
    if (error) throw error;
    if (data?.status !== 'saved' || !Array.isArray(data.scopes) ||
        data.scopes.length !== scopes.length || data.scopes.some((scope, i) => scope !== scopes[i])) {
      throw Error('No se pudieron confirmar los permisos guardados.');
    }
    return;
  }
  const row = { user_id: user.id, client_id: String(client.id), client_name: client.nombre, scopes };
  if (app === APPS.lifepuff) row.client_raw = client.crudo;
  // Empty scopes must replace previous scopes too. Never touch another app.
  const { error } = await api.from(app.table).upsert(row, { onConflict: 'user_id,client_id' });
  if (error) throw error;
}
