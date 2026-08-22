/* ============================================================
   VERIFICADOR DE FIDELIDAD DE LA DEMO
   ------------------------------------------------------------
   Corre los mismos escenarios que se corrieron contra Postgres
   real (guardados en golden.json) contra el motor JavaScript de
   la demo, y exige salida IDENTICA: mismos emparejamientos ronda
   por ronda, mismos marcadores, mismos puntos con dos decimales.

   Si esto falla, la demo esta mintiendo y no se entrega.

   Uso:  node pruebas/verificar_motor.js
   ============================================================ */

const fs = require('fs');
const path = require('path');

// El motor es un modulo ES; se carga con import() dinamico.
async function main() {
  const motor = await import('../assets/js/demo/motor.js');
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));

  let fallos = 0;
  const linea = (ok, txt) => { console.log(`${ok ? '  ok  ' : ' FALLA'}  ${txt}`); if (!ok) fallos++; };

  for (const [nombre, esc] of Object.entries(golden.escenarios)) {
    console.log(`\n--- ${nombre} ---`);
    const res = correrEscenario(motor, esc);

    linea(res.rondas === esc.rondas, 'emparejamientos y marcadores ronda por ronda');
    if (res.rondas !== esc.rondas) mostrarDiff(esc.rondas, res.rondas);

    linea(res.totales === esc.totales, 'puntos finales de cada jugador');
    if (res.totales !== esc.totales) mostrarDiff(esc.totales, res.totales);

    if (res.notas.length) {
      console.log(`        (${res.notas.length} empate(s) de reparto, resueltos al azar tambien en Postgres)`);
    }
  }

  // Reglas que el club describio, verificadas sobre la salida REAL de Postgres.
  console.log('\n--- reglas del formato Individual (sobre la salida real de la base) ---');
  for (const [nombre, esc] of Object.entries(golden.escenarios)) {
    if (esc.formato !== 'individual') continue;
    for (const [txt, ok] of Object.entries(revisarReglas(parsear(esc.rondas)))) {
      linea(ok === true, `${nombre}: ${txt}`);
      if (ok !== true) console.log(`        ${ok}`);
    }
  }

  console.log(fallos === 0
    ? '\nRESULTADO: la demo se comporta EXACTAMENTE igual que la base real.'
    : `\nRESULTADO: ${fallos} diferencia(s) — la demo NO refleja la app real.`);
  process.exit(fallos === 0 ? 0 : 1);
}

/* ---------- armado del escenario en el motor JS ---------- */

