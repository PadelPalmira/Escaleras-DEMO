import { el, formatHora, toast, humanizeError, confirmSheet, avatarContent, chipJugador } from '../utils.js';
import {
  getMyProfile, esMaestro,
  getSystemSettingsAll, updateSystemSetting, getWeekdayScheduleAll, updateWeekdaySchedule,
  crearWeekdaySchedule, borrarWeekdaySchedule,
  getStaff, setProfileRole, buscarJugadores, generarEscalerasSemana, getProximasEscaleras,
} from '../api.js';

const WEEKDAY_LABEL = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };
const FORMAT_LABEL = { individual: 'Individual', parejas: 'Parejas Fijas', retas_abiertas: 'Retas Abiertas' };
const WEEKDAY_OPTIONS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const FORMAT_OPTIONS = ['individual', 'parejas', 'retas_abiertas'];

export async function renderMaestro() {
  const profile = await getMyProfile();
  if (!esMaestro(profile)) {
    return el('div', { class: 'empty-state' }, [el('div', { class: 'emoji' }, '🔒'), el('p', {}, 'Solo el Maestro puede ver esta sección.')]);
  }

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Configuración'));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, 'Cambios aquí afectan a todo el club de inmediato — revisa antes de guardar.'));

  wrap.appendChild(el('div', { class: 'section-title' }, 'Horarios semanales'));
  const schedBox = el('div');
  wrap.appendChild(schedBox);
  await pintarHorarios(schedBox);

  wrap.appendChild(el('div', { class: 'section-title' }, 'Convocatorias de la semana'));
  const convBox = el('div');
  wrap.appendChild(convBox);
  await pintarConvocatorias(convBox);

  wrap.appendChild(el('div', { class: 'section-title' }, 'Fórmula de puntos y reglas' ));
  const settings = await getSystemSettingsAll();
  const settingsCard = el('div', { class: 'card' });
  settings.forEach((s, i) => {
    if (i > 0) settingsCard.appendChild(el('hr', { class: 'sep', style: 'margin:14px 0;' }));
    settingsCard.appendChild(renderSettingRow(s));
  });
  wrap.appendChild(settingsCard);

  wrap.appendChild(el('div', { class: 'section-title' }, 'Administradores'));
  const staffBox = el('div');
  wrap.appendChild(staffBox);
  await pintarStaff(staffBox);

  return wrap;
}

async function pintarHorarios(box) {
  box.innerHTML = '<p class="text-tiny">Cargando…</p>';
  const schedules = await getWeekdayScheduleAll();
  box.innerHTML = '';

  const schedCard = el('div', { class: 'card' });
  if (schedules.length === 0) {
    schedCard.appendChild(el('p', { class: 'text-muted' }, 'No hay ningún horario configurado todavía.'));
  }
  schedules.forEach((ws, i) => {
    if (i > 0) schedCard.appendChild(el('hr', { class: 'sep', style: 'margin:14px 0;' }));
    schedCard.appendChild(renderWeekdayRow(ws, () => pintarHorarios(box)));
  });
  box.appendChild(schedCard);

  box.appendChild(el('div', { class: 'mt-4' }, [renderNuevoHorarioForm(() => pintarHorarios(box))]));
}

