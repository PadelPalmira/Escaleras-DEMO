import { el, todayISO, formatFecha, formatHora, initials } from '../utils.js';
import { icon } from '../icons.js';
import {
  getMyProfile, getMiCategoria, getMisRegistros, tiersElegiblesPorCategoria,
  getEventoLiguillaActivo, getMiCalificacionLiguilla,
  esAdminOMaestro, esMaestro, getEscalerasAdmin, getConteosRegistros,
} from '../api.js';
import { navigate } from '../router.js';
import { abrirNoche } from './admin_escaleras.js';

const CAT_LABEL = { A: 'Categoría A', B: 'Categoría B', limite: 'Zona Límite' };
const CAT_BADGE_CLASS = { A: 'badge-a', B: 'badge-b', limite: 'badge-limite' };

const STATUS_LABEL = {
  confirmed: { text: 'Confirmado', cls: 'badge-success' },
  waitlist: { text: 'En lista de espera', cls: 'badge-warning' },
  substitute: { text: 'Jugando como sustituto', cls: 'badge-success' },
  declined: { text: 'Declinado', cls: 'badge-neutral' },
  cancelled_ontime: { text: 'Cancelado', cls: 'badge-neutral' },
  cancelled_late: { text: 'Cancelado tarde', cls: 'badge-danger' },
  no_show: { text: 'No asististe', cls: 'badge-danger' },
};

export async function renderHome() {
  const profile = await getMyProfile();
  // Recepcion y direccion no vienen a esta pantalla a ver si juegan hoy:
  // vienen a ver que les toca administrar. Antes veian lo mismo que un
  // jugador y les decia "Hoy no juegas".
  if (esAdminOMaestro(profile)) return renderInicioAdmin(profile);
  return renderInicioJugador(profile);
}

