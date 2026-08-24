import { el, todayISO, formatFecha, formatHora, toast, humanizeError, openSheet, confirmSheet } from '../utils.js';
import {
  getMyProfile, esAdminOMaestro,
  getEscalerasAdmin, getRegistrosEscalera, getRondasConPartidos,
  generarSiguienteRonda, registrarResultadoPartido, corregirResultadoPartido, cerrarEscalera,
  marcarNoShow, cancelarRegistro, asignarSustituto, asignarSustitutoAdmin, buscarJugadores,
  cancelarEscaleraAdmin,
  comenzarEscalera, adminAgregarJugador, getAjusteNum,
} from '../api.js';

/* El Inicio del Admin manda directo a UNA noche. Se guarda aquí cuál para
   que al entrar a la pantalla se abra esa, en vez de dejar a recepción
   buscándola otra vez en la lista. */
let nochePendiente = null;
export function abrirNoche(escaleraId) { nochePendiente = escaleraId; }

const FORMAT_LABEL = { individual: 'Individual', parejas: 'Parejas Fijas', retas_abiertas: 'Retas Abiertas' };
const ESTADO_ESCALERA = {
  scheduled: { text: 'Programada', cls: 'badge-neutral' },
  registration_open: { text: 'Registro abierto', cls: 'badge-neutral' },
  confirmed: { text: 'Confirmada', cls: 'badge-neutral' },
  in_progress: { text: 'En juego', cls: 'badge-warning' },
  completed: { text: 'Cerrada', cls: 'badge-success' },
  cancelled: { text: 'Cancelada', cls: 'badge-danger' },
};
const REG_STATUS = {
  confirmed: { text: 'Confirmado', cls: 'badge-success' },
  waitlist: { text: 'Lista de espera', cls: 'badge-warning' },
  substitute: { text: 'Sustituto', cls: 'badge-success' },
  declined: { text: 'Declinado', cls: 'badge-neutral' },
  cancelled_ontime: { text: 'Cancelado', cls: 'badge-neutral' },
  cancelled_late: { text: 'Cancelado tarde', cls: 'badge-danger' },
  no_show: { text: 'No asistió', cls: 'badge-danger' },
};

export async function renderAdminEscaleras() {
  const profile = await getMyProfile();
  if (!esAdminOMaestro(profile)) {
    return el('div', { class: 'empty-state' }, [el('div', { class: 'emoji' }, '🔒'), el('p', {}, 'No tienes permiso para ver esta sección.')]);
  }

  const wrap = el('div');
  if (nochePendiente) {
    const id = nochePendiente;
    nochePendiente = null;
    await pintarDetalle(wrap, id);
  } else {
    await pintarLista(wrap);
  }
  return wrap;
}

async function pintarLista(wrap) {
  wrap.innerHTML = '';
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Noches del club'));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, 'Aquí ves quién se anotó, arrancas la noche y capturas los resultados.'));

  const escaleras = await getEscalerasAdmin();
  if (escaleras.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, [el('div', { class: 'emoji' }, '📅'), el('p', {}, 'No hay escaleras recientes o próximas.')]));
    return;
  }
  // La de hoy primero y bien marcada: es la que recepcion necesita 9 de cada
  // 10 veces que entra aquí.
  const hoy = todayISO();
  const deHoy = escaleras.filter((e) => e.session_date === hoy);
  const proximas = escaleras.filter((e) => e.session_date > hoy).sort((a, b) => a.session_date.localeCompare(b.session_date));
  const pasadas = escaleras.filter((e) => e.session_date < hoy);
  const pendientes = pasadas.filter((e) => e.status !== 'completed' && e.status !== 'cancelled');
  const cerradas = pasadas.filter((e) => e.status === 'completed' || e.status === 'cancelled');

  const seccion = (titulo, lista, destacar) => {
    if (!lista.length) return;
    wrap.appendChild(el('div', { class: 'section-title' }, titulo));
    lista.forEach((esc) => wrap.appendChild(tarjetaNoche(wrap, esc, destacar)));
  };

  seccion('Hoy', deHoy, true);
  seccion('Sin cerrar — te faltó terminarlas', pendientes, true);
  seccion('Ya vienen', proximas, false);
  seccion('Ya cerradas', cerradas, false);
}

