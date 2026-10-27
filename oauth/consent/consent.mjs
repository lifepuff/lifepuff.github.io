
// La pantalla donde decides si tu asistente de IA puede entrar en tu LifePuff.
//
// Aquí no hay nada secreto: la clave es la publicable, la misma que ya lleva la
// app en el teléfono. Quien decide es Supabase Auth, con la sesión de quien
// esté mirando; esta página pregunta, enseña lo que se concede y lo guarda.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/+esm';

import { APPS, appForPath, verifyMetadata, callbackUrl, saveGrant, validateSelection } from './flow.mjs';
const app = appForPath(location.pathname);
const SUPABASE_URL = 'https://' + app.project + '.supabase.co';
const CLAVE_PUBLICA = app.key;
document.querySelector('.marca').textContent = app.name;
document.title = 'Permitir acceso · ' + app.name;
let callbackEsperado = null;

let supabase;
try {
  await verifyMetadata(app);
  supabase = createClient(SUPABASE_URL, CLAVE_PUBLICA);
} catch {
  window.__lpCargada?.();
  document.getElementById('pantalla').textContent = 'No se pudo verificar la aplicación. Vuelve a intentarlo desde tu asistente.';
  throw Error('No se pudieron validar los metadatos OAuth.');
}
const pantalla = document.getElementById('pantalla');
const idAutorizacion = new URLSearchParams(location.search).get('authorization_id');
const ID_VALIDO = /^[A-Za-z0-9_-]{8,128}$/;
const ERROR_GENERICO = 'Algo salió mal. Vuelve a intentarlo desde tu asistente.';

// Ya cargó el módulo: la propia página se encarga de los errores a partir de aquí.
window.__lpCargada?.();

/** Si algo tarda más de la cuenta, se corta con un error en vez de esperar para siempre. */
function conLimite(promesa, ms = 15000) {
  let t;
  return Promise.race([
    promesa,
    new Promise((_, rechaza) => { t = setTimeout(() => rechaza(new Error('timeout')), ms); }),
  ]).finally(() => clearTimeout(t));
}

// Al volver de Google hay que caer en esta misma página, con el mismo id.
const ESTA_PAGINA = location.origin + location.pathname +
  '?authorization_id=' + encodeURIComponent(idAutorizacion ?? '');

/**
 * Lo que puede tocar de LifePuff. Los permisos de OAuth de arriba solo dicen
 * quién eres; estos dicen qué ve y qué crea, que es lo que de verdad importa.
 * Los de ver vienen marcados; los de crear, no: que los encienda quien quiera.
 */
const PERMISOS_VER = [
  ['spaces:read', 'Tus espacios y quién está en cada uno'],
  ['tasks:read', 'Tus tareas'],
  ['calendar:read', 'Tu calendario'],
  ['schedule:read', 'Tu horario de trabajo'],
  ['money:read', 'Tus gastos y presupuestos'],
  ['trips:read', 'Tus viajes'],
  ['home:read', 'Tu hogar: garantías y mantenimiento'],
  ['pets:read', 'Tus mascotas'],
  ['vault:metadata:read', 'Los datos de la Bóveda (nunca los archivos)'],
];

const PERMISOS_CREAR = [
  ['tasks:write', 'Crear y completar tareas'],
  ['calendar:write', 'Crear eventos'],
  ['money:write', 'Anotar gastos'],
  ['trips:write', 'Añadir elementos a un viaje'],
];

// PopView guarda sus propios permisos, exclusivamente en su proyecto.
const PERMISOS_POPVIEW = [
  ['palomitas:read', 'PopView: ver tus títulos, listas y espacios'],
  ['palomitas:write', 'PopView: añadir y cambiar títulos'],
  ['palomitas:photos', 'PopView: añadir portadas'],
  ['palomitas:delete', 'PopView: borrar títulos'],
];