function renderWeekdayRow(ws, refresh) {
  const start = el('input', { class: 'input', type: 'time', value: ws.start_time ? ws.start_time.slice(0, 5) : '' });
  const end = el('input', { class: 'input', type: 'time', value: ws.end_time ? ws.end_time.slice(0, 5) : '' });
  const capacity = el('input', { class: 'input', type: 'number', min: '0', value: ws.capacity != null ? String(ws.capacity) : '' });
  const courts = el('input', { class: 'input', type: 'number', min: '1', value: String(ws.courts) });
  const activeToggle = el('button', { class: `chip-btn${ws.active ? ' selected' : ''}` }, ws.active ? '☑ Activo' : '☐ Inactivo');
  let activo = ws.active;
  activeToggle.addEventListener('click', () => {
    activo = !activo;
    activeToggle.classList.toggle('selected', activo);
    activeToggle.textContent = activo ? '☑ Activo' : '☐ Inactivo';
  });

  const label = `${WEEKDAY_LABEL[ws.weekday] || ws.weekday} — ${FORMAT_LABEL[ws.format] || ws.format}${ws.category ? ' · Cat ' + ws.category : ''}`;

  const row = el('div', {}, [
    el('div', { style: 'font-weight:700;margin-bottom:8px;' }, label),
    el('div', { class: 'grid-2' }, [
      el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Inicio'), start]),
      el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Fin'), end]),
    ]),
    el('div', { class: 'grid-2 mt-3' }, [
      el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Cupo'), capacity]),
      el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Canchas'), courts]),
    ]),
    activeToggle,
  ]);

  if (ws.escaleras_generadas > 0) {
    row.appendChild(el('p', { class: 'text-tiny mt-1', style: 'color:var(--text-tertiary);' },
      `Ya generó ${ws.escaleras_generadas} convocatoria(s) — para retirarlo, desactívalo (no se puede borrar sin perder ese historial).`));
  }

  const saveBtn = el('button', { class: 'btn btn-secondary btn-sm mt-3', style: 'width:auto;' }, 'Guardar');
  saveBtn.addEventListener('click', async () => {
    // Apagar un horario tiene consecuencias reales (deja de convocar gente
    // los domingos) — se explica y se pide confirmación antes de guardar.
    if (ws.active && !activo) {
      const ok = await confirmSheet({
        title: `¿Desactivar "${label}"?`,
        body: 'A partir de ahora ya no se van a crear convocatorias nuevas para este horario los domingos. Las convocatorias que ya existen (pasadas o de esta semana) no se cancelan ni se tocan. Puedes volver a activarlo cuando quieras.',
        confirmLabel: 'Sí, desactivar',
        danger: true,
      });
      if (!ok) { activo = true; activeToggle.classList.add('selected'); activeToggle.textContent = '☑ Activo'; return; }
    }
    saveBtn.disabled = true; saveBtn.textContent = 'Guardando…';
    try {
      await updateWeekdaySchedule(ws.id, {
        start_time: start.value || null,
        end_time: end.value || null,
        capacity: capacity.value ? Number(capacity.value) : null,
        courts: Number(courts.value) || 1,
        active: activo,
      });
      toast('Horario actualizado.', 'success');
    } catch (err) { toast(humanizeError(err), 'error'); }
    saveBtn.disabled = false; saveBtn.textContent = 'Guardar';
  });

  const btnRow = el('div', { class: 'mt-1', style: 'display:flex;gap:8px;flex-wrap:wrap;' }, [saveBtn]);

  if (ws.escaleras_generadas === 0) {
    const delBtn = el('button', { class: 'btn btn-ghost btn-sm', style: 'width:auto;color:var(--danger);' }, 'Borrar horario');
    delBtn.addEventListener('click', async () => {
      const ok = await confirmSheet({
        title: `¿Borrar "${label}"?`,
        body: 'Este horario nunca generó ninguna convocatoria, así que se puede borrar por completo — no hay historial que perder. Esta acción no se puede deshacer. Si solo quieres dejar de usarlo pero conservarlo por si acaso, mejor desactívalo en vez de borrarlo.',
        confirmLabel: 'Sí, borrar',
        danger: true,
      });
      if (!ok) return;
      delBtn.disabled = true; delBtn.textContent = 'Borrando…';
      try {
        await borrarWeekdaySchedule(ws.id);
        toast('Horario borrado.', 'success');
        refresh();
      } catch (err) { toast(humanizeError(err), 'error'); delBtn.disabled = false; delBtn.textContent = 'Borrar horario'; }
    });
    btnRow.appendChild(delBtn);
  }

  row.appendChild(btnRow);
  return row;
}