function tarjetaNoche(wrap, esc, destacar) {
  const ws = esc.weekday_schedule;
  const est = ESTADO_ESCALERA[esc.status] || { text: esc.status, cls: 'badge-neutral' };
  return el('div', {
    class: 'card card-tappable mt-3' + (destacar ? ' card-hero' : ''),
    onclick: () => pintarDetalle(wrap, esc.id),
  }, [
    el('div', { class: 'row-between' }, [
      el('div', {}, [
        el('div', { style: 'font-weight:800;font-size:15px;' }, formatFecha(esc.session_date)),
        el('div', { class: 'text-tiny mt-1' }, `${FORMAT_LABEL[ws.format] || ws.format}${ws.category ? ' · Cat ' + ws.category : ''} · ${formatHora(ws.start_time)}`),
      ]),
      el('span', { class: `badge ${est.cls}` }, est.text),
    ]),
  ]);
}

async function pintarDetalle(wrap, escaleraId) {
  wrap.innerHTML = '';
  const loading = el('div', { class: 'stack', style: 'padding-top:60px;' }, [el('div', { class: 'spinner' })]);
  wrap.appendChild(loading);

  const [escaleras, registros, rondas] = await Promise.all([
    getEscalerasAdmin(), getRegistrosEscalera(escaleraId), getRondasConPartidos(escaleraId),
  ]);
  const esc = escaleras.find((e) => e.id === escaleraId);
  wrap.innerHTML = '';
  if (!esc) { wrap.appendChild(el('p', { class: 'text-muted' }, 'Esa escalera ya no está disponible.')); return; }
  const ws = esc.weekday_schedule;

  const refresh = () => pintarDetalle(wrap, escaleraId);

  const back = el('button', { class: 'btn btn-ghost btn-sm mb-3', style: 'width:auto;padding-left:0;', onclick: () => pintarLista(wrap) }, '← Volver');
  wrap.appendChild(back);

  const est = ESTADO_ESCALERA[esc.status] || { text: esc.status, cls: 'badge-neutral' };
  wrap.appendChild(el('div', { class: 'row-between' }, [
    el('div', { class: 'h2' }, formatFecha(esc.session_date)),
    el('span', { class: `badge ${est.cls}` }, est.text),
  ]));
  wrap.appendChild(el('p', { class: 'text-muted mt-1' }, `${FORMAT_LABEL[ws.format] || ws.format}${ws.category ? ' · Cat ' + ws.category : ''} · ${formatHora(ws.start_time)}–${formatHora(ws.end_time)}`));

  if (ws.format === 'retas_abiertas') {
    wrap.appendChild(el('div', { class: 'card mt-4' }, el('p', { class: 'text-muted' }, 'Retas Abiertas es 100% social — no otorga puntos ni tiene rondas capturables aquí.')));
    return;
  }

  // ============================================================
  //  El orden de esta pantalla es el orden en que pasan las cosas
  //  una noche: primero ves cuántos van, luego arrancas, y hasta
  //  entonces aparecen las rondas. Nada de decidir antes de tiempo.
  // ============================================================

  const confirmados = registros.filter((r) => ['confirmed', 'substitute'].includes(r.status));
  const enEspera = registros.filter((r) => r.status === 'waitlist');
  const cupo = ws.capacity || 12;
  const faltan = Math.max(cupo - confirmados.length, 0);
  const completo = confirmados.length >= cupo;
  const yaArranco = ['in_progress', 'completed'].includes(esc.status);

  // ---- Cuántos van ----
  if (esc.status !== 'cancelled') {
    wrap.appendChild(renderCuantosVan(esc, confirmados.length, cupo, enEspera.length, yaArranco));
  }

  // ---- El botón grande de la noche ----
  if (esc.status === 'scheduled') {
    wrap.appendChild(renderComenzar(esc, confirmados.length, cupo, faltan, completo, refresh));
  }

  // ---- Quién va ----
  if (esc.status !== 'cancelled') {
    wrap.appendChild(renderRoster(esc, ws, registros, confirmados, enEspera, cupo, refresh));
  }

  // ---- Rondas (solo cuando la noche ya arrancó) ----
  if (esc.status === 'scheduled') return;
  if (esc.status === 'cancelled') {
    wrap.appendChild(el('div', { class: 'aviso aviso-danger mt-4' },
      'Esta noche se canceló. Nadie recibió penalización ni perdió puntos.'));
    return;
  }

  wrap.appendChild(el('div', { class: 'section-title' }, 'Rondas'));
  if (rondas.length === 0) {
    wrap.appendChild(el('div', { class: 'card' },
      el('p', { class: 'text-muted' }, 'Esta noche está marcada como en juego pero no tiene rondas. Avisa a dirección.')));
    return;
  }

  rondas.forEach((ronda) => {
    const rondaCard = el('div', { class: 'card mt-4' });
    rondaCard.appendChild(el('div', { class: 'row-between mb-2' }, [
      el('div', { style: 'font-weight:700;' }, `Ronda ${ronda.round_number}`),
      el('span', { class: `badge ${ronda.status === 'completed' ? 'badge-success' : 'badge-warning'}` },
        ronda.status === 'completed' ? 'Completa' : 'En curso'),
    ]));
    ronda.partidos.forEach((m, i) => {
      if (i > 0) rondaCard.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      rondaCard.appendChild(renderPartidoRow(m, refresh));
    });
    wrap.appendChild(rondaCard);
  });

  const ultimaRonda = rondas[rondas.length - 1];
  const pendientes = ultimaRonda.partidos.filter((m) => m.status === 'pending').length;
  const tope = await getAjusteNum('max_rondas_escalera', 7);
  const accionesFinales = el('div', { class: 'stack gap-3 mt-4' });

  if (pendientes > 0) {
    accionesFinales.appendChild(el('p', { class: 'text-muted' },
      `Faltan ${pendientes} partido(s) por capturar en la ronda ${ultimaRonda.round_number}.`));
  } else if (esc.status === 'completed') {
    accionesFinales.appendChild(el('p', { class: 'text-muted' },
      'Esta noche ya está cerrada. Para corregir un resultado, usa "Corregir" en el partido correspondiente.'));
  } else {
    if (ultimaRonda.round_number < tope) {
      accionesFinales.appendChild(el('button', { class: 'btn btn-secondary', onclick: async (e) => {
        e.target.disabled = true; e.target.textContent = 'Generando…';
        try { await generarSiguienteRonda(escaleraId); toast(`Ronda ${ultimaRonda.round_number + 1} lista.`, 'success'); refresh(); }
        catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; e.target.textContent = 'Generar siguiente ronda'; }
      } }, 'Generar siguiente ronda'));
    } else {
      accionesFinales.appendChild(el('div', { class: 'aviso aviso-neutral' },
        `Ya se jugaron las ${tope} rondas de la noche. Cierra la escalera para repartir los bonos.`));
    }
    accionesFinales.appendChild(el('button', { class: 'btn btn-primary', onclick: async (e) => {
      const ok = await confirmSheet({
        title: '¿Cerrar la noche?',
        body: 'Se reparten los bonos de posición final según la cancha donde terminó cada quien, y la noche entra al ranking. No se puede deshacer desde aquí.',
        confirmLabel: 'Sí, cerrar',
      });
      if (!ok) return;
      e.target.disabled = true; e.target.textContent = 'Cerrando…';
      try { await cerrarEscalera(escaleraId); toast('Noche cerrada — bonos repartidos.', 'success'); refresh(); }
      catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; e.target.textContent = 'Cerrar la noche'; }
    } }, 'Cerrar la noche'));
  }
  wrap.appendChild(accionesFinales);
}

