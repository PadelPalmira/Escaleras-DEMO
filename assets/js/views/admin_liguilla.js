import { el, formatFecha, toast, humanizeError, openSheet, confirmSheet, ahora, avatarContent, chipJugador } from '../utils.js';
import { icon } from '../icons.js';
import {
  getMyProfile, esAdminOMaestro,
  getLiguillaEventosAdmin, crearEventoLiguilla, generarCalificadosLiguilla, getCalificadosLiguillaAdmin,
  cerrarConfirmacionesLiguilla, autogenerarParejasRestantes, cancelarLiguillaSinJugadores,
  generarRonda1Liguilla, registrarResultadoLiguillaMatch, sustituirCalificadoLiguilla, buscarJugadores,
  getParejasLiguilla, getPartidosLiguilla, getPickActualDraft,
} from '../api.js';

const TIER_LABEL = { liguilla_a: 'Liguilla · Categoría A', ascenso_b: 'Torneo de Ascenso · Categoría B' };
const EVENT_STATUS_LABEL = {
  scheduled: { text: 'Programado', cls: 'badge-neutral' },
  qualifying: { text: 'Confirmando calificados', cls: 'badge-warning' },
  draft_open: { text: 'Draft en curso', cls: 'badge-warning' },
  confirmed: { text: 'Bracket listo', cls: 'badge-success' },
  in_progress: { text: 'En juego', cls: 'badge-success' },
  completed: { text: 'Finalizado', cls: 'badge-neutral' },
  cancelled_no_players: { text: 'Cancelado', cls: 'badge-danger' },
};
const QUALIFIER_STATUS_LABEL = {
  invited: 'Invitado', confirmed: 'Confirmado', waitlist: 'Lista de espera',
  declined: 'Declinó', substituted: 'Sustituido',
};
const STAGE_LABEL = { ronda1: 'Ronda 1', ronda2: 'Ronda 2', final: 'Final' };
const PURPOSE_LABEL = {
  bracket_r1: '', r2_sembrado_vs_lucky_loser: 'Sembrado vs Lucky Loser',
  r2_otros_ganadores: 'Ganadores', r2_consolacion_5_6: '5º–6º lugar', final: '',
};

export async function renderAdminLiguilla() {
  const profile = await getMyProfile();
  if (!esAdminOMaestro(profile)) {
    return el('div', { class: 'empty-state' }, [el('div', { class: 'emoji' }, '🔒'), el('p', {}, 'No tienes permiso para ver esta sección.')]);
  }
  const wrap = el('div');
  await pintarLista(wrap);
  return wrap;
}

async function pintarLista(wrap) {
  wrap.innerHTML = '';
  wrap.appendChild(el('div', { class: 'row-between mb-2' }, [
    el('div', { class: 'h1' }, 'Liguilla / Ascenso'),
    el('button', { class: 'btn btn-secondary btn-sm', style: 'width:auto;', onclick: () => abrirCrearEvento(wrap) }, '+ Nuevo'),
  ]));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, 'Elige una edición para gestionarla.'));

  const eventos = await getLiguillaEventosAdmin();
  if (eventos.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, [el('div', { class: 'emoji' }, '🏆'), el('p', {}, 'Todavía no hay ninguna edición creada.')]));
    return;
  }
  eventos.forEach((ev) => {
    const st = EVENT_STATUS_LABEL[ev.status] || { text: ev.status, cls: 'badge-neutral' };
    wrap.appendChild(el('div', { class: 'card card-tappable mt-4', onclick: () => pintarDetalle(wrap, ev.id) }, [
      el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:800;font-size:15px;' }, TIER_LABEL[ev.tier] || ev.tier),
          el('div', { class: 'text-tiny mt-1' }, `${ev.month_key}${ev.event_date ? ' · ' + formatFecha(ev.event_date) : ''}`),
        ]),
        el('span', { class: `badge ${st.cls}` }, st.text),
      ]),
    ]));
  });
}

