import { el, todayISO, formatFecha, formatHora, toast, humanizeError, openSheet, confirmSheet, avatarContent, chipJugador, waLinkConfirmarInvitacion } from '../utils.js';
import { icon } from '../icons.js';
import {
  getMyProfile, esAdminOMaestro,
  getEscalerasAdmin, getRegistrosEscalera, getRondasConPartidos,
  generarSiguienteRonda, registrarResultadoPartido, corregirResultadoPartido, cerrarEscalera,
  marcarNoShow, cancelarRegistro, asignarSustituto, asignarSustitutoAdmin, buscarJugadores,
  cancelarEscaleraAdmin,
  comenzarEscalera, adminAgregarJugador, getAjusteNum,
  iniciarCronometroRonda, horaServidor,
  responderInvitacionPareja, reemplazarJugadorEnCancha,
} from '../api.js';

/* El Inicio del Admin manda directo a UNA noche. Se guarda aquí cuál para
   que al entrar a la pantalla se abra esa, en vez de dejar a recepción
   buscándola otra vez en la lista. */
let nochePendiente = null;

/* ============================================================
   Cronómetro de la ronda
   ------------------------------------------------------------
   Recepción no debería tener que estar viendo el reloj mientras
   captura marcadores y le contesta a 12 jugadores. La cuenta
   regresiva se calcula SIEMPRE desde la marca de tiempo que dejó
   el servidor al arrancarla — no se lleva contando en el
   teléfono — así que sobrevive a que se recargue la página o se
   apague la pantalla, y se ve igual desde cualquier dispositivo.

   El iPhone no puede vibrar desde una página web (Safari nunca ha
   soportado esa API), así que el aviso es sonido + pantalla. Y el
   sonido solo puede sonar si el navegador lo "desbloqueó" antes
   con un toque: por eso se arma en el mismo botón que arranca el
   cronómetro.
   ============================================================ */
let cronoTick = null;          // setInterval de la cuenta regresiva
let cronoAudio = null;         // AudioContext ya desbloqueado
let cronoAlarma = null;        // setInterval de los beeps
let cronoWakeLock = null;      // para que el teléfono no se duerma
let cronoSonadaEn = null;      // round_id cuya alarma ya sonó
let desfaseReloj = 0;          // reloj del teléfono - reloj del servidor (ms)
let relojSincronizado = false; // ya se comparó contra el servidor en esta sesión
let mostrarAcomodo = false;    // abrir la hoja de "a dónde va cada quien"

function ahoraServidor() { return Date.now() - desfaseReloj; }

/* La cuenta regresiva se mide contra el reloj del SERVIDOR, no contra el del
   teléfono: si el teléfono del club trae la hora mal puesta, el cronómetro
   estaría mal sin que nadie lo note. Se compara una vez por sesión. */
async function sincronizarReloj() {
  if (relojSincronizado) return;
  relojSincronizado = true;
  try {
    const s = await horaServidor();
    desfaseReloj = Date.now() - s.getTime();
  } catch { desfaseReloj = 0; }
}

function armarAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!cronoAudio) cronoAudio = new AC();
    if (cronoAudio.state === 'suspended') cronoAudio.resume();
    // Un sonido mudo dentro del gesto del usuario: es lo que deja el audio
    // habilitado para poder sonar solo, 15 minutos después.
    const o = cronoAudio.createOscillator();
    const g = cronoAudio.createGain();
    g.gain.value = 0;
    o.connect(g); g.connect(cronoAudio.destination);
    o.start(); o.stop(cronoAudio.currentTime + 0.01);
  } catch { /* sin audio disponible: queda el aviso visual */ }
}

function pitido() {
  if (!cronoAudio) return;
  try {
    const t = cronoAudio.currentTime;
    [0, 0.28, 0.56].forEach((d) => {
      const o = cronoAudio.createOscillator();
      const g = cronoAudio.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(880, t + d);
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
      o.connect(g); g.connect(cronoAudio.destination);
      o.start(t + d); o.stop(t + d + 0.24);
    });
  } catch { /* nada */ }
}

function arrancarAlarma() {
  if (cronoAlarma) return;
  pitido();
  cronoAlarma = setInterval(pitido, 3000);
}
function callarAlarma() {
  if (cronoAlarma) { clearInterval(cronoAlarma); cronoAlarma = null; }
}

