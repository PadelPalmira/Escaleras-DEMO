/* ============================================================
   EL CLUB FALSO
   ------------------------------------------------------------
   Arma un club completo y creíble: 32 jugadores, 5 semanas de
   noches YA JUGADAS, ranking y categorías formadas, la semana
   en curso convocada y la Liguilla del mes programada.

   El historial no está escrito a mano: se JUEGA de verdad con el
   mismo motor que usa la app (rondas, subir y bajar de cancha,
   puntos), y las categorías se recalculan cada semana con la
   fórmula real. Así el ranking que se ve es consecuencia de los
   partidos que aparecen en el historial de cada jugador, no un
   número inventado.

   Todo sale de una semilla fija, así que la demo se ve igual en
   la computadora de todos y se puede repetir.
   ============================================================ */

import * as motor from './motor.js';
import { REGLAS } from './reglas_texto.js';
import { lunesDe, sumarDias, diaSemanaDe, instanteClub } from './estado.js';

/* ---------- el club ---------- */

const STAFF = [
  { id: 'u-direccion', nombre: 'Dirección del club', rol: 'maestro', email: 'direccion@padelpalmira.demo' },
  { id: 'u-recepcion1', nombre: 'Recepción · Turno 1', rol: 'admin', email: 'recepcion1@padelpalmira.demo' },
  { id: 'u-recepcion2', nombre: 'Recepción · Turno 2', rol: 'admin', email: 'recepcion2@padelpalmira.demo' },
];

// [nombre, fuerza, nivel declarado]
// La fuerza (0 a 1) solo sirve para que los marcadores del historial no salgan
// al azar puro y el club tenga jerarquía. NO decide la categoría: eso lo
// calcula el sistema semana con semana, igual que en la app real. El nivel
// declarado es lo único que ubica a alguien su primera semana.
const JUGADORES = [
  ['Andrés Ortiz', 0.90, '3ra_varonil'], ['Fernando Velasco', 0.86, '4ta_varonil'],
  ['Rodrigo Silva', 0.83, '4ta_varonil'], ['Diego Ruiz', 0.80, '4ta_varonil'],
  ['Mateo Flores', 0.78, '4ta_varonil'], ['Héctor Domínguez', 0.76, '4ta_varonil'],
  ['Emilio Cabrera', 0.74, '4ta_varonil'], ['Santiago Lara', 0.72, '5ta_varonil'],
  ['Ricardo Fuentes', 0.70, '5ta_varonil'], ['Joaquín Bermúdez', 0.68, '5ta_varonil'],
  ['Nicolás Arriaga', 0.66, '5ta_varonil'], ['Tomás Escobar', 0.64, '5ta_varonil'],
  ['Julián Mendoza', 0.62, '5ta_varonil'], ['Álvaro Zepeda', 0.60, '5ta_varonil'],
  ['Bruno Iglesias', 0.58, '5ta_varonil'], ['Maximiliano Rosas', 0.56, '5ta_varonil'],
  ['Luis Gómez', 0.52, '6ta_varonil'], ['Jorge Salinas', 0.50, '6ta_varonil'],
  ['Carlos Méndez', 0.48, '6ta_varonil'], ['Pablo Herrera', 0.46, '6ta_varonil'],
  ['Iván Delgado', 0.44, '6ta_varonil'], ['Sergio Padilla', 0.42, '6ta_varonil'],
  ['Gerardo Nava', 0.40, '6ta_varonil'], ['Raúl Cisneros', 0.38, '6ta_varonil'],
  ['Óscar Beltrán', 0.36, '6ta_varonil'], ['Marco Villalobos', 0.34, '6ta_varonil'],
  ['Adrián Quiroz', 0.32, '6ta_varonil'], ['Fabián Cortés', 0.30, '6ta_varonil'],
  ['Leonardo Prado', 0.28, '7ma_varonil'], ['Gabriel Ontiveros', 0.26, '7ma_varonil'],
  ['Damián Rosales', 0.24, '7ma_varonil'], ['Eduardo Sandoval', 0.22, '7ma_varonil'],
];