function abrirCrearEvento(wrap) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, 'Nueva edición de Liguilla/Ascenso'));
  const hoy = ahora();
  const monthDefault = `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}`;
  const monthInput = el('input', { class: 'input', type: 'text', value: monthDefault, placeholder: 'AAAA-MM' });
  const tierSelect = el('select', { class: 'input' }, [
    el('option', { value: 'liguilla_a' }, 'Liguilla · Categoría A'),
    el('option', { value: 'ascenso_b' }, 'Torneo de Ascenso · Categoría B'),
  ]);
  const dateInput = el('input', { class: 'input', type: 'date' });
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Mes (AAAA-MM)'), monthInput]));
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Tier'), tierSelect]));
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Fecha del evento (opcional)'), dateInput]));

  const errBox = el('p', { class: 'text-tiny mt-1', style: 'color:var(--danger);display:none;' });
  content.appendChild(errBox);
  const btn = el('button', { class: 'btn btn-primary mt-3' }, 'Crear evento');
  btn.addEventListener('click', async () => {
    errBox.style.display = 'none';
    if (!/^\d{4}-\d{2}$/.test(monthInput.value.trim())) { errBox.textContent = 'El mes debe tener el formato AAAA-MM.'; errBox.style.display = 'block'; return; }
    btn.disabled = true; btn.textContent = 'Creando…';
    try {
      await crearEventoLiguilla(monthInput.value.trim(), tierSelect.value, dateInput.value || null, null);
      toast('Evento creado.', 'success');
      handle.close();
      pintarLista(wrap);
    } catch (err) { errBox.textContent = humanizeError(err); errBox.style.display = 'block'; btn.disabled = false; btn.textContent = 'Crear evento'; }
  });
  content.appendChild(btn);
  const handle = openSheet(content);
}

