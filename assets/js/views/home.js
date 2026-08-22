import { el, todayISO, formatFecha, formatHora, initials } from '../utils.js';
import { icon } from '../icons.js';
import { getMyProfile, getMiCategoria, getMisRegistros, tiersElegiblesPorCategoria, getEventoLiguillaActivo, getMiCalificacionLiguilla } from '../api.js';
import { navigate } from '../router.js';

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
  const [profile, registros] = await Promise.all([getMyProfile(), getMisRegistros({ soloFuturas: true })]);
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
          categoria.zona_limite_side ? el('span', { class: 'badge badge-neutral' }, categoria.zona_limite_side === 'bottom_a' ? 'Puedes probar B' : 'Primero en espera de A') : null,
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