async function renderInicioJugador(profile) {
  const registros = await getMisRegistros({ soloFuturas: true });
  const categoria = profile ? await getMiCategoria(profile.id) : null;

  const hoy = todayISO();
  const registroHoy = registros.find((r) => r.escaleras && r.escaleras.session_date === hoy && ['confirmed', 'substitute', 'waitlist'].includes(r.status));
  const proximosRegistros = registros
    .filter((r) => r.escaleras && r.escaleras.session_date >= hoy)
    .sort((a, b) => a.escaleras.session_date.localeCompare(b.escaleras.session_date));

  const wrap = el('div');

  // Saludo
  const nombre = (profile && profile.full_name) ? profile.full_name.split(' ')[0] : 'Jugador';
  wrap.appendChild(el('div', { class: 'row-between mb-2' }, [
    el('div', { class: 'h1' }, `Hola, ${nombre}`),
    el('div', { class: 'avatar-btn', style: 'width:44px;height:44px;font-size:15px;' }, initials(profile && profile.full_name)),
  ]));

  // Tarjeta "hoy juegas"
  if (registroHoy) {
    const esc = registroHoy.escaleras;
    const ws = esc.weekday_schedule;
    wrap.appendChild(
      el('div', { class: 'card card-hero mt-4' }, [
        el('div', { class: 'row-between' }, [
          el('div', { class: 'h2' }, 'Hoy juegas 🎾'),
          el('span', { class: `badge ${STATUS_LABEL[registroHoy.status]?.cls || 'badge-neutral'}` }, STATUS_LABEL[registroHoy.status]?.text || registroHoy.status),
        ]),
        el('p', { class: 'text-muted mt-2' }, `${ws.format === 'individual' ? 'Individual' : ws.format === 'parejas' ? 'Parejas Fijas' : 'Retas Abiertas'} · Categoría ${ws.category || '—'}`),
        el('p', { class: 'text-muted' }, `${formatHora(ws.start_time)} – ${formatHora(ws.end_time)}`),
        el('button', { class: 'btn btn-secondary mt-4', onclick: () => navigate('/convocatorias') }, 'Ver detalles'),
      ])
    );
  } else {
    wrap.appendChild(
      el('div', { class: 'card mt-4' }, [
        el('div', { class: 'h2' }, 'Hoy no juegas'),
        el('p', { class: 'text-muted mt-2' }, 'Revisa las convocatorias abiertas de la semana.'),
        el('button', { class: 'btn btn-primary mt-4', onclick: () => navigate('/convocatorias') }, 'Ver convocatorias'),
      ])
    );
  }

  // Categoría / stats
  wrap.appendChild(el('div', { class: 'section-title' }, 'Tu categoría'));
  if (categoria) {
    wrap.appendChild(
      el('div', { class: 'card' }, [
        el('div', { class: 'row-between' }, [
          el('span', { class: `badge ${CAT_BADGE_CLASS[categoria.category] || 'badge-neutral'}` }, CAT_LABEL[categoria.category] || categoria.category),
          categoria.zona_limite_side
            ? el('span', { class: `badge ${categoria.zona_limite_side === 'bottom_a' ? 'badge-danger' : 'badge-success'}` },
                categoria.zona_limite_side === 'bottom_a' ? 'Zona de descenso' : 'Zona de ascenso')
            : null,
        ]),
        el('div', { class: 'grid-3 mt-4' }, [
          el('div', { class: 'stat-tile' }, [
            el('div', { class: 'stat-value' }, categoria.rank != null ? `#${categoria.rank}` : '—'),
            el('div', { class: 'stat-label' }, 'Posición'),
          ]),
          el('div', { class: 'stat-tile' }, [
            el('div', { class: 'stat-value' }, categoria.rolling_points != null ? Number(categoria.rolling_points).toFixed(0) : '—'),
            el('div', { class: 'stat-label' }, 'Puntos'),
          ]),
          el('div', { class: 'stat-tile' }, [
            el('div', { class: 'stat-value' }, categoria.escaleras_counted != null ? categoria.escaleras_counted : '—'),
            el('div', { class: 'stat-label' }, 'Escaleras' ),
          ]),
        ]),
      ])
    );
  } else {
    wrap.appendChild(
      el('div', { class: 'card' }, [
        el('p', { class: 'text-muted' }, 'Todavía no tienes categoría calculada. Se asigna en cuanto empiezas a jugar o declaras tu nivel al registrarte.'),
      ])
    );
  }

  // Próximas convocatorias en las que estoy anotado
  if (proximosRegistros.length > 0) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Tus próximas sesiones'));
    const list = el('div', { class: 'card' });
    proximosRegistros.slice(0, 5).forEach((r, i) => {
      const esc = r.escaleras;
      const ws = esc.weekday_schedule;
      const st = STATUS_LABEL[r.status] || { text: r.status, cls: 'badge-neutral' };
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
      list.appendChild(
        el('div', { class: 'row-between' }, [
          el('div', {}, [
            el('div', { style: 'font-weight:700;font-size:14.5px;' }, formatFecha(esc.session_date)),
            el('div', { class: 'text-tiny' }, `${ws.format === 'individual' ? 'Individual' : ws.format === 'parejas' ? 'Parejas' : 'Retas'} · Cat ${ws.category || '—'}`),
          ]),
          el('span', { class: `badge ${st.cls}` }, st.text),
        ])
      );
    });
    wrap.appendChild(list);
  }

  // Banner de Liguilla/Ascenso — solo si hay algo relevante para este jugador este mes.
  try {
    const tiers = tiersElegiblesPorCategoria(categoria);
    if (tiers.length > 0) {
      const evento = await getEventoLiguillaActivo(tiers);
      if (evento && !['completed', 'cancelled_no_players'].includes(evento.status)) {
        const miCalificacion = await getMiCalificacionLiguilla(evento.id, profile.id);
        if (miCalificacion) {
          const titulo = evento.tier === 'liguilla_a' ? 'Liguilla' : 'Torneo de Ascenso';
          wrap.appendChild(
            el('div', { class: 'card mt-4', style: 'border-color:var(--cyan);', onclick: () => navigate('/liguilla') }, [
              el('div', { class: 'row-between' }, [
                el('div', { style: 'font-weight:700;' }, [el('span', { html: icon.trophy, style: 'width:16px;height:16px;vertical-align:-3px;margin-right:6px;color:var(--cyan);' }), titulo]),
                el('span', { html: icon.chevronRight, style: 'width:18px;height:18px;color:var(--text-tertiary);' }),
              ]),
              el('p', { class: 'text-tiny mt-2' }, 'Tienes movimientos pendientes — toca para ver.'),
            ])
          );
        }
      }
    }
  } catch (err) {
    // El banner de Liguilla nunca debe tumbar el Inicio si algo falla.
    console.error('Error cargando banner de Liguilla:', err);
  }

  return wrap;
}

