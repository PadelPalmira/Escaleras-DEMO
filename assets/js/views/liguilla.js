import { el, formatFecha, initials, toast, humanizeError, confirmSheet } from '../utils.js';
import { icon } from '../icons.js';
import {
  getMyProfile, getMiCategoria, tiersElegiblesPorCategoria, getEventoLiguillaActivo,
  getMiCalificacionLiguilla, getCalificadosConfirmados, getParejasLiguilla, getMiParejaLiguilla,
  getPickActualDraft, getPartidosLiguilla, responderCalificacionLiguilla, hacerPickDraft, responderPickDraft,
  autoprogramarLiguillaMes, getEventoLiguillaDelMes, getLiguillaTablaVivo, getMiCarreraLiguilla,
} from '../api.js';

const TIER_LABEL = { liguilla_a: 'Liguilla · Categoría A', ascenso_b: 'Torneo de Ascenso · Categoría B' };
const EVENT_STATUS_LABEL = {
  scheduled: { text: 'Programado', cls: 'badge-neutral' },
  qualifying: { text: 'Confirmando', cls: 'badge-warning' },
  draft_open: { text: 'Draft en curso', cls: 'badge-warning' },
  confirmed: { text: 'Bracket listo', cls: 'badge-success' },
  in_progress: { text: 'En juego', cls: 'badge-success' },
  completed: { text: 'Finalizado', cls: 'badge-neutral' },
  cancelled_no_players: { text: 'Cancelado', cls: 'badge-danger' },
};
const QUALIFIER_STATUS_LABEL = {
  invited: 'Invitado — pendiente de confirmar',
  confirmed: 'Confirmado',
  waitlist: 'En lista de espera',
  declined: 'Declinaste tu lugar',
  substituted: 'Tu lugar fue cubierto por un sustituto',
};
const STAGE_LABEL = { ronda1: 'Ronda 1', ronda2: 'Ronda 2', final: 'Final' };
const PURPOSE_LABEL = {
  bracket_r1: '',
  r2_sembrado_vs_lucky_loser: 'Sembrado vs Lucky Loser',
  r2_otros_ganadores: 'Ganadores',
  r2_consolacion_5_6: '5º–6º lugar',
  final: '',
};

export async function renderLiguilla() {
  const profile = await getMyProfile();
  if (!profile) return el('div', { class: 'empty-state' }, 'No se pudo cargar tu perfil.');
  const categoria = await getMiCategoria(profile.id);
  const tiers = tiersElegiblesPorCategoria(categoria);

  const wrap = el('div');
  const header = el('div', { class: 'row-between mb-2' }, [
    el('div', { class: 'h1' }, 'Liguilla'),
    el('button', { class: 'btn btn-ghost btn-sm', onclick: () => refresh(wrap) }, 'Actualizar'),
  ]);
  wrap.appendChild(header);

  if (tiers.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'emoji' }, '🏆'),
      el('p', {}, 'Todavía no tienes categoría calculada — no puedes calificar todavía.'),
    ]));
    return wrap;
  }

  const tier = tiers[0];

  // La Liguilla del mes se programa sola: la fecha sale del horario semanal
  // (siempre la última noche de Parejas Fijas del mes de tu categoría), así
  // que el jugador la ve desde el primer día del mes aunque las
  // convocatorias de esa semana todavía no existan.
  let eventoMes = null;
  try {
    await autoprogramarLiguillaMes();
    eventoMes = await getEventoLiguillaDelMes(tier);
  } catch (err) {
    console.error('No se pudo programar/leer la Liguilla del mes:', err);
  }

  wrap.appendChild(await renderCarreraDelMes(tier, eventoMes, profile, () => refresh(wrap)));

  async function refresh(oldWrap) {
    const fresh = await renderLiguilla();
    oldWrap.replaceWith(fresh);
  }

  const evento = await getEventoLiguillaActivo(tiers);
  if (!evento) return wrap;

  // La tarjeta de arriba ya dice cuándo es y cómo va la carrera; esta solo
  // aparece cuando la edición ya arrancó de verdad, para no repetir lo mismo.
  if (evento.status !== 'scheduled') {
    const st = EVENT_STATUS_LABEL[evento.status] || { text: evento.status, cls: 'badge-neutral' };
    wrap.appendChild(
      el('div', { class: 'card card-hero mb-4' }, [
        el('div', { class: 'row-between' }, [
          el('div', { class: 'h2' }, TIER_LABEL[evento.tier] || evento.tier),
          el('span', { class: `badge ${st.cls}` }, st.text),
        ]),
        evento.event_date ? el('p', { class: 'text-muted mt-2' }, formatFecha(evento.event_date)) : null,
      ])
    );
  }

  const misCalificacion = await getMiCalificacionLiguilla(evento.id, profile.id);

  if (evento.status === 'scheduled' || evento.status === 'qualifying') {
    wrap.appendChild(renderSeccionCalificacion(misCalificacion, evento, () => refresh(wrap)));
  } else if (evento.status === 'draft_open') {
    wrap.appendChild(await renderSeccionDraft(evento, profile, misCalificacion, () => refresh(wrap)));
  } else if (evento.status === 'confirmed' || evento.status === 'in_progress' || evento.status === 'completed') {
    wrap.appendChild(await renderBracket(evento, profile));
  } else if (evento.status === 'cancelled_no_players') {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'Esta edición no se pudo realizar por falta de jugadores.')));
    wrap.appendChild(await renderBracket(evento, profile));
  }

  wrap.appendChild(el('p', { class: 'text-tiny mt-6', style: 'text-align:center;' }, 'Esta pantalla no se actualiza sola — usa "Actualizar" arriba para ver movimientos nuevos.'));

  return wrap;
}