async function mantenerPantallaEncendida() {
  try {
    if ('wakeLock' in navigator && !cronoWakeLock) {
      cronoWakeLock = await navigator.wakeLock.request('screen');
      cronoWakeLock.addEventListener('release', () => { cronoWakeLock = null; });
    }
  } catch { /* el navegador no lo permite: no pasa nada, solo se puede dormir */ }
}
function soltarPantalla() {
  try { if (cronoWakeLock) cronoWakeLock.release(); } catch { /* nada */ }
  cronoWakeLock = null;
}

function limpiarCronometro() {
  if (cronoTick) { clearInterval(cronoTick); cronoTick = null; }
  callarAlarma();
}

// Si el teléfono se durmió y vuelve, hay que recuperar el candado de pantalla.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cronoTick) mantenerPantallaEncendida();
});
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
  limpiarCronometro();
  wrap.innerHTML = '';
  const loading = el('div', { class: 'stack', style: 'padding-top:60px;' }, [el('div', { class: 'spinner' })]);
  wrap.appendChild(loading);

  // El tope de rondas se pide junto con lo demas: si se pidiera despues, la
  // pantalla pintaria el roster y las rondas llegarian tarde, que es justo el
  // momento en que recepcion esta esperando ver la ronda nueva.
  const [escaleras, registros, rondas, tope, minutosRonda] = await Promise.all([
    getEscalerasAdmin(), getRegistrosEscalera(escaleraId), getRondasConPartidos(escaleraId),
    getAjusteNum('max_rondas_escalera', 7), getAjusteNum('minutos_por_ronda', 15),
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

  // Antes de arrancar, lo importante es el cupo y la lista. Ya en juego, lo
  // importante es la ronda: el cupo se guarda en una linea y la lista se
  // pliega, para que la ronda viva quede lo mas arriba posible.
  if (esc.status === 'scheduled') {
    wrap.appendChild(renderCuantosVan(esc, confirmados.length, cupo, enEspera.length, yaArranco));
    wrap.appendChild(renderSinConfirmar(esc, ws, confirmados, refresh));
    wrap.appendChild(renderComenzar(esc, confirmados.length, cupo, faltan, completo, refresh));
    wrap.appendChild(renderRoster(esc, ws, registros, confirmados, enEspera, cupo, refresh));
  } else if (esc.status !== 'cancelled') {
    wrap.appendChild(el('p', { class: 'text-tiny mt-2', style: 'color:var(--text-tertiary);' },
      `${confirmados.length} jugadores en cancha`));
    wrap.appendChild(plegable(`Quién va (${confirmados.length})`,
      renderRoster(esc, ws, registros, confirmados, enEspera, cupo, refresh)));
  }

  // ---- Rondas (solo cuando la noche ya arrancó) ----
  if (esc.status === 'scheduled') return;
  if (esc.status === 'cancelled') {
    wrap.appendChild(el('div', { class: 'aviso aviso-danger mt-4' },
      'Esta noche se canceló. Nadie recibió penalización ni perdió puntos.'));
    return;
  }

  if (rondas.length === 0) {
    wrap.appendChild(el('div', { class: 'card mt-4' },
      el('p', { class: 'text-muted' }, 'Esta noche está marcada como en juego pero no tiene rondas. Avisa a dirección.')));
    return;
  }

  const ultimaRonda = rondas[rondas.length - 1];
  const anteriores = rondas.slice(0, -1);
  const pendientes = ultimaRonda.partidos.filter((m) => m.status === 'pending').length;

  /* La ronda que se está jugando va HASTA ARRIBA y sola. Antes se apilaban las
     7 rondas una debajo de otra: en la ronda 6 había que bajar cuatro pantallas
     para llegar a la viva, pasando junto a 15 botones de "Corregir resultado"
     que borran rondas si se tocan por error. */
  const tituloVivo = el('div', { class: 'row-between', style: 'align-items:baseline;' }, [
    el('div', { style: 'font-weight:800;font-size:22px;' },
      esc.status === 'completed' ? `Ronda ${ultimaRonda.round_number} — la última` : `Ronda ${ultimaRonda.round_number} de ${tope}`),
    el('span', { class: `badge ${pendientes > 0 ? 'badge-warning' : 'badge-success'}` },
      pendientes > 0 ? `Faltan ${pendientes}` : 'Completa'),
  ]);
  wrap.appendChild(el('div', { class: 'mt-4 mb-2' }, tituloVivo));

  if (esc.status === 'in_progress') {
    wrap.appendChild(renderCronometro(ultimaRonda, minutosRonda, refresh));
  }

  const cardViva = el('div', { class: 'card' });
  ultimaRonda.partidos.forEach((m, i) => {
    if (i > 0) cardViva.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
    cardViva.appendChild(renderPartidoRow(m, refresh));
  });
  wrap.appendChild(cardViva);

  // Alguien se lesiona en la ronda 3 y otro entra en su lugar. Es el unico
  // camino que de verdad cambia las canchas; el de "sustituto" solo servia
  // antes de arrancar.
  if (esc.status === 'in_progress' && pendientes > 0) {
    wrap.appendChild(el('button', {
      class: 'btn btn-ghost btn-sm mt-2', style: 'width:auto;',
      onclick: () => abrirCambioEnCancha(esc, ultimaRonda, refresh),
    }, 'Cambiar un jugador en cancha'));
  }

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
        e.target.disabled = true; e.target.textContent = 'Armando la siguiente…';
        // Al terminar la ronda se abre sola la hoja con el acomodo nuevo: es
        // el momento en que recepcion tiene que decirle a 12 personas a que
        // cancha se mueven y con quien les toca.
        mostrarAcomodo = true;
        try { await generarSiguienteRonda(escaleraId); refresh(); }
        catch (err) {
          mostrarAcomodo = false;
          // Si otro dispositivo ya la genero, no es un error que recepcion
          // pueda entender: se recarga y ya está la ronda nueva en pantalla.
          if (/duplicate key|rounds_escalera_id_round_number/i.test(String(err && err.message))) {
            toast('Esa ronda ya estaba generada — te la muestro.', 'success'); refresh(); return;
          }
          toast(humanizeError(err), 'error');
          e.target.disabled = false; e.target.textContent = `Terminar ronda ${ultimaRonda.round_number} y armar la ${ultimaRonda.round_number + 1}`;
        }
      } }, `Terminar ronda ${ultimaRonda.round_number} y armar la ${ultimaRonda.round_number + 1}`));
    } else {
      accionesFinales.appendChild(el('div', { class: 'aviso aviso-neutral' },
        `Ya se jugaron las ${tope} rondas de la noche. Cierra la escalera para repartir los bonos.`));
    }
    accionesFinales.appendChild(el('button', { class: 'btn btn-primary', onclick: async (e) => {
      const ok = await confirmSheet({
        title: '¿Cerrar la noche?',
        body: `Se reparten los bonos de posición final según la cancha donde terminó cada quien, y la noche entra al ranking. Se cierra con las ${ultimaRonda.round_number} ronda(s) jugadas. No se puede deshacer desde aquí.`,
        confirmLabel: 'Sí, cerrar',
      });
      if (!ok) return;
      e.target.disabled = true; e.target.textContent = 'Cerrando…';
      try { await cerrarEscalera(escaleraId); toast('Noche cerrada — bonos repartidos.', 'success'); refresh(); }
      catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; e.target.textContent = 'Cerrar la noche'; }
    } }, 'Cerrar la noche'));
  }
  wrap.appendChild(accionesFinales);

  /* Las rondas ya jugadas quedan guardadas pero fuera del camino. */
  if (anteriores.length) {
    const cuerpo = el('div');
    anteriores.slice().reverse().forEach((ronda) => {
      const rondaCard = el('div', { class: 'card mt-2' });
      rondaCard.appendChild(el('div', { class: 'row-between mb-2' }, [
        el('div', { style: 'font-weight:700;' }, `Ronda ${ronda.round_number}`),
        el('span', { class: 'badge badge-success' }, 'Completa'),
      ]));
      ronda.partidos.forEach((m, i) => {
        if (i > 0) rondaCard.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
        rondaCard.appendChild(renderPartidoRow(m, refresh));
      });
      cuerpo.appendChild(rondaCard);
    });
    wrap.appendChild(plegable(`Rondas anteriores (${anteriores.length})`, cuerpo));
  }

  if (mostrarAcomodo && esc.status === 'in_progress') {
    mostrarAcomodo = false;
    abrirAcomodo(ultimaRonda, minutosRonda, refresh);
  }
}