function correrEscenario(motor, esc) {
  const n = esc.jugadores;
  const titulares = esc.titulares || n;
  const pid = (i) => 'p' + String(i).padStart(2, '0');
  const num = (id) => Number(String(id).slice(1));

  const db = nuevaDb(motor, n, esc.formato);
  const escaleraId = 'esc-0001';
  const ctx = { ahora: () => new Date('2031-03-03T02:00:00Z'), uid: 'admin', rnd: motor.rngDesde(7) };

  db.escaleras.push({
    id: escaleraId, weekday_schedule_id: 'ws1', session_date: '2031-03-03',
    format: esc.formato, category: 'A', status: 'scheduled', courts_active: 3,
  });

  if (esc.formato === 'parejas') {
    for (let i = 1; i <= titulares; i += 2) {
      db.escalera_registrations.push(registro(motor, db, escaleraId, pid(i), pid(i + 1), i));
      db.escalera_registrations.push(registro(motor, db, escaleraId, pid(i + 1), pid(i), i));
    }
  } else {
    for (let i = 1; i <= titulares; i++) {
      db.escalera_registrations.push(registro(motor, db, escaleraId, pid(i), null, i));
    }
  }

  // Sustituciones, replicando lo que dejan asignar_sustituto /
  // asignar_sustituto_admin en la tabla de registros.
  for (const s of esc.sustituciones || []) {
    const orig = db.escalera_registrations.find(
      (r) => r.escalera_id === escaleraId && r.player_id === pid(s.titular));
    orig.status = 'cancelled';
    db.escalera_registrations.push({
      id: motor.nuevoId(db, 'reg'), escalera_id: escaleraId, player_id: pid(s.sustituto),
      partner_id: null, partner_status: null, status: 'substitute',
      substitute_for_registration_id: orig.id,
      is_coach_substitute: s.tipo === 'coach',
      no_point_split: s.tipo === 'admin_sin_reparto',
      admin_substitute_reason: s.tipo === 'admin_sin_reparto' ? 'Emergencia medica de prueba' : null,
      waitlist_position: null, via_privilegio: false, priority_snapshot: null,
      created_at: '2031-03-01T00:00:00Z', confirmed_at: '2031-03-01T00:00:00Z',
    });
  }

  // Ronda 1: el reparto real es al azar en las dos implementaciones, asi que
  // se inyecta EXACTAMENTE el de Postgres. Todo lo que sigue (rondas 2+, subir
  // y bajar, emparejamiento, puntos) ya es determinista y es lo que se compara.
  const golden = parsear(esc.rondas);
  const r1 = golden.filter((g) => g.ronda === 1).sort((a, b) => a.cancha - b.cancha);
  const roundId = motor.nuevoId(db, 'rd');
  db.rounds.push({
    id: roundId, escalera_id: escaleraId, round_number: 1, status: 'in_progress',
    started_at: ctx.ahora().toISOString(), completed_at: null,
  });
  for (const g of r1) {
    db.round_matches.push({
      id: motor.nuevoId(db, 'rm'), round_id: roundId, court_number: g.cancha,
      team1_player1: pid(g.t1[0]), team1_player2: pid(g.t1[1]),
      team2_player1: pid(g.t2[0]), team2_player2: pid(g.t2[1]),
      status: 'pending', score_team1: null, score_team2: null,
      games_team1: null, games_team2: null, sets_json: null,
      golden_point_winner: null, entered_by: null, entered_at: null,
    });
  }
  db.escaleras[0].status = 'in_progress';

  const maxRonda = Math.max(...golden.map((g) => g.ronda));
  const salida = [];
  const notas = [];
  for (let r = 1; r <= maxRonda; r++) {
    const rd = db.rounds.find((x) => x.escalera_id === escaleraId && x.round_number === r);
    const partidos = db.round_matches.filter((m) => m.round_id === rd.id)
      .sort((a, b) => a.court_number - b.court_number);
    for (const m of partidos) {
      const eq1 = [num(m.team1_player1), num(m.team1_player2)];
      const eq2 = [num(m.team2_player1), num(m.team2_player2)];
      motor.registrarResultadoPartido(db, m.id, setsDe(r, m.court_number, eq1, eq2), ctx);
    }
    for (const m of partidos) {
      // Forma canonica: cada equipo con sus jugadores ordenados, y los dos
      // equipos ordenados por su jugador mas chico.
      let ta = [num(m.team1_player1), num(m.team1_player2)].sort((a, b) => a - b);
      let tb = [num(m.team2_player1), num(m.team2_player2)].sort((a, b) => a - b);
      let ga = m.games_team1, gb = m.games_team2;
      if (tb[0] < ta[0]) { [ta, tb] = [tb, ta]; [ga, gb] = [gb, ga]; }
      salida.push(`R${r}C${m.court_number}:${ta[0]}+${ta[1]}vs${tb[0]}+${tb[1]}=${ga}-${gb}`);
    }
    if (r < maxRonda) {
      motor.generarSiguienteRonda(db, escaleraId, ctx);
      if (esc.formato === 'individual') {
        notas.push(...alinearEmpates(motor, db, escaleraId, r + 1, golden, pid, num));
      }
    }
  }
  motor.cerrarEscalera(db, escaleraId, ctx);

  // Totales por jugador, en el mismo formato que el SQL (2 decimales fijos).
  const suma = new Map();
  for (const pl of db.points_ledger) {
    suma.set(pl.player_id, motor.round2((suma.get(pl.player_id) || 0) + Number(pl.points)));
  }
  const totales = [...suma.keys()].sort()
    .map((k) => `${num(k)}=${suma.get(k).toFixed(2)}`).join(' ');

  return { rondas: salida.join(' | '), totales, notas };
}