const HORARIO = [
  { id: 'ws-lun', weekday: 'lunes', format: 'individual', category: 'A', start_time: '20:00:00', end_time: '22:00:00', capacity: 12, courts: 3, active: true },
  { id: 'ws-mar', weekday: 'martes', format: 'individual', category: 'B', start_time: '20:00:00', end_time: '22:00:00', capacity: 12, courts: 3, active: true },
  { id: 'ws-mie', weekday: 'miercoles', format: 'parejas', category: 'A', start_time: '20:00:00', end_time: '22:00:00', capacity: 12, courts: 3, active: true },
  { id: 'ws-jue', weekday: 'jueves', format: 'parejas', category: 'B', start_time: '20:00:00', end_time: '22:00:00', capacity: 12, courts: 3, active: true },
  { id: 'ws-vie', weekday: 'viernes', format: 'retas_abiertas', category: null, start_time: '19:00:00', end_time: '23:00:00', capacity: null, courts: 3, active: true },
];

const AJUSTES = [
  ['puntos_por_game', '2', 'Cuantos puntos vale cada game ganado en un partido de escalera. Se multiplica por los games que gano tu equipo y luego por el multiplicador de tu cancha.'],
  ['bono_victoria_partido', '3', 'Puntos extra que recibe cada jugador del equipo que GANA el partido, ademas de los puntos por game.'],
  ['multiplicador_cancha_1', '1.2', 'Multiplicador de puntos cancha 1'],
  ['multiplicador_cancha_2', '1.0', 'Multiplicador de puntos cancha 2'],
  ['multiplicador_cancha_3', '0.9', 'Multiplicador de puntos cancha 3 (se ignora si esa noche solo hay 2 canchas activas)'],
  ['bono_posicion_final_por_cancha', { 1: 10, 2: 5, 3: 0 }, 'Bono que se entrega UNA SOLA VEZ al cerrar la escalera, segun la cancha en la que cada jugador termino la noche.'],
  ['rolling_window_size', '6', 'Numero de escaleras jugadas mas recientes que definen el puntaje movil'],
  ['semanas_vigencia_puntos', '8', 'Cuantas semanas cuenta una noche jugada para el ranking. Pasadas esas semanas deja de sumar.'],
  ['min_noches_para_mover', '3', 'Noches jugadas que hacen falta para que tu puntaje deje de ser provisional: antes de eso no subes ni bajas de categoria y apareces al final del ranking.'],
  ['lugares_reservados_ranking', '8', 'Cuantos de los lugares de cada noche puede apartar el top del ranking durante la ventana del domingo. Los demas quedan abiertos para toda la categoria por orden de llegada desde que abre la convocatoria.'],
  ['max_rondas_escalera', '7', 'Numero de rondas por escalera'],
  ['minutos_por_ronda', '15', 'Duracion de cada ronda en minutos'],
  ['privilege_top_n', '12', 'Cuantos jugadores del ranking de cada categoria pueden apartar lugar durante la ventana del domingo.'],
  ['privilege_close_time', '18:00', 'Hora del domingo (CDMX) en que termina la ventana exclusiva del top del ranking.'],
  ['convocatoria_open_time', '10:00', 'Hora en que se publican las convocatorias de la semana.'],
  ['privilege_lockout_weeks', '1', 'Semanas que un jugador pierde la ventaja de ranking si se da de baja de todos sus eventos confirmados de la semana sin conseguir sustituto.'],
  ['liguilla_top_n', '12', 'Cuantos jugadores de cada categoria califican a la Liguilla / Torneo de Ascenso al cierre del mes.'],
  ['liguilla_cutoff_hours', '24', 'Horas antes de Liguilla/Ascenso en que se cierra confirmacion'],
  ['late_cancel_cutoff_hours', '12', 'Horas antes de la sesion: cancelar despues de este corte sin sustituto = penalizacion tardia'],
  ['late_cancel_penalty_pct', '15', 'Porcentaje del puntaje movil (las ultimas 6 noches) que se pierde por cancelacion tardia sin sustituto.'],
  ['no_show_penalty_pct', '50', 'Porcentaje del puntaje movil (las ultimas 6 noches) que se pierde por no presentarse sin avisar.'],
  ['cupo_check_hours_before', '6', 'Horas antes del evento en que la app le avisa al admin que el cupo no se ha completado. Si no se llena, la noche se cancela: la escalera solo arranca con el cupo lleno.'],
  ['substitute_split_ausente_pct', '66', 'Porcentaje de puntos ganados que recibe el jugador ausente cuando consigue sustituto'],
  ['substitute_split_sustituto_pct', '34', 'Porcentaje de puntos ganados que recibe el sustituto'],
  ['monetary_fine_amount_mxn', '250', 'Monto sugerido de multa manual por cancelacion tardia/no-show'],
  ['retas_price_mxn', '150', 'Costo informativo por persona de las Retas Abiertas del viernes.'],
  ['zona_limite_band_size', '3', 'Cuantos jugadores de cada orilla se marcan en zona de descenso (en A) o de ascenso (en B). Es solo el aviso: no cambia cuantos se mueven.'],
  ['ascenso_descenso_por_semana', '2', 'Cuantos jugadores bajan de A y cuantos suben de B cada domingo. Es un tope duro: nadie mas cambia de categoria esa semana. Si las dos categorias quedan con 2 o mas de diferencia en tamano, se mueve uno extra hacia la mas chica para emparejarlas.'],
  ['timezone', 'America/Mexico_City', 'Zona horaria oficial del club para TODOS los cortes de tiempo.'],
];