/* ============================================================
   El reloj de la ronda, en pantalla
   ============================================================ */
function renderCronometro(ronda, minutos, refresh) {
  const box = el('div', { class: 'card mb-2', style: 'text-align:center;' });

  if (!ronda.cronometro_inicio) {
    box.appendChild(el('p', { class: 'text-tiny mb-2' },
      'Cuando ya estén los 12 en su cancha, arranca el reloj.'));
    const b = el('button', { class: 'btn btn-primary' }, `Empezar los ${minutos} minutos`);
    b.addEventListener('click', async () => {
      armarAudio();   // tiene que pasar DENTRO del toque, si no el iPhone no deja sonar después
      b.disabled = true; b.textContent = 'Arrancando…';
      try {
        const r = await iniciarCronometroRonda(ronda.id);
        desfaseReloj = Date.now() - new Date(r.inicio).getTime();
        relojSincronizado = true;
        cronoSonadaEn = null;
        mantenerPantallaEncendida();
        refresh();
      } catch (err) {
        toast(humanizeError(err), 'error');
        b.disabled = false; b.textContent = `Empezar los ${minutos} minutos`;
      }
    });
    box.appendChild(b);
    return box;
  }

  const finMs = new Date(ronda.cronometro_inicio).getTime() + minutos * 60000;
  const numero = el('div', { style: 'font-size:52px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;' });
  const pie = el('p', { class: 'text-tiny mt-2' });
  const acciones = el('div', { class: 'btn-row mt-3' });
  const silenciar = el('button', { class: 'btn btn-primary btn-sm', style: 'display:none;' }, 'Ya avisé — silenciar');
  silenciar.addEventListener('click', () => {
    callarAlarma(); silenciar.style.display = 'none'; soltarPantalla();
  });
  /* Si se recargó la página con el reloj ya corriendo, el navegador vuelve a
     bloquear el audio: hace falta un toque nuevo para que la alarma pueda
     sonar sola. Sin este botón la alarma fallaría en silencio, que es la peor
     forma de fallar. */
  const avisoSonido = el('div', { class: 'mt-2' }, [
    el('p', { class: 'text-tiny', style: 'color:var(--warning);' },
      'El sonido de la alarma está apagado porque se recargó la pantalla.'),
    el('button', { class: 'btn btn-secondary btn-sm mt-1', onclick: () => {
      armarAudio();
      avisoSonido.remove();
      toast('Listo, la alarma ya puede sonar.', 'success');
    } }, 'Activar sonido'),
  ]);

  const reiniciar = el('button', { class: 'btn btn-secondary btn-sm' }, 'Reiniciar reloj');
  reiniciar.addEventListener('click', async () => {
    armarAudio();
    try {
      const r = await iniciarCronometroRonda(ronda.id, true);
      desfaseReloj = Date.now() - new Date(r.inicio).getTime();
      relojSincronizado = true;
      cronoSonadaEn = null; callarAlarma(); mantenerPantallaEncendida(); refresh();
    } catch (err) { toast(humanizeError(err), 'error'); }
  });
  acciones.append(silenciar, reiniciar);
  box.append(numero, pie, acciones);
  if (!cronoAudio) box.appendChild(avisoSonido);

  const pintar = () => {
    const restante = Math.round((finMs - ahoraServidor()) / 1000);
    if (restante > 0) {
      const mm = Math.floor(restante / 60);
      const ss = restante % 60;
      numero.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
      numero.style.color = restante <= 60 ? 'var(--warning)' : 'var(--text)';
      box.style.background = '';
      box.style.borderColor = '';
      pie.textContent = `Termina a las ${new Date(finMs).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}`;
      silenciar.style.display = 'none';
      return;
    }
    numero.textContent = '0:00';
    numero.style.color = 'var(--danger)';
    box.style.background = 'var(--danger-dim)';
    box.style.borderColor = 'var(--danger)';
    pie.textContent = `Se acabó el tiempo de la ronda (${Math.round(minutos)} min). Diles que paren y anota los marcadores.`;
    silenciar.style.display = '';
    if (cronoSonadaEn !== ronda.id) { cronoSonadaEn = ronda.id; arrancarAlarma(); }
  };
  pintar();
  sincronizarReloj().then(pintar);
  cronoTick = setInterval(pintar, 500);
  mantenerPantallaEncendida();
  return box;
}