/** Los permisos de OAuth, dichos como se los dirías a una persona. */
const NOMBRES_OAUTH = {
  openid: 'Verificar tu identidad',
  email: 'Ver tu correo',
  profile: 'Ver tu nombre y tu foto',
  phone: 'Ver tu teléfono',
  offline_access: 'Mantener la sesión iniciada',
};

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pinta = (html) => { pantalla.innerHTML = html; };
const aviso = (texto) => '<p class="error">' + esc(texto) + '</p>';

if (!idAutorizacion || !ID_VALIDO.test(idAutorizacion)) {
  pinta('<h1>Falta información</h1><p class="ayuda">Este enlace debe abrirse desde tu asistente. Inténtalo de nuevo desde allí.</p>');
} else if (!supabase.auth.oauth) {
  pinta('<h1>No disponible</h1><p class="ayuda">Esta versión de LifePuff todavía no puede mostrar la pantalla de permisos. Inténtalo más tarde.</p>');
} else {
  arranca();
}

async function arranca() {
  try {
    const { data } = await conLimite(supabase.auth.getSession());
    if (data?.session) return await pideConsentimiento();
    pideEntrar();
  } catch (e) {
    pinta('<h1>No se pudo cargar</h1>' + aviso(traduce(e?.message)) +
      '<button id="reintentar-2" class="boton">Reintentar</button>');
    document.getElementById('reintentar-2').addEventListener('click', () => location.reload());
  }
}

// ---------------------------------------------------------------------- entrar
function pideEntrar(error) {
  pinta(`
    <h1>Inicia sesión en ${app.name}</h1>
    <p class="ayuda">Primero confirma que eres tú.</p>
    ${error ? aviso(error) : ''}
    <button id="google" class="boton">Continuar con Google</button>
    <div class="separador"><span>o inicia sesión con tu contraseña</span></div>
    <label>Correo<input id="correo" type="email" autocomplete="email" placeholder="tu@correo.com"></label>
    <label>Contraseña<input id="clave" type="password" autocomplete="current-password" placeholder="Tu contraseña"></label>
    <button id="entrar" class="boton secundario">Entrar</button>
  `);

  document.getElementById('google').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: ESTA_PAGINA },
    });
    if (error) pideEntrar(traduce(error.message));
  });

  document.getElementById('entrar').addEventListener('click', async (e) => {
    const boton = e.currentTarget;
    boton.disabled = true;
    boton.textContent = 'Entrando…';
    const correo = document.getElementById('correo').value.trim();
    const clave = document.getElementById('clave').value;
    const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
    if (error) return pideEntrar(traduce(error.message));
    pideConsentimiento();
  });
}

// ----------------------------------------------------------- dar o negar permiso
let cliente = null;   // { id, nombre, crudo }
let usuario = null;

