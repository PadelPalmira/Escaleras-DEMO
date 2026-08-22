import { el, formatFecha, formatHora, formatFechaHora, toast, humanizeError, openSheet, confirmSheet } from '../utils.js';
import { icon } from '../icons.js';
import {
  getMyProfile, getMisConvocatorias,
  registrarJugador, cancelarRegistro, previewCancelacion, asignarSustituto,
  responderInvitacionPareja, getJugadoresParaPareja,
  registrarseRetasAbiertas, salirRetasAbiertas, getInscritosRetas,
} from '../api.js';

const FORMAT_LABEL = { individual: 'Individual', parejas: 'Parejas Fijas', retas_abiertas: 'Retas Abiertas' };

// Las dos dinámicas son distintas de verdad, no solo de nombre — así que la
// app lo dice en cada tarjeta en vez de dar por hecho que el jugador ya lo sabe.
const FORMAT_HINT = {
  individual: 'Te anotas solo, pero siempre juegas en pareja: la app te asigna compañero en cada ronda y tu compañero anterior pasa a ser tu rival. Suben o bajan de cancha juntos según ganen o pierdan. Si no puedes ir, tú mismo eliges tu sustituto.',
  parejas: 'Juegas toda la noche con la misma pareja y suben o bajan de cancha juntos. Aquí no hay sustitutos: si uno no puede, se cae la pareja completa.',
  retas_abiertas: 'Noche libre y social. No hay categorías, ni puntos, ni cupo: llegas y juegas el tiempo que quieras.',
};

const STATUS_LABEL = {
  confirmed: { text: 'Tienes lugar', cls: 'badge-success' },
  waitlist: { text: 'En lista de espera', cls: 'badge-warning' },
  substitute: { text: 'Vas de sustituto', cls: 'badge-success' },
  declined: { text: 'Rechazaste', cls: 'badge-neutral' },
  cancelled_ontime: { text: 'Te diste de baja', cls: 'badge-neutral' },
  cancelled_late: { text: 'Baja tardía', cls: 'badge-danger' },
  no_show: { text: 'No asististe', cls: 'badge-danger' },
};

const ACTIVO = ['confirmed', 'substitute', 'waitlist'];

export async function renderConvocatorias() {
  const [profile, filas] = await Promise.all([getMyProfile(), getMisConvocatorias(9)]);

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Convocatorias'));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' },
    'Toda la semana se convoca el domingo a las 10:00 am.'));

  wrap.appendChild(renderComoFunciona());

  // Al arrancar el club todavía no hay ranking que premiar, así que la ventana
  // del domingo no aplica a ninguna convocatoria. Es la misma frase en todas:
  // se dice una vez arriba en lugar de repetirla dentro de cada tarjeta.
  const sinRanking = filas.some(
    (f) => f.formato !== 'retas_abiertas' && f.ranking_listo === false);
  if (sinRanking) {
    wrap.appendChild(el('div', { class: 'aviso aviso-neutral mb-4' }, [
      el('strong', {}, 'Todavía no hay ranking suficiente. '),
      `La ventaja del top ${filas[0] ? filas[0].top_n : 12} para apartar lugar el domingo arranca cuando el club lleve varias noches jugadas. Mientras tanto, todas estas convocatorias son para todos por orden de llegada.`,
    ]));
  }

  async function refresh() {
    const fresh = await renderConvocatorias();
    wrap.replaceWith(fresh);
  }

  if (!filas.length) {
    wrap.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'emoji' }, '📅'),
      el('p', {}, 'No hay convocatorias abiertas en los próximos días.'),
      el('p', { class: 'text-tiny mt-2' }, 'La semana completa se publica cada domingo a las 10:00 am.'),
    ]));
    return wrap;
  }

  for (const f of filas) {
    wrap.appendChild(renderTarjeta(f, profile, refresh, sinRanking));
  }

  return wrap;
}

/* ============================================================
   Explicación fija arriba de la lista — es el cambio de reglas
   más grande de la versión 2.0 y no puede quedar escondido en
   el reglamento.
   ============================================================ */