const SEMANAS_DE_HISTORIAL = 5;
const DIAS_HABILES = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

/* ============================================================
   Construcción
   ============================================================ */

export function construirDemo(hoyRealISO) {
  const rnd = motor.rngDesde(20260822);
  const db = baseVacia();
  const fuerza = new Map();

  STAFF.forEach((s) => db.profiles.push(perfil(s.id, s.nombre, s.email, s.rol, null)));
  JUGADORES.forEach(([nombre, f, nivel], i) => {
    const id = 'u-j' + String(i + 1).padStart(2, '0');
    fuerza.set(id, f);
    db.profiles.push(perfil(id, nombre, correoDe(nombre, i), 'jugador', nivel));
  });

  const lunesActual = semanaDeLaDemo(hoyRealISO);

  /* 5 semanas ya jugadas. Cada semana se recalculan las categorías ANTES de
     jugarla, exactamente como el club: el domingo 9am se recalcula y con eso
     se arma la semana. El movimiento entre A y B que se ve en la demo no está
     inventado — es el que produce la fórmula real. */
  for (let s = SEMANAS_DE_HISTORIAL; s >= 1; s--) {
    const lunes = sumarDias(lunesActual, -7 * s);
    // El corte se guarda con la fecha del domingo, igual que en produccion
    // (la tarea automatica corre el domingo 9am y pasa esa fecha).
    motor.recalcularCategorias(db, sumarDias(lunes, -1), () => instanteClub(sumarDias(lunes, -1), '09:00'));
    for (const ws of HORARIO) {
      if (ws.format === 'retas_abiertas') continue;
      const fecha = sumarDias(lunes, DIAS_HABILES.indexOf(ws.weekday));
      jugarNoche(db, ws, fecha, elegirAsistentes(db, lunes, ws.category, rnd), fuerza, rnd);
    }
  }

  motor.recalcularCategorias(db, sumarDias(lunesActual, -1), () => instanteClub(sumarDias(lunesActual, -1), '09:00'));
  sembrarSemanaActual(db, lunesActual, rnd);
  sembrarLiguilla(db, lunesActual);
  sembrarCrm(db, lunesActual);

  db.__lunes_demo = lunesActual;
  return db;
}

/* La demo se planta en una semana que todavía se pueda jugar completa: si hoy
   es viernes, sábado o domingo, se usa la semana que entra. Así las 5 noches
   de "esta semana" siempre están por delante y el reloj de la demo puede
   caminar de lunes a viernes sin que nada quede en el pasado. */