/* ============================================================
   Cuántos van — el número que recepción necesita de un vistazo.
   ============================================================ */
function renderCuantosVan(esc, confirmados, cupo, espera, yaArranco) {
  const box = el('div', { class: 'mt-4' });
  const pct = Math.min(100, Math.round((confirmados / cupo) * 100));
  const completo = confirmados >= cupo;

  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { class: 'row-between' }, [
    el('div', { style: 'font-size:30px;font-weight:800;line-height:1;' }, [
      el('span', { style: completo ? 'color:var(--cyan);' : '' }, String(confirmados)),
      el('span', { style: 'color:var(--text-tertiary);font-size:20px;' }, ` / ${cupo}`),
    ]),
    el('span', { class: `badge ${completo ? 'badge-success' : 'badge-warning'}` },
      completo ? 'Cupo completo' : `Faltan ${cupo - confirmados}`),
  ]));
  card.appendChild(el('div', { class: 'cupo-bar mt-3' }, [
    el('div', { class: `cupo-bar-fill${completo ? ' full' : ''}`, style: `width:${pct}%;` }),
  ]));
  card.appendChild(el('p', { class: 'text-tiny mt-2' },
    espera > 0 ? `${espera} en lista de espera` : 'Sin lista de espera'));
  box.appendChild(card);
  void yaArranco;
  return box;
}