/* ============================================================
   La carrera del mes, en vivo. Es lo primero que ve el jugador:
   cuándo es la Liguilla, cómo va él, y quiénes van calificados
   ahorita mismo — que es lo que de verdad motiva a venir a jugar.
   ============================================================ */
async function renderCarreraDelMes(tier, eventoMes, profile, onChange) {
  const wrap = el('div', { class: 'mb-4' });

  const titulo = tier === 'liguilla_a' ? 'Liguilla · Categoría A' : 'Torneo de Ascenso · Categoría B';
  const hero = el('div', { class: 'card card-hero' });
  hero.appendChild(el('div', { class: 'row-between' }, [
    el('div', { class: 'h2' }, [
      el('span', { html: icon.trophy, style: 'width:18px;height:18px;vertical-align:-3px;margin-right:7px;color:var(--cyan);' }),
      titulo,
    ]),
  ]));
  if (eventoMes && eventoMes.event_date) {
    hero.appendChild(el('p', { class: 'mt-2', style: 'font-weight:700;font-size:15px;' }, formatFecha(eventoMes.event_date)));
    hero.appendChild(el('p', { class: 'text-tiny mt-1' }, diasRestantes(eventoMes.event_date)));
  } else {
    hero.appendChild(el('p', { class: 'text-muted mt-2' }, 'La fecha de este mes se publica en cuanto arranque el mes.'));
  }
  hero.appendChild(el('p', { class: 'text-tiny mt-3', style: 'color:var(--text-tertiary);' },
    'Califican los 12 mejores del ranking de tu categoría al cierre del mes.'));
  wrap.appendChild(hero);

  // Mi situación personal.
  try {
    const c = await getMiCarreraLiguilla(tier);
    if (c) {
      const card = el('div', { class: `card mt-3 ${c.ya_calificado ? 'carrera-dentro' : 'carrera-fuera'}` });
      card.appendChild(el('div', { class: 'row-between' }, [
        el('div', { style: 'font-weight:800;font-size:15px;' }, c.titulo || ''),
        c.mi_rank != null ? el('span', { class: `badge ${c.ya_calificado ? 'badge-success' : 'badge-warning'}` },
          c.ya_calificado ? 'Calificado' : 'Fuera del top') : null,
      ]));
      card.appendChild(el('p', { class: 'text-tiny mt-2' }, c.mensaje || ''));

      if (c.mi_rank != null) {
        card.appendChild(el('div', { class: 'grid-3 mt-4' }, [
          el('div', { class: 'stat-tile' }, [
            el('div', { class: 'stat-value' }, `#${c.mi_rank}`),
            el('div', { class: 'stat-label' }, 'Tu lugar'),
          ]),
          el('div', { class: 'stat-tile' }, [
            el('div', { class: 'stat-value' }, Number(c.mis_puntos || 0).toFixed(0)),
            el('div', { class: 'stat-label' }, 'Tus puntos'),
          ]),
          el('div', { class: 'stat-tile' }, [
            // Sin nadie en el lugar 13 todavía no hay "colchón" que medir:
            // poner un número ahí sería inventarse una ventaja que no existe.
            el('div', { class: 'stat-value' }, c.margen == null
              ? '—'
              : (c.ya_calificado ? `+${Number(c.margen).toFixed(0)}` : Number(c.margen).toFixed(0))),
            el('div', { class: 'stat-label' }, c.ya_calificado ? 'De colchón' : 'Te faltan'),
          ]),
        ]));
      }
      if (!c.ya_calificado && c.aun_posible === false) {
        card.appendChild(el('div', { class: 'aviso aviso-warn mt-3' },
          'Matemáticamente ya es muy difícil este mes — pero los puntos de la ventana móvil se renuevan, así que el mes que entra arrancas de nuevo.'));
      }
      wrap.appendChild(card);
    }
  } catch (err) {
    console.error('No se pudo calcular tu carrera de Liguilla:', err);
  }

  // Tabla en vivo.
  try {
    const tabla = await getLiguillaTablaVivo(tier, 20);
    if (tabla.length) {
      wrap.appendChild(el('div', { class: 'section-title' }, 'Cómo va la carrera ahorita'));
      const list = el('div', { class: 'card' });
      let corteDibujado = false;
      tabla.forEach((r, i) => {
        if (!r.calificado && !corteDibujado) {
          corteDibujado = true;
          list.appendChild(el('div', { class: 'corte-liguilla' }, 'Línea de corte — de aquí para abajo, fuera'));
        } else if (i > 0) {
          list.appendChild(el('hr', { class: 'sep', style: 'margin:9px 0;' }));
        }
        const soyYo = r.player_id === profile.id;
        list.appendChild(
          el('div', { class: `row-between${soyYo ? ' text-cyan' : ''}`, style: soyYo ? 'font-weight:800;' : '' }, [
            el('div', { class: 'row gap-2', style: 'align-items:center;' }, [
              el('span', { class: 'rank-num' }, String(r.rnk)),
              el('span', { class: 'avatar-mini' }, initials(r.full_name)),
              el('span', {}, r.full_name || 'Jugador'),
            ]),
            el('span', { style: 'font-variant-numeric:tabular-nums;' }, Number(r.rolling_points || 0).toFixed(0)),
          ])
        );
      });
      wrap.appendChild(list);
      wrap.appendChild(el('p', { class: 'text-tiny mt-2', style: 'color:var(--text-tertiary);' },
        'Se calcula en vivo con tus últimas escaleras. Cada noche que se juega, la tabla se mueve.'));
    }
  } catch (err) {
    console.error('No se pudo cargar la tabla de la carrera:', err);
  }

  return wrap;
}