function renderComoFunciona() {
  const box = el('div', { class: 'card mb-4', style: 'background:var(--surface-2);' });
  const head = el('button', {
    class: 'row-between',
    style: 'width:100%;background:none;border:none;text-align:left;color:inherit;padding:0;',
  }, [
    el('div', { style: 'font-weight:700;font-size:14.5px;' }, [
      el('span', { html: icon.info, style: 'width:16px;height:16px;vertical-align:-3px;margin-right:7px;color:var(--cyan);' }),
      'Cómo se reparten los lugares',
    ]),
    el('span', { class: 'como-chevron', html: icon.chevronRight, style: 'width:18px;height:18px;color:var(--text-tertiary);transition:transform 150ms ease;' }),
  ]);
  const body = el('div', { class: 'mt-3', style: 'display:none;' }, [
    el('p', { class: 'text-tiny' }, [
      el('strong', {}, 'Domingo 10:00 am – 6:00 pm: '),
      'los 12 mejores del ranking de tu categoría pueden apartar su lugar en todos los eventos de la semana. Es su ventaja por estar arriba.',
    ]),
    el('p', { class: 'text-tiny mt-2' }, [
      el('strong', {}, 'Domingo 6:00 pm en adelante: '),
      'se acaba la preferencia. Los lugares que sobren se reparten por orden de llegada, y quien ya estaba en lista de espera entra automático en ese orden.',
    ]),
    el('p', { class: 'text-tiny mt-2' }, [
      el('strong', {}, 'Si no estás en el top 12: '),
      'durante el domingo puedes anotarte a la lista de espera. No es automático, lo tienes que pedir tú.',
    ]),
    el('p', { class: 'text-tiny mt-2' }, [
      el('strong', {}, 'Bajas: '),
      'hasta 12 horas antes del evento no pasa nada. Después, solo hay penalización si nadie toma tu lugar.',
    ]),
    el('p', { class: 'text-tiny mt-2', style: 'color:var(--text-tertiary);' },
      'Ojo: si confirmas todos tus eventos de la semana y luego te bajas de todos sin dejar sustituto, pierdes la ventaja de ranking la semana siguiente.'),
  ]);
  head.addEventListener('click', () => {
    const abierto = body.style.display !== 'none';
    body.style.display = abierto ? 'none' : 'block';
    const chev = head.querySelector('.como-chevron');
    if (chev) chev.style.transform = abierto ? 'none' : 'rotate(90deg)';
  });
  box.append(head, body);
  return box;
}

/* ============================================================
   Tarjeta de una convocatoria
   ============================================================ */
function renderTarjeta(f, profile, refresh, avisoArriba) {
  const card = el('div', { class: 'card' });
  const tengoRegistroActivo = f.mi_status && ACTIVO.includes(f.mi_status);
  const st = f.mi_status ? STATUS_LABEL[f.mi_status] : null;

  card.appendChild(el('div', { class: 'row-between' }, [
    el('div', {}, [
      el('div', { style: 'font-weight:800;font-size:15.5px;' }, formatFecha(f.session_date)),
      el('div', { class: 'text-tiny mt-1' },
        `${FORMAT_LABEL[f.formato]}${f.categoria ? ' · Cat ' + f.categoria : ''} · ${formatHora(f.start_time)}–${formatHora(f.end_time)}`),
    ]),
    st && (tengoRegistroActivo || f.mi_sustituto_nombre)
      ? el('span', { class: `badge ${st.cls}` }, st.text) : null,
  ]));

  card.appendChild(el('p', { class: 'text-tiny mt-2', style: 'color:var(--text-tertiary);' }, FORMAT_HINT[f.formato]));

  if (f.formato === 'retas_abiertas') {
    card.appendChild(renderRetas(f, profile, refresh));
    return card;
  }

  card.appendChild(renderCupo(f));

  const banner = renderBannerVentana(f, avisoArriba);
  if (banner) card.appendChild(banner);

  card.appendChild(renderAcciones(f, profile, refresh));
  return card;
}