/* ============================================================
   El botón de la noche.
   Regla del club: o se completa el cupo, o no hay escalera. Si no
   se llena, se cancela y recepción ve con la gente qué hacer —
   pero eso ya no lo organiza la app, y no reparte puntos.
   ============================================================ */
function renderComenzar(esc, confirmados, cupo, faltan, completo, refresh) {
  const box = el('div', { class: 'mt-4' });

  if (completo) {
    box.appendChild(el('div', { class: 'aviso aviso-ok' }, [
      el('strong', {}, 'Ya están todos. '),
      'Cuando los tengas en cancha, dale Comenzar: se cierra la lista y la app reparte la ronda 1.',
    ]));
    box.appendChild(el('button', { class: 'btn btn-primary mt-3', onclick: async (e) => {
      const ok = await confirmSheet({
        title: '¿Comenzar la escalera?',
        body: `Se cierra la convocatoria (ya nadie se puede anotar) y se arma la ronda 1 con los ${confirmados} jugadores. Hazlo cuando ya estén en cancha.`,
        confirmLabel: 'Sí, comenzar',
      });
      if (!ok) return;
      e.target.disabled = true; e.target.textContent = 'Arrancando…';
      try {
        const r = await comenzarEscalera(esc.id);
        toast(`Listo: ${r.jugadores} jugadores en ${r.canchas} canchas.`, 'success');
        refresh();
      } catch (err) {
        toast(humanizeError(err), 'error');
        e.target.disabled = false; e.target.textContent = 'Comenzar escalera';
      }
    } }, 'Comenzar escalera'));
    return box;
  }

  box.appendChild(el('div', { class: 'aviso aviso-warn' }, [
    el('strong', {}, `Faltan ${faltan} para completar. `),
    'La escalera solo arranca con el cupo lleno: se juega de 4 en 4 y con menos no se pueden armar las canchas. ',
    'Agrega a quien llegue, o cancela la noche.',
  ]));
  box.appendChild(el('button', { class: 'btn btn-secondary mt-3', disabled: 'disabled' }, 'Comenzar escalera'));
  box.appendChild(el('button', { class: 'btn btn-danger mt-2', onclick: async () => {
    const motivo = await pedirMotivoCancelacion(confirmados, cupo);
    if (motivo === null) return;
    try {
      await cancelarEscaleraAdmin(esc.id, motivo);
      toast('Noche cancelada. Ya se les avisó a todos.', 'success');
      refresh();
    } catch (err) { toast(humanizeError(err), 'error'); }
  } }, 'Cancelar la noche'));
  return box;
}