async function pintarDetalle(wrap, eventId) {
  wrap.innerHTML = '';
  wrap.appendChild(el('div', { class: 'stack', style: 'padding-top:60px;' }, [el('div', { class: 'spinner' })]));

  const eventos = await getLiguillaEventosAdmin();
  const ev = eventos.find((e) => e.id === eventId);
  wrap.innerHTML = '';
  if (!ev) { wrap.appendChild(el('p', { class: 'text-muted' }, 'Ese evento ya no está disponible.')); return; }

  const refresh = () => pintarDetalle(wrap, eventId);
  wrap.appendChild(el('button', { class: 'btn btn-ghost btn-sm mb-3', style: 'width:auto;padding-left:0;', onclick: () => pintarLista(wrap) }, '← Volver'));

  const st = EVENT_STATUS_LABEL[ev.status] || { text: ev.status, cls: 'badge-neutral' };
  wrap.appendChild(el('div', { class: 'card card-hero mb-4' }, [
    el('div', { class: 'row-between' }, [
      el('div', { class: 'h2' }, TIER_LABEL[ev.tier] || ev.tier),
      el('span', { class: `badge ${st.cls}` }, st.text),
    ]),
    el('p', { class: 'text-muted mt-2' }, `${ev.month_key}${ev.event_date ? ' · ' + formatFecha(ev.event_date) : ''}`),
  ]));

  if (ev.status === 'scheduled') {
    wrap.appendChild(el('div', { class: 'card' }, [
      el('p', { class: 'text-muted mb-3' }, 'Invita a los primeros 12 lugares del ranking de este tier (más lista de espera).'),
      el('button', { class: 'btn btn-primary', onclick: async (e) => {
        e.target.disabled = true; e.target.textContent = 'Generando…';
        try { const r = await generarCalificadosLiguilla(eventId, 8); toast(`${r.calificados} invitados, ${r.en_espera} en espera.`, 'success'); refresh(); }
        catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; e.target.textContent = 'Generar calificados'; }
      } }, 'Generar calificados'),
    ]));
    return;
  }

  if (ev.status === 'qualifying') {
    const calificados = await getCalificadosLiguillaAdmin(eventId);
    wrap.appendChild(el('div', { class: 'section-title' }, `Calificados (${calificados.filter((c) => c.status === 'confirmed').length} confirmados)`));
    const list = el('div', { class: 'card' });
    calificados.forEach((c, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const row = el('div', { class: 'row-between' }, [
        el('div', { class: 'row gap-2', style: 'align-items:center;' }, [
          el('span', { class: 'avatar-mini' }, avatarContent(c.profiles || {})),
          el('div', {}, [
            el('div', { style: 'font-weight:600;font-size:14px;' }, (c.profiles && c.profiles.full_name) || '(sin nombre)'),
            el('div', { class: 'text-tiny' }, `Seed ${c.seed}`),
          ]),
        ]),
        el('span', { class: 'badge badge-neutral' }, QUALIFIER_STATUS_LABEL[c.status] || c.status),
      ]);
      list.appendChild(row);
      if (['invited', 'confirmed'].includes(c.status)) {
        list.appendChild(el('button', {
          class: 'btn btn-secondary btn-sm mt-2', style: 'width:auto;',
          onclick: () => abrirSustituirCalificado(c, refresh),
        }, 'Sustituir'));
      }
    });
    wrap.appendChild(list);

    wrap.appendChild(el('div', { class: 'card mt-4' }, [
      el('p', { class: 'text-muted mb-3' }, 'Cierra la confirmación para pasar al draft. Si aún no se alcanza el corte de 24h, puedes forzarlo.'),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn btn-secondary', onclick: () => cerrarConf(eventId, false, refresh) }, 'Cerrar confirmaciones'),
        el('button', { class: 'btn btn-secondary', onclick: () => cerrarConf(eventId, true, refresh) }, 'Forzar cierre ahora'),
      ]),
    ]));
    wrap.appendChild(renderCancelarSinJugadores(eventId, refresh));
    return;
  }

  if (ev.status === 'draft_open') {
    const [pick, parejas] = await Promise.all([getPickActualDraft(eventId), getParejasLiguilla(eventId)]);
    if (pick) {
      const texto = pick.status === 'pending'
        ? `Le toca elegir a ${pick.picker?.full_name || '—'}.`
        : `${pick.picker?.full_name || '—'} ofreció pareja a ${pick.picked?.full_name || '—'} — esperando respuesta.`;
      wrap.appendChild(el('div', { class: 'card' }, el('p', {}, texto)));
    } else {
      wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'El draft ya no tiene turnos pendientes.')));
    }
    if (parejas.length > 0) {
      wrap.appendChild(el('div', { class: 'section-title' }, `Parejas formadas (${parejas.length}/6)`));
      const list = el('div', { class: 'card' });
      parejas.forEach((p, i) => {
        if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
        list.appendChild(el('div', {}, `${p.player1?.full_name || '—'} / ${p.player2?.full_name || '—'}`));
      });
      wrap.appendChild(list);
    }
    wrap.appendChild(el('div', { class: 'card mt-4' }, [
      el('p', { class: 'text-muted mb-3' }, 'Si el draft se atora, puedes emparejar automáticamente a los jugadores restantes por nivel (normalmente disponible 2h antes del evento).'),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn btn-secondary', onclick: () => autogenerar(eventId, false, refresh) }, 'Autogenerar restantes'),
        el('button', { class: 'btn btn-secondary', onclick: () => autogenerar(eventId, true, refresh) }, 'Forzar ahora'),
      ]),
    ]));
    wrap.appendChild(renderCancelarSinJugadores(eventId, refresh));
    return;
  }

  if (ev.status === 'confirmed') {
    const parejas = await getParejasLiguilla(eventId);
    wrap.appendChild(el('div', { class: 'section-title' }, 'Parejas sembradas'));
    const list = el('div', { class: 'card' });
    parejas.sort((a, b) => (a.seed_pair || 0) - (b.seed_pair || 0)).forEach((p, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      list.appendChild(el('div', {}, `${p.seed_pair}. ${p.player1?.full_name || '—'} / ${p.player2?.full_name || '—'}`));
    });
    wrap.appendChild(list);
    wrap.appendChild(el('button', { class: 'btn btn-primary mt-4', onclick: async (e) => {
      e.target.disabled = true; e.target.textContent = 'Generando…';
      try { await generarRonda1Liguilla(eventId); toast('Ronda 1 generada.', 'success'); refresh(); }
      catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; e.target.textContent = 'Generar Ronda 1'; }
    } }, 'Generar Ronda 1'));
    return;
  }

  if (ev.status === 'in_progress' || ev.status === 'completed' || ev.status === 'cancelled_no_players') {
    if (ev.status === 'cancelled_no_players') {
      wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'Esta edición se canceló por falta de jugadores; se registró una pareja campeona por default.')));
    }
    await pintarBracketAdmin(wrap, eventId, ev.status === 'in_progress', refresh);
    return;
  }
}

function renderCancelarSinJugadores(eventId, onChange) {
  const card = el('div', { class: 'card mt-4' }, [
    el('p', { class: 'text-tiny mb-3' }, 'Si no se puede completar esta edición por falta de jugadores, decláralos ganadores por default (los 2 con más puntos del mes).'),
    el('button', { class: 'btn btn-danger', onclick: async (e) => {
      const ok = await confirmSheet({ title: '¿Cancelar por falta de jugadores?', body: 'Se borran las parejas/partidos que existan y se declara una pareja campeona por default.', confirmLabel: 'Sí, cancelar', danger: true });
      if (!ok) return;
      e.target.disabled = true;
      try { await cancelarLiguillaSinJugadores(eventId, null, null); toast('Edición cancelada — ganadores por default asignados.', 'success'); onChange(); }
      catch (err) { toast(humanizeError(err), 'error'); e.target.disabled = false; }
    } }, 'Cancelar sin jugadores'),
  ]);
  return card;
}