/* ============================================================
   Empates de reparto
   ------------------------------------------------------------
   En Individual puede haber DOS repartos igual de buenos (ninguno
   repite compañero, o los dos repiten lo mismo de viejo). Postgres
   se queda con cualquiera de los dos: el orden depende del uuid
   aleatorio del partido de origen. Eso no es logica, es azar.

   Entonces lo que se exige aqui es lo que si es logica:
     1. a esa cancha llegaron EXACTAMENTE los mismos 4 jugadores
        que en la base real (o sea, subir y bajar funciono igual),
     2. el reparto que eligio Postgres y el que eligio la demo
        tienen la MISMA calificacion (mismas repeticiones, misma
        antiguedad) — o sea, las dos aplican la misma regla,
     3. el reparto de Postgres separa a los que llegaron juntos.
   Cumplido eso, se adopta el reparto de Postgres para que las
   rondas siguientes y los puntos se puedan comparar exactos.
   ============================================================ */
function alinearEmpates(motor, db, escaleraId, ronda, golden, pid, num) {
  const notas = [];
  const rd = db.rounds.find((x) => x.escalera_id === escaleraId && x.round_number === ronda);
  const mios = db.round_matches.filter((m) => m.round_id === rd.id);

  for (const m of mios) {
    const g = golden.find((x) => x.ronda === ronda && x.cancha === m.court_number);
    if (!g) throw new Error(`Falta la cancha ${m.court_number} de la ronda ${ronda} en golden.`);

    const mios4 = [m.team1_player1, m.team1_player2, m.team2_player1, m.team2_player2].map(num).sort((a, b) => a - b);
    const suyos4 = g.t1.concat(g.t2).slice().sort((a, b) => a - b);
    if (mios4.join(',') !== suyos4.join(',')) {
      throw new Error(`R${ronda}C${m.court_number}: a la cancha llegaron jugadores distintos. `
        + `real(SQL)=${suyos4.join('+')} demo(JS)=${mios4.join('+')}`);
    }

    // Se quitan los partidos de esta ronda antes de calificar, para que la
    // calificacion mire el mismo historial que vio cada implementacion.
    const guardados = db.round_matches;
    db.round_matches = db.round_matches.filter((x) => x.round_id !== rd.id);

    const clave = (o) => `${o.repeat_count}/${o.repeat_reciente}`;
    const opciones = motor.opcionesSplit(db,
      [m.team1_player1, m.team1_player2, m.team2_player1, m.team2_player2], escaleraId, false);
    const buscar = (x, y) => opciones.find((o) =>
      (o.team1_p1 === x && o.team1_p2 === y) || (o.team1_p1 === y && o.team1_p2 === x)
      || (o.team2_p1 === x && o.team2_p2 === y) || (o.team2_p1 === y && o.team2_p2 === x));

    const mia = buscar(m.team1_player1, m.team1_player2);
    const suya = buscar(pid(g.t1[0]), pid(g.t1[1]));
    db.round_matches = guardados;

    if (!suya) throw new Error(`R${ronda}C${m.court_number}: el reparto de la base real no es una particion valida.`);
    if (clave(mia) !== clave(suya)) {
      throw new Error(`R${ronda}C${m.court_number}: los dos repartos NO valen lo mismo. `
        + `real(SQL) ${g.t1.join('+')}vs${g.t2.join('+')} = ${clave(suya)}; `
        + `demo(JS) ${num(m.team1_player1)}+${num(m.team1_player2)}vs${num(m.team2_player1)}+${num(m.team2_player2)} = ${clave(mia)}`);
    }
    const mejor = clave(opciones[0]);
    if (clave(suya) !== mejor) {
      throw new Error(`R${ronda}C${m.court_number}: el reparto de la base real no es el mejor posible (${clave(suya)} vs ${mejor}).`);
    }

    if (clave(mia) === clave(suya)
        && `${num(m.team1_player1)}+${num(m.team1_player2)}` !== `${g.t1[0]}+${g.t1[1]}`) {
      notas.push(`R${ronda}C${m.court_number}: empate de repartos, ambos ${clave(suya)}`);
    }

    // Se adopta el de Postgres para que lo que sigue se compare exacto.
    m.team1_player1 = pid(g.t1[0]); m.team1_player2 = pid(g.t1[1]);
    m.team2_player1 = pid(g.t2[0]); m.team2_player2 = pid(g.t2[1]);
  }
  return notas;
}

