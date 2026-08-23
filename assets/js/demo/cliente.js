/* ============================================================
   CLIENTE FALSO DE SUPABASE — solo para la demo
   ------------------------------------------------------------
   La app real habla con Supabase. Aquí se sustituye ese cliente
   por uno que responde exactamente igual pero contra una base de
   datos que vive en el navegador de quien abre la página.

   Consecuencias, y son las importantes:
   · La demo NO puede tocar la app real ni sus datos. No hay
     internet de por medio: no hay a dónde llamar.
   · Todo lo que hagas aquí se guarda solo en TU navegador. Otro
     empleado abriendo el mismo link empieza con su propia copia.
   · El botón "Reiniciar demo" borra esa copia y vuelve a armar
     el club desde cero.

   El motor de escaleras (rondas, emparejamiento, puntos) NO se
   improvisa aquí: se llama a motor.js, que es la traducción
   verificada de las funciones reales de Postgres.
   ============================================================ */

import * as motor from './motor.js';
import { construirDemo } from './semilla.js';
import { DEMO, cargarBd, guardarBd, borrarTodo, fechaClub, instanteClub, sumarDias, lunesDe } from './estado.js';

/* ---------- la base de datos de la demo ---------- */

let DB = cargarBd();
if (!DB || !DB.profiles || !DB.profiles.length) {
  DB = construirDemo(fechaClub(new Date()));
  guardarBd(DB);
}

// Se guarda con retraso: durante la captura de una noche se tocan muchas
// filas seguidas y no tiene caso serializar un megabyte en cada una.
let guardadoPendiente = null;
function persistir() {
  if (guardadoPendiente) clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(() => { guardadoPendiente = null; guardarBd(DB); }, 250);
}

export function reiniciarDemo() {
  borrarTodo();
  DB = construirDemo(fechaClub(new Date()));
  guardarBd(DB);
  return DB;
}

export function baseDeDatos() { return DB; }

function log(...args) { if (window.__demoTrazar) console.log('[demo]', ...args); }

/* ---------- utilidades ---------- */

function clone(v) { return v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)); }
function wsById(id) { return DB.weekday_schedule.find((w) => w.id === id) || null; }

function attachEscaleraJoin(reg) {
  const esc = DB.escaleras.find((e) => e.id === reg.escalera_id);
  const profiles = clone(DB.profiles.find((p) => p.id === reg.player_id)) || null;
  if (!esc) return { ...reg, escaleras: null, profiles };
  return { ...reg, escaleras: { ...esc, weekday_schedule: wsById(esc.weekday_schedule_id) }, profiles };
}

function todayPlus(dias) { return sumarDias(fechaClub(DEMO.ahora()), dias); }

const ACTIVOS = ['confirmed', 'substitute', 'waitlist'];

function cfg(k, d) { return motor.cfgNum(DB, k, d); }
function uidActual() { return currentSession ? currentSession.user.id : null; }
function nuevoRegId() { return motor.nuevoId(DB, 'reg'); }

function ctx() {
  return { ahora: () => DEMO.ahora(), uid: uidActual(), rnd: Math.random };
}

/* Envuelve una llamada al motor en la forma {data, error} que devuelve
   supabase-js, para que api.js no note la diferencia. */
function envolver(fn) {
  try {
    const data = fn();
    persistir();
    return { data: data === undefined ? null : data, error: null };
  } catch (e) {
    return { data: null, error: { message: e.message || String(e) } };
  }
}

/* ---------- ventana del domingo, ranking y categorías ---------- */

function ventanaDe(escId) { return motor.ventanaPrivilegio(DB, escId, () => DEMO.ahora()); }

function rankingVivo(cat) {
  return motor.rankingVivo(DB, cat).map((r) => ({
    ...r,
    rolling_points: r.rolling_points,
    escaleras_counted: r.escaleras_contadas,
    category: cat,
  }));
}

function catEfectivaDe(playerId) { return motor.categoriaEfectiva(DB, playerId); }
function tengoVentaja(playerId, esc) { return motor.tieneVentajaRanking(DB, playerId, esc.id); }

function ocupadosDe(escId) {
  return DB.escalera_registrations.filter(
    (r) => r.escalera_id === escId && ['confirmed', 'substitute'].includes(r.status)).length;
}
function enEsperaDe(escId) {
  return DB.escalera_registrations.filter((r) => r.escalera_id === escId && r.status === 'waitlist');
}

function horasFaltantes(esc) {
  const ws = wsById(esc.weekday_schedule_id);
  const inicio = instanteClub(esc.session_date, (ws ? ws.start_time : '20:00:00').slice(0, 5));
  return Math.round(((inicio - DEMO.ahora()) / 3600000) * 10) / 10;
}

/* ---------- recalcular_posiciones_lista_espera / promover_lista_espera ---------- */

function recalcularEspera(escId) {
  enEsperaDe(escId)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .forEach((r, i) => { r.waitlist_position = i + 1; });
  persistir();
}

function promoverEspera(escId) {
  const esc = DB.escaleras.find((e) => e.id === escId);
  const ws = esc ? wsById(esc.weekday_schedule_id) : null;
  const cap = ws && ws.capacity != null ? ws.capacity : 999;
  const formato = esc ? esc.format : 'individual';
  let libres = cap - ocupadosDe(escId);
  if (libres <= 0) { recalcularEspera(escId); return 0; }

  let promovidos = 0;
  const fila = enEsperaDe(escId).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  if (formato === 'parejas') {
    // En Parejas entra la pareja completa o no entra nadie.
    const vistas = new Set();
    for (const r of fila) {
      if (!r.partner_id || libres < 2) continue;
      const clave = [r.player_id, r.partner_id].sort().join('|');
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      DB.escalera_registrations
        .filter((x) => x.escalera_id === escId && x.status === 'waitlist'
          && [x.player_id, x.partner_id].sort().join('|') === clave)
        .forEach((x) => {
          x.status = 'confirmed';
          x.confirmed_at = DEMO.ahora().toISOString();
          x.waitlist_position = null;
          notificar(x.player_id, 'promocion_lista_espera', 'Se abrió un lugar para tu pareja',
            'Se liberó un lugar y como iban primero en la lista de espera, su pareja ya está confirmada.', escId);
        });
      libres -= 2;
      promovidos += 2;
    }
  } else {
    for (const r of fila) {
      if (libres <= 0) break;
      r.status = 'confirmed';
      r.confirmed_at = DEMO.ahora().toISOString();
      r.waitlist_position = null;
      notificar(r.player_id, 'promocion_lista_espera', 'Se abrió un lugar y es tuyo',
        'Se liberó un lugar y como ibas primero en la lista de espera, ya tienes lugar confirmado. Si no puedes ir, cancela cuanto antes.', escId);
      libres -= 1;
      promovidos += 1;
    }
  }
  recalcularEspera(escId);
  return promovidos;
}

/* ---------- reordenar_parejas_ventana ---------- */

function reordenarParejasVentana(escId) {
  const esc = DB.escaleras.find((e) => e.id === escId);
  if (!esc || esc.format !== 'parejas') return;
  const ws = wsById(esc.weekday_schedule_id) || {};
  const maxParejas = Math.floor((ws.capacity != null ? ws.capacity : 12) / 2);
  const pv = motor.puntosVivos(DB);
  const pts = (id) => (pv.find((x) => x.player_id === id) || {}).rolling_points || 0;

  const grupos = new Map();
  DB.escalera_registrations
    .filter((r) => r.escalera_id === escId && r.partner_id && ['confirmed', 'waitlist'].includes(r.status))
    .forEach((r) => {
      const clave = [r.player_id, r.partner_id].sort().join('|');
      const g = grupos.get(clave) || { clave, filas: [], ca: r.created_at };
      g.filas.push(r);
      if (String(r.created_at) < String(g.ca)) g.ca = r.created_at;
      grupos.set(clave, g);
    });

  [...grupos.values()]
    .map((g) => {
      const [a, b] = g.clave.split('|');
      return { ...g, promedio: (pts(a) + pts(b)) / 2 };
    })
    .sort((x, y) => y.promedio - x.promedio || String(x.ca).localeCompare(String(y.ca)))
    .forEach((g, i) => {
      const dentro = i + 1 <= maxParejas;
      g.filas.forEach((r) => {
        r.status = dentro ? 'confirmed' : 'waitlist';
        r.confirmed_at = dentro ? (r.confirmed_at || DEMO.ahora().toISOString()) : null;
        r.waitlist_position = dentro ? null : i + 1 - maxParejas;
      });
    });
  persistir();
}

/* ---------- notificar ---------- */

function notificar(playerId, tipo, titulo, cuerpo, escId) {
  DB.notifications.push({
    id: motor.nuevoId(DB, 'not'), player_id: playerId, type: tipo, title: titulo,
    body: cuerpo, related_escalera_id: escId || null, read_at: null,
    created_at: DEMO.ahora().toISOString(),
  });
}

/* ---------- liquidar_ventana_privilegio ---------- */

function liquidarVentana(escId) {
  const e = DB.escaleras.find((x) => x.id === escId);
  if (!e || e.privilege_settled_at) return false;
  if (!['individual', 'parejas'].includes(e.format) || e.status === 'cancelled') return false;
  const v = ventanaDe(escId);
  if (!v.ranking_listo || !v.cerrada) return false;

  const top = cfg('privilege_top_n', 12);
  motor.rankingVivo(DB, e.category).filter((r) => r.rnk <= top).forEach((r) => {
    const tiene = DB.escalera_registrations.some(
      (x) => x.escalera_id === escId && x.player_id === r.player_id && ACTIVOS.includes(x.status));
    if (tiene) return;
    notificar(r.player_id, 'preferencia_expirada', 'Se acabó tu preferencia de ranking',
      `No apartaste tu lugar antes de las 6:00 pm del domingo, así que la convocatoria del ${e.session_date.slice(8)}/${e.session_date.slice(5, 7)} ya está abierta para todos. Todavía te puedes anotar si queda lugar.`, escId);
  });

  e.privilege_settled_at = DEMO.ahora().toISOString();
  promoverEspera(escId);
  return true;
}