async function pideConsentimiento() {
  pinta('<p class="ayuda">Cargando…</p>');

  let detalles;
  try {
    const { data, error } = await conLimite(supabase.auth.oauth.getAuthorizationDetails(idAutorizacion));
    if (error) throw error;
    detalles = data;
  } catch (e) {
    return pinta('<h1>No se pudo cargar</h1>' +
      aviso(traduce(e?.message)));
  }

  if (detalles?.authorization_id && detalles.authorization_id !== idAutorizacion) return errorGenerico();
  callbackEsperado = detalles?.redirect_uri ?? null;
  if (callbackEsperado) {
    try { callbackUrl(callbackEsperado); } catch { return errorGenerico(); }
  }
  // Supabase already validated this existing OAuth consent.
  if (detalles && !('authorization_id' in detalles) && detalles.redirect_url) {
    if (app === APPS.popview) {
      pinta('<h1>Continúa con tu asistente</h1><p>Esta conexión OAuth ya está autorizada. Si faltan permisos de PopView, revísalos en PopView.</p><button id="continuar-oauth" class="boton">Continuar con el asistente</button>');
      document.getElementById('continuar-oauth').addEventListener('click', () => volverAlAsistente(detalles.redirect_url));
      return;
    }
    pinta('<h1>Comprueba los permisos de LifePuff</h1><p class="ayuda">Este asistente ya está conectado, pero no tiene todos los permisos. Revísalos y selecciona los que quieras conceder.</p><a class="boton" href="/oauth/consent/recover.html" target="_blank" rel="noopener noreferrer">Revisar conexiones y permisos</a><button id="continuar-oauth" class="boton secundario">Continuar con el asistente</button><p class="nota">La revisión se abrirá en otra pestaña. Al terminar, vuelve aquí y selecciona «Continuar con el asistente».</p>');
    document.getElementById('continuar-oauth').addEventListener('click', () => volverAlAsistente(detalles.redirect_url));
    return;
  }

  if (!detalles?.authorization_id || !detalles?.redirect_uri) return errorGenerico();
  const c = detalles?.client ?? {};
  cliente = {
    id: c.client_id ?? c.id ?? detalles?.client_id ?? null,
    nombre: c.client_name ?? c.name ?? 'Un asistente',
    crudo: c,
  };
  try {
    const { data, error } = await conLimite(supabase.auth.getUser());
    if (error) throw error;
    usuario = data?.user ?? null;
  } catch (e) {
    return pinta('<h1>No se pudo cargar</h1>' + aviso(traduce(e?.message)));
  }
  if (!usuario) return pideEntrar('Tu sesión caducó. Inicia sesión de nuevo.');

  // De dónde salió esta app: la creó el dueño del proyecto, o se registró sola
  // por la puerta pública. Es la diferencia entre un conocido y un desconocido,
  // y cambia todo lo que viene debajo.
  let ficha = null;
  try {
    const { data } = await conLimite(supabase.rpc('oauth_cliente_info', { p_client_id: cliente.id }));
    ficha = Array.isArray(data) ? data[0] : data;
  } catch { /* si no se puede saber, se trata como desconocida */ }

  const deConfianza = ficha?.registro === 'manual';

  // Un desconocido que se llama como la casa. Ese es el engaño entero: el nombre
  // lo elige quien registra la app, y aquí se enseñaría tal cual. No se autoriza.
  if (!deConfianza && /lifepuff|life\s*puff|\bpuff\b|popview|pop\s*view|\bpalomitas\b|oficial|official|soporte|support|seguridad|security|verificaci/i.test(cliente.nombre)) {
    pinta(`
      <h1>Aplicación no autorizada</h1>
      <p class="ayuda">«${esc(cliente.nombre)}» intenta hacerse pasar por LifePuff. LifePuff nunca solicita este acceso.</p>
      <p class="nota">Cierra esta ventana; no tienes que hacer nada más.${
        detalles?.redirect_uri ? '<br><br>Intentaba redirigirte a <b>' + esc(detalles.redirect_uri) + '</b>' : ''}</p>
      <button id="no" class="boton">Cancelar y salir</button>
    `);
    document.getElementById('no').addEventListener('click', () => decide(false));
    return;
  }

  const permisosOauth = String(detalles?.scope ?? '').split(/\s+/).filter(Boolean);

  // A un desconocido no se le marca nada de antemano: pulsar «Permitir» sin
  // leer no debe conceder ni una sola cosa.
  const casilla = (clave, texto, marcada) => `
    <label class="casilla">
      <input type="checkbox" value="${esc(clave)}"${marcada && deConfianza ? ' checked' : ''}>
      <span>${esc(texto)}</span>
    </label>`;

  const edad = ficha?.minutos_de_vida;
  const cuando = edad == null ? '' :
    edad < 60 ? `hace ${edad} minuto${edad === 1 ? '' : 's'}` :
    edad < 1440 ? `hace ${Math.floor(edad / 60)} hora${Math.floor(edad / 60) === 1 ? '' : 's'}` :
    `hace ${Math.floor(edad / 1440)} día${Math.floor(edad / 1440) === 1 ? '' : 's'}`;

  const cartel = deConfianza
    ? ''
    : `<p class="alerta"><b>Aplicación no verificada.</b> Se registró de forma automática${cuando ? ', ' + cuando : ''}. Cualquiera puede usar este nombre. Si no eres tú quien la está conectando, selecciona «Ahora no».</p>`;

  pinta(`
    <h1>${esc(cliente.nombre)} quiere entrar en tu ${app.name}</h1>
    <p class="ayuda">Como ${esc(usuario?.email ?? 'tú')}.</p>
    <p class="nota">Identificador del asistente: <b>${esc(String(cliente.id ?? 'desconocido').slice(0, 8))}…</b>${
      detalles?.redirect_uri ? '<br>Dirección de vuelta: <b>' + esc(detalles.redirect_uri) + '</b>' : ''}</p>

    ${cartel}

    <div class="lista">
      ${(permisosOauth.length ? permisosOauth : ['email']).map((p) =>
        '<div class="fila"><span class="tic">✓</span>' + esc(NOMBRES_OAUTH[p] ?? p) + '</div>').join('')}
    </div>

    ${app === APPS.lifepuff ? `<div class="grupo">
      <div class="grupo-titulo">Qué podrá ver</div>
      ${PERMISOS_VER.map(([k, t]) => casilla(k, t, true)).join('')}
    </div>

    <div class="grupo">
      <div class="grupo-titulo">Qué podrá crear</div>
      ${PERMISOS_CREAR.map(([k, t]) => casilla(k, t, false)).join('')}
    </div>

    ` : `<div class="grupo">
      <div class="grupo-titulo">PopView</div>
      ${PERMISOS_POPVIEW.map(([k, t]) => casilla(k, t, k === 'palomitas:read')).join('')}
      <p class="nota">Para cambiar necesitas ver. Para añadir portadas o borrar necesitas ver y cambiar. Estos permisos solo se conceden si marcas sus casillas.</p>
    </div>`}

    <p class="nota">Nunca tendrá más acceso que tú. ${app === APPS.lifepuff ? 'De la Bóveda solo verá los datos, no los archivos.' : ''} Puedes cambiar o retirar este acceso en Ajustes.${
      detalles?.redirect_uri
        ? '<br><br>Al finalizar, se te redirigirá a <b>' + esc(detalles.redirect_uri) + '</b>'
        : ''}</p>

    <p id="seleccion-error" class="error" role="alert"></p>
    <button id="si" class="boton">Permitir</button>
    <button id="no" class="boton secundario">Ahora no</button>
  `);

  document.getElementById('si').addEventListener('click', () => decide(true));
  document.getElementById('no').addEventListener('click', () => decide(false));
}