function diasRestantes(fechaISO) {
  const hoy = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) + 'T00:00:00Z');
  const dia = new Date(fechaISO + 'T00:00:00Z');
  const dias = Math.round((dia - hoy) / 86400000);
  if (dias < 0) return 'Ya se jugó.';
  if (dias === 0) return '¡Es hoy!';
  if (dias === 1) return 'Es mañana.';
  return `Faltan ${dias} días.`;
}

function renderSeccionCalificacion(misCalificacion, evento, onChange) {
  if (!misCalificacion) {
    return el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'No calificaste a esta edición — se invita a los primeros 12 lugares del ranking de tu categoría.'));
  }
  const card = el('div', { class: 'card' });
  card.appendChild(el('p', { style: 'font-weight:600;' }, QUALIFIER_STATUS_LABEL[misCalificacion.status] || misCalificacion.status));

  if (misCalificacion.status === 'invited') {
    card.appendChild(el('p', { class: 'text-muted mt-2 mb-4' }, 'Confirma tu lugar antes de que cierre el plazo (normalmente 24h antes del evento).'));
    const row = el('div', { class: 'btn-row' });
    const btnNo = el('button', { class: 'btn btn-secondary' }, 'Rechazar');
    const btnSi = el('button', { class: 'btn btn-primary' }, 'Confirmar mi lugar');
    btnNo.addEventListener('click', async () => {
      btnNo.disabled = true;
      try { await responderCalificacionLiguilla(misCalificacion.id, false); toast('Declinaste tu lugar.', 'info'); onChange(); }
      catch (err) { toast(humanizeError(err), 'error'); btnNo.disabled = false; }
    });
    btnSi.addEventListener('click', async () => {
      btnSi.disabled = true; btnSi.textContent = 'Confirmando…';
      try { await responderCalificacionLiguilla(misCalificacion.id, true); toast('¡Lugar confirmado!', 'success'); onChange(); }
      catch (err) { toast(humanizeError(err), 'error'); btnSi.disabled = false; btnSi.textContent = 'Confirmar mi lugar'; }
    });
    row.append(btnNo, btnSi);
    card.appendChild(row);
  }
  return card;
}