function renderCupo(f) {
  const cap = f.capacidad || 12;
  const pct = Math.min(100, Math.round((f.ocupados / cap) * 100));
  const box = el('div', { class: 'mt-3' });
  box.appendChild(el('div', { class: 'row-between text-tiny' }, [
    el('span', {}, `${f.ocupados} de ${cap} lugares`),
    el('span', { style: 'color:var(--text-tertiary);' },
      f.en_espera > 0 ? `${f.en_espera} en lista de espera` : 'Sin lista de espera'),
  ]));
  box.appendChild(
    el('div', { class: 'cupo-bar mt-1' }, [
      el('div', { class: `cupo-bar-fill${pct >= 100 ? ' full' : ''}`, style: `width:${pct}%;` }),
    ])
  );
  return box;
}

function renderBannerVentana(f, avisoArriba) {
  if (f.ventana_abierta) {
    if (f.tengo_ventaja) {
      return el('div', { class: 'aviso aviso-ok mt-3' }, [
        el('strong', {}, 'Tienes ventaja de ranking. '),
        `Estás en el top ${f.top_n} de tu categoría, así que puedes apartar tu lugar hasta las 6:00 pm del domingo (${formatFechaHora(f.ventana_cierra)}).`,
      ]);
    }
    return el('div', { class: 'aviso aviso-info mt-3' }, [
      el('strong', {}, 'Todavía es la ventana del top ' + f.top_n + '. '),
      `Hasta las 6:00 pm del domingo (${formatFechaHora(f.ventana_cierra)}) los lugares están apartados para los mejores del ranking. Puedes anotarte a la lista de espera y entras automático a esa hora si sobran lugares.`,
    ]);
  }
  if (f.ventana_cerrada) {
    // Decir "ya se acabó la preferencia" cuando el ranking todavía no existe
    // sería mentira: nunca empezó. Ese caso ya se explica una sola vez arriba
    // de la lista, así que aquí la tarjeta se queda sin banner.
    if (f.ranking_listo === false) {
      if (avisoArriba) return null;
      return el('div', { class: 'aviso aviso-neutral mt-3' }, [
        el('strong', {}, 'Todavía no hay ranking suficiente. '),
        `La ventaja del top ${f.top_n} arranca cuando el club lleve varias noches jugadas. Mientras tanto, estas convocatorias son para todos por orden de llegada.`,
      ]);
    }
    return el('div', { class: 'aviso aviso-neutral mt-3' },
      'Ya se acabó la preferencia por ranking: esta convocatoria está abierta para todos, por orden de llegada.');
  }
  return el('div', { class: 'aviso aviso-neutral mt-3' },
    `Esta convocatoria abre el domingo a las 10:00 am (${formatFechaHora(f.ventana_abre)}).`);
}

/* ============================================================
   Acciones
   ============================================================ */
