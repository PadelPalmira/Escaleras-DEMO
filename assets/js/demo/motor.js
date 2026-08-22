/* ============================================================
   MOTOR DE LA DEMO
   ------------------------------------------------------------
   Traducción a JavaScript de las funciones reales de Postgres.
   Cada bloque lleva el nombre de la función SQL que copia.

   REGLA DE ORO DE ESTE ARCHIVO: si el SQL cambia, este archivo
   cambia igual. La prueba `verificar_motor.js` corre los mismos
   escenarios contra la base real y contra este archivo y exige
   resultado idéntico; si no coinciden, la demo miente.
   ============================================================ */

/* ---------- utilidades equivalentes a Postgres ---------- */

// round(x, 2) de Postgres es redondeo half-up sobre decimal.
// El round() de JavaScript sobre binario da 1.005 -> 1.00; esto lo evita.
export function round2(x) {
  const n = Number(x);
  if (!isFinite(n)) return 0;
  const signo = n < 0 ? -1 : 1;
  return signo * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
}

export function cfgNum(db, key, porDefecto) {
  const s = db.system_settings.find((x) => x.key === key);
  if (!s) return Number(porDefecto);
  const v = typeof s.value === 'object' ? s.value : s.value;
  const n = Number(v);
  return isFinite(n) ? n : Number(porDefecto);
}

export function cfgJson(db, key, porDefecto) {
  const s = db.system_settings.find((x) => x.key === key);
  if (!s) return porDefecto;
  if (typeof s.value === 'string') {
    try { return JSON.parse(s.value); } catch { return porDefecto; }
  }
  return s.value;
}