async function renderSeccionDraft(evento, profile, misCalificacion, onChange) {
  const wrap = el('div');

  if (!misCalificacion || misCalificacion.status !== 'confirmed') {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'No participas en el draft de esta edición.')));
    wrap.appendChild(await renderParejasFormadas(evento, profile));
    return wrap;
  }

  const miPareja = await getMiParejaLiguilla(evento.id, profile.id);
  if (miPareja) {
    const companeroNombre = miPareja.player1_id === profile.id
      ? (miPareja.player2?.full_name || 'tu pareja')
      : (miPareja.player1?.full_name || 'tu pareja');
    wrap.appendChild(el('div', { class: 'card' }, [
      el('p', { style: 'font-weight:600;' }, `Ya tienes pareja: ${companeroNombre}`),
      el('p', { class: 'text-muted mt-2' }, 'Esperando a que las demás parejas terminen de formarse.'),
    ]));
    wrap.appendChild(await renderParejasFormadas(evento, profile));
    return wrap;
  }

  const pick = await getPickActualDraft(evento.id);
  if (!pick) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'El draft está por comenzar.')));
    return wrap;
  }

  if (pick.status === 'offered' && pick.picked_player_id === profile.id) {
    const card = el('div', { class: 'card' }, [
      el('p', { style: 'font-weight:600;' }, `${pick.picker?.full_name || 'Alguien'} te eligió como pareja.`),
      el('p', { class: 'text-muted mt-2 mb-4' }, 'Puedes aceptar o buscar que te toque con alguien más.'),
    ]);
    const row = el('div', { class: 'btn-row' });
    const btnNo = el('button', { class: 'btn btn-secondary' }, 'Rechazar');
    const btnSi = el('button', { class: 'btn btn-primary' }, 'Aceptar pareja');
    btnNo.addEventListener('click', async () => {
      btnNo.disabled = true;
      try { await responderPickDraft(pick.id, false); toast('Rechazaste la invitación.', 'info'); onChange(); }
      catch (err) { toast(humanizeError(err), 'error'); btnNo.disabled = false; }
    });
    btnSi.addEventListener('click', async () => {
      btnSi.disabled = true;
      try { await responderPickDraft(pick.id, true); toast('¡Pareja confirmada!', 'success'); onChange(); }
      catch (err) { toast(humanizeError(err), 'error'); btnSi.disabled = false; }
    });
    row.append(btnNo, btnSi);
    card.appendChild(row);
    wrap.appendChild(card);
    return wrap;
  }

  if (pick.status === 'pending' && pick.picker_player_id === profile.id) {
    wrap.appendChild(el('div', { class: 'card mb-3' }, el('p', { style: 'font-weight:600;' }, 'Te toca elegir pareja.')));
    const [confirmados, parejas] = await Promise.all([getCalificadosConfirmados(evento.id), getParejasLiguilla(evento.id)]);
    const idsConPareja = new Set(parejas.flatMap((p) => [p.player1_id, p.player2_id]));
    const disponibles = confirmados.filter((c) => c.player_id !== profile.id && !idsConPareja.has(c.player_id));
    const list = el('div', { class: 'card stack gap-2' });
    if (disponibles.length === 0) {
      list.appendChild(el('p', { class: 'text-muted' }, 'No hay jugadores disponibles.'));
    }
    disponibles.forEach((c) => {
      const btn = el('button', { class: 'chip-btn' }, c.profiles?.full_name || '(sin nombre)');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await hacerPickDraft(evento.id, c.player_id); toast('Invitación enviada.', 'success'); onChange(); }
        catch (err) { toast(humanizeError(err), 'error'); btn.disabled = false; }
      });
      list.appendChild(btn);
    });
    wrap.appendChild(list);
    return wrap;
  }

  if (pick.status === 'offered' && pick.picker_player_id === profile.id) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, `Esperando que ${pick.picked?.full_name || 'tu invitado'} responda tu invitación.`)));
    return wrap;
  }
  if (pick.status === 'offered') {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, `${pick.picker?.full_name || 'Alguien'} eligió a ${pick.picked?.full_name || 'alguien'} — esperando su respuesta.`)));
    return wrap;
  }
  wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, `Le toca elegir a ${pick.picker?.full_name || 'otro jugador'}.`)));
  return wrap;
}