/** Lo que quedó marcado cuando se pulsó Permitir. */
function elegidos() {
  return [...pantalla.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value);
}

let decidiendo = false;

/**
 * approveAuthorization y denyAuthorization devuelven OAuthRedirect.
 * En auth-js 2.111.0 el campo es redirect_url, no redirect_to.
 */
function direccionDeVuelta(data) {
  const url = data?.redirect_url;
  return typeof url === 'string' && url ? url : null;
}

/** Solo una URL absoluta http o https se puede abrir. */
function esHttp(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function errorGenerico() {
  pinta('<h1>No se pudo completar</h1>' + aviso(ERROR_GENERICO));
}

/** Vuelve al asistente. Si la dirección falta o no es http(s), no navega. */
function volverAlAsistente(url) {
  try { window.location.assign(callbackUrl(url, callbackEsperado)); }
  catch { errorGenerico(); }
}

async function decide(permitir) {
  // Un solo clic: los dos botones se bloquean en cuanto se pulsa uno.
  if (decidiendo) return;
  const scopes = permitir ? elegidos() : [];
  if (permitir) {
    const permisos = app === APPS.lifepuff ? [...PERMISOS_VER, ...PERMISOS_CREAR] : PERMISOS_POPVIEW;
    try { validateSelection(app, scopes, permisos.map(([key]) => key)); }
    catch (e) { document.getElementById('seleccion-error').textContent = e.message; return; }
  }
  decidiendo = true;
  pantalla.querySelectorAll('button').forEach((b) => { b.disabled = true; });

  if (permitir && (!cliente?.id || !usuario?.id)) {
    return pinta('<h1>No se pudo completar</h1>' +
      aviso('No se pudo identificar al asistente que realiza la solicitud. Inténtalo de nuevo desde el asistente.'));
  }

  pinta('<p class="ayuda">' + (permitir ? 'Conectando…' : 'Cancelando…') + '</p>');

  // 1) Primero se autoriza (o se niega), sin dejar que la librería redirija sola.
  //    Con el valor por defecto se iría al asistente antes de guardar los permisos.
  //    Si esto falla, no se guarda nada.
  let destino = null;
  try {
    const { data, error } = await conLimite(permitir
      ? supabase.auth.oauth.approveAuthorization(idAutorizacion, { skipBrowserRedirect: true })
      : supabase.auth.oauth.denyAuthorization(idAutorizacion, { skipBrowserRedirect: true }));
    if (error) throw error;
    destino = callbackUrl(direccionDeVuelta(data), callbackEsperado);
  } catch (e) {
    return pinta('<h1>No se pudo completar</h1>' + aviso(traduce(e?.message)));
  }

  // Negar no guarda nada: se vuelve al asistente en cuanto hay una dirección válida.
  if (!permitir) {
    if (!destino) return errorGenerico();
    return volverAlAsistente(destino);
  }

  // 2) Solo si se autorizó, se guarda qué puede tocar. La redirección espera a
  //    que esto termine. Si falla, el asistente queda conectado pero sin permisos
  //    nuevos y se avisa, sin irse de esta página.
  try {
    await guardaPermisos(scopes);
  } catch {
    if (!destino) return errorGenerico();
    pinta('<h1>No se pudieron guardar los permisos</h1>' +
      aviso('Se autorizó la conexión OAuth, pero no se pudieron guardar los permisos seleccionados. Si esta conexión ya tenía permisos, puede conservarlos.') +
      '<p class="ayuda">Revisa los permisos y vuelve a guardarlos.</p>' +
      (app === APPS.lifepuff ? '<a class="boton" href="/oauth/consent/recover.html" target="_blank" rel="noopener noreferrer">Revisar conexiones y permisos</a>' : '<p>Revisa los permisos en PopView y reinicia la conexión desde tu asistente.</p>') +
      '<button id="continuar-oauth" class="boton secundario">Continuar con el asistente</button>');
    document.getElementById('continuar-oauth').addEventListener('click', () => volverAlAsistente(destino));
    return;
  }

  if (!destino) return errorGenerico();
  volverAlAsistente(destino);
}

/** Guarda exclusivamente los permisos de la aplicación validada. */
async function guardaPermisos(scopes) {
  const permisos = app === APPS.lifepuff ? [...PERMISOS_VER, ...PERMISOS_CREAR] : PERMISOS_POPVIEW;
  await conLimite(saveGrant(supabase, app, usuario, cliente, scopes, permisos.map(([key]) => key), idAutorizacion));
}

/** Los mensajes de Supabase vienen en inglés y de técnico. Aquí se traducen. */
function traduce(mensaje) {
  const m = String(mensaje ?? '').toLowerCase();
  if (!m) return ERROR_GENERICO;
  if (m === 'timeout' || m.includes('failed to fetch') || m.includes('network')) {
    return 'No hay conexión o el servidor tarda demasiado. Revisa tu conexión y vuelve a intentarlo.';
  }
  if (m.includes('invalid login')) return 'Ese correo o esa contraseña no son correctos.';
  if (m.includes('email not confirmed')) return 'Todavía no has confirmado tu correo. Revisa tu bandeja de entrada.';
  if (m.includes('expired')) return 'La solicitud caducó. Vuelve a empezar desde tu asistente.';
  if (m.includes('not found')) return 'Esta solicitud ya no existe. Vuelve a empezar desde tu asistente.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.';
  if (m.includes('row-level security') || m.includes('permission denied')) {
    return 'No se pudieron guardar los permisos. Inicia sesión de nuevo e inténtalo otra vez.';
  }
  return ERROR_GENERICO;
}