/* Mismos marcadores deterministas que uso el bloque DO en Postgres.

   El ganador NO se decide por "equipo 1" o "equipo 2": eso depende del uuid
   aleatorio del partido de origen y cambia entre una corrida y otra. Se decide
   por QUE JUGADORES estan en la cancha, que si es identico en las dos
   implementaciones. */
function setsDe(ronda, cancha, eq1, eq2) {
  const todos = eq1.concat(eq2).slice().sort((a, b) => a - b);
  const objetivo = todos[(ronda * 7 + cancha * 3) % 4];
  const gana1 = eq1.includes(objetivo);
  const k = (ronda * 10 + cancha) % 3;
  let g, p;
  if (k === 0) { g = [[6, 4], [3, 6], [10, 8]]; }
  else if (k === 1) { g = [[6, 3], [6, 4]]; }
  else { g = [[6, 4], [6, 4]]; }
  p = g.map(([w, l]) => (gana1 ? { team1: w, team2: l } : { team1: l, team2: w }));
  return p;
}

function registro(motor, db, escaleraId, playerId, partnerId, i) {
  return {
    id: motor.nuevoId(db, 'reg'), escalera_id: escaleraId, player_id: playerId,
    partner_id: partnerId, partner_status: partnerId ? 'accepted' : null,
    status: 'confirmed', substitute_for_registration_id: null,
    is_coach_substitute: false, no_point_split: false, admin_substitute_reason: null,
    waitlist_position: null, via_privilegio: false, priority_snapshot: null,
    created_at: `2031-03-01T00:00:${String(i).padStart(2, '0')}Z`,
    confirmed_at: '2031-03-01T00:00:00Z',
  };
}

function nuevaDb(motor, n, formato) {
  const db = {
    __seq: 0,
    profiles: [], category_snapshots: [], weekday_schedule: [{ id: 'ws1', capacity: 12, courts: 3 }],
    escaleras: [], escalera_registrations: [], rounds: [], round_matches: [],
    points_ledger: [], ranking_privilege_penalties: [],
    system_settings: [
      { key: 'puntos_por_game', value: '2' },
      { key: 'bono_victoria_partido', value: '3' },
      { key: 'multiplicador_cancha_1', value: '1.2' },
      { key: 'multiplicador_cancha_2', value: '1.0' },
      { key: 'multiplicador_cancha_3', value: '0.9' },
      { key: 'bono_posicion_final_por_cancha', value: { 1: 10, 2: 5, 3: 0 } },
      { key: 'substitute_split_ausente_pct', value: '66' },
      { key: 'substitute_split_sustituto_pct', value: '34' },
      { key: 'rolling_window_size', value: '6' },
    ],
  };
  for (let i = 1; i <= n; i++) {
    db.profiles.push({ id: 'p' + String(i).padStart(2, '0'), full_name: 'VERIF ' + i, status: 'active', role: 'jugador' });
  }
  return db;
}