async function renderParejasFormadas(evento, profile) {
  const parejas = await getParejasLiguilla(evento.id);
  const wrap = el('div', { class: 'mt-4' });
  if (parejas.length === 0) return wrap;
  wrap.appendChild(el('div', { class: 'section-title' }, 'Parejas ya formadas'));
  const list = el('div', { class: 'card' });
  parejas.forEach((p, i) => {
    if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
    const soyYo = p.player1_id === profile.id || p.player2_id === profile.id;
    list.appendChild(el('div', { class: soyYo ? 'text-cyan' : '' }, `${p.player1?.full_name || '—'} / ${p.player2?.full_name || '—'}`));
  });
  wrap.appendChild(list);
  return wrap;
}

async function renderBracket(evento, profile) {
  const [parejas, partidos] = await Promise.all([getParejasLiguilla(evento.id), getPartidosLiguilla(evento.id)]);
  const parejaPorId = new Map(parejas.map((p) => [p.id, p]));
  const wrap = el('div');

  const nombrePareja = (parejaId) => {
    const p = parejaPorId.get(parejaId);
    if (!p) return 'Por definir';
    return `${p.player1?.full_name || '—'} / ${p.player2?.full_name || '—'}`;
  };
  const esMiPareja = (parejaId) => {
    const p = parejaPorId.get(parejaId);
    return p && (p.player1_id === profile.id || p.player2_id === profile.id);
  };

  ['ronda1', 'ronda2', 'final'].forEach((stage) => {
    const delStage = partidos.filter((m) => m.stage === stage).sort((a, b) => (a.court_number || 0) - (b.court_number || 0));
    if (delStage.length === 0) return;
    wrap.appendChild(el('div', { class: 'section-title' }, STAGE_LABEL[stage]));
    const list = el('div', { class: 'card' });
    delStage.forEach((m, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const purpose = PURPOSE_LABEL[m.match_purpose];
      const destacada = esMiPareja(m.pair1_id) || esMiPareja(m.pair2_id);
      const totales = m.sets_json?.totales;
      list.appendChild(
        el('div', {}, [
          purpose ? el('div', { class: 'text-tiny mb-1' }, purpose) : null,
          el('div', { class: `row-between${destacada ? ' text-cyan' : ''}` }, [
            el('div', {}, [
              el('div', { style: 'font-size:13.5px;font-weight:600;' }, nombrePareja(m.pair1_id)),
              el('div', { style: 'font-size:13.5px;font-weight:600;margin-top:4px;' }, nombrePareja(m.pair2_id)),
            ]),
            el('div', { style: 'text-align:right;' }, [
              m.status === 'completed' && totales
                ? el('div', {}, [
                    el('div', { style: 'font-weight:800;' }, String(totales.pair1?.sets ?? '—')),
                    el('div', { style: 'font-weight:800;margin-top:4px;' }, String(totales.pair2?.sets ?? '—')),
                  ])
                : el('span', { class: 'badge badge-neutral' }, 'Pendiente'),
            ]),
          ]),
        ])
      );
    });
    wrap.appendChild(list);
  });

  const campeones = parejas.filter((p) => p.final_placement === 1);
  if (campeones.length > 0) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Resultado final'));
    const list = el('div', { class: 'card' });
    parejas
      .filter((p) => p.final_placement)
      .sort((a, b) => a.final_placement - b.final_placement)
      .forEach((p, i) => {
        if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
        const soyYo = p.player1_id === profile.id || p.player2_id === profile.id;
        list.appendChild(
          el('div', { class: `row-between${soyYo ? ' text-cyan' : ''}` }, [
            el('div', {}, `${p.final_placement}º lugar — ${p.player1?.full_name || '—'} / ${p.player2?.full_name || '—'}`),
            p.final_placement === 1 ? el('span', { html: icon.trophy, style: 'width:18px;height:18px;color:var(--cyan);' }) : null,
          ])
        );
        if (p.wildcard_next_month && soyYo) {
          list.appendChild(el('p', { class: 'text-tiny mt-1' }, '🎟️ Tienen un lugar garantizado en Categoría A el próximo mes.'));
        }
      });
    wrap.appendChild(list);
  }

  return wrap;
}