/* ============================================================
   INICIO DEL ADMIN
   ------------------------------------------------------------
   Recepción abre la app y tiene que ver, sin buscar nada:
     · qué le toca HOY y el botón para hacerlo,
     · qué se le quedó sin cerrar de días pasados,
     · qué noches de esta semana van flojas de gente.
   Un solo botón grande por bloque. Nada de menús.
   ============================================================ */

const FORMATO = { individual: 'Individual', parejas: 'Parejas Fijas', retas_abiertas: 'Retas Abiertas' };

async function renderInicioAdmin(profile) {
  const wrap = el('div');
  const nombre = (profile && profile.full_name) ? profile.full_name.split(' ')[0] : 'Recepción';

  wrap.appendChild(el('div', { class: 'row-between mb-2' }, [
    el('div', { class: 'h1' }, `Hola, ${nombre}`),
    el('div', { class: 'avatar-btn', style: 'width:44px;height:44px;font-size:15px;' }, initials(profile && profile.full_name)),
  ]));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, 'Esto es lo que te toca administrar.'));

  let escaleras = [];
  try {
    escaleras = await getEscalerasAdmin();
  } catch (err) {
    console.error('No se pudieron cargar las noches:', err);
    wrap.appendChild(el('div', { class: 'aviso aviso-danger' },
      'No se pudieron cargar las noches del club. Revisa tu conexión y vuelve a entrar.'));
    return wrap;
  }

  const hoy = todayISO();
  const jugables = escaleras.filter((e) => e.weekday_schedule && e.weekday_schedule.format !== 'retas_abiertas');
  const deHoy = jugables.filter((e) => e.session_date === hoy && e.status !== 'cancelled');
  const pendientes = jugables.filter((e) => e.session_date < hoy && !['completed', 'cancelled'].includes(e.status));
  const proximas = jugables
    .filter((e) => e.session_date > hoy && e.status === 'scheduled')
    .sort((a, b) => a.session_date.localeCompare(b.session_date))
    .slice(0, 4);

  const conteos = await getConteosRegistros(
    [...deHoy, ...pendientes, ...proximas].map((e) => e.id)).catch(() => ({}));

  /* ---------- lo de hoy ---------- */
  wrap.appendChild(el('div', { class: 'section-title', style: 'margin-top:0;' }, 'Hoy'));
  if (!deHoy.length) {
    wrap.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'h2' }, 'Hoy no hay escalera'),
      el('p', { class: 'text-muted mt-2' }, 'Los viernes son Retas Abiertas: se cobran en recepción y no se capturan aquí.'),
    ]));
  } else {
    deHoy.forEach((e) => wrap.appendChild(tarjetaAdmin(e, conteos[e.id], true)));
  }

  /* ---------- lo que se quedó abierto ---------- */
  if (pendientes.length) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Se quedaron sin cerrar'));
    wrap.appendChild(el('div', { class: 'aviso aviso-warn mb-3' },
      'Mientras no se cierren, esas noches no cuentan para el ranking ni para la Liguilla.'));
    pendientes.forEach((e) => wrap.appendChild(tarjetaAdmin(e, conteos[e.id], false)));
  }

  /* ---------- las que vienen ---------- */
  if (proximas.length) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Cómo van las que vienen'));
    const card = el('div', { class: 'card' });
    proximas.forEach((e, i) => {
      const c = conteos[e.id] || { confirmados: 0, espera: 0 };
      const cupo = (e.weekday_schedule && e.weekday_schedule.capacity) || 12;
      const completo = c.confirmados >= cupo;
      if (i > 0) card.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
      card.appendChild(el('div', { class: 'row-between fila-enlace', onclick: () => irANoche(e.id) }, [
        el('div', {}, [
          el('div', { style: 'font-weight:700;font-size:14.5px;' }, formatFecha(e.session_date)),
          el('div', { class: 'text-tiny' },
            `${FORMATO[e.weekday_schedule.format]}${e.weekday_schedule.category ? ' · Cat ' + e.weekday_schedule.category : ''}`),
        ]),
        el('span', { class: `badge ${completo ? 'badge-success' : 'badge-warning'}` },
          completo ? `${c.confirmados}/${cupo} lleno` : `${c.confirmados}/${cupo}`),
      ]));
    });
    wrap.appendChild(card);
    wrap.appendChild(el('p', { class: 'text-tiny mt-2' },
      'Si una noche no llega a su cupo, no hay escalera: se cancela. Puedes agregar gente tú mismo desde la noche.'));
  }

  /* ---------- accesos ---------- */
  wrap.appendChild(el('div', { class: 'section-title' }, 'Otras cosas'));
  const accesos = el('div', { class: 'card' });
  const enlace = (texto, sub, path) => el('div', { class: 'fila-enlace', onclick: () => navigate(path) }, [
    el('div', { class: 'row-between' }, [
      el('div', {}, [
        el('div', { style: 'font-weight:700;font-size:14.5px;' }, texto),
        el('div', { class: 'text-tiny mt-1' }, sub),
      ]),
      el('span', { html: icon.chevronRight, style: 'width:18px;height:18px;color:var(--text-tertiary);' }),
    ]),
  ]);
  accesos.appendChild(enlace('Todas las noches', 'Historial y noches que vienen', '/admin/escaleras'));
  accesos.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
  accesos.appendChild(enlace('Jugadores', 'Sustituto, multa o suspensión', '/admin/jugadores'));
  accesos.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
  accesos.appendChild(enlace('Liguilla del mes', 'Calificados, draft y bracket', '/admin/liguilla'));
  if (esMaestro(profile)) {
    accesos.appendChild(el('hr', { class: 'sep', style: 'margin:12px 0;' }));
    accesos.appendChild(enlace('Configuración', 'Horarios, fórmula de puntos y staff', '/maestro'));
  }
  wrap.appendChild(accesos);

  return wrap;
}