function renderAcciones(f, profile, refresh) {
  const acciones = el('div', { class: 'stack gap-2 mt-4' });
  const tengoLugar = f.mi_status === 'confirmed' || f.mi_status === 'substitute';
  const enEspera = f.mi_status === 'waitlist';
  const yaEmpezo = Number(f.horas_faltantes) <= 0;

  if (yaEmpezo && !tengoLugar && !enEspera) {
    acciones.appendChild(el('p', { class: 'text-tiny' }, 'Esta sesión ya empezó.'));
    return acciones;
  }

  // Ya conseguí sustituto: ya no tengo lugar, pero sí una historia que contar.
  if (!tengoLugar && !enEspera && f.mi_sustituto_nombre) {
    acciones.appendChild(el('div', { class: 'aviso aviso-ok' },
      `${f.mi_sustituto_nombre} juega en tu lugar. No tienes penalización.`));
    return acciones;
  }

  if (tengoLugar || enEspera) {
    if (f.mi_partner_status === 'pending' && f.formato === 'parejas') {
      acciones.appendChild(renderInvitacionPendiente(f, refresh));
    }
    if (enEspera) {
      acciones.appendChild(el('div', { class: 'aviso aviso-warn' }, [
        el('strong', {}, `Vas en el lugar ${f.mi_lugar_en_espera || '—'} de la lista. `),
        f.ventana_abierta && f.formato === 'parejas'
          ? 'Las parejas se ordenan por su promedio de puntos hasta las 6:00 pm del domingo, así que esto todavía puede moverse.'
          : 'En cuanto alguien se dé de baja, el primero de la lista entra automático.',
      ]));
    }
    if (tengoLugar && f.ventana_abierta && f.formato === 'parejas' && f.mi_via_privilegio) {
      acciones.appendChild(el('div', { class: 'aviso aviso-info' },
        'Tu lugar es provisional hasta las 6:00 pm del domingo: si se anota una pareja con mejor promedio de puntos, pueden desplazarlos.'));
    }

    const fila = el('div', { class: 'btn-row' });
    if (tengoLugar && f.formato === 'individual') {
      const btnSub = el('button', { class: 'btn btn-secondary btn-sm' }, 'Buscar sustituto');
      btnSub.addEventListener('click', () => abrirSelectorSustituto(f, profile, refresh));
      fila.appendChild(btnSub);
    }
    const btnBaja = el('button', { class: 'btn btn-danger btn-sm' }, enEspera ? 'Salir de la lista' : 'Darme de baja');
    btnBaja.addEventListener('click', () => confirmarBaja(f, refresh));
    fila.appendChild(btnBaja);
    acciones.appendChild(fila);
    return acciones;
  }

  // Sin lugar: ofrecer registro según el momento de la semana.
  if (!f.ventana_abierta && !f.ventana_cerrada) {
    acciones.appendChild(el('p', { class: 'text-tiny' }, 'Vuelve el domingo a las 10:00 am para anotarte.'));
    return acciones;
  }

  const hayLugar = f.ocupados < (f.capacidad || 12);
  const puedeApartar = f.ventana_cerrada || f.tengo_ventaja;
  const aListaEspera = !puedeApartar || !hayLugar;

  let etiqueta;
  if (f.formato === 'parejas') {
    etiqueta = aListaEspera ? 'Anotarnos a la lista de espera' : 'Registrarme con pareja';
  } else {
    etiqueta = aListaEspera ? 'Anotarme a la lista de espera' : (f.tengo_ventaja && f.ventana_abierta ? 'Apartar mi lugar' : 'Anotarme');
  }

  const btn = el('button', { class: `btn ${aListaEspera ? 'btn-secondary' : 'btn-primary'}` }, etiqueta);
  btn.addEventListener('click', async () => {
    if (f.formato === 'parejas') {
      abrirSelectorPareja(f, profile, aListaEspera, refresh);
      return;
    }
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Un momento…';
    try {
      const res = await registrarJugador(f.escalera_id, profile.id, null, aListaEspera);
      toast(res.mensaje || 'Listo.', res.resultado === 'confirmed' ? 'success' : 'info', 5200);
      refresh();
    } catch (err) {
      toast(humanizeError(err), 'error', 6000);
      btn.disabled = false; btn.textContent = original;
    }
  });
  acciones.appendChild(btn);

  if (aListaEspera && f.ventana_abierta && !f.tengo_ventaja) {
    acciones.appendChild(el('p', { class: 'text-tiny', style: 'color:var(--text-tertiary);' },
      'Entrar a la lista no te cuesta nada y no es automático: si no la pides, no te formas.'));
  }
  return acciones;
}

function renderInvitacionPendiente(f, refresh) {
  return el('div', { class: 'card', style: 'background:var(--surface-2);' }, [
    el('p', {}, [
      el('strong', {}, (f.mi_partner_nombre || 'Un jugador') + ' te invitó a jugar en pareja. '),
      'Si aceptas, juegan juntos toda la noche.',
    ]),
    el('div', { class: 'btn-row mt-3' }, [
      el('button', {
        class: 'btn btn-secondary btn-sm',
        onclick: async (e) => {
          e.target.disabled = true;
          try { await responderInvitacionPareja(f.mi_registro_id, false); toast('Rechazaste la invitación — se liberó el lugar de los dos.', 'info'); refresh(); }
          catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; }
        },
      }, 'Rechazar'),
      el('button', {
        class: 'btn btn-primary btn-sm',
        onclick: async (e) => {
          e.target.disabled = true;
          try { await responderInvitacionPareja(f.mi_registro_id, true); toast('¡Pareja confirmada!', 'success'); refresh(); }
          catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; }
        },
      }, 'Aceptar'),
    ]),
  ]);
}