export function semanaDeLaDemo(hoyISO) {
  const dia = diaSemanaDe(hoyISO);
  const lunes = lunesDe(hoyISO);
  return ['viernes', 'sabado', 'domingo'].includes(dia) ? sumarDias(lunes, 7) : lunes;
}

/* ---------- una noche completa, jugada de verdad ---------- */

function jugarNoche(db, ws, fecha, jugadores, fuerza, rnd) {
  const escId = motor.nuevoId(db, 'esc');
  db.escaleras.push({
    id: escId, session_date: fecha, weekday_schedule_id: ws.id, status: 'scheduled',
    format: ws.format, category: ws.category, courts_active: ws.courts,
    is_liguilla: false, liguilla_event_id: null, cancel_reason: null,
    privilege_settled_at: instanteClub(fecha, '18:00').toISOString(),
  });

  const creado = instanteClub(sumarDias(fecha, -2), '10:05');
  if (ws.format === 'parejas') {
    for (let i = 0; i + 1 < jugadores.length; i += 2) {
      db.escalera_registrations.push(registro(db, escId, jugadores[i], jugadores[i + 1], creado, i));
      db.escalera_registrations.push(registro(db, escId, jugadores[i + 1], jugadores[i], creado, i));
    }
  } else {
    jugadores.forEach((p, i) => db.escalera_registrations.push(registro(db, escId, p, null, creado, i)));
  }

  const ctx = { ahora: () => instanteClub(fecha, '20:00'), uid: 'u-recepcion1', rnd };
  motor.generarRondaInicial(db, escId, ctx);

  const maxRondas = motor.cfgNum(db, 'max_rondas_escalera', 7);
  for (let r = 1; r <= maxRondas; r++) {
    const rd = db.rounds.find((x) => x.escalera_id === escId && x.round_number === r);
    if (!rd) break;
    for (const m of db.round_matches.filter((x) => x.round_id === rd.id)) {
      motor.registrarResultadoPartido(db, m.id, marcadorVerosimil(m, fuerza, rnd), ctx);
    }
    if (r < maxRondas) motor.generarSiguienteRonda(db, escId, ctx);
  }
  motor.cerrarEscalera(db, escId, ctx);
  return escId;
}

/* Un marcador que se parece a una ronda de verdad: 15 minutos, se para donde
   se paró. El equipo más fuerte gana más seguido, pero no siempre, y muchas
   rondas se deciden por un game. */
function marcadorVerosimil(m, fuerza, rnd) {
  const f = (id) => (fuerza.has(id) ? fuerza.get(id) : 0.5);
  const eq1 = (f(m.team1_player1) + f(m.team1_player2)) / 2;
  const eq2 = (f(m.team2_player1) + f(m.team2_player2)) / 2;
  const prob = Math.min(0.9, Math.max(0.1, 0.5 + (eq1 - eq2) * 0.9));
  const gana1 = rnd() < prob;
  const parejo = Math.abs(eq1 - eq2) < 0.12 ? rnd() < 0.6 : rnd() < 0.25;

  // En 15 minutos se juegan del orden de 5 a 9 games entre los dos equipos.
  const alto = parejo ? 4 + Math.floor(rnd() * 2) : 5 + Math.floor(rnd() * 2);
  const bajo = parejo ? alto - 1 : Math.max(0, alto - 2 - Math.floor(rnd() * 3));
  return [gana1 ? { team1: alto, team2: bajo } : { team1: bajo, team2: alto }];
}

/* Quién juega esa noche: 12 de los que quedaron en esa categoría esa semana,
   rotando, para que el historial de cada quien tenga huecos como en la vida
   real (nadie juega todas las noches de todas las semanas). */
function elegirAsistentes(db, lunes, categoria, rnd) {
  const dela = db.category_snapshots
    .filter((c) => c.week_start_date === sumarDias(lunes, -1))
    .filter((c) => catEfectiva(c) === categoria)
    .map((c) => c.player_id)
    .filter((id) => (db.profiles.find((p) => p.id === id) || {}).role === 'jugador');
  return mezclar(dela, rnd).slice(0, 12);
}