/* ============================================================
   El domingo del club
   ------------------------------------------------------------
   En la app real una tarea automatica recalcula las categorias el
   domingo a las 9am. Aqui no hay servidor que la dispare, asi que
   se revisa cada vez que se pide algo: si el reloj de la demo ya
   paso ese momento y esa semana no tiene categorias, se corre.
   Es lo que permite VER el ascenso y el descenso moviendo el
   reloj, sin esperar al domingo.
   ============================================================ */
function correrDomingoSiToca() {
  const ahora = DEMO.ahora();
  const hoy = fechaClub(ahora);
  // El domingo mas reciente que ya paso (si hoy es domingo, hoy mismo).
  const domingo = sumarDias(hoy, -new Date(hoy + 'T12:00:00Z').getUTCDay());
  if (ahora < instanteClub(domingo, '09:00')) return;
  if (DB.category_snapshots.some((c) => c.week_start_date === domingo)) return;

  const mov = motor.recalcularCategorias(DB, domingo, () => DEMO.ahora());
  (mov.suben || []).forEach((id) => notificar(id, 'cambio_categoria', 'Subiste a Categoría A',
    'Quedaste entre los mejores de B esta semana, así que subes a Categoría A. Tus convocatorias de esta semana ya son las de A.', null));
  (mov.bajan || []).forEach((id) => notificar(id, 'cambio_categoria', 'Bajaste a Categoría B',
    'Esta semana quedaste en los últimos lugares de A, así que bajas a Categoría B. Se sube ganando: los primeros de B suben cada domingo.', null));
  persistir();
}

/* ---------- mis_convocatorias(int) ---------- */