/* ============================================================
   Baja, con el aviso que corresponda ANTES de ejecutarla
   ============================================================ */
async function confirmarBaja(f, refresh) {
  let pv = null;
  try { pv = await previewCancelacion(f.mi_registro_id); }
  catch (err) { console.error('No se pudo calcular la vista previa de la baja:', err); }

  const grave = !!(pv && (pv.perderia_ventaja || (!pv.dentro_de_corte && pv.en_lista_espera === 0)));
  const ok = await confirmSheet({
    title: pv ? pv.titulo : '¿Seguro que te quieres dar de baja?',
    body: pv ? pv.mensaje : 'Si cancelas con poco tiempo puede aplicar una penalización de puntos.',
    confirmLabel: grave ? 'Sí, aun así darme de baja' : 'Sí, darme de baja',
    danger: grave,
  });
  if (!ok) return;

  try {
    const res = await cancelarRegistro(f.mi_registro_id);
    toast(res.mensaje || 'Listo.', res.penalizado || res.perdio_ventaja ? 'error' : 'success', 6000);
    refresh();
  } catch (err) {
    toast(humanizeError(err), 'error');
  }
}

/* ============================================================
   Selector de pareja
   ============================================================ */
async function abrirSelectorPareja(f, profile, aListaEspera, refresh) {
  const jugadores = await getJugadoresParaPareja(f.escalera_id, profile.id);
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, 'Elige a tu pareja'));
  content.appendChild(el('p', { class: 'text-muted mb-3' },
    aListaEspera
      ? 'Van a quedar juntos en la lista de espera. Si se libera un lugar entran los dos.'
      : f.ventana_abierta
        ? 'Su lugar será provisional hasta las 6:00 pm del domingo: las parejas se ordenan por el promedio de puntos de los dos.'
        : 'Juegan toda la noche juntos. Si uno se da de baja, se cae la pareja completa.'));

  const search = el('input', { class: 'input mb-3', type: 'text', placeholder: 'Buscar jugador…' });
  const list = el('div', { class: 'stack gap-2', style: 'max-height:44vh;overflow-y:auto;' });

  function draw(filtro = '') {
    list.innerHTML = '';
    const q = filtro.trim().toLowerCase();
    jugadores.filter((j) => !q || (j.full_name || '').toLowerCase().includes(q)).slice(0, 30).forEach((j) => {
      list.appendChild(el('button', {
        class: 'chip-btn',
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            const res = await registrarJugador(f.escalera_id, profile.id, j.id, aListaEspera);
            toast(res.mensaje || 'Listo.', res.resultado === 'confirmed' ? 'success' : 'info', 5200);
            handle.close();
            refresh();
          } catch (err) { toast(humanizeError(err), 'error', 6000); e.target.disabled = false; }
        },
      }, j.full_name || '(sin nombre)'));
    });
    if (!list.children.length) list.appendChild(el('p', { class: 'text-muted' }, 'Sin resultados.'));
  }
  draw();
  search.addEventListener('input', () => draw(search.value));
  content.append(search, list);
  const handle = openSheet(content);
}

/* ============================================================
   Selector de sustituto (solo Individual)
   ============================================================ */