function renderNuevoHorarioForm(refresh) {
  const card = el('div', { class: 'card' });
  card.appendChild(el('div', { style: 'font-weight:700;margin-bottom:8px;' }, 'Nuevo horario'));
  card.appendChild(el('p', { class: 'text-tiny mb-3' },
    'Crea una escalera recurrente nueva (por ejemplo, un horario matutino para otra categoría o rama). Se crea inactiva por seguridad — actívala cuando estés listo para que empiece a convocar gente.'));

  const weekdaySel = el('select', { class: 'input' }, WEEKDAY_OPTIONS.map((w) => el('option', { value: w }, WEEKDAY_LABEL[w])));
  const formatSel = el('select', { class: 'input' }, FORMAT_OPTIONS.map((f) => el('option', { value: f }, FORMAT_LABEL[f])));
  const categorySel = el('select', { class: 'input' }, [
    el('option', { value: '' }, '(sin categoría — ej. Retas Abiertas)'),
    el('option', { value: 'A' }, 'Categoría A'),
    el('option', { value: 'B' }, 'Categoría B'),
  ]);
  const start = el('input', { class: 'input', type: 'time', value: '19:00' });
  const end = el('input', { class: 'input', type: 'time', value: '22:00' });
  const capacity = el('input', { class: 'input', type: 'number', min: '0', placeholder: '(sin límite)' });
  const courts = el('input', { class: 'input', type: 'number', min: '1', value: '3' });

  card.appendChild(el('div', { class: 'grid-2' }, [
    el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Día'), weekdaySel]),
    el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Formato'), formatSel]),
  ]));
  card.appendChild(el('div', { class: 'field mt-3' }, [el('label', {}, 'Categoría'), categorySel]));
  card.appendChild(el('div', { class: 'grid-2 mt-3' }, [
    el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Inicio'), start]),
    el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Fin'), end]),
  ]));
  card.appendChild(el('div', { class: 'grid-2 mt-3' }, [
    el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Cupo'), capacity]),
    el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Canchas'), courts]),
  ]));

  const errBox = el('p', { class: 'text-tiny mt-2', style: 'color:var(--danger);display:none;' });
  card.appendChild(errBox);

  const createBtn = el('button', { class: 'btn btn-secondary btn-sm mt-3', style: 'width:auto;' }, 'Crear horario');
  createBtn.addEventListener('click', async () => {
    errBox.style.display = 'none';
    if (!start.value || !end.value) {
      errBox.textContent = 'Falta la hora de inicio o de fin.'; errBox.style.display = 'block'; return;
    }
    createBtn.disabled = true; createBtn.textContent = 'Creando…';
    try {
      await crearWeekdaySchedule({
        weekday: weekdaySel.value,
        format: formatSel.value,
        category: categorySel.value || null,
        start_time: start.value,
        end_time: end.value,
        capacity: capacity.value ? Number(capacity.value) : null,
        courts: Number(courts.value) || 1,
        active: false,
      });
      toast('Horario creado (inactivo). Actívalo cuando quieras que empiece a convocar.', 'success');
      refresh();
    } catch (err) {
      errBox.textContent = humanizeError(err); errBox.style.display = 'block';
      createBtn.disabled = false; createBtn.textContent = 'Crear horario';
    }
  });
  card.appendChild(createBtn);
  return card;
}

// Estas horas no las lee solo la app: también están escritas en las tareas
// automáticas del servidor. Si se cambian aquí nada más, la app diría una hora
// y el sistema haría otra — así que se muestran, pero no se editan desde aquí.
const HORARIOS_DEL_SISTEMA = {
  convocatoria_open_time: 'Hora en que se publican las convocatorias de la semana.',
  privilege_close_time: 'Hora del domingo en que se acaba la reserva de lugares del ranking.',
  category_recalc_time: 'Hora del domingo en que se recalculan las categorías.',
  category_recalc_weekday: 'Día de la semana del recálculo de categorías.',
  timezone: 'Zona horaria oficial del club.',
};