async function cerrarConf(eventId, force, onChange) {
  try { const r = await cerrarConfirmacionesLiguilla(eventId, force); toast(`${r.confirmados} confirmados, ${r.declinados} declinados, ${r.promovidos} promovidos.`, 'success'); onChange(); }
  catch (err) { toast(humanizeError(err), 'error'); }
}
async function autogenerar(eventId, force, onChange) {
  try { const n = await autogenerarParejasRestantes(eventId, force); toast(`${n} pareja(s) generada(s) automáticamente.`, 'success'); onChange(); }
  catch (err) { toast(humanizeError(err), 'error'); }
}

function abrirSustituirCalificado(calificado, onChange) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, `Sustituir a ${(calificado.profiles && calificado.profiles.full_name) || 'jugador'}`));
  const search = el('input', { class: 'input mb-3', type: 'text', placeholder: 'Buscar jugador…' });
  const list = el('div', { class: 'stack gap-2', style: 'max-height:40vh;overflow-y:auto;' });
  async function draw(filtro = '') {
    list.innerHTML = '<p class="text-tiny">Buscando…</p>';
    const jugadores = await buscarJugadores(filtro, 20);
    list.innerHTML = '';
    jugadores.filter((j) => j.id !== calificado.player_id).forEach((j) => {
      list.appendChild(chipJugador(j, async () => {
        try { await sustituirCalificadoLiguilla(calificado.id, j.id); toast(`${j.full_name} sustituye a ${(calificado.profiles && calificado.profiles.full_name) || ''}.`, 'success'); handle.close(); onChange(); }
        catch (err) { toast(humanizeError(err), 'error'); }
      }));
    });
    if (list.children.length === 0) list.appendChild(el('p', { class: 'text-muted' }, 'Sin resultados.'));
  }
  draw();
  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => draw(search.value), 200); });
  content.appendChild(search);
  content.appendChild(list);
  content.appendChild(el('button', {
    class: 'btn btn-ghost mt-3',
    onclick: async () => {
      try { await sustituirCalificadoLiguilla(calificado.id, null); toast('Se promovió al siguiente en la lista de espera.', 'success'); handle.close(); onChange(); }
      catch (err) { toast(humanizeError(err), 'error'); }
    },
  }, 'Promover automáticamente de la lista de espera'));
  const handle = openSheet(content);
}

async function pintarBracketAdmin(wrap, eventId, permitirCaptura, onChange) {
  const [parejas, partidos] = await Promise.all([getParejasLiguilla(eventId), getPartidosLiguilla(eventId)]);
  const parejaPorId = new Map(parejas.map((p) => [p.id, p]));
  const nombrePareja = (id) => { const p = parejaPorId.get(id); return p ? `${p.player1?.full_name || '—'} / ${p.player2?.full_name || '—'}` : 'Por definir'; };

  ['ronda1', 'ronda2', 'final'].forEach((stage) => {
    const delStage = partidos.filter((m) => m.stage === stage).sort((a, b) => (a.court_number || 0) - (b.court_number || 0));
    if (delStage.length === 0) return;
    wrap.appendChild(el('div', { class: 'section-title' }, STAGE_LABEL[stage]));
    const list = el('div', { class: 'card' });
    delStage.forEach((m, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const purpose = PURPOSE_LABEL[m.match_purpose];
      const totales = m.sets_json?.totales;
      const row = el('div', {}, [
        purpose ? el('div', { class: 'text-tiny mb-1' }, purpose) : null,
        el('div', { class: 'row-between' }, [
          el('div', {}, [
            el('div', { style: 'font-size:13.5px;font-weight:600;' }, nombrePareja(m.pair1_id)),
            el('div', { style: 'font-size:13.5px;font-weight:600;margin-top:4px;' }, nombrePareja(m.pair2_id)),
          ]),
          m.status === 'completed' && totales
            ? el('div', { style: 'text-align:right;' }, [
                el('div', { style: 'font-weight:800;' }, String(totales.pair1?.sets ?? '—')),
                el('div', { style: 'font-weight:800;margin-top:4px;' }, String(totales.pair2?.sets ?? '—')),
              ])
            : el('span', { class: 'badge badge-neutral' }, 'Pendiente'),
        ]),
      ]);
      if (permitirCaptura && m.status !== 'completed' && m.pair1_id && m.pair2_id) {
        row.appendChild(el('button', {
          class: 'btn btn-primary btn-sm mt-2', style: 'width:auto;',
          onclick: () => abrirCapturaLiguilla(m, nombrePareja, onChange),
        }, 'Capturar resultado'));
      }
      list.appendChild(row);
    });
    wrap.appendChild(list);
  });

  const campeones = parejas.filter((p) => p.final_placement === 1);
  if (campeones.length > 0) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Resultado final'));
    const list = el('div', { class: 'card' });
    parejas.filter((p) => p.final_placement).sort((a, b) => a.final_placement - b.final_placement).forEach((p, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      list.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, `${p.final_placement}º lugar — ${p.player1?.full_name || '—'} / ${p.player2?.full_name || '—'}`),
        p.final_placement === 1 ? el('span', { html: icon.trophy, style: 'width:18px;height:18px;color:var(--cyan);' }) : null,
      ]));
    });
    wrap.appendChild(list);
  }
}