function irANoche(id) { abrirNoche(id); navigate('/admin/escaleras'); }

/* Una noche, con el botón que toca según en qué momento va. */
function tarjetaAdmin(e, conteo, esHoy) {
  const ws = e.weekday_schedule || {};
  const c = conteo || { confirmados: 0, espera: 0 };
  const cupo = ws.capacity || 12;
  const completo = c.confirmados >= cupo;

  let etiqueta; let clase; let nota;
  if (e.status === 'in_progress') {
    etiqueta = 'Seguir capturando'; clase = 'btn-primary';
    nota = 'La noche ya arrancó. Captura los marcadores y genera cada ronda.';
  } else if (e.status === 'scheduled' && completo) {
    etiqueta = 'Abrir y comenzar'; clase = 'btn-primary';
    nota = 'Ya está el cupo completo. Cuando estén en cancha, ábrela y dale Comenzar.';
  } else if (e.status === 'scheduled') {
    etiqueta = 'Ver quién va'; clase = 'btn-secondary';
    nota = `Faltan ${cupo - c.confirmados} para completar. Si no se llena, hay que cancelar la noche.`;
  } else {
    etiqueta = 'Abrir'; clase = 'btn-secondary'; nota = '';
  }

  return el('div', { class: `card ${esHoy ? 'card-hero' : 'mt-3'}` }, [
    el('div', { class: 'row-between' }, [
      el('div', {}, [
        el('div', { class: 'h2' }, formatFecha(e.session_date)),
        el('p', { class: 'text-muted mt-1' },
          `${FORMATO[ws.format] || ws.format}${ws.category ? ' · Cat ' + ws.category : ''} · ${formatHora(ws.start_time)}`),
      ]),
      el('span', { class: `badge ${completo ? 'badge-success' : 'badge-warning'}` }, `${c.confirmados}/${cupo}`),
    ]),
    nota ? el('p', { class: 'text-tiny mt-3' }, nota) : null,
    c.espera > 0 ? el('p', { class: 'text-tiny mt-1' }, `${c.espera} en lista de espera`) : null,
    el('button', { class: `btn ${clase} mt-4`, onclick: () => irANoche(e.id) }, etiqueta),
  ]);
}