function pedirMotivoCancelacion(confirmados, cupo) {
  return new Promise((resolve) => {
    const input = el('input', { class: 'input', type: 'text',
      placeholder: 'Ej. no se completó el cupo', value: 'No se completó el cupo' });
    const content = el('div', {}, [
      el('div', { class: 'sheet-title' }, '¿Cancelar la noche?'),
      el('p', { class: 'text-tiny mb-3' },
        `Van ${confirmados} de ${cupo}. Al cancelar se libera a todos: nadie recibe penalización ni pierde puntos, y la app les avisa sola. No se puede deshacer.`),
      el('div', { class: 'field' }, [el('label', {}, 'Motivo (lo van a ver los jugadores)'), input]),
    ]);
    const btnCancelar = el('button', { class: 'btn btn-ghost mt-3', onclick: () => { handle.close(); resolve(null); } }, 'Mejor no');
    const btnOk = el('button', { class: 'btn btn-danger mt-2', onclick: () => {
      handle.close(); resolve(input.value.trim() || 'No se completó el cupo');
    } }, 'Sí, cancelar la noche');
    content.appendChild(btnOk);
    content.appendChild(btnCancelar);
    const handle = openSheet(content, { onClose: () => resolve(null) });
  });
}

/* ============================================================
   Quién va — lista en vivo, con todo lo que recepción puede hacer.
   ============================================================ */
function renderRoster(esc, ws, registros, confirmados, enEspera, cupo, refresh) {
  const box = el('div', {});
  box.appendChild(el('div', { class: 'row-between' }, [
    el('div', { class: 'section-title', style: 'margin-bottom:0;' }, 'Quién va'),
    esc.status === 'scheduled'
      ? el('button', { class: 'btn btn-secondary btn-sm', style: 'width:auto;',
          onclick: () => abrirAgregarJugador(esc, ws, refresh) }, '+ Agregar')
      : null,
  ]));

  const card = el('div', { class: 'card' });
  const pintarFila = (r, i, extra) => {
    if (i > 0) card.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
    const st = REG_STATUS[r.status] || { text: r.status, cls: 'badge-neutral' };
    card.appendChild(el('div', { class: 'row-between' }, [
      el('div', {}, [
        el('div', { style: 'font-weight:600;font-size:14px;' },
          (r.profiles && r.profiles.full_name) || '(sin nombre)'),
        el('div', { class: 'text-tiny' }, extra || (r.is_coach_substitute ? 'Sustituto — coach' : '')),
      ]),
      el('span', { class: `badge ${st.cls}` }, st.text),
    ]));
    if (['confirmed', 'substitute'].includes(r.status) && esc.status !== 'completed') {
      card.appendChild(el('div', { class: 'btn-row mt-2' }, [
        el('button', { class: 'btn btn-secondary btn-sm', onclick: () => abrirSustituto(r, refresh, ws.format) }, 'Sustituto'),
        el('button', { class: 'btn btn-secondary btn-sm', onclick: async () => {
          const ok = await confirmSheet({ title: '¿No se presentó?', body: 'Se le descuenta la penalización de no-show sobre su puntaje de las últimas 6 noches.', confirmLabel: 'Sí, no vino', danger: true });
          if (!ok) return;
          try { await marcarNoShow(r.id); toast('Marcado como no-show.', 'success'); refresh(); }
          catch (err) { toast(humanizeError(err), 'error'); }
        } }, 'No vino'),
        el('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
          const ok = await confirmSheet({ title: '¿Quitarlo de esta noche?', body: 'Se libera su lugar y, si hay lista de espera, entra el siguiente.', confirmLabel: 'Sí, quitar', danger: true });
          if (!ok) return;
          try { await cancelarRegistro(r.id); toast('Listo, ya no está en la lista.', 'success'); refresh(); }
          catch (err) { toast(humanizeError(err), 'error'); }
        } }, 'Quitar'),
      ]));
    }
  };

  if (!confirmados.length && !enEspera.length) {
    card.appendChild(el('p', { class: 'text-muted' }, 'Todavía no se anota nadie.'));
  }
  confirmados.forEach((r, i) => pintarFila(r, i,
    r.partner_id
      ? (r.partner_status === 'pending'
          ? '⚠️ Juega en pareja — todavia no acepta la invitacion'
          : 'Juega en pareja')
      : ''));
  if (enEspera.length) {
    card.appendChild(el('div', { class: 'text-tiny mt-3', style: 'text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);' },
      `Lista de espera (${enEspera.length})`));
    enEspera.forEach((r, i) => pintarFila(r, i + 1, r.waitlist_position ? `Lugar ${r.waitlist_position} de la fila` : ''));
  }
  box.appendChild(card);
  void cupo; void registros;
  return box;
}