/* ============================================================
   "A dónde va cada quien" — se abre solo al terminar una ronda.
   Es el momento en que 12 personas salen de la cancha y preguntan
   a la vez dónde les toca; recepción lee esto en voz alta.
   ============================================================ */
function abrirAcomodo(ronda, minutos, refresh) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, `Ronda ${ronda.round_number} — a dónde va cada quien`));
  content.appendChild(el('p', { class: 'text-tiny mb-3' },
    'Los que ganaron suben una cancha; los que perdieron bajan. Léelo en voz alta.'));

  ronda.partidos.slice().sort((a, b) => a.court_number - b.court_number).forEach((m) => {
    content.appendChild(el('div', { class: 'card mb-2' }, [
      el('div', { class: 'text-tiny', style: 'letter-spacing:0.08em;text-transform:uppercase;color:var(--cyan);font-weight:700;' },
        `Cancha ${m.court_number}`),
      el('div', { style: 'font-size:17px;font-weight:800;margin-top:5px;overflow-wrap:anywhere;' }, nombreEquipo(m, 'team1')),
      el('div', { class: 'text-tiny', style: 'margin:3px 0;color:var(--text-tertiary);' }, 'contra'),
      el('div', { style: 'font-size:17px;font-weight:800;overflow-wrap:anywhere;' }, nombreEquipo(m, 'team2')),
    ]));
  });

  const arrancar = el('button', { class: 'btn btn-primary mt-2' },
    `Ya están en cancha — empezar los ${minutos} min`);
  arrancar.addEventListener('click', async () => {
    armarAudio();
    arrancar.disabled = true; arrancar.textContent = 'Arrancando…';
    try {
      const r = await iniciarCronometroRonda(ronda.id);
      desfaseReloj = Date.now() - new Date(r.inicio).getTime();
      relojSincronizado = true;
      cronoSonadaEn = null;
      mantenerPantallaEncendida();
      handle.close();
      refresh();
    } catch (err) {
      toast(humanizeError(err), 'error');
      arrancar.disabled = false; arrancar.textContent = `Ya están en cancha — empezar los ${minutos} min`;
    }
  });
  content.appendChild(arrancar);
  content.appendChild(el('button', { class: 'btn btn-ghost mt-2', onclick: () => handle.close() },
    'Todavía no — cerrar'));

  const handle = openSheet(content);
}