function parsear(txt) {
  return txt.split(' | ').map((s) => {
    const m = s.match(/^R(\d+)C(\d+):(\d+)\+(\d+)vs(\d+)\+(\d+)=(\d+)-(\d+)$/);
    if (!m) throw new Error('No se pudo leer la linea golden: ' + s);
    return {
      ronda: +m[1], cancha: +m[2], t1: [+m[3], +m[4]], t2: [+m[5], +m[6]],
      games: [+m[7], +m[8]],
    };
  });
}

function mostrarDiff(esperado, obtenido) {
  const a = esperado.split(/ \| | /), b = obtenido.split(/ \| | /);
  const max = Math.max(a.length, b.length);
  let mostrados = 0;
  for (let i = 0; i < max && mostrados < 8; i++) {
    if (a[i] !== b[i]) {
      console.log(`        real(SQL): ${a[i] ?? '(nada)'}`);
      console.log(`        demo(JS) : ${b[i] ?? '(nada)'}`);
      mostrados++;
    }
  }
}

main().catch((e) => { console.error(e); process.exit(2); });

/* ============================================================
   Las reglas que el club describio, comprobadas sobre lo que la
   BASE REAL produjo. Esto no compara demo contra base: comprueba
   que la base hace lo que el club dice que debe hacer.
   ============================================================ */
function revisarReglas(rondas) {
  const maxR = Math.max(...rondas.map((r) => r.ronda));
  const de = (r) => rondas.filter((x) => x.ronda === r).sort((a, b) => a.cancha - b.cancha);
  const parejaDe = (m, j) => (m.t1.includes(j) ? m.t1.find((x) => x !== j) : m.t2.find((x) => x !== j));
  const rivalesDe = (m, j) => (m.t1.includes(j) ? m.t2 : m.t1);
  const canchaDe = (rs, j) => rs.find((m) => m.t1.concat(m.t2).includes(j));

  let rivalSiempre = true, detalleRival = '';
  let nuncaSeguido = true, detalleSeguido = '';
  const juntos = new Map(); // "a-b" -> [rondas]

  for (let r = 1; r <= maxR; r++) {
    for (const m of de(r)) {
      for (const eq of [m.t1, m.t2]) {
        const k = eq.slice().sort((a, b) => a - b).join('-');
        if (!juntos.has(k)) juntos.set(k, []);
        juntos.get(k).push(r);
      }
    }
    if (r === maxR) break;
    const sig = de(r + 1);
    for (const m of de(r)) {
      for (const j of m.t1.concat(m.t2)) {
        const antes = parejaDe(m, j);
        const ahora = canchaDe(sig, j);
        // 1. tu compañero anterior pasa a ser tu rival
        if (!rivalesDe(ahora, j).includes(antes)) {
          rivalSiempre = false;
          detalleRival = `ronda ${r}->${r + 1}: el jugador ${j} venia con ${antes} y no le toco de rival`;
        }
        // 2. nunca repites compañero dos rondas seguidas
        if (parejaDe(ahora, j) === antes) {
          nuncaSeguido = false;
          detalleSeguido = `ronda ${r}->${r + 1}: el jugador ${j} repitio a ${antes} de compañero`;
        }
      }
    }
  }

  // 3. cuando se repite pareja, pasaron varias rondas de por medio
  let separacionMinima = Infinity;
  for (const [, rs] of juntos) {
    for (let i = 1; i < rs.length; i++) separacionMinima = Math.min(separacionMinima, rs[i] - rs[i - 1]);
  }

  return {
    'en la siguiente ronda juegas CONTRA la pareja con la que subiste o bajaste':
      rivalSiempre || detalleRival,
    'nunca te toca el mismo compañero dos rondas seguidas':
      nuncaSeguido || detalleSeguido,
    [`si se repite un compañero, pasaron al menos 2 rondas (minimo visto: ${separacionMinima === Infinity ? 'ninguna repeticion' : separacionMinima})`]:
      separacionMinima === Infinity || separacionMinima >= 2 || `hubo una repeticion a ${separacionMinima} ronda(s)`,
  };
}