/* Recepción mete a alguien que llegó sin haberse anotado. */
function abrirAgregarJugador(esc, ws, refresh) {
  const content = el('div', {});
  content.appendChild(el('div', { class: 'sheet-title' }, 'Agregar a la noche'));
  content.appendChild(el('p', { class: 'text-tiny mb-3' },
    ws.format === 'parejas'
      ? 'En Parejas Fijas hay que agregar a los dos: busca al primero y luego a su pareja.'
      : 'Busca al jugador que llegó. Queda confirmado de inmediato.'));

  const buscador = el('input', { class: 'input', type: 'text', placeholder: 'Escribe un nombre…' });
  const lista = el('div', { class: 'mt-2' });
  const seleccion = { a: null, b: null };
  const resumen = el('p', { class: 'text-tiny mt-2' });

  const pintarResumen = () => {
    if (ws.format !== 'parejas') { resumen.textContent = ''; return; }
    resumen.textContent = `Pareja: ${seleccion.a ? seleccion.a.full_name : '—'} + ${seleccion.b ? seleccion.b.full_name : '—'}`;
  };

  const guardar = async (a, b, forzar = false) => {
    try {
      const r = await adminAgregarJugador(esc.id, a.id, b ? b.id : null, forzar);
      toast(r && r.mensaje ? r.mensaje : 'Listo, ya está en la lista.', 'success');
      handle.close();
      refresh();
    } catch (err) {
      // La base avisa cuando el jugador es de otra categoría en vez de
      // dejarlo pasar en silencio: recepción decide, pero a propósito.
      const msg = String((err && err.message) || '');
      if (msg.includes('CATEGORIA_DISTINTA')) {
        const detalle = msg.split('CATEGORIA_DISTINTA:').pop().trim();
        const ok = await confirmSheet({
          title: 'Es de otra categoría',
          body: `${detalle} Si lo metes de todas formas va a jugar por puntos contra jugadores de otro nivel. ¿Seguro?`,
          confirmLabel: 'Sí, meterlo igual', danger: true,
        });
        if (ok) await guardar(a, b, true);
        return;
      }
      toast(humanizeError(err), 'error');
    }
  };

  const elegir = (p) => {
    if (ws.format !== 'parejas') { guardar(p, null); return; }
    if (!seleccion.a) seleccion.a = p;
    else if (p.id !== seleccion.a.id) seleccion.b = p;
    pintarResumen();
    if (seleccion.a && seleccion.b) guardar(seleccion.a, seleccion.b);
  };

  let timer = null;
  buscador.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = buscador.value.trim();
      lista.innerHTML = '';
      if (q.length < 2) return;
      const gente = await buscarJugadores(q, 8);
      if (!gente.length) { lista.appendChild(el('p', { class: 'text-tiny' }, 'Nadie con ese nombre.')); return; }
      gente.forEach((p) => lista.appendChild(el('div', {
        class: 'fila-enlace', onclick: () => elegir(p),
      }, p.full_name || '(sin nombre)')));
    }, 250);
  });

  content.appendChild(buscador);
  content.appendChild(resumen);
  content.appendChild(lista);
  const handle = openSheet(content);
}

function nombreEquipo(m, prefix) {
  const p1 = m[`${prefix}_player1_nombre`];
  const p2 = m[`${prefix}_player2_nombre`];
  return [p1 && p1.full_name, p2 && p2.full_name].filter(Boolean).join(' / ') || '—';
}