/* Una seccion que se abre y se cierra. Durante una noche hay que tener a la
   vista SOLO la ronda que se esta jugando: todo lo demas estorba y ademas
   pone al alcance del dedo botones que borran rondas. */
function plegable(titulo, contenido) {
  const caja = el('div', { class: 'mt-4' });
  const cuerpo = el('div', { style: 'display:none;' }, contenido);
  const chevron = el('span', { class: 'como-chevron', html: icon.chevronRight,
    style: 'width:18px;height:18px;color:var(--text-tertiary);transition:transform 150ms ease;' });
  const cabeza = el('button', {
    class: 'row-between',
    style: 'width:100%;background:none;border:none;text-align:left;color:inherit;padding:6px 0;',
    onclick: () => {
      const abierto = cuerpo.style.display !== 'none';
      cuerpo.style.display = abierto ? 'none' : 'block';
      chevron.style.transform = abierto ? 'none' : 'rotate(90deg)';
    },
  }, [
    el('div', { style: 'font-weight:700;font-size:14px;' }, titulo),
    chevron,
  ]);
  caja.append(cabeza, cuerpo);
  return caja;
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
   Invitaciones de pareja sin responder.
   ------------------------------------------------------------
   En Parejas Fijas, quien te inscribe deja tu lugar apartado y tu
   invitacion en "pendiente". La base nunca exigio esa respuesta:
   comprobado contra produccion, los 12 jugadores de una noche de
   parejas salieron a la cancha con las 6 invitaciones sin contestar.
   O sea que te pueden apuntar sin que te enteres, y si no llegas la
   cancha se queda con 3.

   No se libera el lugar solo — casi siempre la pareja ya lo acordo
   en persona y quitarlo seria peor. Lo que hace falta es que
   recepcion lo VEA antes de arrancar y lo resuelva de frente, que es
   quien tiene a la gente enfrente.
   ============================================================ */
function renderSinConfirmar(esc, ws, confirmados, refresh) {
  const pend = confirmados.filter((r) => r.partner_id && r.partner_status === 'pending');
  if (!pend.length) return el('span', { style: 'display:none;' });

  const box = el('div', { class: 'mt-4' });
  const card = el('div', { class: 'card', style: 'border-color:var(--warning);' });
  card.appendChild(el('div', { style: 'font-weight:800;font-size:15px;' },
    pend.length === 1 ? 'Falta 1 por confirmar su invitación' : `Faltan ${pend.length} por confirmar su invitación`));
  card.appendChild(el('p', { class: 'text-tiny mt-1' },
    'Su pareja los apuntó pero ellos no han contestado en la app. Ya tienen el lugar apartado; '
    + 'si no van a venir, libéralo para que entre alguien de la lista de espera.'));

  pend.forEach((r, i) => {
    const fila = el('div', { class: 'fila-sin-confirmar' });
    if (i > 0) fila.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
    else fila.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0 10px;' }));
    fila.appendChild(el('div', { class: 'row gap-2', style: 'align-items:center;font-weight:600;font-size:14px;' }, [
      el('span', { class: 'avatar-mini' }, avatarContent(r.profiles || {})),
      el('span', {}, (r.profiles && r.profiles.full_name) || '(sin nombre)'),
    ]));
    fila.appendChild(el('div', { class: 'btn-row mt-2' }, [
      el('button', { class: 'btn btn-secondary btn-sm', onclick: async (e) => {
        e.target.disabled = true;
        try { await responderInvitacionPareja(r.id, true); toast('Confirmado.', 'success'); refresh(); }
        catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; }
      } }, 'Sí viene'),
      el('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
        const ok = await confirmSheet({
          title: '¿Liberar el lugar de la pareja?',
          body: 'En Parejas Fijas se cae la pareja completa: se liberan los DOS lugares y, si hay lista de espera, entra la siguiente pareja. Nadie recibe penalización.',
          confirmLabel: 'Sí, liberar', danger: true,
        });
        if (!ok) return;
        try { await responderInvitacionPareja(r.id, false); toast('Lugar liberado.', 'success'); refresh(); }
        catch (err) { toast(humanizeError(err), 'error'); }
      } }, 'No viene'),
    ]));

    // Botón de WhatsApp aparte, en su propia línea — solo lo ve admin/maestro
    // (esta pantalla ya es exclusiva para ellos). Nunca ofrece confirmar por
    // WhatsApp: solo manda a la persona directo a la app a confirmar ahí.
    const waUrl = waLinkConfirmarInvitacion(r.profiles || {}, esc.session_date, ws.start_time);
    fila.appendChild(waUrl
      ? el('a', { class: 'btn btn-sm mt-2', style: 'background:#25D366;color:#fff;', href: waUrl, target: '_blank', rel: 'noopener' }, 'Avisarle por WhatsApp')
      : el('p', { class: 'text-tiny mt-2', style: 'color:var(--text-tertiary);' }, 'Sin teléfono registrado — avísale en persona.'));
    card.appendChild(fila);
  });

  box.appendChild(card);
  return box;
}