function renderSettingRow(s) {
  const wrapper = el('div');
  wrapper.appendChild(el('div', { style: 'font-weight:700;' }, s.key));
  if (s.description) wrapper.appendChild(el('p', { class: 'text-tiny mt-1 mb-2' }, s.description));

  if (HORARIOS_DEL_SISTEMA[s.key]) {
    wrapper.appendChild(el('div', { class: 'input mt-2', style: 'background:var(--surface-2);color:var(--text-tertiary);' },
      String(s.value)));
    wrapper.appendChild(el('p', { class: 'text-tiny mt-1', style: 'color:var(--text-tertiary);' },
      'Esta hora también vive en las tareas automáticas del servidor. Para cambiarla hay que cambiarla en los dos lados a la vez: avísale a quien lleva el sistema.'));
    return wrapper;
  }

  let getInputValue;
  if (s.key === 'bono_posicion_final_por_cancha' && s.value && typeof s.value === 'object') {
    const i1 = el('input', { class: 'input', type: 'number', value: String(s.value['1'] ?? 0) });
    const i2 = el('input', { class: 'input', type: 'number', value: String(s.value['2'] ?? 0) });
    const i3 = el('input', { class: 'input', type: 'number', value: String(s.value['3'] ?? 0) });
    wrapper.appendChild(el('div', { class: 'grid-3 mt-2' }, [
      el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Cancha 1'), i1]),
      el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Cancha 2'), i2]),
      el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Cancha 3'), i3]),
    ]));
    getInputValue = () => ({ 1: Number(i1.value) || 0, 2: Number(i2.value) || 0, 3: Number(i3.value) || 0 });
  } else if (typeof s.value === 'number') {
    const input = el('input', { class: 'input mt-2', type: 'number', value: String(s.value) });
    wrapper.appendChild(input);
    getInputValue = () => { const n = Number(input.value); if (!Number.isFinite(n)) throw new Error('Debe ser un número.'); return n; };
  } else {
    const input = el('input', { class: 'input mt-2', type: 'text', value: String(s.value) });
    wrapper.appendChild(input);
    getInputValue = () => input.value.trim();
  }

  const errBox = el('p', { class: 'text-tiny mt-1', style: 'color:var(--danger);display:none;' });
  wrapper.appendChild(errBox);
  const saveBtn = el('button', { class: 'btn btn-secondary btn-sm mt-2', style: 'width:auto;' }, 'Guardar');
  saveBtn.addEventListener('click', async () => {
    errBox.style.display = 'none';
    let val;
    try { val = getInputValue(); } catch (e) { errBox.textContent = e.message; errBox.style.display = 'block'; return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Guardando…';
    try { await updateSystemSetting(s.key, val); toast('Guardado.', 'success'); }
    catch (err) { errBox.textContent = humanizeError(err); errBox.style.display = 'block'; }
    saveBtn.disabled = false; saveBtn.textContent = 'Guardar';
  });
  wrapper.appendChild(saveBtn);
  return wrapper;
}

async function pintarConvocatorias(box) {
  box.innerHTML = '<p class="text-tiny">Cargando…</p>';
  const proximas = await getProximasEscaleras(14);
  box.innerHTML = '';

  const card = el('div', { class: 'card' });
  if (!proximas || proximas.length === 0) {
    card.appendChild(el('p', { class: 'text-muted' }, 'No hay ninguna convocatoria creada para los próximos 14 días — los jugadores no van a poder registrarse todavía.'));
  } else {
    card.appendChild(el('p', { class: 'text-tiny mb-3' }, `${proximas.length} convocatoria(s) creada(s) en los próximos 14 días:`));
    proximas.forEach((e, i) => {
      if (i > 0) card.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      card.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600;' }, `${WEEKDAY_LABEL[e.weekday_schedule?.weekday] || ''} ${e.session_date}`),
          el('div', { class: 'text-tiny' }, e.weekday_schedule ? `${FORMAT_LABEL[e.weekday_schedule.format] || e.weekday_schedule.format}${e.weekday_schedule.category ? ' · Cat ' + e.weekday_schedule.category : ''}` : ''),
        ]),
      ]));
    });
  }

  const genBtn = el('button', { class: 'btn btn-secondary btn-sm mt-3', style: 'width:auto;' }, 'Generar convocatorias de esta semana');
  genBtn.addEventListener('click', async () => {
    genBtn.disabled = true; genBtn.textContent = 'Generando…';
    try {
      const nuevas = await generarEscalerasSemana();
      toast(nuevas && nuevas.length > 0 ? `Se crearon ${nuevas.length} convocatoria(s) nueva(s).` : 'No había nada nuevo que crear — ya estaban todas.', 'success');
      await pintarConvocatorias(box);
      return;
    } catch (err) { toast(humanizeError(err), 'error'); }
    genBtn.disabled = false; genBtn.textContent = 'Generar convocatorias de esta semana';
  });
  card.appendChild(genBtn);
  card.appendChild(el('p', { class: 'text-tiny mt-2' }, 'Esto pasa solo, automáticamente, cada domingo a las 10am — este botón es solo por si necesitas forzarlo (p.ej. acabas de activar un horario nuevo a media semana).'));
  box.appendChild(card);
}