function catEfectiva(c) {
  if (c.category === 'limite') return c.zona_limite_side === 'bottom_a' ? 'A' : 'B';
  return c.category;
}

/* ---------- la semana en curso ---------- */

function sembrarSemanaActual(db, lunesActual, rnd) {
  const domingo = sumarDias(lunesActual, -1);
  const creadoBase = instanteClub(domingo, '10:00');

  for (const ws of HORARIO) {
    const fecha = sumarDias(lunesActual, DIAS_HABILES.indexOf(ws.weekday));
    const escId = motor.nuevoId(db, 'esc');
    db.escaleras.push({
      id: escId, session_date: fecha, weekday_schedule_id: ws.id, status: 'scheduled',
      format: ws.format, category: ws.category, courts_active: ws.courts,
      is_liguilla: false, liguilla_event_id: null, cancel_reason: null,
      privilege_settled_at: null,
    });

    if (ws.format === 'retas_abiertas') {
      const gente = db.profiles.filter((p) => p.role === 'jugador');
      mezclar(gente, rnd).slice(0, 7).forEach((p, i) => {
        db.escalera_registrations.push(registro(db, escId, p.id, null,
          new Date(creadoBase.getTime() + (i + 1) * 900000), i, 'confirmed'));
      });
      continue;
    }

    // Los mejores del ranking de esa categoría apartaron el domingo; unos
    // cuantos más pidieron lista de espera.
    const ranking = motor.rankingVivo(db, ws.category);
    const top = ranking.slice(0, 12).map((r) => r.player_id);
    const resto = ranking.slice(12).map((r) => r.player_id);

    // Lunes y martes quedan llenos para poder jugarlos de inmediato. El resto
    // de la semana queda a medias a propósito, para que se vea la lista de
    // espera y el panel de cupo incompleto.
    const cuantos = { lunes: 12, martes: 12, miercoles: 10, jueves: 6 }[ws.weekday];
    const dentro = top.slice(0, cuantos);

    if (ws.format === 'parejas') {
      for (let i = 0; i + 1 < dentro.length; i += 2) {
        const t = new Date(creadoBase.getTime() + (i + 1) * 600000);
        db.escalera_registrations.push(registro(db, escId, dentro[i], dentro[i + 1], t, i, 'confirmed', true));
        db.escalera_registrations.push(registro(db, escId, dentro[i + 1], dentro[i], t, i, 'confirmed', true));
      }
      if (resto.length >= 2) {
        const t = new Date(creadoBase.getTime() + 20 * 600000);
        db.escalera_registrations.push(registro(db, escId, resto[0], resto[1], t, 90, 'waitlist'));
        db.escalera_registrations.push(registro(db, escId, resto[1], resto[0], t, 90, 'waitlist'));
      }
    } else {
      dentro.forEach((p, i) => db.escalera_registrations.push(registro(db, escId, p, null,
        new Date(creadoBase.getTime() + (i + 1) * 600000), i, 'confirmed', true)));
      resto.slice(0, 3).forEach((p, i) => db.escalera_registrations.push(registro(db, escId, p, null,
        new Date(creadoBase.getTime() + (30 + i) * 600000), 50 + i, 'waitlist')));
    }
    recalcularEspera(db, escId);
  }
}

function recalcularEspera(db, escId) {
  db.escalera_registrations
    .filter((r) => r.escalera_id === escId && r.status === 'waitlist')
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .forEach((r, i) => { r.waitlist_position = i + 1; });
}

/* ---------- Liguilla del mes ---------- */

function sembrarLiguilla(db, lunesActual) {
  const mes = lunesActual.slice(0, 7);
  for (const [tier, dia] of [['liguilla_a', 'miercoles'], ['ascenso_b', 'jueves']]) {
    db.liguilla_events.push({
      id: motor.nuevoId(db, 'lig'), month_key: mes, tier, event_date: ultimoDiaDelMes(mes, dia),
      status: 'scheduled', escalera_id: null, draft_started_at: null,
      confirmations_closed_at: null, finalized_at: null,
    });
  }
}