function misConvocatorias(uid) {
  correrDomingoSiToca();
  const hoy = todayPlus(0);
  const hasta = todayPlus(9);
  const miCat = catEfectivaDe(uid);

  DB.escaleras
    .filter((e) => e.session_date >= hoy && e.session_date <= hasta && e.status !== 'cancelled'
      && ['individual', 'parejas'].includes(e.format))
    .forEach((e) => liquidarVentana(e.id));

  return DB.escaleras
    .filter((e) => e.session_date >= hoy && e.session_date <= hasta && e.status !== 'cancelled')
    .sort((a, b) => a.session_date.localeCompare(b.session_date))
    .map((e) => {
      const ws = wsById(e.weekday_schedule_id) || {};
      const retas = ws.format === 'retas_abiertas';
      const v = retas ? { abierta: false, cerrada: true, ranking_listo: false, abre: null, cierra: null } : ventanaDe(e.id);
      const mio = DB.escalera_registrations
        .filter((r) => r.escalera_id === e.id && r.player_id === uid)
        .sort((a, b) => (ACTIVOS.includes(a.status) ? 0 : 1) - (ACTIVOS.includes(b.status) ? 0 : 1)
          || String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
      const sustituto = mio
        ? DB.escalera_registrations.find((r) => r.substitute_for_registration_id === mio.id && r.status === 'substitute')
        : null;
      return {
        escalera_id: e.id,
        session_date: e.session_date,
        formato: ws.format,
        categoria: ws.category,
        start_time: ws.start_time,
        end_time: ws.end_time,
        capacidad: ws.capacity,
        canchas: e.courts_active != null ? e.courts_active : ws.courts,
        esc_status: e.status,
        ocupados: ocupadosDe(e.id),
        en_espera: enEsperaDe(e.id).length,
        precio_mxn: retas ? cfg('retas_price_mxn', 150) : null,
        ventana_abre: v.abre ? v.abre.toISOString() : null,
        ventana_cierra: v.cierra ? v.cierra.toISOString() : null,
        ventana_abierta: v.abierta,
        ventana_cerrada: v.cerrada,
        ranking_listo: retas ? false : v.ranking_listo,
        tengo_ventaja: retas ? false : tengoVentaja(uid, e),
        top_n: cfg('privilege_top_n', 12),
        mi_registro_id: mio ? mio.id : null,
        mi_status: mio ? mio.status : null,
        mi_partner_id: mio ? mio.partner_id || null : null,
        mi_partner_nombre: mio && mio.partner_id
          ? ((DB.profiles.find((p) => p.id === mio.partner_id) || {}).full_name || null) : null,
        mi_partner_status: mio ? mio.partner_status || null : null,
        mi_lugar_en_espera: mio ? mio.waitlist_position || null : null,
        mi_via_privilegio: mio ? !!mio.via_privilegio : false,
        mi_sustituto_nombre: sustituto
          ? ((DB.profiles.find((p) => p.id === sustituto.player_id) || {}).full_name || null) : null,
        horas_faltantes: horasFaltantes(e),
      };
    })
    .filter((f) => !f.categoria || !miCat || f.categoria === miCat || f.mi_registro_id);
}

/* ---------- registrar_jugador ---------- */

function registrarJugadorMock(params) {
  const esc = DB.escaleras.find((e) => e.id === params.p_escalera_id);
  if (!esc) return { data: null, error: { message: 'Convocatoria no encontrada.' } };
  const ws = wsById(esc.weekday_schedule_id) || {};
  const soyAdmin = esAdminActual();
  const v = ventanaDe(esc.id);
  const cierre = String(motor.cfgTimeMin(DB, 'privilege_close_time', '18:00'));
  const horaCierre = etiquetaHora(cierre);
  const cap = ws.capacity != null ? ws.capacity : 999;
  const necesita = ws.format === 'parejas' ? 2 : 1;
  const ocupados = ocupadosDe(esc.id);
  const ventaja = tengoVentaja(params.p_player_id, esc);
  const topN = cfg('privilege_top_n', 12);

  // La convocatoria cierra cuando el Admin le da "Comenzar escalera", no
  // cuando el reloj marca la hora de inicio.
  if (esc.status !== 'scheduled') {
    return { data: null, error: { message: 'Esa noche ya arrancó: recepción ya cerró la lista. Habla con ellos si todavía hay lugar.' } };
  }
  if (esc.session_date < fechaClub(DEMO.ahora())) {
    return { data: null, error: { message: 'Esa noche ya pasó.' } };
  }
  if (DEMO.ahora() < v.abre && !soyAdmin) {
    return { data: null, error: { message: 'La convocatoria de esta semana todavía no abre. Abre el domingo a las 10:00 am.' } };
  }

  let status; let mensaje; let via = false;
  if (v.abierta && !soyAdmin) {
    if (params.p_a_lista_espera) {
      status = 'waitlist';
      mensaje = `Quedaste en lista de espera. A las ${horaCierre} del domingo entran automático los primeros de la lista si sobran lugares.`;
    } else if (!ventaja) {
      return { data: null, error: { message: `Hasta las ${horaCierre} del domingo los lugares están apartados para el top ${topN} del ranking de tu categoría. Puedes anotarte a la lista de espera: si a esa hora sobran lugares, entras automático por orden de llegada.` } };
    } else {
      via = true;
      status = ocupados + necesita <= cap ? 'confirmed' : 'waitlist';
      mensaje = status === 'confirmed'
        ? (ws.format === 'parejas'
          ? `Lugar apartado con tu ventaja de ranking. Es provisional hasta las ${horaCierre} del domingo: las parejas se ordenan por el promedio de puntos de los dos.`
          : 'Lugar apartado con tu ventaja de ranking. Ya estás dentro.')
        : 'Los lugares ya están llenos — quedaste en lista de espera.';
    }
  } else {
    status = (ocupados + necesita <= cap && !params.p_a_lista_espera) ? 'confirmed' : 'waitlist';
    mensaje = status === 'confirmed'
      ? 'Listo, tienes tu lugar.'
      : 'Los lugares ya están llenos — quedaste en lista de espera por orden de llegada.';
  }

  const ahora = DEMO.ahora().toISOString();
  const id = nuevoRegId();
  DB.escalera_registrations.push({
    id, escalera_id: esc.id, player_id: params.p_player_id,
    partner_id: params.p_partner_id || null,
    partner_status: params.p_partner_id ? 'accepted' : null,
    status, via_privilegio: via, created_at: ahora,
    confirmed_at: status === 'confirmed' ? ahora : null,
  });
  if (params.p_partner_id) {
    DB.escalera_registrations.push({
      id: nuevoRegId(), escalera_id: esc.id, player_id: params.p_partner_id,
      partner_id: params.p_player_id, partner_status: 'pending',
      status, via_privilegio: via, created_at: ahora,
      confirmed_at: status === 'confirmed' ? ahora : null,
    });
    const quien = (DB.profiles.find((p) => p.id === params.p_player_id) || {}).full_name || 'Un jugador';
    notificar(params.p_partner_id, 'invitacion_pareja', 'Te invitaron a jugar Parejas Fijas',
      `${quien} te eligió como pareja para el ${esc.session_date.slice(8)}/${esc.session_date.slice(5, 7)}. Entra a Convocatorias para aceptar o rechazar.`, esc.id);
  }

  let finalStatus = status;
  if (v.abierta && ws.format === 'parejas') {
    reordenarParejasVentana(esc.id);
    const mio = DB.escalera_registrations.find((r) => r.id === id);
    finalStatus = mio ? mio.status : status;
    if (finalStatus === 'waitlist') {
      mensaje = `Por ahora quedaron fuera por promedio de puntos: van en lista de espera. Puede cambiar hasta las ${horaCierre} del domingo.`;
    }
  }
  if (finalStatus === 'waitlist') recalcularEspera(esc.id);
  persistir();
  return { data: [{ registration_id: id, resultado: finalStatus, mensaje }], error: null };
}

function etiquetaHora(minutos) {
  const m = Number(minutos);
  const h = Math.floor(m / 60), mm = m % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ampm}`;
}

function esAdminActual() {
  const p = DB.profiles.find((x) => x.id === uidActual());
  return !!p && ['admin', 'maestro'].includes(p.role);
}

/* ---------- bajas_semana_sin_cubrir ---------- */

function bajasSemanaSinCubrir(playerId, semana) {
  const filas = DB.escalera_registrations.filter((r) => {
    const e = DB.escaleras.find((x) => x.id === r.escalera_id);
    return r.player_id === playerId && e && ['individual', 'parejas'].includes(e.format)
      && lunesDe(e.session_date) === semana;
  });
  const confirmados = filas.filter((r) => r.confirmed_at).length;
  const bajas = filas.filter((r) => r.confirmed_at
    && ['cancelled_ontime', 'cancelled_late'].includes(r.status)
    && r.cancelled_by === r.player_id
    && !r.cubierto_por_lista_espera
    && !DB.escalera_registrations.some((s) => s.substitute_for_registration_id === r.id && s.status === 'substitute')
  ).length;
  return { confirmados, bajas };
}

/* ---------- preview_cancelacion ---------- */

function previewCancelacionMock(regId) {
  const reg = DB.escalera_registrations.find((r) => r.id === regId);
  if (!reg) throw new Error('Registro no encontrado.');
  const esc = DB.escaleras.find((e) => e.id === reg.escalera_id);
  const ws = esc ? wsById(esc.weekday_schedule_id) : null;

  const horas = esc ? horasFaltantes(esc) : 99;
  const corte = cfg('late_cancel_cutoff_hours', 12);
  const dentro = horas >= corte;
  const pct = cfg('late_cancel_penalty_pct', 15);

  const mes = esc ? esc.session_date.slice(0, 7) : '';
  const puntosMes = DB.points_ledger
    .filter((p) => p.player_id === reg.player_id && p.month_key === mes)
    .reduce((s, p) => s + Number(p.points), 0);
  const puntosEstimados = motor.round2(Math.max(puntosMes, 0) * pct / 100);

  const espera = esc ? enEsperaDe(esc.id).length : 0;
  const arrastra = !!(ws && ws.format === 'parejas' && reg.partner_id);
  const tieneVentaja = esc ? tengoVentaja(reg.player_id, esc) : false;

  const semana = esc ? lunesDe(esc.session_date) : null;
  const { confirmados, bajas } = semana ? bajasSemanaSinCubrir(reg.player_id, semana) : { confirmados: 0, bajas: 0 };
  const perderia = tieneVentaja && (bajas + 1) >= 2 && (bajas + 1) >= confirmados;

  let titulo; let mensaje;
  if (perderia) {
    titulo = 'Ojo: perderías tu ventaja de ranking';
    mensaje = 'Confirmaste todos tus eventos de esta semana y te estarías dando de baja de todos sin dejar sustituto. '
      + 'Si lo haces, la próxima semana ya no vas a poder apartar lugar el domingo por ranking: te vas a formar como todos.';
  } else if (!dentro && espera === 0) {
    titulo = 'Esta baja sí tiene penalización';
    mensaje = `Faltan menos de ${corte} horas y no hay nadie en lista de espera que pueda tomar tu lugar, `
      + `así que aplica la penalización de ${pct}% de tus puntos del mes (aprox. ${puntosEstimados} pts). `
      + 'Si consigues sustituto o alguien entra de lista de espera, no se te cobra.';
  } else if (!dentro) {
    titulo = 'Estás fuera del plazo sin penalización';
    mensaje = `Faltan menos de ${corte} horas, pero hay ${espera} en lista de espera. `
      + `Si alguien toma tu lugar de inmediato no hay penalización; si no, aplica el ${pct}% de tus puntos del mes.`;
  } else {
    titulo = 'Baja sin penalización';
    mensaje = `Todavía faltan más de ${corte} horas para el evento, así que no hay ninguna penalización.`;
  }
  if (arrastra) mensaje += ' Ojo: en Parejas Fijas se cae la pareja completa, tu compañero también se queda fuera.';

  return {
    horas_antes: horas, dentro_de_corte: dentro, corte_horas: corte,
    penalizacion_pct: pct, puntos_estimados: puntosEstimados,
    en_lista_espera: espera, arrastra_pareja: arrastra,
    tiene_ventaja: tieneVentaja, perderia_ventaja: perderia, titulo, mensaje,
  };
}

/* ---------- cancelar_registro ---------- */

function cancelarRegistroMock(regId) {
  const reg = DB.escalera_registrations.find((r) => r.id === regId);
  if (!reg) throw new Error('Registro no encontrado.');
  if (['cancelled_ontime', 'cancelled_late', 'declined', 'no_show'].includes(reg.status)) {
    throw new Error('Este registro ya estaba dado de baja.');
  }
  const yo = uidActual();
  const propia = reg.player_id === yo;
  const esc = DB.escaleras.find((e) => e.id === reg.escalera_id);
  const ws = esc ? wsById(esc.weekday_schedule_id) : null;
  const horas = esc ? horasFaltantes(esc) : 99;
  const corte = cfg('late_cancel_cutoff_hours', 12);
  const ocupaba = ['confirmed', 'substitute'].includes(reg.status);
  const ocupadosAntes = esc ? ocupadosDe(esc.id) : 0;

  reg.status = (!ocupaba || horas >= corte) ? 'cancelled_ontime' : 'cancelled_late';
  reg.cancelled_at = DEMO.ahora().toISOString();
  reg.cancelled_by = yo;

  if (ws && ws.format === 'parejas' && reg.partner_id && ocupaba) {
    const pareja = DB.escalera_registrations.find((r) => r.escalera_id === reg.escalera_id
      && r.player_id === reg.partner_id && r.partner_id === reg.player_id && ACTIVOS.includes(r.status));
    if (pareja) {
      pareja.status = 'cancelled_ontime';
      pareja.cancelled_at = DEMO.ahora().toISOString();
      pareja.cancelled_by = yo;
      const quien = (DB.profiles.find((p) => p.id === reg.player_id) || {}).full_name || 'Tu pareja';
      notificar(pareja.player_id, 'pareja_cancelada', 'Se cayó tu pareja para ese día',
        `${quien} se dio de baja del ${esc.session_date.slice(8)}/${esc.session_date.slice(5, 7)}. En Parejas Fijas se libera el lugar de los dos, pero a ti no te aplica ninguna penalización. Puedes volver a inscribirte con alguien más.`, esc.id);
    }
  }

  if (ocupaba && esc) {
    const v = ventanaDe(esc.id);
    if (v.abierta && esc.format === 'parejas') reordenarParejasVentana(esc.id);
    else if (v.abierta) recalcularEspera(esc.id);
    else promoverEspera(esc.id);
  }

  const cubierto = ocupaba && esc ? ocupadosDe(esc.id) >= ocupadosAntes : false;
  if (cubierto) reg.cubierto_por_lista_espera = true;

  const pct = cfg('late_cancel_penalty_pct', 15);
  let penal = 0;
  if (reg.status === 'cancelled_late' && !cubierto && esc) {
    const mes = esc.session_date.slice(0, 7);
    const puntosMes = DB.points_ledger
      .filter((p) => p.player_id === reg.player_id && p.month_key === mes)
      .reduce((s, p) => s + Number(p.points), 0);
    penal = motor.round2(Math.max(puntosMes, 0) * pct / 100);
    if (penal > 0) {
      DB.points_ledger.push({
        id: motor.nuevoId(DB, 'pl'), player_id: reg.player_id, escalera_id: esc.id,
        round_match_id: null, format: esc.format, points: -penal, reason: 'late_cancel_penalty',
        court_number: null, multiplier_applied: null, month_key: mes, created_by: yo,
        notes: `Baja a ${horas} h del evento, sin sustituto y sin nadie en lista de espera.`,
        created_at: DEMO.ahora().toISOString(),
      });
    }
  }

  let perdio = false;
  if (propia && ocupaba && !cubierto && esc) {
    const semana = lunesDe(esc.session_date);
    const { confirmados, bajas } = bajasSemanaSinCubrir(reg.player_id, semana);
    if (bajas >= 2 && bajas >= confirmados) {
      const castigo = sumarDias(semana, cfg('privilege_lockout_weeks', 1) * 7);
      const yaEsta = DB.ranking_privilege_penalties.some(
        (p) => p.player_id === reg.player_id && p.week_start === castigo);
      if (!yaEsta) {
        DB.ranking_privilege_penalties.push({
          id: motor.nuevoId(DB, 'pen'), player_id: reg.player_id, week_start: castigo,
          reason: 'doble_baja_sin_sustituto', source_escalera_id: esc.id,
          created_at: DEMO.ahora().toISOString(),
        });
        perdio = true;
        notificar(reg.player_id, 'privilegio_perdido', 'Perdiste tu ventaja de ranking la próxima semana',
          'Confirmaste todos tus eventos de esta semana y te diste de baja de todos sin dejar sustituto ni que alguien tomara tu lugar. '
          + 'La próxima semana no vas a poder apartar lugar el domingo por ranking: te formas como todos, por orden de llegada. '
          + 'A la siguiente semana la recuperas.', esc.id);
      }
    }
  }

  persistir();
  const mensaje = penal > 0
    ? `Te diste de baja con menos de ${corte} h y nadie tomó tu lugar: se aplicó una penalización de ${penal} pts.`
    : (cubierto && reg.status === 'cancelled_late'
      ? 'Te diste de baja tarde, pero alguien de la lista de espera tomó tu lugar: sin penalización.'
      : (reg.status === 'cancelled_late'
        ? 'Te diste de baja tarde. No había puntos del mes que descontar, pero quedó registrado.'
        : 'Listo, te dimos de baja sin penalización.'));

  return { estado: reg.status, penalizado: penal > 0, puntos_penalizacion: penal, perdio_ventaja: perdio, cubierto, mensaje };
}

/* ---------- recomendacion_cupo ---------- */

function recomendacionCupoMock(escId) {
  const esc = DB.escaleras.find((e) => e.id === escId);
  const ws = esc ? wsById(esc.weekday_schedule_id) || {} : {};
  const confirmados = ocupadosDe(escId);
  const capacidad = ws.capacity != null ? ws.capacity : 12;
  const horas = esc ? horasFaltantes(esc) : 99;
  const chequeo = cfg('cupo_check_hours_before', 6);
  const yaToca = horas <= chequeo;
  const maximas = ws.courts || 3;
  const faltan = capacidad - confirmados;
  const base = {
    confirmados, capacidad, canchas_actuales: esc ? (esc.courts_active || maximas) : maximas,
    canchas_maximas: maximas, en_lista_espera: enEsperaDe(escId).length,
    horas_faltantes: horas, ya_toca_decidir: yaToca, canchas_sugeridas: maximas,
  };
  if (ws.format === 'retas_abiertas') {
    return { ...base, accion: 'na', canchas_sugeridas: base.canchas_actuales,
      titulo: 'Retas Abiertas', detalle: 'Formato libre, sin cupo: no aplica revisión de canchas.' };
  }
  if (confirmados >= capacidad) {
    return { ...base, accion: 'completo', titulo: 'Cupo completo',
      detalle: `Están los ${confirmados} lugares llenos. En cuanto todos estén en cancha, dale "Comenzar escalera".` };
  }
  if (!yaToca) {
    return { ...base, accion: 'esperar', titulo: `Van ${confirmados} de ${capacidad}`,
      detalle: `Faltan ${faltan} y todavía quedan ${horas} h. Dale chance a la lista de espera; la app te vuelve a avisar cuando falten ${chequeo} h.` };
  }
  // Regla del club: o se completa el cupo, o no hay escalera.
  return { ...base, accion: 'cancelar', titulo: `Faltan ${faltan} para completar`,
    detalle: `Van ${confirmados} de ${capacidad} y ya falta poco para la hora. Si no se completa, cancela la noche: la escalera solo arranca con el cupo lleno. Al cancelar nadie recibe penalización ni pierde puntos, y se les avisa a todos automáticamente.` };
}

/* ---------- comenzar_escalera ---------- */

function comenzarEscaleraMock(escId) {
  const e = DB.escaleras.find((x) => x.id === escId);
  if (!e) throw new Error('Convocatoria no encontrada.');
  const ws = wsById(e.weekday_schedule_id) || {};
  if (e.format === 'retas_abiertas') throw new Error('Las Retas Abiertas no se arrancan desde aquí: son libres y no reparten puntos.');
  if (e.status === 'cancelled') throw new Error('Esta noche está cancelada.');
  if (e.status === 'completed') throw new Error('Esta noche ya se cerró.');
  if (e.status === 'in_progress') throw new Error('Esta noche ya está en juego.');

  const cap = ws.capacity != null ? ws.capacity : 12;
  const conf = ocupadosDe(escId);
  const espera = enEsperaDe(escId).length;
  if (conf < cap) {
    throw new Error(`Van ${conf} de ${cap} lugares: faltan ${cap - conf}. La escalera solo arranca con el cupo completo — si no se llena, cancela la noche.`);
  }

  const roundId = motor.generarRondaInicial(DB, escId, ctx());

  // Quien quedó en lista de espera ya no alcanzó lugar esta noche.
  DB.escalera_registrations
    .filter((r) => r.escalera_id === escId && r.status === 'waitlist')
    .forEach((r) => { r.status = 'cancelled_ontime'; r.cancelled_at = DEMO.ahora().toISOString(); });

  persistir();
  return { escalera_id: escId, round_id: roundId, jugadores: conf, canchas: conf / 4, lista_espera_liberada: espera };
}

/* ---------- admin_agregar_jugador ---------- */

function adminAgregarJugadorMock(escId, playerId, partnerId) {
  const e = DB.escaleras.find((x) => x.id === escId);
  if (!e) throw new Error('Convocatoria no encontrada.');
  const ws = wsById(e.weekday_schedule_id) || {};
  if (e.status !== 'scheduled') throw new Error('Esa noche ya arrancó o ya se cerró: ya no se puede agregar gente.');
  if (e.format === 'retas_abiertas') throw new Error('Retas Abiertas es libre: no hace falta agregar a nadie.');
  if (e.format === 'parejas' && !partnerId) throw new Error('En Parejas Fijas hay que agregar a los dos: falta el compañero.');
  if (e.format === 'individual' && partnerId) throw new Error('El formato Individual no usa compañero.');
  if (DB.escalera_registrations.some((r) => r.escalera_id === escId && r.player_id === playerId && ACTIVOS.includes(r.status))) {
    throw new Error('Esa persona ya está en la lista de esta noche.');
  }
  const perfil = DB.profiles.find((p) => p.id === playerId);
  if (perfil && perfil.status === 'suspended') throw new Error('Esa cuenta está suspendida.');

  const cap = ws.capacity != null ? ws.capacity : 12;
  const necesita = e.format === 'parejas' ? 2 : 1;
  const conf = ocupadosDe(escId);
  if (conf + necesita > cap) throw new Error(`Ya están los ${cap} lugares llenos. Primero quita a alguien.`);

  const ahora = DEMO.ahora().toISOString();
  const id = nuevoRegId();
  DB.escalera_registrations.push({
    id, escalera_id: escId, player_id: playerId, partner_id: partnerId || null,
    partner_status: partnerId ? 'accepted' : null, status: 'confirmed',
    via_privilegio: false, created_at: ahora, confirmed_at: ahora,
  });
  if (partnerId) {
    DB.escalera_registrations.push({
      id: nuevoRegId(), escalera_id: escId, player_id: partnerId, partner_id: playerId,
      partner_status: 'accepted', status: 'confirmed',
      via_privilegio: false, created_at: ahora, confirmed_at: ahora,
    });
  }
  notificar(playerId, 'promocion_lista_espera', 'Recepción te anotó para esta noche',
    `Te agregaron a la convocatoria del ${e.session_date.slice(8)}/${e.session_date.slice(5, 7)}. Ya tienes lugar confirmado.`, escId);
  if (partnerId) {
    notificar(partnerId, 'promocion_lista_espera', 'Recepción los anotó para esta noche',
      `Los agregaron como pareja a la convocatoria del ${e.session_date.slice(8)}/${e.session_date.slice(5, 7)}.`, escId);
  }
  recalcularEspera(escId);
  persistir();
  return { registration_id: id, resultado: 'confirmed',
    mensaje: `${(perfil && perfil.full_name) || 'El jugador'} quedó confirmado. Van ${conf + necesita} de ${cap}.` };
}

/* ---------- mi_carrera_liguilla ---------- */

function miCarreraMock(tier, playerId) {
  const cat = tier === 'liguilla_a' ? 'A' : 'B';
  const tabla = motor.rankingVivo(DB, cat);
  const topN = cfg('liguilla_top_n', 12);
  const yo = tabla.find((r) => r.player_id === playerId);
  const corte = tabla[topN - 1];
  const ev = DB.liguilla_events.find((e) => e.tier === tier && e.status !== 'finalized');
  const hoy = fechaClub(DEMO.ahora());
  const noches = ev ? DB.escaleras.filter((e) => e.session_date > hoy && e.session_date < ev.event_date
    && e.category === cat && ['individual', 'parejas'].includes(e.format)).length : 0;

  if (!yo) {
    return {
      tiene_lugar: false, mi_rank: null, mis_puntos: 0, puntos_corte: corte ? corte.rolling_points : 0,
      faltan: null, noches_restantes: noches, imposible: false, top_n: topN,
      mensaje: 'Todavía no tienes noches jugadas este mes, así que aún no apareces en la tabla. En cuanto juegues tu primera escalera del mes entras a la carrera.',
    };
  }
  const dentro = yo.rnk <= topN;
  const faltan = dentro ? 0 : motor.round2(Number(corte.rolling_points) - Number(yo.rolling_points) + 0.01);
  // Una noche muy buena ronda los 200 puntos; con eso se estima si todavía da.
  const techoPorNoche = 200;
  const imposible = !dentro && noches > 0 && faltan > techoPorNoche * noches;
  return {
    tiene_lugar: dentro, mi_rank: yo.rnk, mis_puntos: yo.rolling_points,
    puntos_corte: corte ? corte.rolling_points : 0, faltan, noches_restantes: noches,
    imposible: !dentro && (noches === 0 || imposible), top_n: topN,
    mensaje: dentro
      ? `Vas en el lugar ${yo.rnk}: hoy estás dentro del top ${topN} que califica. Cuida tu lugar, todavía faltan ${noches} noche(s).`
      : (noches === 0
        ? 'Ya no quedan noches antes del evento, así que este mes no alcanzas. La carrera del mes que entra arranca de cero.'
        : `Te faltan ${faltan} puntos para meterte al top ${topN}, y quedan ${noches} noche(s). ${imposible ? 'Matemáticamente ya no alcanza este mes.' : 'Todavía se puede.'}`),
  };
}

// ---- helpers de dominio: Liguilla ----

function jugadoresEmparejados(eventId) {
  const ids = new Set();
  DB.liguilla_pairs.filter((p) => p.liguilla_event_id === eventId).forEach((p) => { ids.add(p.player1_id); ids.add(p.player2_id); });
  return ids;
}

function intentarCerrarDraft(ev) {
  const confirmados = DB.liguilla_qualifiers.filter((q) => q.liguilla_event_id === ev.id && q.status === 'confirmed');
  const emparejados = jugadoresEmparejados(ev.id);
  const faltan = confirmados.filter((q) => !emparejados.has(q.player_id));
  if (faltan.length === 0 && confirmados.length >= 2) {
    ev.status = 'confirmed';
    const seedOf = (playerId) => {
      const q = DB.liguilla_qualifiers.find((x) => x.liguilla_event_id === ev.id && x.player_id === playerId);
      return q ? q.seed : 99;
    };
    const pares = DB.liguilla_pairs.filter((p) => p.liguilla_event_id === ev.id);
    pares.sort((a, b) => (seedOf(a.player1_id) + seedOf(a.player2_id)) - (seedOf(b.player1_id) + seedOf(b.player2_id)));
    pares.forEach((p, i) => { p.seed_pair = i + 1; });
  }
}

function seedPairDe(pairId) {
  const p = DB.liguilla_pairs.find((x) => x.id === pairId);
  return p ? (p.seed_pair || 99) : 99;
}

function aplicarSetsALiguillaMatch(m, sets) {
  let s1 = 0, s2 = 0, g1 = 0, g2 = 0;
  sets.forEach((s) => { g1 += s.pair1; g2 += s.pair2; if (s.pair1 > s.pair2) s1++; else s2++; });
  m.status = 'completed';
  m.sets_json = { sets: sets.map((s) => ({ pair1: s.pair1, pair2: s.pair2 })), totales: { pair1: { sets: s1, games: g1 }, pair2: { sets: s2, games: g2 } } };
  m.winner_pair_id = s1 > s2 ? m.pair1_id : m.pair2_id;
  m.loser_pair_id = s1 > s2 ? m.pair2_id : m.pair1_id;
}

function gamesDiff(m) {
  const t = m.sets_json && m.sets_json.totales;
  if (!t) return 0;
  const esPair1 = m.loser_pair_id === m.pair1_id;
  const propio = esPair1 ? t.pair1 : t.pair2;
  const rival = esPair1 ? t.pair2 : t.pair1;
  return (propio.games || 0) - (rival.games || 0);
}

/** Ronda 2 real: sembrado (mejor seed de los ganadores) vs Lucky Loser
 * (mejor perdedor por diferencia de games) + los otros dos ganadores
 * entre sí. Los dos perdedores restantes ya quedan emparejados para el
 * partido de 5º-6º lugar (se puede jugar en paralelo a la Ronda 2). */
function generarRonda2Liguilla(ev, ronda1Matches) {
  const ganadores = ronda1Matches.map((m) => ({ pairId: m.winner_pair_id, seedPair: seedPairDe(m.winner_pair_id) })).sort((a, b) => a.seedPair - b.seedPair);
  const perdedores = ronda1Matches.map((m) => ({ pairId: m.loser_pair_id, diff: gamesDiff(m) })).sort((a, b) => b.diff - a.diff);

  const sembrado = ganadores[0].pairId;
  const otros = [ganadores[1].pairId, ganadores[2].pairId];
  const luckyLoser = perdedores[0].pairId;
  const consolacionA = perdedores[1].pairId;
  const consolacionB = perdedores[2].pairId;

  let court = DB.liguilla_matches.filter((x) => x.liguilla_event_id === ev.id).length + 1;
  const nuevoId = () => 'lm' + (DB.liguilla_matches.length + 1);

  DB.liguilla_matches.push({
    id: nuevoId(), liguilla_event_id: ev.id, stage: 'ronda2', match_purpose: 'r2_sembrado_vs_lucky_loser',
    court_number: court++, pair1_id: sembrado, pair2_id: luckyLoser, status: 'pending', sets_json: null,
    winner_pair_id: null, loser_pair_id: null,
  });
  DB.liguilla_matches.push({
    id: nuevoId(), liguilla_event_id: ev.id, stage: 'ronda2', match_purpose: 'r2_otros_ganadores',
    court_number: court++, pair1_id: otros[0], pair2_id: otros[1], status: 'pending', sets_json: null,
    winner_pair_id: null, loser_pair_id: null,
  });
  // La consolación 5º-6º ya se puede jugar desde este momento — por eso
  // vive en stage "final" (junto con el partido de campeonato) aunque se
  // genere aquí: sus dos parejas ya se conocen sin esperar a la Ronda 2.
  DB.liguilla_matches.push({
    id: nuevoId(), liguilla_event_id: ev.id, stage: 'final', match_purpose: 'r2_consolacion_5_6',
    court_number: court++, pair1_id: consolacionA, pair2_id: consolacionB, status: 'pending', sets_json: null,
    winner_pair_id: null, loser_pair_id: null,
  });
}

function generarFinalLiguilla(ev, ronda2Matches) {
  const ganadores = ronda2Matches.map((m) => m.winner_pair_id);
  const court = DB.liguilla_matches.filter((x) => x.liguilla_event_id === ev.id).length + 1;
  DB.liguilla_matches.push({
    id: 'lm' + (DB.liguilla_matches.length + 1), liguilla_event_id: ev.id, stage: 'final', match_purpose: 'final',
    court_number: court, pair1_id: ganadores[0], pair2_id: ganadores[1], status: 'pending', sets_json: null,
    winner_pair_id: null, loser_pair_id: null,
  });
}

function finalizarLiguilla(ev, partidos) {
  const final = partidos.find((x) => x.stage === 'final' && x.match_purpose === 'final');
  const consolacion = partidos.find((x) => x.match_purpose === 'r2_consolacion_5_6');
  const ronda2 = partidos.filter((x) => x.stage === 'ronda2');
  const pares = DB.liguilla_pairs.filter((p) => p.liguilla_event_id === ev.id);
  const setPlacement = (pairId, lugar) => { const p = pares.find((x) => x.id === pairId); if (p) p.final_placement = lugar; };
  if (final) { setPlacement(final.winner_pair_id, 1); setPlacement(final.loser_pair_id, 2); }
  ronda2.map((m) => m.loser_pair_id).filter(Boolean).forEach((pid, i) => setPlacement(pid, 3 + i));
  if (consolacion) { setPlacement(consolacion.winner_pair_id, 5); setPlacement(consolacion.loser_pair_id, 6); }
  ev.status = 'completed';
}

/** Avanza el estado de la Liguilla tras registrar el resultado de `m`.
 * Refleja el comportamiento auto-avanzante real: la Ronda 2 (con Lucky
 * Loser + consolación 5º-6º) y la Final se generan solas, sin que el
 * front tenga que orquestarlo. */
function avanzarLiguilla(ev, m) {
  const partidos = DB.liguilla_matches.filter((x) => x.liguilla_event_id === ev.id);

  if (m.stage === 'final') {
    if (m.match_purpose === 'r2_consolacion_5_6') {
      const principal = partidos.find((x) => x.stage === 'final' && x.match_purpose === 'final');
      if (!principal || principal.status !== 'completed') return 'pendiente_consolacion_5_6';
      finalizarLiguilla(ev, partidos);
      return 'liguilla_finalizada';
    }
    const consolacion = partidos.find((x) => x.match_purpose === 'r2_consolacion_5_6');
    if (consolacion && consolacion.status !== 'completed') return 'pendiente_consolacion_5_6';
    finalizarLiguilla(ev, partidos);
    return 'liguilla_finalizada';
  }

  const delMismoStage = partidos.filter((x) => x.stage === m.stage);
  const pendientes = delMismoStage.filter((x) => x.status !== 'completed');
  if (pendientes.length > 0) return m.stage === 'ronda1' ? 'ronda1_en_curso' : 'ronda2_en_curso';

  if (m.stage === 'ronda1') {
    generarRonda2Liguilla(ev, delMismoStage);
    return 'ronda2_generada';
  }
  if (m.stage === 'ronda2') {
    generarFinalLiguilla(ev, delMismoStage);
    return 'final_generada';
  }
  return 'ok';
}
function makeQuery(table) {
  // El "domingo" de la demo se dispara con cualquier lectura, no solo con
  // Convocatorias: asi el Ranking tambien se ve recalculado.
  if (table === 'category_snapshots' || table === 'escaleras') correrDomingoSiToca();
  const filters = [];
  let mode = 'multi';
  let updateFields = null;
  let insertFields = null;
  let orderCol = null, orderAsc = true;
  let limitN = null;

  const api = {
    select() { return api; },
    eq(col, val) {
      // La consola de la demo necesita saber qué noche está viendo el Admin
      // para poder ofrecer el atajo de "llenar marcadores".
      if (table === 'rounds' && col === 'escalera_id') window.__demoEscaleraVista = val;
      filters.push((r) => r[col] === val);
      return api;
    },
    neq(col, val) { filters.push((r) => r[col] !== val); return api; },
    in(col, arr) { filters.push((r) => arr.includes(r[col])); return api; },
    gte(col, val) { filters.push((r) => r[col] >= val); return api; },
    lte(col, val) { filters.push((r) => r[col] <= val); return api; },
    ilike(col, pattern) {
      const needle = String(pattern).replace(/%/g, '').toLowerCase();
      filters.push((r) => String(r[col] || '').toLowerCase().includes(needle));
      return api;
    },
    not(col, _op, val) {
      // supabase-js style: .not('status', 'in', '("cancelled")')
      const inner = String(val).replace(/[()"]/g, '');
      const excluded = inner.split(',').filter(Boolean);
      filters.push((r) => !excluded.includes(r[col]));
      return api;
    },
    order(col, opts) { orderCol = col; orderAsc = !opts || opts.ascending !== false; return api; },
    limit(n) { limitN = n; return api; },
    single() { mode = 'single'; return api; },
    maybeSingle() { mode = 'maybeSingle'; return api; },
    update(fields) { updateFields = fields; return api; },
    insert(fields) { insertFields = fields; return api; },
    then(resolve, reject) {
      try {
        resolve(execute());
      } catch (e) {
        if (reject) reject(e); else throw e;
      }
    },
  };

  function baseRows() {
    if (table === 'profiles') return DB.profiles.map(clone);
    if (table === 'category_snapshots') return DB.category_snapshots.map(clone);
    if (table === 'escaleras') return DB.escaleras.map((e) => ({ ...clone(e), weekday_schedule: clone(wsById(e.weekday_schedule_id)) }));
    if (table === 'escalera_registrations') return DB.escalera_registrations.map((r) => attachEscaleraJoin(clone(r)));
    if (table === 'rules_content') return DB.rules_content.map(clone);
    if (table === 'points_ledger') return DB.points_ledger.map(clone);
    if (table === 'liguilla_events') return DB.liguilla_events.map(clone);
    if (table === 'liguilla_qualifiers') return DB.liguilla_qualifiers.map((q) => ({ ...clone(q), profiles: clone(DB.profiles.find((p) => p.id === q.player_id)) || null }));
    if (table === 'liguilla_pairs') return DB.liguilla_pairs.map((pr) => ({
      ...clone(pr),
      player1: clone(DB.profiles.find((p) => p.id === pr.player1_id)) || null,
      player2: clone(DB.profiles.find((p) => p.id === pr.player2_id)) || null,
    }));
    if (table === 'liguilla_draft_picks') return DB.liguilla_draft_picks.map((d) => ({
      ...clone(d),
      picker: clone(DB.profiles.find((p) => p.id === d.picker_player_id)) || null,
      picked: d.picked_player_id ? clone(DB.profiles.find((p) => p.id === d.picked_player_id)) || null : null,
    }));
    if (table === 'liguilla_matches') return DB.liguilla_matches.map(clone);
    if (table === 'rounds') return DB.rounds.map(clone);
    if (table === 'round_matches') return DB.round_matches.map((m) => ({
      ...clone(m),
      team1_player1_nombre: m.team1_player1 ? clone(DB.profiles.find((p) => p.id === m.team1_player1)) || null : null,
      team1_player2_nombre: m.team1_player2 ? clone(DB.profiles.find((p) => p.id === m.team1_player2)) || null : null,
      team2_player1_nombre: m.team2_player1 ? clone(DB.profiles.find((p) => p.id === m.team2_player1)) || null : null,
      team2_player2_nombre: m.team2_player2 ? clone(DB.profiles.find((p) => p.id === m.team2_player2)) || null : null,
    }));
    if (table === 'fines') return DB.fines.map((f) => ({ ...clone(f), profiles: clone(DB.profiles.find((p) => p.id === f.player_id)) || null }));
    if (table === 'suspensions') return DB.suspensions.map((s) => ({ ...clone(s), profiles: clone(DB.profiles.find((p) => p.id === s.player_id)) || null }));
    if (table === 'notifications') return DB.notifications.map(clone);
    if (table === 'system_settings') return DB.system_settings.map(clone);
    if (table === 'weekday_schedule') return DB.weekday_schedule.map(clone);
    return [];
  }

  // Tablas simples respaldadas por un arreglo plano en DB, usadas por
  // doUpdate/doInsert. profiles ya no es un caso especial — cualquier
  // tabla de esta lista soporta .update()/.insert() genéricamente.
  const ARRAY_TABLES = {
    profiles: DB.profiles,
    fines: DB.fines,
    suspensions: DB.suspensions,
    notifications: DB.notifications,
    system_settings: DB.system_settings,
    weekday_schedule: DB.weekday_schedule,
  };

  function doUpdate() {
    const arr = ARRAY_TABLES[table];
    if (!arr) return { data: null, error: { message: `mock: update no soportado en tabla "${table}"` } };
    const idx = arr.findIndex((r) => filters.every((f) => f(r)));
    if (idx === -1) return { data: null, error: { message: 'No encontrado.' } };
    arr[idx] = { ...arr[idx], ...updateFields };
    const row = clone(arr[idx]);
    return { data: mode === 'multi' ? [row] : row, error: null };
  }

  function doInsert() {
    if (table === 'fines') {
      const row = {
        id: 'f' + (DB.fines.length + 1),
        player_id: insertFields.player_id,
        amount_mxn: insertFields.amount_mxn,
        reason: insertFields.reason ?? null,
        escalera_id: insertFields.escalera_id ?? null,
        status: 'pending',
        applied_at: DEMO.ahora().toISOString(),
        paid_at: null,
      };
      DB.fines.push(row);
      return { data: mode === 'single' ? clone(row) : [clone(row)], error: null };
    }
    if (table === 'suspensions') {
      const row = {
        id: 's' + (DB.suspensions.length + 1),
        player_id: insertFields.player_id,
        start_date: insertFields.start_date,
        end_date: insertFields.end_date ?? null,
        reason: insertFields.reason ?? null,
        lifted_at: null,
        created_at: DEMO.ahora().toISOString(),
      };
      DB.suspensions.push(row);
      return { data: mode === 'single' ? clone(row) : [clone(row)], error: null };
    }
    return { data: null, error: { message: `mock: insert no soportado en tabla "${table}"` } };
  }

  function execute() {
    if (insertFields) return doInsert();
    if (updateFields) return doUpdate();

    let rows = baseRows().filter((r) => filters.every((f) => f(r)));

    // ranking join: category_snapshots select('*, profiles(...)')
    if (table === 'category_snapshots') {
      rows = rows.map((r) => ({ ...r, profiles: clone(DB.profiles.find((p) => p.id === r.player_id)) || null }));
    }

    if (orderCol) {
      rows.sort((a, b) => {
        const av = a[orderCol], bv = b[orderCol];
        if (av == null && bv == null) return 0;
        if (av == null) return orderAsc ? 1 : -1;
        if (bv == null) return orderAsc ? -1 : 1;
        if (av < bv) return orderAsc ? -1 : 1;
        if (av > bv) return orderAsc ? 1 : -1;
        return 0;
      });
    }
    if (limitN != null) rows = rows.slice(0, limitN);

    if (mode === 'single') {
      if (!rows.length) return { data: null, error: { message: 'No rows found' } };
      return { data: rows[0], error: null };
    }
    if (mode === 'maybeSingle') {
      return { data: rows[0] || null, error: null };
    }
    return { data: rows, error: null };
  }

  return api;
}
/* ============================================================
   Sesión: en la demo no hay correo ni contraseña. Se entra
   eligiendo a quién quieres ser desde la barra de arriba.
   ============================================================ */

let authListeners = [];
let currentSession = null;

function setSession(session) {
  currentSession = session;
  DEMO.uid = session ? session.user.id : null;
  DEMO.persistir();
  authListeners.forEach((cb) => cb(session ? 'SIGNED_IN' : 'SIGNED_OUT', session));
}

function sesionDe(userId) {
  const p = DB.profiles.find((x) => x.id === userId);
  if (!p) return null;
  return { user: { id: p.id, email: p.email }, access_token: 'demo' };
}

export function entrarComo(userId) { setSession(sesionDe(userId)); }
export function salir() { setSession(null); }
export function usuarioActual() { return DB.profiles.find((p) => p.id === uidActual()) || null; }

// Al recargar la página se vuelve a entrar con quien estabas.
if (DEMO.uid && DB.profiles.some((p) => p.id === DEMO.uid)) {
  currentSession = sesionDe(DEMO.uid);
}

export function createClient() {
  log('createClient() — cliente de demo, sin red.');
  return {
    auth: {
      async getSession() { return { data: { session: currentSession }, error: null }; },
      async signInWithOtp() {
        return { error: { message: 'En la demo no se entra por correo: usa el selector de arriba para elegir con quién entrar.' } };
      },
      async signOut() { setSession(null); return { error: null }; },
      onAuthStateChange(cb) {
        authListeners.push(cb);
        return { data: { subscription: { unsubscribe() { authListeners = authListeners.filter((c) => c !== cb); } } } };
      },
    },
    from(table) { return makeQuery(table); },
    async rpc(name, params) {
      if (window.__demoTrazar) console.log('[demo] rpc', name, params);
      await new Promise((r) => setTimeout(r, 150));

      if (name === 'mis_convocatorias') {
        return { data: misConvocatorias(uidActual()), error: null };
      }
      if (name === 'registrar_jugador') {
        return registrarJugadorMock(params);
      }
      if (name === 'preview_cancelacion') {
        return { data: [previewCancelacionMock(params.p_registration_id)], error: null };
      }
      if (name === 'asignar_sustituto_admin') {
        const reg = DB.escalera_registrations.find((r) => r.id === params.p_registration_id);
        if (!reg) return { data: null, error: { message: 'Registro no encontrado.' } };
        const id = nuevoRegId();
        DB.escalera_registrations.push({
          id, escalera_id: reg.escalera_id, player_id: params.p_sustituto_player_id,
          partner_id: reg.partner_id || null, partner_status: reg.partner_id ? 'accepted' : null,
          status: 'substitute', substitute_for_registration_id: reg.id,
          no_point_split: true, admin_substitute_reason: params.p_motivo || null,
          created_at: DEMO.ahora().toISOString(), confirmed_at: DEMO.ahora().toISOString(),
        });
        reg.status = 'cancelled_ontime';
        reg.cancelled_at = DEMO.ahora().toISOString();
        reg.cubierto_por_lista_espera = true;
        return { data: id, error: null };
      }
      if (name === 'comenzar_escalera') {
        return envolver(() => comenzarEscaleraMock(params.p_escalera_id));
      }
      if (name === 'admin_agregar_jugador') {
        return envolver(() => [adminAgregarJugadorMock(
          params.p_escalera_id, params.p_player_id, params.p_partner_id || null)]);
      }
      if (name === 'recomendacion_cupo') {
        return { data: [recomendacionCupoMock(params.p_escalera_id)], error: null };
      }
      if (name === 'ajustar_canchas_escalera') {
        const esc = DB.escaleras.find((e) => e.id === params.p_escalera_id);
        if (!esc) return { data: null, error: { message: 'Convocatoria no encontrada.' } };
        esc.courts_active = params.p_courts;
        return { data: null, error: null };
      }
      if (name === 'cancelar_escalera_admin') {
        const esc = DB.escaleras.find((e) => e.id === params.p_escalera_id);
        if (!esc) return { data: null, error: { message: 'Convocatoria no encontrada.' } };
        esc.status = 'cancelled';
        esc.cancel_reason = params.p_motivo;
        DB.escalera_registrations
          .filter((r) => r.escalera_id === esc.id && ACTIVOS.includes(r.status))
          .forEach((r) => { r.status = 'cancelled_ontime'; r.cancelled_at = DEMO.ahora().toISOString(); });
        return { data: null, error: null };
      }
      if (name === 'autoprogramar_liguilla_mes') {
        return { data: [], error: null };
      }
      if (name === 'liguilla_tabla_vivo') {
        const cat = params.p_tier === 'liguilla_a' ? 'A' : 'B';
        return { data: rankingVivo(cat).slice(0, params.p_limite || 20).map((r) => ({
          player_id: r.player_id,
          full_name: (DB.profiles.find((p) => p.id === r.player_id) || {}).full_name || 'Jugador',
          avatar_url: null,
          rolling_points: r.rolling_points,
          escaleras_contadas: r.escaleras_counted || 0,
          rnk: r.rnk,
          calificado: r.rnk <= 12,
        })), error: null };
      }
      if (name === 'mi_carrera_liguilla') {
        return { data: [miCarreraMock(params.p_tier, params.p_player_id || uidActual())], error: null };
      }
      if (name === 'responder_invitacion_pareja') {
        const reg = DB.escalera_registrations.find((r) => r.id === params.p_registration_id);
        if (reg) reg.partner_status = params.p_aceptar ? 'confirmed' : 'declined';
        return { data: null, error: null };
      }
      if (name === 'cancelar_registro') {
        return { data: [cancelarRegistroMock(params.p_registration_id)], error: null };
      }
      if (name === 'registrarse_retas_abiertas') {
        const escId = params.p_escalera_id;
        const playerId = currentSession ? currentSession.user.id : ME;
        const esc = DB.escaleras.find((e) => e.id === escId);
        if (!esc) return { data: null, error: { message: 'Convocatoria no encontrada.' } };
        if (esc.format !== 'retas_abiertas') return { data: null, error: { message: 'Esta convocatoria no es Retas Abiertas.' } };
        let reg = DB.escalera_registrations.find((r) => r.escalera_id === escId && r.player_id === playerId);
        if (reg) {
          if (reg.status === 'confirmed') return { data: [{ registration_id: reg.id, resultado: 'ya_inscrito' }], error: null };
          reg.status = 'confirmed';
          reg.confirmed_at = DEMO.ahora().toISOString();
          reg.cancelled_at = null;
          return { data: [{ registration_id: reg.id, resultado: 'confirmed' }], error: null };
        }
        const id = 'r' + (DB.escalera_registrations.length + 1);
        const nueva = {
          id, escalera_id: escId, player_id: playerId, status: 'confirmed', partner_status: null,
          created_at: DEMO.ahora().toISOString(), confirmed_at: DEMO.ahora().toISOString(),
        };
        DB.escalera_registrations.push(nueva);
        return { data: [{ registration_id: id, resultado: 'confirmed' }], error: null };
      }
      if (name === 'salir_retas_abiertas') {
        const reg = DB.escalera_registrations.find((r) => r.id === params.p_registration_id);
        if (!reg) return { data: null, error: { message: 'Registro no encontrado.' } };
        reg.status = 'cancelled_ontime';
        reg.cancelled_at = DEMO.ahora().toISOString();
        return { data: 'cancelled_ontime', error: null };
      }
      if (name === 'asignar_sustituto') {
        const reg = DB.escalera_registrations.find((r) => r.id === params.p_registration_id);
        if (reg) reg.status = 'substitute';
        return { data: { ok: true }, error: null };
      }
      if (name === 'marcar_no_show') {
        const reg = DB.escalera_registrations.find((r) => r.id === params.p_registration_id);
        if (!reg) return { data: null, error: { message: 'Registro no encontrado.' } };
        reg.status = 'no_show';
        return { data: { ok: true }, error: null };
      }
      if (name === 'responder_calificacion_liguilla') {
        const q = DB.liguilla_qualifiers.find((x) => x.id === params.p_qualifier_id);
        if (!q) return { data: null, error: { message: 'Calificado no encontrado.' } };
        if (params.p_aceptar) { q.status = 'confirmed'; q.confirmed_at = DEMO.ahora().toISOString(); return { data: 'confirmed', error: null }; }
        q.status = 'declined'; q.confirmed_at = null;
        return { data: 'declined', error: null };
      }
      if (name === 'hacer_pick_draft') {
        const pick = DB.liguilla_draft_picks.find((d) => d.liguilla_event_id === params.p_liguilla_event_id && d.status === 'pending');
        if (!pick) return { data: null, error: { message: 'No hay un turno de pick activo.' } };
        pick.picked_player_id = params.p_picked_player_id;
        pick.status = 'offered';
        pick.offered_at = DEMO.ahora().toISOString();
        return { data: pick.id, error: null };
      }
      if (name === 'responder_pick_draft') {
        const pick = DB.liguilla_draft_picks.find((d) => d.id === params.p_pick_id);
        if (!pick) return { data: null, error: { message: 'Pick no encontrado.' } };
        if (params.p_aceptar) {
          pick.status = 'accepted'; pick.responded_at = DEMO.ahora().toISOString();
          DB.liguilla_pairs.push({
            id: 'pr' + (DB.liguilla_pairs.length + 1),
            liguilla_event_id: pick.liguilla_event_id,
            player1_id: pick.picker_player_id,
            player2_id: pick.picked_player_id,
            seed_pair: null, formed_via: 'draft',
            ronda1_outcome: null, ronda1_games_won: null, ronda1_games_lost: null,
            is_lucky_loser: false, final_placement: null, wildcard_next_month: false,
          });
          return { data: 'accepted', error: null };
        }
        pick.status = 'declined'; pick.responded_at = DEMO.ahora().toISOString();
        return { data: 'declined', error: null };
      }

      /* ---------------- Admin — captura de resultados de escaleras ---------------- */

      /* ---------------- Motor real de escaleras ----------------
         Estas cuatro llamadas son el corazon de la noche y NO son una
         imitacion: llaman al motor de motor.js, que es la traduccion
         verificada de las funciones de Postgres. */

      if (name === 'generar_ronda_inicial') {
        return envolver(() => motor.generarRondaInicial(DB, params.p_escalera_id, ctx()));
      }
      if (name === 'generar_siguiente_ronda') {
        return envolver(() => motor.generarSiguienteRonda(DB, params.p_escalera_id, ctx()));
      }
      if (name === 'registrar_resultado_partido') {
        return envolver(() => motor.registrarResultadoPartido(DB, params.p_match_id, params.p_sets, ctx()));
      }
      if (name === 'corregir_resultado_partido') {
        return envolver(() => {
          const r = motor.registrarResultadoPartido(DB, params.p_match_id, params.p_sets,
            { ...ctx(), corregir: true });
          const m = DB.round_matches.find((x) => x.id === params.p_match_id);
          if (m && m.sets_json) m.sets_json.nota_correccion = params.p_nota || null;
          return r;
        });
      }
      if (name === 'cerrar_escalera') {
        return envolver(() => motor.cerrarEscalera(DB, params.p_escalera_id, ctx()));
      }

      if (name === 'generar_escaleras_semana') {
        // Aproximación fiel del RPC real (Postgres) para poder probar el
        // botón de Maestro: crea, de cada weekday_schedule activo, la
        // fila de escaleras que le toca en la semana pedida (o la semana
        // en curso/próxima si no se especifica), sin duplicar si ya existe.
        const WEEKDAY_OFFSET = { lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6 };
        const hoy = todayPlus(0);
        let monday = params && params.p_week_start;
        if (!monday) {
          const d = new Date(hoy + 'T12:00:00Z');
          const dow = d.getUTCDay(); // 0=domingo..6=sabado
          const diffToNextMonday = dow === 0 ? 1 : (dow === 1 ? 0 : 8 - dow);
          d.setUTCDate(d.getUTCDate() + diffToNextMonday);
          monday = d.toISOString().slice(0, 10);
        }
        const nuevas = [];
        DB.weekday_schedule.filter((ws) => ws.active).forEach((ws) => {
          const off = WEEKDAY_OFFSET[ws.weekday];
          if (off === undefined) return;
          const d = new Date(monday + 'T12:00:00Z');
          d.setUTCDate(d.getUTCDate() + off);
          const fecha = d.toISOString().slice(0, 10);
          if (fecha < hoy) return;
          const yaExiste = DB.escaleras.some((e) => e.weekday_schedule_id === ws.id && e.session_date === fecha);
          if (yaExiste) return;
          const nueva = { id: 'e' + (DB.escaleras.length + nuevas.length + 1), session_date: fecha, weekday_schedule_id: ws.id, status: 'scheduled', format: ws.format, category: ws.category };
          nuevas.push(nueva);
        });
        DB.escaleras.push(...nuevas);
        return { data: nuevas.map((n) => ({ out_escalera_id: n.id, out_fecha: n.session_date, out_weekday: wsById(n.weekday_schedule_id).weekday, out_format: n.format })), error: null };
      }

      /* ---------------- Admin — Liguilla / Ascenso ---------------- */

      if (name === 'crear_evento_liguilla') {
        const nuevo = {
          id: 'lig' + (DB.liguilla_events.length + 1),
          month_key: params.p_month_key, tier: params.p_tier,
          event_date: params.p_event_date || null, status: 'scheduled',
          created_at: DEMO.ahora().toISOString(),
        };
        DB.liguilla_events.push(nuevo);
        return { data: nuevo.id, error: null };
      }
      if (name === 'generar_calificados_liguilla') {
        const ev = DB.liguilla_events.find((e) => e.id === params.p_liguilla_event_id);
        if (!ev) return { data: null, error: { message: 'Evento no encontrado.' } };
        if (ev.status !== 'scheduled') return { data: null, error: { message: 'Este evento ya tiene calificados generados.' } };
        const yaCalificados = new Set(DB.liguilla_qualifiers.filter((q) => q.liguilla_event_id === ev.id).map((q) => q.player_id));
        const elegibles = DB.profiles.filter((p) => p.role === 'jugador' && !yaCalificados.has(p.id));
        const waitlistDepth = params.p_waitlist_depth || 8;
        const invitedCount = Math.min(12, elegibles.length);
        const total = Math.min(elegibles.length, invitedCount + waitlistDepth);
        let calificados = 0, enEspera = 0;
        for (let i = 0; i < total; i++) {
          const status = i < invitedCount ? 'invited' : 'waitlist';
          DB.liguilla_qualifiers.push({
            id: 'q' + (DB.liguilla_qualifiers.length + 1),
            liguilla_event_id: ev.id, player_id: elegibles[i].id, seed: i + 1,
            rolling_points_snapshot: 100 - i, status, substitute_for_qualifier_id: null, confirmed_at: null,
          });
          if (status === 'invited') calificados++; else enEspera++;
        }
        ev.status = 'qualifying';
        return { data: [{ calificados, en_espera: enEspera }], error: null };
      }
      if (name === 'cerrar_confirmaciones_liguilla') {
        const ev = DB.liguilla_events.find((e) => e.id === params.p_liguilla_event_id);
        if (!ev) return { data: null, error: { message: 'Evento no encontrado.' } };
        const qs = DB.liguilla_qualifiers.filter((q) => q.liguilla_event_id === ev.id);
        let declinados = 0, promovidos = 0;
        qs.filter((q) => q.status === 'invited').forEach((q) => { q.status = 'declined'; declinados++; });
        const confirmadosList = qs.filter((q) => q.status === 'confirmed');
        const espera = qs.filter((q) => q.status === 'waitlist').sort((a, b) => a.seed - b.seed);
        espera.forEach((q) => {
          if (confirmadosList.length % 2 !== 0) {
            q.status = 'confirmed'; q.confirmed_at = DEMO.ahora().toISOString();
            confirmadosList.push(q); promovidos++;
          }
        });
        ev.status = 'draft_open';
        const orden = confirmadosList.slice().sort((a, b) => a.seed - b.seed);
        if (orden.length >= 2) {
          DB.liguilla_draft_picks.push({
            id: 'pk' + (DB.liguilla_draft_picks.length + 1),
            liguilla_event_id: ev.id, pick_order: 1,
            picker_player_id: orden[0].player_id, picked_player_id: null,
            status: 'pending', offered_at: null, responded_at: null,
          });
        }
        return { data: [{ confirmados: confirmadosList.length, declinados, promovidos }], error: null };
      }
      if (name === 'autogenerar_parejas_restantes') {
        const ev = DB.liguilla_events.find((e) => e.id === params.p_liguilla_event_id);
        if (!ev) return { data: null, error: { message: 'Evento no encontrado.' } };
        const confirmados = DB.liguilla_qualifiers.filter((q) => q.liguilla_event_id === ev.id && q.status === 'confirmed').sort((a, b) => a.seed - b.seed);
        const emparejados = jugadoresEmparejados(ev.id);
        const restantes = confirmados.filter((q) => !emparejados.has(q.player_id));
        let generadas = 0;
        for (let i = 0; i + 1 < restantes.length; i += 2) {
          DB.liguilla_pairs.push({
            id: 'pr' + (DB.liguilla_pairs.length + 1),
            liguilla_event_id: ev.id,
            player1_id: restantes[i].player_id, player2_id: restantes[i + 1].player_id,
            seed_pair: null, formed_via: 'auto', ronda1_outcome: null,
            ronda1_games_won: null, ronda1_games_lost: null,
            is_lucky_loser: false, final_placement: null, wildcard_next_month: false,
          });
          generadas++;
        }
        DB.liguilla_draft_picks.filter((d) => d.liguilla_event_id === ev.id && ['pending', 'offered'].includes(d.status)).forEach((d) => { d.status = 'declined'; });
        intentarCerrarDraft(ev);
        return { data: generadas, error: null };
      }
      if (name === 'cancelar_liguilla_sin_jugadores') {
        const ev = DB.liguilla_events.find((e) => e.id === params.p_liguilla_event_id);
        if (!ev) return { data: null, error: { message: 'Evento no encontrado.' } };
        DB.liguilla_pairs = DB.liguilla_pairs.filter((p) => p.liguilla_event_id !== ev.id);
        DB.liguilla_matches = DB.liguilla_matches.filter((m) => m.liguilla_event_id !== ev.id);
        DB.liguilla_draft_picks = DB.liguilla_draft_picks.filter((d) => d.liguilla_event_id !== ev.id);
        let p1id = params.p_player1_id, p2id = params.p_player2_id;
        if (!p1id || !p2id) {
          const candidatos = DB.liguilla_qualifiers.filter((q) => q.liguilla_event_id === ev.id)
            .sort((a, b) => (b.rolling_points_snapshot || 0) - (a.rolling_points_snapshot || 0));
          p1id = p1id || (candidatos[0] && candidatos[0].player_id);
          p2id = p2id || (candidatos[1] && candidatos[1].player_id);
        }
        if (p1id && p2id) {
          DB.liguilla_pairs.push({
            id: 'pr' + (DB.liguilla_pairs.length + 1), liguilla_event_id: ev.id,
            player1_id: p1id, player2_id: p2id, seed_pair: 1, formed_via: 'default_no_players',
            ronda1_outcome: null, ronda1_games_won: null, ronda1_games_lost: null,
            is_lucky_loser: false, final_placement: 1, wildcard_next_month: true,
          });
        }
        ev.status = 'cancelled_no_players';
        return { data: { ok: true }, error: null };
      }
      if (name === 'generar_ronda1_liguilla') {
        const ev = DB.liguilla_events.find((e) => e.id === params.p_liguilla_event_id);
        if (!ev) return { data: null, error: { message: 'Evento no encontrado.' } };
        const pares = DB.liguilla_pairs.filter((p) => p.liguilla_event_id === ev.id).sort((a, b) => (a.seed_pair || 99) - (b.seed_pair || 99));
        let court = 1;
        for (let i = 0; i < Math.floor(pares.length / 2); i++) {
          DB.liguilla_matches.push({
            id: 'lm' + (DB.liguilla_matches.length + 1), liguilla_event_id: ev.id, stage: 'ronda1', match_purpose: 'bracket_r1',
            court_number: court++, pair1_id: pares[i].id, pair2_id: pares[pares.length - 1 - i].id,
            status: 'pending', sets_json: null, winner_pair_id: null, loser_pair_id: null,
          });
        }
        ev.status = 'in_progress';
        return { data: { ronda_generada: 'ronda1' }, error: null };
      }
      if (name === 'registrar_resultado_liguilla_match') {
        const m = DB.liguilla_matches.find((x) => x.id === params.p_match_id);
        if (!m) return { data: null, error: { message: 'Partido no encontrado.' } };
        if (m.status === 'completed') return { data: null, error: { message: 'Este partido ya tiene un resultado capturado.' } };
        aplicarSetsALiguillaMatch(m, params.p_sets);
        const ev = DB.liguilla_events.find((e) => e.id === m.liguilla_event_id);
        const siguiente = ev ? avanzarLiguilla(ev, m) : 'ok';
        return { data: [{ siguiente_paso: siguiente }], error: null };
      }
      if (name === 'sustituir_calificado_liguilla') {
        const q = DB.liguilla_qualifiers.find((x) => x.id === params.p_qualifier_id);
        if (!q) return { data: null, error: { message: 'Calificado no encontrado.' } };
        if (params.p_substitute_player_id) {
          q.player_id = params.p_substitute_player_id;
          return { data: { ok: true, modo: 'sustituto_directo' }, error: null };
        }
        const siguiente = DB.liguilla_qualifiers
          .filter((x) => x.liguilla_event_id === q.liguilla_event_id && x.status === 'waitlist')
          .sort((a, b) => a.seed - b.seed)[0];
        q.status = 'substituted';
        if (siguiente) {
          siguiente.status = 'confirmed';
          siguiente.confirmed_at = DEMO.ahora().toISOString();
          siguiente.substitute_for_qualifier_id = q.id;
        }
        return { data: { ok: true, modo: 'promovido_de_espera' }, error: null };
      }

      return { data: null, error: null };
    },
  };
}