async function pintarStaff(box) {
  box.innerHTML = '<p class="text-tiny">Cargando…</p>';
  const staff = await getStaff();
  box.innerHTML = '';
  const list = el('div', { class: 'card' });
  staff.forEach((p, i) => {
    if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
    const row = el('div', { class: 'row-between' }, [
      el('div', { class: 'row gap-2', style: 'align-items:center;' }, [
        el('span', { class: 'avatar-mini' }, avatarContent(p)),
        el('div', {}, [
          el('div', { style: 'font-weight:600;font-size:14px;' }, p.full_name || '(sin nombre)'),
          el('div', { class: 'text-tiny' }, p.email),
        ]),
      ]),
      el('span', { class: `badge ${p.role === 'maestro' ? 'badge-a' : 'badge-neutral'}` }, p.role === 'maestro' ? 'Maestro' : 'Admin'),
    ]);
    list.appendChild(row);
    if (p.role === 'admin') {
      list.appendChild(el('button', {
        class: 'btn btn-ghost btn-sm mt-2', style: 'width:auto;color:var(--danger);',
        onclick: async () => {
          const ok = await confirmSheet({ title: `¿Quitar a ${p.full_name} como Admin?`, confirmLabel: 'Sí, quitar', danger: true });
          if (!ok) return;
          try { await setProfileRole(p.id, 'jugador'); toast('Ya no es Admin.', 'success'); pintarStaff(box); }
          catch (err) { toast(humanizeError(err), 'error'); }
        },
      }, 'Quitar Admin'));
    }
  });
  box.appendChild(list);

  box.appendChild(el('div', { class: 'card mt-4' }, [
    el('p', { class: 'text-tiny mb-3' }, 'Busca a un jugador para hacerlo Admin.'),
    (() => {
      const search = el('input', { class: 'input mb-3', type: 'text', placeholder: 'Buscar jugador…' });
      const results = el('div', { class: 'stack gap-2' });
      let t;
      search.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          results.innerHTML = '';
          if (!search.value.trim()) return;
          const jugadores = (await buscarJugadores(search.value, 10)).filter((j) => j.role === 'jugador');
          jugadores.forEach((j) => {
            results.appendChild(chipJugador(j, async () => {
              try { await setProfileRole(j.id, 'admin'); toast(`${j.full_name} ahora es Admin.`, 'success'); search.value = ''; results.innerHTML = ''; pintarStaff(box); }
              catch (err) { toast(humanizeError(err), 'error'); }
            }));
          });
          if (jugadores.length === 0) results.appendChild(el('p', { class: 'text-muted' }, 'Sin resultados.'));
        }, 200);
      });
      const wrapper = el('div');
      wrapper.appendChild(search);
      wrapper.appendChild(results);
      return wrapper;
    })(),
  ]));
}