/** Sheet de captura para partidos de Liguilla — OJO: aquí las llaves del JSON son
 * pair1/pair2 (no team1/team2 como en escaleras normales), porque
 * registrar_resultado_liguilla_match llama a liguilla_resumen_sets directamente. */
function abrirCapturaLiguilla(m, nombrePareja, onChange) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, 'Capturar resultado') );
  content.appendChild(el('p', { class: 'text-tiny mb-3' }, `${nombrePareja(m.pair1_id)}  vs  ${nombrePareja(m.pair2_id)}`));

  function setRow(label) {
    const g1 = el('input', { class: 'input', type: 'number', min: '0', placeholder: '0' });
    const g2 = el('input', { class: 'input', type: 'number', min: '0', placeholder: '0' });
    return { node: el('div', { class: 'field' }, [el('label', {}, label), el('div', { class: 'row gap-2' }, [g1, el('div', { class: 'text-tiny' }, 'vs'), g2])]), g1, g2 };
  }
  const set1 = setRow('Set 1 (games)');
  const set2 = setRow('Set 2 (games)');
  const set3 = setRow('Set 3 — súper muerte (opcional)');
  content.appendChild(set1.node); content.appendChild(set2.node); content.appendChild(set3.node);

  const errBox = el('p', { class: 'text-tiny mt-1', style: 'color:var(--danger);display:none;' });
  content.appendChild(errBox);
  const btn = el('button', { class: 'btn btn-primary mt-3' }, 'Guardar resultado');
  btn.addEventListener('click', async () => {
    errBox.style.display = 'none';
    let sets;
    try { sets = construirSetsPareja(set1, set2, set3); }
    catch (e) { errBox.textContent = e.message; errBox.style.display = 'block'; return; }
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const res = await registrarResultadoLiguillaMatch(m.id, sets);
      const mensajes = {
        ronda1_en_curso: 'Resultado guardado — faltan más partidos de Ronda 1.',
        ronda2_generada: '¡Ronda 1 completa! Se generó la Ronda 2 (incluye Lucky Loser).',
        ronda2_en_curso: 'Resultado guardado — faltan más partidos de Ronda 2.',
        final_generada: '¡Ronda 2 completa! Se generó la Final.',
        pendiente_consolacion_5_6: 'Final registrada — falta el partido de 5º-6º lugar para cerrar la edición.',
        liguilla_finalizada: '¡Liguilla finalizada! Resultados y wildcard asignados.',
      };
      toast(mensajes[res.siguiente_paso] || 'Resultado guardado.', 'success');
      handle.close();
      onChange();
    } catch (err) { errBox.textContent = humanizeError(err); errBox.style.display = 'block'; btn.disabled = false; btn.textContent = 'Guardar resultado'; }
  });
  content.appendChild(btn);
  const handle = openSheet(content);
}

function construirSetsPareja(set1, set2, set3) {
  function leer(s) {
    const t1 = s.g1.value.trim(), t2 = s.g2.value.trim();
    if (!t1 && !t2) return null;
    const n1 = Number(t1), n2 = Number(t2);
    if (!Number.isFinite(n1) || !Number.isFinite(n2) || n1 < 0 || n2 < 0) throw new Error('Los marcadores deben ser números válidos (0 o más).');
    if (n1 === n2) throw new Error('Un set no puede terminar empatado.');
    return { pair1: n1, pair2: n2 };
  }
  const s1 = leer(set1), s2 = leer(set2);
  if (!s1 || !s2) throw new Error('Captura al menos el Set 1 y el Set 2.');
  const sets = [s1, s2];
  const s3 = leer(set3);
  if (s3) sets.push(s3);
  else if ((s1.pair1 > s1.pair2) !== (s2.pair1 > s2.pair2)) throw new Error('Hay empate a un set — captura el Set 3 (súper muerte) para definir el partido.');
  return sets;
}