function renderPartidoRow(m, onChange) {
  const row = el('div', {});
  row.appendChild(el('div', { class: 'row-between' }, [
    el('div', { class: 'text-tiny' }, `Cancha ${m.court_number}`),
    m.status === 'completed'
      ? el('span', { class: 'badge badge-success' }, `${m.games_team1}-${m.games_team2}`)
      : el('span', { class: 'badge badge-neutral' }, 'Pendiente'),
  ]));
  row.appendChild(el('div', { class: 'mt-1', style: 'font-size:14px;font-weight:600;' }, nombreEquipo(m, 'team1')));
  row.appendChild(el('div', { style: 'font-size:14px;font-weight:600;' }, nombreEquipo(m, 'team2')));

  if (!m.team1_player1 && !m.team2_player1) {
    row.appendChild(el('p', { class: 'text-tiny mt-1' }, 'Sin jugadores suficientes esta ronda.'));
    return row;
  }

  const btn = el('button', {
    class: `btn btn-sm mt-2 ${m.status === 'completed' ? 'btn-secondary' : 'btn-primary'}`,
    style: 'width:auto;',
    onclick: () => abrirCapturaResultado(m, onChange),
  }, m.status === 'completed' ? 'Corregir resultado' : 'Capturar resultado');
  row.appendChild(btn);
  return row;
}

/* ============================================================
   Captura del marcador.
   La ronda dura 15 minutos y se detiene ahi: se anota UN marcador
   de games, no sets. Los partidos a 2-3 sets son solo de Liguilla.
   ============================================================ */
function abrirCapturaResultado(m, onChange) {
  const previo = ((m.sets_json && m.sets_json.sets) || [])[0] || null;
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' },
    m.status === 'completed' ? 'Corregir el marcador' : '¿Cómo quedaron a los 15 minutos?'));
  content.appendChild(el('p', { class: 'text-tiny mb-3' },
    'Anota los games que hizo cada equipo. Si al minuto 15 iban iguales, el punto de oro define ese game: nunca se guarda un empate.'));

  function ladoEquipo(nombre, valor) {
    const input = el('input', {
      class: 'input', type: 'number', min: '0', inputmode: 'numeric',
      placeholder: '0', value: valor == null ? '' : String(valor),
      style: 'font-size:26px;font-weight:800;text-align:center;height:58px;',
    });
    const node = el('div', { style: 'flex:1;min-width:0;' }, [
      el('div', { class: 'text-tiny mb-1', style: 'font-weight:700;overflow-wrap:anywhere;' }, nombre),
      input,
    ]);
    return { node, input };
  }

  const eq1 = ladoEquipo(nombreEquipo(m, 'team1'), previo ? previo.team1 : null);
  const eq2 = ladoEquipo(nombreEquipo(m, 'team2'), previo ? previo.team2 : null);
  content.appendChild(el('div', { class: 'row gap-2', style: 'align-items:flex-end;' }, [
    eq1.node,
    el('div', { class: 'text-tiny', style: 'padding-bottom:18px;font-weight:700;' }, 'vs'),
    eq2.node,
  ]));

  if (m.status === 'completed') {
    const nota = el('input', { class: 'input', type: 'text', placeholder: 'Motivo de la corrección (opcional)' });
    content.appendChild(el('div', { class: 'field mt-3' }, [el('label', {}, 'Nota de corrección'), nota]));
    content._nota = nota;
  }

  const errBox = el('p', { class: 'text-tiny mt-2', style: 'color:var(--danger);display:none;' });
  content.appendChild(errBox);

  const saveBtn = el('button', { class: 'btn btn-primary mt-3' }, 'Guardar marcador');
  saveBtn.addEventListener('click', async () => {
    errBox.style.display = 'none';
    let sets;
    try {
      sets = construirSets(eq1, eq2);
    } catch (e) {
      errBox.textContent = e.message; errBox.style.display = 'block'; return;
    }
    saveBtn.disabled = true; saveBtn.textContent = 'Guardando…';
    try {
      if (m.status === 'completed') {
        await corregirResultadoPartido(m.id, sets, content._nota ? content._nota.value.trim() || null : null);
        toast('Marcador corregido.', 'success');
      } else {
        await registrarResultadoPartido(m.id, sets);
        toast('Marcador guardado.', 'success');
      }
      handle.close();
      onChange();
    } catch (err) {
      errBox.textContent = humanizeError(err); errBox.style.display = 'block';
      saveBtn.disabled = false; saveBtn.textContent = 'Guardar marcador';
    }
  });
  content.appendChild(saveBtn);

  const handle = openSheet(content);
}