async function abrirSelectorSustituto(f, profile, refresh) {
  const jugadores = await getJugadoresParaPareja(f.escalera_id, profile.id);
  let esCoach = false;
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, 'Buscar sustituto'));
  const info = el('p', { class: 'text-muted mb-3' },
    'Tu sustituto recibe el 34% de los puntos que gane esa noche; tú conservas el 66%. Al dejar sustituto no hay penalización, aunque falten menos de 12 horas.');
  content.appendChild(info);

  const coachToggle = el('button', { class: 'chip-btn mb-3' }, '☐ Es un coach del club cubriendo una emergencia');
  coachToggle.addEventListener('click', () => {
    esCoach = !esCoach;
    coachToggle.classList.toggle('selected', esCoach);
    coachToggle.textContent = esCoach
      ? '☑ Es un coach del club cubriendo una emergencia'
      : '☐ Es un coach del club cubriendo una emergencia';
    info.textContent = esCoach
      ? 'El coach no gana puntos del club y tú recibes la penalización completa según el tiempo de aviso, igual que si no hubieras conseguido sustituto.'
      : 'Tu sustituto recibe el 34% de los puntos que gane esa noche; tú conservas el 66%. Al dejar sustituto no hay penalización, aunque falten menos de 12 horas.';
  });
  content.appendChild(coachToggle);

  const search = el('input', { class: 'input mb-3', type: 'text', placeholder: 'Buscar jugador…' });
  const list = el('div', { class: 'stack gap-2', style: 'max-height:36vh;overflow-y:auto;' });

  function draw(filtro = '') {
    list.innerHTML = '';
    const q = filtro.trim().toLowerCase();
    jugadores.filter((j) => !q || (j.full_name || '').toLowerCase().includes(q)).slice(0, 30).forEach((j) => {
      list.appendChild(el('button', {
        class: 'chip-btn',
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            await asignarSustituto(f.mi_registro_id, j.id, esCoach);
            toast(`${j.full_name} jugará en tu lugar.`, 'success');
            handle.close();
            refresh();
          } catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; }
        },
      }, j.full_name || '(sin nombre)'));
    });
    if (!list.children.length) list.appendChild(el('p', { class: 'text-muted' }, 'Sin resultados.'));
  }
  draw();
  search.addEventListener('input', () => draw(search.value));
  content.append(search, list);
  const handle = openSheet(content);
}

/* ============================================================
   Retas Abiertas — sin cupo, sin puntos, con precio visible
   ============================================================ */
function renderRetas(f, profile, refresh) {
  const box = el('div');
  const inscrito = f.mi_status === 'confirmed';
  const precio = f.precio_mxn != null ? Number(f.precio_mxn) : 150;

  box.appendChild(el('div', { class: 'retas-precio mt-3' }, [
    el('div', {}, [
      el('div', { class: 'retas-precio-monto' }, `$${precio.toLocaleString('es-MX')}`),
      el('div', { class: 'text-tiny' }, 'por persona'),
    ]),
    el('div', { class: 'text-tiny', style: 'text-align:right;max-width:60%;' },
      `Juegas todo el tiempo que quieras, de ${formatHora(f.start_time)} a ${formatHora(f.end_time)} · Se paga en recepción`),
  ]));

  const social = el('div', { class: 'retas-social mt-3' });
  const countLine = el('div', { class: 'row gap-2' }, [
    el('span', { class: 'retas-count-number' }, '···'),
    el('span', { class: 'text-muted retas-count-label' }, 'anotados esta noche'),
  ]);
  const namesLine = el('div', { class: 'text-tiny mt-1' }, 'Cargando…');
  social.append(countLine, namesLine);
  box.appendChild(social);

  const btn = el('button', { class: `btn ${inscrito ? 'btn-secondary' : 'btn-primary'} mt-4` },
    inscrito ? 'Ya estás anotado — salir' : 'Anotarme');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      if (inscrito) {
        await salirRetasAbiertas(f.mi_registro_id);
        toast('Listo, te quitamos de la lista.', 'info');
      } else {
        await registrarseRetasAbiertas(f.escalera_id);
        toast('¡Anotado! Nos vemos el viernes.', 'success');
      }
      refresh();
    } catch (err) {
      toast(humanizeError(err), 'error');
      btn.disabled = false;
    }
  });
  box.appendChild(btn);
  box.appendChild(el('p', { class: 'text-tiny mt-2', style: 'color:var(--text-tertiary);' },
    'Anotarte no aparta lugar ni cuesta puntos — solo sirve para que todos vean quién va.'));

  getInscritosRetas(f.escalera_id).then((inscritos) => {
    countLine.querySelector('.retas-count-number').textContent = String(inscritos.length);
    countLine.querySelector('.retas-count-label').textContent =
      inscritos.length === 1 ? 'anotado esta noche' : 'anotados esta noche';
    namesLine.textContent = inscritos.length
      ? inscritos.map((r) => (r.profiles?.full_name || 'Jugador').trim().split(' ')[0]).join(', ')
      : 'Todavía nadie se ha anotado — sé el primero en animar.';
  }).catch(() => { namesLine.textContent = ''; });

  return box;
}