/* ============================================================
   Cambiar a un jugador que YA esta en una cancha.
   ------------------------------------------------------------
   Se lesiona alguien en la ronda 3 y hay quien lo cubra. Antes,
   "asignar sustituto" solo tocaba la lista de inscritos: el
   lesionado se quedaba en la cancha de la pantalla, seguia
   sumando puntos ronda tras ronda, y el que entraba no aparecia
   en ninguna cancha. Esto si lo cambia donde importa.
   ============================================================ */
function abrirCambioEnCancha(esc, ronda, refresh) {
  const enCancha = [];
  ronda.partidos.filter((m) => m.status === 'pending').forEach((m) => {
    [[m.team1_player1, m.team1_player1_nombre], [m.team1_player2, m.team1_player2_nombre],
     [m.team2_player1, m.team2_player1_nombre], [m.team2_player2, m.team2_player2_nombre]]
      .forEach(([id, prof]) => {
        if (id) enCancha.push({ id, full_name: (prof && prof.full_name) || '(sin nombre)', avatar_url: prof && prof.avatar_url, cancha: m.court_number });
      });
  });

  const content = el('div', {});
  content.appendChild(el('div', { class: 'sheet-title' }, 'Cambiar un jugador en cancha'));
  content.appendChild(el('p', { class: 'text-tiny mb-3' },
    'Para cuando alguien se lesiona o se tiene que ir a media noche. El que sale conserva '
    + 'los puntos que ya ganó y no lleva penalización; el que entra juega desde esta ronda '
    + 'y sus puntos son suyos, sin reparto.'));

  const sel = { sale: null, entra: null };
  const paso2 = el('div', { class: 'mt-3' });
  const resumen = el('p', { class: 'text-tiny mt-2' });

  const listaSale = el('div', {});
  enCancha.forEach((j) => {
    listaSale.appendChild(el('button', {
      class: 'btn btn-secondary btn-sm mt-2', style: 'width:100%;text-align:left;display:flex;align-items:center;gap:8px;',
      onclick: () => {
        sel.sale = j;
        Array.from(listaSale.children).forEach((b) => b.classList.remove('btn-primary'));
        listaSale.querySelectorAll('button').forEach((b) => {
          if (b.dataset.id === j.id) b.classList.add('btn-primary');
        });
        pintarPaso2();
      },
    }, [
      el('span', { class: 'avatar-mini' }, avatarContent(j)),
      el('span', {}, `Cancha ${j.cancha} · ${j.full_name}`),
    ]));
    listaSale.lastChild.dataset.id = j.id;
  });
  content.appendChild(el('div', { class: 'text-tiny', style: 'text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);' }, '1. ¿Quién sale?'));
  content.appendChild(listaSale);
  content.appendChild(paso2);
  content.appendChild(resumen);

  const btnGuardar = el('button', { class: 'btn btn-primary mt-3', disabled: 'disabled', onclick: async (e) => {
    if (!sel.sale || !sel.entra) return;
    e.target.disabled = true; e.target.textContent = 'Cambiando…';
    try {
      const r = await reemplazarJugadorEnCancha(esc.id, sel.sale.id, sel.entra.id, 'Cambio en cancha');
      toast(`Listo: entra ${r.entra} en la cancha ${r.cancha}.`, 'success');
      handle.close();
      refresh();
    } catch (err) {
      toast(humanizeError(err), 'error');
      e.target.disabled = false; e.target.textContent = 'Hacer el cambio';
    }
  } }, 'Hacer el cambio');

  function pintarPaso2() {
    paso2.innerHTML = '';
    if (!sel.sale) return;
    paso2.appendChild(el('div', { class: 'text-tiny mt-3', style: 'text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);' }, '2. ¿Quién entra?'));
    const buscador = el('input', { class: 'input mt-2', type: 'text', placeholder: 'Escribe un nombre…' });
    const lista = el('div', { class: 'mt-2' });
    paso2.append(buscador, lista);
    let t = null;
    const buscar = async () => {
      const q = buscador.value.trim();
      lista.innerHTML = '';
      if (q.length < 2) return;
      let res = [];
      try { res = await buscarJugadores(q, 8); } catch { res = []; }
      res.filter((j) => j.id !== sel.sale.id && !enCancha.some((x) => x.id === j.id))
         .forEach((j) => {
        lista.appendChild(el('button', {
          class: 'btn btn-secondary btn-sm mt-2', style: 'width:100%;text-align:left;display:flex;align-items:center;gap:8px;',
          onclick: () => { sel.entra = j; actualizarResumen(); },
        }, [
          el('span', { class: 'avatar-mini' }, avatarContent(j)),
          el('span', {}, j.full_name || '(sin nombre)'),
        ]));
      });
      if (!lista.children.length) lista.appendChild(el('p', { class: 'text-tiny mt-2' }, 'Nadie con ese nombre.'));
    };
    buscador.addEventListener('input', () => { clearTimeout(t); t = setTimeout(buscar, 220); });
    actualizarResumen();
  }

  function actualizarResumen() {
    resumen.textContent = sel.sale
      ? `Sale ${sel.sale.full_name} (cancha ${sel.sale.cancha}) · Entra ${sel.entra ? (sel.entra.full_name || '(sin nombre)') : '—'}`
      : '';
    btnGuardar.disabled = !(sel.sale && sel.entra);
  }

  content.appendChild(btnGuardar);
  content.appendChild(el('button', { class: 'btn btn-ghost mt-2', onclick: () => handle.close() }, 'Cerrar'));
  const handle = openSheet(content);
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
      el('div', { class: 'row gap-2', style: 'align-items:center;' }, [
        el('span', { class: 'avatar-mini' }, avatarContent(r.profiles || {})),
        el('div', {}, [
          el('div', { style: 'font-weight:600;font-size:14px;' },
            (r.profiles && r.profiles.full_name) || '(sin nombre)'),
          el('div', { class: 'text-tiny' }, extra || (r.is_coach_substitute ? 'Sustituto — coach' : '')),
        ]),
      ]),
      el('span', { class: `badge ${st.cls}` }, st.text),
    ]));
    // Sustituto / no-show / quitar solo tienen sentido ANTES de arrancar. Una
    // vez que la noche esta en juego, marcar "no vino" le cobraba la
    // penalizacion al jugador y su lugar seguia sumando puntos en las rondas
    // siguientes: quedaba castigado y premiado al mismo tiempo.
    if (['confirmed', 'substitute'].includes(r.status) && esc.status === 'scheduled') {
      card.appendChild(el('div', { class: 'btn-row mt-2' }, [
        el('button', { class: 'btn btn-secondary btn-sm', onclick: () => abrirSustituto(r, refresh, ws.format) }, 'Sustituto'),
        el('button', { class: 'btn btn-secondary btn-sm', onclick: async () => {
          const ok = await confirmSheet({ title: '¿No se presentó?', body: 'Se le descuenta la penalización de no-show sobre su puntaje de las últimas 6 noches y se libera su lugar.', confirmLabel: 'Sí, no vino', danger: true });
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
      }, [
        el('div', { class: 'row gap-2', style: 'align-items:center;' }, [
          el('span', { class: 'avatar-mini' }, avatarContent(p)),
          el('span', {}, p.full_name || '(sin nombre)'),
        ]),
      ])));
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

  /* Confirmación en voz alta antes de guardar: el error más fácil de cometer
     es teclear el marcador al revés, y así se ve de inmediato. */
  const quienGana = el('div', { class: 'aviso aviso-ok mt-3', style: 'display:none;' });
  content.appendChild(quienGana);
  const repintarGanador = () => {
    const a = Number(eq1.input.value), b = Number(eq2.input.value);
    if (!eq1.input.value || !eq2.input.value || !Number.isFinite(a) || !Number.isFinite(b) || a === b) {
      quienGana.style.display = 'none'; return;
    }
    quienGana.style.display = 'block';
    quienGana.innerHTML = '';
    quienGana.append(
      el('strong', {}, 'Gana ' + nombreEquipo(m, a > b ? 'team1' : 'team2') + '. '),
      `Suben a la cancha de arriba; los otros bajan.`);
  };
  eq1.input.addEventListener('input', repintarGanador);
  eq2.input.addEventListener('input', repintarGanador);
  repintarGanador();

  if (m.status === 'completed') {
    const nota = el('input', { class: 'input', type: 'text', placeholder: 'Motivo de la corrección (opcional)' });
    content.appendChild(el('div', { class: 'field mt-3' }, [el('label', {}, 'Nota de corrección'), nota]));
    content._nota = nota;
  }

  const errBox = el('p', { class: 'text-tiny mt-2', style: 'color:var(--danger);display:none;' });
  content.appendChild(errBox);

  /* Punto de oro: si al minuto 15 iban iguales, el reglamento dice que ese
     game se define con un punto de oro. En vez de rebotarle un error a
     recepción y dejar que haga la cuenta de cabeza, la app pregunta quién lo
     ganó y guarda el marcador ya resuelto. */
  const puntoOro = el('div', { class: 'aviso aviso-warn mt-3', style: 'display:none;' });
  content.appendChild(puntoOro);

  const guardar = async (sets, gp) => {
    saveBtn.disabled = true; saveBtn.textContent = 'Guardando…';
    try {
      if (m.status === 'completed') {
        await corregirResultadoPartido(m.id, sets, content._nota ? content._nota.value.trim() || null : null, gp);
        toast('Marcador corregido.', 'success');
      } else {
        await registrarResultadoPartido(m.id, sets, gp);
        toast('Marcador guardado.', 'success');
      }
      handle.close();
      onChange();
    } catch (err) {
      errBox.textContent = humanizeError(err); errBox.style.display = 'block';
      saveBtn.disabled = false; saveBtn.textContent = 'Guardar marcador';
    }
  };

  const preguntarPuntoDeOro = (n) => {
    puntoOro.innerHTML = '';
    puntoOro.style.display = 'block';
    puntoOro.append(
      el('div', { style: 'font-weight:800;margin-bottom:4px;' }, `Van ${n}-${n} y no puede quedar empatado.`),
      el('div', { class: 'text-tiny mb-3' }, '¿Quién ganó el punto de oro? Ese game define la ronda.'));
    [['team1', 1], ['team2', 2]].forEach(([lado, num]) => {
      const b = el('button', { class: 'btn btn-secondary mt-2', style: 'text-align:left;' },
        nombreEquipo(m, lado));
      b.addEventListener('click', () => {
        const sets = [{ team1: num === 1 ? n + 1 : n, team2: num === 2 ? n + 1 : n }];
        guardar(sets, num);
      });
      puntoOro.appendChild(b);
    });
  };

  const saveBtn = el('button', { class: 'btn btn-primary mt-3' }, 'Guardar marcador');
  saveBtn.addEventListener('click', async () => {
    errBox.style.display = 'none';
    puntoOro.style.display = 'none';
    let sets;
    try {
      sets = construirSets(eq1, eq2);
    } catch (e) {
      if (e.empate != null) { preguntarPuntoDeOro(e.empate); return; }
      errBox.textContent = e.message; errBox.style.display = 'block'; return;
    }
    guardar(sets, null);
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
    const e = new Error(`No se puede guardar ${n1}-${n1}: la ronda necesita un ganador.`);
    e.empate = n1;   // lo resuelve el punto de oro, no un mensaje de error
    throw e;
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
      list.appendChild(chipJugador(j, async (e) => {
        e.target.closest('button').disabled = true;
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
        } catch (err) { toast(humanizeError(err), 'error', 6000); e.target.closest('button').disabled = false; }
      }));
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