function ultimoDiaDelMes(mesKey, dia) {
  const [y, m] = mesKey.split('-').map(Number);
  let f = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  for (let i = 0; i < 7; i++) {
    if (diaSemanaDe(f) === dia) return f;
    f = sumarDias(f, -1);
  }
  return f;
}

/* ---------- CRM: multas y avisos de ejemplo ---------- */

function sembrarCrm(db, lunesActual) {
  const jug = db.profiles.filter((p) => p.role === 'jugador');

  db.fines.push({
    id: motor.nuevoId(db, 'mul'), player_id: jug[7].id, amount_mxn: 250, status: 'pending',
    reason: 'No se presentó a la escalera del lunes sin avisar.',
    escalera_id: null, created_at: instanteClub(sumarDias(lunesActual, -5), '21:30').toISOString(),
  });
  db.fines.push({
    id: motor.nuevoId(db, 'mul'), player_id: jug[19].id, amount_mxn: 250, status: 'paid',
    reason: 'Cancelación tardía sin sustituto.',
    escalera_id: null, created_at: instanteClub(sumarDias(lunesActual, -18), '19:00').toISOString(),
  });

  const avisos = [
    ['promocion_lista_espera', 'Se abrió un lugar y es tuyo',
      'Se liberó un lugar y como ibas primero en la lista de espera, ya tienes lugar confirmado.', -1, '18:02'],
    ['recordatorio', 'Tu noche es el lunes',
      'Juegas el lunes a las 8:00 pm. Si no puedes ir, cancela cuanto antes para que alguien más tome tu lugar.', 0, '09:00'],
  ];
  avisos.forEach(([type, title, body, dias, hora]) => {
    db.notifications.push({
      id: motor.nuevoId(db, 'not'), player_id: jug[0].id, type, title, body,
      related_escalera_id: null, read_at: null,
      created_at: instanteClub(sumarDias(lunesActual, dias), hora).toISOString(),
    });
  });
}

/* ---------- piezas sueltas ---------- */

function baseVacia() {
  return {
    __seq: 0,
    profiles: [], category_snapshots: [], weekday_schedule: HORARIO.map((w) => ({ ...w })),
    escaleras: [], escalera_registrations: [], rounds: [], round_matches: [],
    points_ledger: [], ranking_privilege_penalties: [],
    liguilla_events: [], liguilla_qualifiers: [], liguilla_pairs: [],
    liguilla_draft_picks: [], liguilla_matches: [],
    fines: [], suspensions: [], notifications: [],
    rules_content: REGLAS.map((r, i) => ({ id: i + 1, ...r })),
    system_settings: AJUSTES.map(([key, value, description]) => ({ key, value, description })),
  };
}

function perfil(id, nombre, email, rol, nivel) {
  return {
    id, full_name: nombre, email,
    phone: '55' + String(Math.abs(hash(id)) % 100000000).padStart(8, '0'),
    status: 'active', role: rol, declared_level: nivel,
    app_guide_seen_at: '2026-01-01T00:00:00Z', avatar_url: null,
  };
}

function registro(db, escId, playerId, partnerId, creado, i, estado = 'confirmed', viaPrivilegio = false) {
  const t = creado instanceof Date ? creado : new Date(creado);
  return {
    id: motor.nuevoId(db, 'reg'), escalera_id: escId, player_id: playerId,
    partner_id: partnerId || null, partner_status: partnerId ? 'accepted' : null,
    status: estado, substitute_for_registration_id: null,
    is_coach_substitute: false, no_point_split: false, admin_substitute_reason: null,
    waitlist_position: null, via_privilegio: viaPrivilegio, priority_snapshot: null,
    created_at: new Date(t.getTime() + i * 1000).toISOString(),
    confirmed_at: estado === 'confirmed' ? t.toISOString() : null,
    cancelled_at: null, cubierto_por_lista_espera: false,
  };
}

function correoDe(nombre, i) {
  const base = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '').split(' ')[0];
  return `${base}${i + 1}@padelpalmira.demo`;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function mezclar(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