// 'HH:MM' -> minutos desde medianoche
export function cfgTimeMin(db, key, porDefecto) {
  const s = db.system_settings.find((x) => x.key === key);
  const txt = s ? String(s.value) : porDefecto;
  const [h, m] = txt.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function mesKey(fechaISO) {
  return String(fechaISO).slice(0, 7); // to_char(date,'YYYY-MM')
}

/* ============================================================
   liguilla_resumen_sets(jsonb) + escalera_resumen_sets(jsonb)
   ============================================================ */
export function resumenSets(sets) {
  if (!Array.isArray(sets)) throw new Error('sets_json debe ser un arreglo JSON de sets.');
  if (sets.length < 2 || sets.length > 3) {
    throw new Error(`Un partido debe tener entre 2 y 3 sets (recibidos: ${sets.length}).`);
  }
  let sets1 = 0, sets2 = 0, games1 = 0, games2 = 0;
  sets.forEach((el, idx) => {
    const i = idx + 1;
    if (el.team1 === undefined || el.team1 === null || el.team2 === undefined || el.team2 === null) {
      throw new Error(`Cada set requiere las claves team1 y team2 (set ${i}).`);
    }
    const s1 = Number(el.team1), s2 = Number(el.team2);
    if (s1 < 0 || s2 < 0) throw new Error(`Marcadores negativos no validos (set ${i}).`);
    if (s1 === s2) throw new Error(`Un set no puede terminar empatado (set ${i}).`);
    // super_muerte por defecto true en el 3er set, igual que el SQL.
    const sup = el.super_muerte === undefined || el.super_muerte === null ? i === 3 : !!el.super_muerte;
    if (s1 > s2) {
      sets1 += 1;
      if (sup) games1 += 1; else { games1 += s1; games2 += s2; }
    } else {
      sets2 += 1;
      if (sup) games2 += 1; else { games1 += s1; games2 += s2; }
    }
  });
  if (sets1 === sets2) throw new Error(`El marcador no define un ganador (sets ${sets1}-${sets2}).`);
  return { sets, totales: { team1: { sets: sets1, games: games1 }, team2: { sets: sets2, games: games2 } } };
}

/* ============================================================
   elegir_mejor_split(uuid[], uuid, boolean) -> court_split
   ------------------------------------------------------------
   De las 3 formas de partir 4 jugadores en 2 parejas, elige la
   que menos repita parejas ya jugadas esa noche; a igualdad de
   repeticiones, la que repita lo MÁS ANTIGUO (repeat_reciente
   más bajo). Con separarLlegadas se descartan los repartos que
   dejarían juntos a los dos que llegaron juntos.
   ============================================================ */
export function elegirMejorSplit(db, jugadores, escaleraId, separarLlegadas) {
  return opcionesSplit(db, jugadores, escaleraId, separarLlegadas)[0];
}

// Las 3 (o 2) formas de partir la cancha, ya calificadas y ordenadas de mejor
// a peor. Se expone aparte porque el verificador la necesita: cuando dos
// repartos empatan, Postgres elige uno cualquiera de los dos, asi que lo que
// se puede exigir es que la demo los califique IGUAL, no que elija el mismo.
export function opcionesSplit(db, jugadores, escaleraId, separarLlegadas) {
  const [a, b, c, d] = jugadores;

  // max(round_number) de la ronda donde x e y jugaron juntos, o null.
  const ultimaJuntos = (x, y) => {
    let mx = null;
    for (const rm of db.round_matches) {
      const rd = db.rounds.find((r) => r.id === rm.round_id);
      if (!rd || rd.escalera_id !== escaleraId) continue;
      const par = (p, q) => (p === x && q === y) || (p === y && q === x);
      if (par(rm.team1_player1, rm.team1_player2) || par(rm.team2_player1, rm.team2_player2)) {
        if (mx === null || rd.round_number > mx) mx = rd.round_number;
      }
    }
    return mx;
  };

  const candidatos = [
    [a, b, c, d],
    [a, c, b, d],
    [a, d, b, c],
  ].filter(([t1p1, t1p2]) =>
    !separarLlegadas || !((t1p1 === a && t1p2 === b) || (t1p1 === b && t1p2 === a)));

  const opciones = candidatos.map(([t1p1, t1p2, t2p1, t2p2]) => {
    const r1 = ultimaJuntos(t1p1, t1p2);
    const r2 = ultimaJuntos(t2p1, t2p2);
    return {
      team1_p1: t1p1, team1_p2: t1p2, team2_p1: t2p1, team2_p2: t2p2,
      repeat_count: (r1 !== null ? 1 : 0) + (r2 !== null ? 1 : 0),
      repeat_reciente: Math.max(r1 || 0, r2 || 0),
    };
  });

  opciones.sort((x, y) =>
    x.repeat_count - y.repeat_count || x.repeat_reciente - y.repeat_reciente);
  return opciones;
}

/* ============================================================
   generar_ronda_inicial(uuid)
   ============================================================ */
export function generarRondaInicial(db, escaleraId, { rnd, ahora }) {
  const esc = db.escaleras.find((e) => e.id === escaleraId);
  if (!esc) throw new Error('Escalera no encontrada.');
  if (db.rounds.some((r) => r.escalera_id === escaleraId)) {
    throw new Error('Esta escalera ya tiene la ronda 1 generada.');
  }

  const roundId = nuevoId(db, 'rd');
  db.rounds.push({
    id: roundId, escalera_id: escaleraId, round_number: 1,
    status: 'in_progress', started_at: ahora().toISOString(), completed_at: null,
  });

  const confirmados = db.escalera_registrations.filter(
    (r) => r.escalera_id === escaleraId && (r.status === 'confirmed' || r.status === 'substitute'));

  if (esc.format === 'individual') {
    // row_number() over (order by random()) / 4 -> grupos de 4 al azar
    const orden = barajar(confirmados.map((r) => r.player_id), rnd);
    let cancha = 0;
    for (let i = 0; i < orden.length; i += 4) {
      const grupo = orden.slice(i, i + 4);
      if (grupo.length < 4) break;
      cancha += 1;
      const split = elegirMejorSplit(db, grupo, escaleraId, false);
      db.round_matches.push(nuevoPartido(db, roundId, cancha, split));
    }
  } else if (esc.format === 'parejas') {
    // Una fila por pareja (player_id < partner_id), grupos de 2 parejas.
    const parejas = confirmados
      .filter((r) => r.partner_id && r.player_id < r.partner_id)
      .map((r) => ({ p1: r.player_id, p2: r.partner_id }));
    const orden = barajar(parejas, rnd);
    let cancha = 0;
    for (let i = 0; i < orden.length; i += 2) {
      const g = orden.slice(i, i + 2);
      if (g.length < 2) break;
      cancha += 1;
      // array_agg(... order by player_id): las 2 parejas del grupo se
      // ordenan por player_id antes de repartirse en equipo 1 y 2.
      g.sort((x, y) => (x.p1 < y.p1 ? -1 : x.p1 > y.p1 ? 1 : 0));
      db.round_matches.push(nuevoPartido(db, roundId, cancha, {
        team1_p1: g[0].p1, team1_p2: g[0].p2, team2_p1: g[1].p1, team2_p2: g[1].p2,
      }));
    }
  }

  esc.status = 'in_progress';
  return roundId;
}

/* ============================================================
   generar_siguiente_ronda(uuid)
   ------------------------------------------------------------
   El corazón del formato: gana -> sube una cancha, pierde ->
   baja una. Los dos equipos que caen en la misma cancha se
   enfrentan; en Individual además se revuelven de modo que
   quien llegó contigo pase a ser tu rival.
   ============================================================ */
export function generarSiguienteRonda(db, escaleraId, { ahora }) {
  const esc = db.escaleras.find((e) => e.id === escaleraId);
  if (!esc) throw new Error('Escalera no encontrada.');

  const rondas = db.rounds.filter((r) => r.escalera_id === escaleraId)
    .sort((a, b) => a.round_number - b.round_number);
  const actual = rondas[rondas.length - 1];
  if (!actual) throw new Error('No hay una ronda previa.');

  const partidos = db.round_matches.filter((m) => m.round_id === actual.id)
    .sort((a, b) => a.court_number - b.court_number);
  const pendientes = partidos.filter((m) => m.status === 'pending').length;
  if (pendientes > 0) {
    throw new Error(`No se puede generar la siguiente ronda: hay ${pendientes} partido(s) sin resultado en la ronda ${actual.round_number}.`);
  }

  const maxCancha = Math.max(...partidos.map((m) => m.court_number));
  const nuevoNum = actual.round_number + 1;

  // tmp_arrivals: cada equipo se mueve a su cancha destino.
  const llegadas = [];
  for (const m of partidos) {
    const sube = Math.max(m.court_number - 1, 1);
    const baja = Math.min(m.court_number + 1, maxCancha);
    if (m.score_team1 > m.score_team2) {
      llegadas.push({ src: m.id, court: sube, p1: m.team1_player1, p2: m.team1_player2 });
      llegadas.push({ src: m.id, court: baja, p1: m.team2_player1, p2: m.team2_player2 });
    } else {
      llegadas.push({ src: m.id, court: baja, p1: m.team1_player1, p2: m.team1_player2 });
      llegadas.push({ src: m.id, court: sube, p1: m.team2_player1, p2: m.team2_player2 });
    }
  }

  const porCancha = new Map();
  for (const l of llegadas) {
    if (!porCancha.has(l.court)) porCancha.set(l.court, []);
    porCancha.get(l.court).push(l);
  }
  for (const [, arr] of porCancha) {
    if (arr.length !== 2) {
      throw new Error('Error de integridad en el movimiento de escalera: alguna cancha destino no recibio exactamente 2 equipos.');
    }
  }

  const roundId = nuevoId(db, 'rd');
  db.rounds.push({
    id: roundId, escalera_id: escaleraId, round_number: nuevoNum,
    status: 'in_progress', started_at: ahora().toISOString(), completed_at: null,
  });

  const canchas = [...porCancha.keys()].sort((a, b) => a - b);
  for (const cancha of canchas) {
    // array_agg(... order by source_match_id): el orden lo fija el partido
    // de origen, no el azar.
    const arr = porCancha.get(cancha).slice()
      .sort((x, y) => ordenId(x.src, y.src));
    if (esc.format === 'parejas') {
      db.round_matches.push(nuevoPartido(db, roundId, cancha, {
        team1_p1: arr[0].p1, team1_p2: arr[0].p2, team2_p1: arr[1].p1, team2_p2: arr[1].p2,
      }));
    } else {
      const split = elegirMejorSplit(db, [arr[0].p1, arr[0].p2, arr[1].p1, arr[1].p2], escaleraId, true);
      db.round_matches.push(nuevoPartido(db, roundId, cancha, split));
    }
  }

  actual.status = 'completed';
  actual.completed_at = ahora().toISOString();
  return roundId;
}

/* ============================================================
   registrar_resultado_partido / calcular_puntos_match /
   otorgar_puntos_seat
   ============================================================ */
export function registrarResultadoPartido(db, matchId, sets, { ahora, uid, corregir = false }) {
  const m = db.round_matches.find((x) => x.id === matchId);
  if (!m) throw new Error('Partido no encontrado.');
  const rd = db.rounds.find((r) => r.id === m.round_id);
  const esc = db.escaleras.find((e) => e.id === rd.escalera_id);

  if (!corregir && m.status === 'completed') {
    throw new Error('Ese partido ya tiene resultado registrado; use corregir para modificarlo.');
  }
  if (esc.status === 'cancelled') throw new Error('La escalera esta cancelada.');
  if (!corregir && esc.status === 'completed') {
    throw new Error('La escalera ya fue cerrada; use corregir.');
  }
  if (!['individual', 'parejas'].includes(esc.format)) {
    throw new Error(`El formato ${esc.format} no otorga puntos de escalera.`);
  }

  const res = resumenSets(sets);
  m.sets_json = res;
  m.score_team1 = res.totales.team1.sets;
  m.score_team2 = res.totales.team2.sets;
  m.games_team1 = res.totales.team1.games;
  m.games_team2 = res.totales.team2.games;
  m.status = 'completed';
  m.entered_by = uid;
  m.entered_at = ahora().toISOString();

  db.points_ledger = db.points_ledger.filter((p) => p.round_match_id !== matchId);
  const filas = calcularPuntosMatch(db, matchId, { ahora, uid });

  return {
    match_id: matchId, ronda: rd.round_number, cancha: m.court_number,
    sets_team1: m.score_team1, sets_team2: m.score_team2,
    games_team1: m.games_team1, games_team2: m.games_team2,
    equipo_ganador: m.score_team1 > m.score_team2 ? 1 : 2,
    filas_ledger: filas,
  };
}

export function calcularPuntosMatch(db, matchId, ctx) {
  const m = db.round_matches.find((x) => x.id === matchId);
  const rd = db.rounds.find((r) => r.id === m.round_id);
  const esc = db.escaleras.find((e) => e.id === rd.escalera_id);

  const ppg = cfgNum(db, 'puntos_por_game', 2);
  const bono = cfgNum(db, 'bono_victoria_partido', 3);
  const mult = cfgNum(db, 'multiplicador_cancha_' + m.court_number, 1.0);
  const mes = mesKey(esc.session_date);

  const g1 = m.games_team1 || 0, g2 = m.games_team2 || 0;
  const s1 = m.score_team1 || 0, s2 = m.score_team2 || 0;
  const tot1 = round2((g1 * ppg + (s1 > s2 ? bono : 0)) * mult);
  const tot2 = round2((g2 * ppg + (s2 > s1 ? bono : 0)) * mult);
  const nota = `Ronda ${rd.round_number}, cancha ${m.court_number}`;

  let filas = 0;
  filas += otorgarPuntosSeat(db, esc.id, m.id, esc.format, m.team1_player1, tot1, m.court_number, mult, mes, 'match_result', nota, ctx);
  filas += otorgarPuntosSeat(db, esc.id, m.id, esc.format, m.team1_player2, tot1, m.court_number, mult, mes, 'match_result', nota, ctx);
  filas += otorgarPuntosSeat(db, esc.id, m.id, esc.format, m.team2_player1, tot2, m.court_number, mult, mes, 'match_result', nota, ctx);
  filas += otorgarPuntosSeat(db, esc.id, m.id, esc.format, m.team2_player2, tot2, m.court_number, mult, mes, 'match_result', nota, ctx);
  return filas;
}

export function otorgarPuntosSeat(db, escaleraId, matchId, formato, playerId, puntos, cancha, mult, mes, razon, notas, ctx) {
  if (!playerId) return 0;
  const push = (pid, pts, reason, relacionado, nota) => {
    db.points_ledger.push({
      id: nuevoId(db, 'pl'), player_id: pid, escalera_id: escaleraId, round_match_id: matchId,
      format: formato, points: round2(pts), reason, court_number: cancha,
      multiplier_applied: mult, related_player_id: relacionado || null, month_key: mes,
      created_by: ctx.uid, notes: nota, created_at: ctx.ahora().toISOString(),
    });
  };

  const reg = db.escalera_registrations.find(
    (r) => r.escalera_id === escaleraId && r.player_id === playerId);

  if (!reg || reg.status !== 'substitute' || !reg.substitute_for_registration_id) {
    push(playerId, puntos, razon, null, notas);
    return 1;
  }

  // Sustituto autorizado por administración: sin reparto.
  if (reg.no_point_split) {
    push(playerId, puntos, razon, null,
      (notas ? notas + ' | ' : '') + 'Sustituto autorizado por administracion: sin reparto de puntos.'
      + (reg.admin_substitute_reason ? ' Motivo: ' + reg.admin_substitute_reason : ''));
    return 1;
  }

  const orig = db.escalera_registrations.find((r) => r.id === reg.substitute_for_registration_id);
  if (!orig) {
    push(playerId, puntos, razon, null,
      (notas ? notas + ' | ' : '') + 'Sustituto sin registro original vinculado.');
    return 1;
  }

  let pAus, pSus, notaA, notaS;
  if (reg.is_coach_substitute) {
    pAus = 0; pSus = 0;
    notaA = 'Sustituto COACH: el jugador ausente no recibe puntos por esta sesion.';
    notaS = 'Sustituto COACH: el coach no acumula puntos del club.';
  } else {
    const pctA = cfgNum(db, 'substitute_split_ausente_pct', 66);
    const pctS = cfgNum(db, 'substitute_split_sustituto_pct', 34);
    pAus = round2(puntos * pctA / 100);
    pSus = round2(puntos * pctS / 100);
    notaA = `Split de sustituto: ${pctA}% para el jugador ausente.`;
    notaS = `Split de sustituto: ${pctS}% para el sustituto.`;
  }
  push(orig.player_id, pAus, 'substitute_bonus_ausente', playerId, (notas ? notas + ' | ' : '') + notaA);
  push(playerId, pSus, 'substitute_bonus_sustituto', orig.player_id, (notas ? notas + ' | ' : '') + notaS);
  return 2;
}

/* ============================================================
   cerrar_escalera(uuid) — bonos de posición final
   ============================================================ */
export function cerrarEscalera(db, escaleraId, ctx) {
  const e = db.escaleras.find((x) => x.id === escaleraId);
  if (!e) throw new Error('Escalera no encontrada.');
  if (e.status === 'completed') {
    throw new Error('Esta escalera ya fue cerrada; los bonos de posicion ya fueron otorgados.');
  }
  if (e.status === 'cancelled') throw new Error('Esta escalera esta cancelada; no se puede cerrar.');
  if (!['individual', 'parejas'].includes(e.format)) {
    throw new Error(`El formato ${e.format} no otorga puntos de escalera.`);
  }

  const conPartidos = db.rounds
    .filter((r) => r.escalera_id === escaleraId && db.round_matches.some((m) => m.round_id === r.id))
    .sort((a, b) => b.round_number - a.round_number);
  const ronda = conPartidos[0];
  if (!ronda) throw new Error('La escalera no tiene ninguna ronda con partidos; no se puede cerrar.');

  const pendientes = db.round_matches.filter((m) => {
    const r = db.rounds.find((x) => x.id === m.round_id);
    return r && r.escalera_id === escaleraId && m.status === 'pending';
  }).length;
  if (pendientes > 0) {
    throw new Error(`No se puede cerrar la escalera: hay ${pendientes} partido(s) sin resultado.`);
  }

  const mapa = cfgJson(db, 'bono_posicion_final_por_cancha', { 1: 10, 2: 5, 3: 0 });
  const mes = mesKey(e.session_date);

  // revertir_bonos_posicion: defensivo, no puede haber dos tandas.
  db.points_ledger = db.points_ledger.filter(
    (p) => !(p.escalera_id === escaleraId && p.reason === 'position_bonus'));

  let filas = 0, asientos = 0;
  for (const m of db.round_matches.filter((x) => x.round_id === ronda.id)) {
    for (const pid of [m.team1_player1, m.team1_player2, m.team2_player1, m.team2_player2]) {
      if (!pid) continue;
      const b = Number(mapa[m.court_number] ?? mapa[String(m.court_number)] ?? 0);
      asientos += 1;
      filas += otorgarPuntosSeat(db, escaleraId, null, e.format, pid, b, m.court_number, null, mes,
        'position_bonus', `Bono de posicion final: cancha ${m.court_number} (ronda ${ronda.round_number})`, ctx);
    }
  }

  db.rounds.filter((r) => r.escalera_id === escaleraId && r.status !== 'completed')
    .forEach((r) => { r.status = 'completed'; r.completed_at = r.completed_at || ctx.ahora().toISOString(); });
  e.status = 'completed';

  return { escalera_id: escaleraId, ronda_final: ronda.round_number, asientos, filas_ledger: filas, mapa_bonos: mapa };
}

/* ============================================================
   puntos_vivos() / ranking_vivo(text) / ranking_establecido(text)
   ============================================================ */
export function puntosVivos(db) {
  const n = cfgNum(db, 'rolling_window_size', 6);

  // por_escalera: suma de puntos por jugador y escalera COMPLETADA.
  const porEscalera = new Map(); // player -> [{escalera_id, session_date, pts}]
  for (const pl of db.points_ledger) {
    const e = db.escaleras.find((x) => x.id === pl.escalera_id);
    if (!e || e.status !== 'completed' || !['individual', 'parejas'].includes(e.format)) continue;
    if (!porEscalera.has(pl.player_id)) porEscalera.set(pl.player_id, new Map());
    const m = porEscalera.get(pl.player_id);
    const prev = m.get(e.id) || { escalera_id: e.id, session_date: e.session_date, pts: 0 };
    prev.pts += Number(pl.points);
    m.set(e.id, prev);
  }

  const out = [];
  for (const [playerId, m] of porEscalera) {
    const filas = [...m.values()].sort((a, b) =>
      (a.session_date < b.session_date ? 1 : a.session_date > b.session_date ? -1 : ordenId(b.escalera_id, a.escalera_id)));
    const top = filas.slice(0, n);
    out.push({
      player_id: playerId,
      rolling_points: round2(top.reduce((s, r) => s + r.pts, 0)),
      escaleras_contadas: top.length,
    });
  }
  return out;
}

export function categoriaEfectiva(db, playerId) {
  const filas = db.category_snapshots.filter((c) => c.player_id === playerId)
    .sort((a, b) => (a.week_start_date < b.week_start_date ? 1 : a.week_start_date > b.week_start_date ? -1 : 0));
  const cs = filas[0];
  if (!cs) return null;
  if (cs.category === 'limite') return cs.zona_limite_side === 'bottom_a' ? 'A' : 'B';
  return cs.category;
}

export function rankingVivo(db, categoria) {
  const pv = puntosVivos(db);
  const base = [];
  for (const pr of db.profiles) {
    if (pr.status !== 'active') continue;
    if (categoriaEfectiva(db, pr.id) !== categoria) continue;
    const p = pv.find((x) => x.player_id === pr.id);
    base.push({
      player_id: pr.id,
      rolling_points: p ? p.rolling_points : 0,
      escaleras_contadas: p ? p.escaleras_contadas : 0,
    });
  }
  base.sort((a, b) => b.rolling_points - a.rolling_points || ordenId(a.player_id, b.player_id));
  base.forEach((r, i) => { r.rnk = i + 1; });
  return base;
}

export function rankingEstablecido(db, categoria) {
  const top = cfgNum(db, 'privilege_top_n', 12);
  return rankingVivo(db, categoria).filter((r) => r.escaleras_contadas > 0).length >= top;
}

/* ============================================================
   ventana_privilegio(uuid) / tiene_ventaja_ranking(uuid, uuid)
   ============================================================ */
// date_trunc('week', d)::date -> lunes de esa semana (ISO)
export function lunesDe(fechaISO) {
  const d = new Date(fechaISO + 'T12:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function domingoPrevio(fechaISO) {
  const l = new Date(lunesDe(fechaISO) + 'T12:00:00Z');
  l.setUTCDate(l.getUTCDate() - 1);
  return l.toISOString().slice(0, 10);
}

// Construye un instante real a partir de una fecha del club (CDMX) y minutos.
// CDMX no usa horario de verano desde 2022: es UTC-6 todo el año.
const OFFSET_CDMX_MIN = -360;
export function instanteClub(fechaISO, minutos) {
  const base = Date.UTC(
    Number(fechaISO.slice(0, 4)), Number(fechaISO.slice(5, 7)) - 1, Number(fechaISO.slice(8, 10)));
  return new Date(base + (minutos - OFFSET_CDMX_MIN) * 60000);
}

export function ventanaPrivilegio(db, escaleraId, ahora) {
  const e = db.escaleras.find((x) => x.id === escaleraId);
  if (!e) throw new Error('Convocatoria no encontrada.');
  const dom = domingoPrevio(e.session_date);
  const abre = instanteClub(dom, cfgTimeMin(db, 'convocatoria_open_time', '10:00'));
  const cierra = instanteClub(dom, cfgTimeMin(db, 'privilege_close_time', '18:00'));
  const rankingListo = !!e.category && rankingEstablecido(db, e.category);
  const t = ahora().getTime();
  return {
    abre, cierra, ranking_listo: rankingListo,
    abierta: rankingListo ? (t >= abre.getTime() && t < cierra.getTime()) : false,
    cerrada: rankingListo ? (t >= cierra.getTime()) : true,
  };
}

export function tieneVentajaRanking(db, playerId, escaleraId) {
  const e = db.escaleras.find((x) => x.id === escaleraId);
  if (!e || !e.category) return false;
  const semana = lunesDe(e.session_date);
  if (db.ranking_privilege_penalties.some((p) => p.player_id === playerId && p.week_start === semana)) return false;
  const top = cfgNum(db, 'privilege_top_n', 12);
  const r = rankingVivo(db, e.category).find((x) => x.player_id === playerId);
  return !!r && r.rnk <= top;
}

/* ---------- helpers internos ---------- */

export function nuevoId(db, prefijo) {
  db.__seq = (db.__seq || 0) + 1;
  return `${prefijo}-${String(db.__seq).padStart(6, '0')}`;
}

// Los ids de la demo son ordenables como texto, igual que los uuid en un
// `order by id` de Postgres.
export function ordenId(a, b) {
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function nuevoPartido(db, roundId, cancha, split) {
  return {
    id: nuevoId(db, 'rm'), round_id: roundId, court_number: cancha,
    team1_player1: split.team1_p1, team1_player2: split.team1_p2,
    team2_player1: split.team2_p1, team2_player2: split.team2_p2,
    status: 'pending', score_team1: null, score_team2: null,
    games_team1: null, games_team2: null, sets_json: null,
    golden_point_winner: null, entered_by: null, entered_at: null,
  };
}

function barajar(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generador determinista: la demo se ve igual para todos y se puede repetir.
export function rngDesde(semilla) {
  let s = semilla >>> 0;
  return function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