function construirSets(eq1, eq2) {
  const t1 = eq1.input.value.trim(), t2 = eq2.input.value.trim();
  if (!t1 || !t2) throw new Error('Falta el marcador de alguno de los dos equipos.');
  const n1 = Number(t1), n2 = Number(t2);
  if (!Number.isInteger(n1) || !Number.isInteger(n2) || n1 < 0 || n2 < 0) {
    throw new Error('Los games se anotan con números enteros de 0 en adelante.');
  }
  if (n1 === n2) {
    throw new Error(`No se puede guardar ${n1}-${n2}: la ronda necesita un ganador. Si iban iguales al minuto 15, jueguen el punto de oro y anoten ese game.`);
  }
  return [{ team1: n1, team2: n2 }];
}

function abrirSustituto(registro, onChange, formato) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, 'Asignar sustituto'));

  const esParejas = formato === 'parejas';
  let modo = esParejas ? 'emergencia' : 'normal';

  const infoTxt = el('p', { class: 'text-muted mb-3' }, MODOS_SUSTITUTO.find((m) => m.key === modo).info);
  content.appendChild(infoTxt);

  const motivoInput = el('input', {
    class: 'input mb-3', type: 'text',
    placeholder: 'Motivo (opcional) — p. ej. emergencia médica',
    style: modo === 'emergencia' ? '' : 'display:none;',
  });

  const grupo = el('div', { class: 'stack gap-2 mb-3' });
  const botones = MODOS_SUSTITUTO.map((m) => {
    const b = el('button', { class: `chip-btn${m.key === modo ? ' selected' : ''}` }, m.etiqueta);
    b.addEventListener('click', () => {
      if (esParejas && m.key !== 'emergencia') {
        toast('En Parejas Fijas solo aplica el sustituto de emergencia autorizado.', 'info', 5000);
        return;
      }
      modo = m.key;
      botones.forEach((x, idx) => x.classList.toggle('selected', MODOS_SUSTITUTO[idx].key === modo));
      infoTxt.textContent = m.info;
      motivoInput.style.display = modo === 'emergencia' ? '' : 'none';
    });
    grupo.appendChild(b);
    return b;
  });
  content.appendChild(grupo);

  if (esParejas) {
    content.appendChild(el('div', { class: 'aviso aviso-warn mb-3' },
      'Esta noche es de Parejas Fijas: normalmente se cae la pareja completa. Meter un sustituto aquí es una decisión tuya y no le cuesta puntos ni penalización a nadie.'));
  }
  content.appendChild(motivoInput);

  const search = el('input', { class: 'input mb-3', type: 'text', placeholder: 'Buscar jugador…' });
  const list = el('div', { class: 'stack gap-2', style: 'max-height:36vh;overflow-y:auto;' });
  async function draw(filtro = '') {
    list.innerHTML = '<p class="text-tiny">Buscando…</p>';
    const jugadores = await buscarJugadores(filtro, 20);
    list.innerHTML = '';
    jugadores
      .filter((j) => j.id !== registro.player_id && (j.full_name || '').trim())
      .forEach((j) => {
      list.appendChild(el('button', {
        class: 'chip-btn',
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            if (modo === 'emergencia') {
              await asignarSustitutoAdmin(registro.id, j.id, motivoInput.value.trim() || null);
              toast(`${j.full_name} juega en su lugar, sin reparto de puntos ni penalización.`, 'success', 5200);
            } else {
              await asignarSustituto(registro.id, j.id, modo === 'coach');
              toast(`${j.full_name} jugará en su lugar.`, 'success');
            }
            handle.close();
            onChange();
          } catch (err) { toast(humanizeError(err), 'error', 6000); e.target.disabled = false; }
        },
      }, j.full_name || '(sin nombre)'));
    });
    if (list.children.length === 0) list.appendChild(el('p', { class: 'text-muted' }, 'Sin resultados.'));
  }
  draw();
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => draw(search.value), 200); });
  content.appendChild(search);
  content.appendChild(list);
  const handle = openSheet(content);
}
