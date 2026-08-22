import { el, todayISO, formatFecha, formatFechaHora, toast, humanizeError, openSheet, confirmSheet } from '../utils.js';
import {
  getMyProfile, esAdminOMaestro, buscarJugadores,
  getRegistrosActivosDeJugador, asignarSustituto, marcarNoShow, cancelarRegistro,
  aplicarMulta, marcarMultaEstado, getMisMultas,
  aplicarSuspension, levantarSuspension, getMisSuspensiones,
} from '../api.js';

const FORMAT_LABEL = { individual: 'Individual', parejas: 'Parejas Fijas', retas_abiertas: 'Retas Abiertas' };
const REG_STATUS = {
  confirmed: { text: 'Confirmado', cls: 'badge-success' },
  waitlist: { text: 'Lista de espera', cls: 'badge-warning' },
  substitute: { text: 'Sustituto', cls: 'badge-success' },
};
const FINE_STATUS = { pending: { text: 'Pendiente', cls: 'badge-warning' }, paid: { text: 'Pagada', cls: 'badge-success' }, waived: { text: 'Condonada', cls: 'badge-neutral' } };

export async function renderAdminJugadores() {
  const profile = await getMyProfile();
  if (!esAdminOMaestro(profile)) {
    return el('div', { class: 'empty-state' }, [el('div', { class: 'emoji' }, '🔒'), el('p', {}, 'No tienes permiso para ver esta sección.')]);
  }
  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Jugadores'));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, 'Busca a un jugador para asignar sustituto, aplicar una multa o una suspensión.'));

  const search = el('input', { class: 'input mb-4', type: 'text', placeholder: 'Buscar jugador por nombre…' });
  wrap.appendChild(search);
  const resultsBox = el('div');
  wrap.appendChild(resultsBox);

  let t;
  search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => pintarResultados(resultsBox, search.value, wrap), 200); });

  return wrap;
}

async function pintarResultados(box, filtro, wrap) {
  if (!filtro.trim()) { box.innerHTML = ''; return; }
  box.innerHTML = '<p class="text-tiny">Buscando…</p>';
  const jugadores = await buscarJugadores(filtro, 15);
  box.innerHTML = '';
  if (jugadores.length === 0) { box.appendChild(el('p', { class: 'text-muted' }, 'Sin resultados.')); return; }
  const list = el('div', { class: 'card' });
  jugadores.forEach((j, i) => {
    if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
    list.appendChild(el('button', {
      class: 'chip-btn', style: 'width:100%;',
      onclick: () => pintarFicha(wrap, j),
    }, `${j.full_name || '(sin nombre)'}${j.status !== 'active' ? '  ·  ' + (j.status === 'suspended' ? 'Suspendido' : 'Inactivo') : ''}`));
  });
  box.appendChild(list);
}

async function pintarFicha(wrap, jugador) {
  wrap.innerHTML = '';
  wrap.appendChild(el('button', { class: 'btn btn-ghost btn-sm mb-3', style: 'width:auto;padding-left:0;', onclick: () => renderAdminJugadores().then((n) => wrap.replaceWith(n)) }, '← Volver a la búsqueda'));

  const refresh = () => pintarFicha(wrap, jugador);

  wrap.appendChild(el('div', { class: 'card', style: 'text-align:center;' }, [
    el('div', { class: 'h2' }, jugador.full_name || 'Sin nombre'),
    el('div', { class: 'text-tiny mt-1' }, jugador.email),
    jugador.status !== 'active' ? el('span', { class: 'badge badge-warning mt-2' }, jugador.status === 'suspended' ? 'Suspendido' : 'Inactivo') : null,
  ]));

  // ---- Registros activos próximos ----
  const registros = await getRegistrosActivosDeJugador(jugador.id);
  wrap.appendChild(el('div', { class: 'section-title' }, 'Registros próximos'));
  if (registros.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'No tiene registros activos próximos.')));
  } else {
    const list = el('div', { class: 'card' });
    registros.forEach((r, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const st = REG_STATUS[r.status] || { text: r.status, cls: 'badge-neutral' };
      list.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600;font-size:14px;' }, formatFecha(r.escaleras.session_date)),
          el('div', { class: 'text-tiny' }, r.escaleras.weekday_schedule ? `${FORMAT_LABEL[r.escaleras.weekday_schedule.format] || r.escaleras.weekday_schedule.format} · Cat ${r.escaleras.weekday_schedule.category || '—'}` : ''),
        ]),
        el('span', { class: `badge ${st.cls}` }, st.text),
      ]));
      if (['confirmed', 'substitute'].includes(r.status)) {
        list.appendChild(el('div', { class: 'btn-row mt-2' }, [
          el('button', { class: 'btn btn-secondary btn-sm', onclick: () => abrirSustituto(r, jugador, refresh) }, 'Sustituto'),
          el('button', { class: 'btn btn-secondary btn-sm', onclick: async () => {
            const ok = await confirmSheet({ title: '¿Marcar no-show?', confirmLabel: 'Sí, marcar', danger: true });
            if (!ok) return;
            try { await marcarNoShow(r.id); toast('Marcado como no-show.', 'success'); refresh(); } catch (err) { toast(humanizeError(err), 'error'); }
          } }, 'No-show'),
          el('button', { class: 'btn btn-danger btn-sm', onclick: async () => {
            const ok = await confirmSheet({ title: '¿Cancelar este registro?', confirmLabel: 'Sí, cancelar', danger: true });
            if (!ok) return;
            try { await cancelarRegistro(r.id); toast('Registro cancelado.', 'success'); refresh(); } catch (err) { toast(humanizeError(err), 'error'); }
          } }, 'Cancelar'),
        ]));
      }
    });
    wrap.appendChild(list);
  }

  // ---- Multas ----
  const multas = await getMisMultas(jugador.id);
  wrap.appendChild(el('div', { class: 'row-between mt-6' }, [
    el('div', { class: 'section-title', style: 'margin:0;' }, 'Multas'),
    el('button', { class: 'btn btn-secondary btn-sm', style: 'width:auto;', onclick: () => abrirMulta(jugador, refresh) }, '+ Aplicar multa'),
  ]));
  if (multas.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'Sin multas.')));
  } else {
    const list = el('div', { class: 'card' });
    multas.forEach((m, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const st = FINE_STATUS[m.status] || { text: m.status, cls: 'badge-neutral' };
      list.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:700;' }, `$${Number(m.amount_mxn).toLocaleString('es-MX')} MXN`),
          el('div', { class: 'text-tiny' }, `${m.reason || 'Sin motivo especificado'} · ${formatFechaHora(m.applied_at)}`),
        ]),
        el('span', { class: `badge ${st.cls}` }, st.text),
      ]));
      if (m.status === 'pending') {
        list.appendChild(el('div', { class: 'btn-row mt-2' }, [
          el('button', { class: 'btn btn-secondary btn-sm', onclick: async () => { try { await marcarMultaEstado(m.id, 'paid'); toast('Marcada como pagada.', 'success'); refresh(); } catch (err) { toast(humanizeError(err), 'error'); } } }, 'Marcar pagada'),
          el('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { try { await marcarMultaEstado(m.id, 'waived'); toast('Multa condonada.', 'info'); refresh(); } catch (err) { toast(humanizeError(err), 'error'); } } }, 'Condonar'),
        ]));
      }
    });
    wrap.appendChild(list);
  }

  // ---- Suspensiones ----
  const suspensiones = await getMisSuspensiones(jugador.id);
  const hoy = todayISO();
  wrap.appendChild(el('div', { class: 'row-between mt-6' }, [
    el('div', { class: 'section-title', style: 'margin:0;' }, 'Suspensiones'),
    el('button', { class: 'btn btn-secondary btn-sm', style: 'width:auto;', onclick: () => abrirSuspension(jugador, refresh) }, '+ Suspender'),
  ]));
  if (suspensiones.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'Sin suspensiones.')));
  } else {
    const list = el('div', { class: 'card' });
    suspensiones.forEach((s, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const activa = !s.lifted_at && (!s.end_date || s.end_date >= hoy);
      list.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600;' }, `${formatFecha(s.start_date)} — ${s.end_date ? formatFecha(s.end_date) : 'indefinida'}`),
          el('div', { class: 'text-tiny' }, s.reason || 'Sin motivo especificado'),
        ]),
        el('span', { class: `badge ${activa ? 'badge-danger' : 'badge-neutral'}` }, s.lifted_at ? 'Levantada' : (activa ? 'Activa' : 'Terminada')),
      ]));
      if (activa) {
        list.appendChild(el('button', { class: 'btn btn-secondary btn-sm mt-2', style: 'width:auto;', onclick: async () => {
          try { await levantarSuspension(s.id, jugador.id); jugador.status = 'active'; toast('Suspensión levantada.', 'success'); refresh(); } catch (err) { toast(humanizeError(err), 'error'); }
        } }, 'Levantar suspensión'));
      }
    });
    wrap.appendChild(list);
  }
}

async function abrirSustituto(registro, jugador, onChange) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, 'Asignar sustituto'));
  let esCoach = false;
  const infoTxt = el('p', { class: 'text-muted mb-3' }, 'El sustituto recibe 34% de los puntos ganados; el ausente conserva 66%.');
  content.appendChild(infoTxt);
  const coachToggle = el('button', { class: 'chip-btn mb-3' }, '☐ Es un coach del club cubriendo una emergencia');
  coachToggle.addEventListener('click', () => {
    esCoach = !esCoach;
    coachToggle.classList.toggle('selected', esCoach);
    coachToggle.textContent = esCoach ? '☑ Es un coach del club cubriendo una emergencia' : '☐ Es un coach del club cubriendo una emergencia';
    infoTxt.textContent = esCoach ? 'El coach no gana puntos; el ausente recibe la penalización completa por tiempo.' : 'El sustituto recibe 34% de los puntos ganados; el ausente conserva 66%.';
  });
  content.appendChild(coachToggle);
  const search = el('input', { class: 'input mb-3', type: 'text', placeholder: 'Buscar jugador…' });
  const list = el('div', { class: 'stack gap-2', style: 'max-height:36vh;overflow-y:auto;' });
  async function draw(filtro = '') {
    list.innerHTML = '<p class="text-tiny">Buscando…</p>';
    const jugadores = await buscarJugadores(filtro, 20);
    list.innerHTML = '';
    jugadores.filter((j) => j.id !== jugador.id).forEach((j) => {
      list.appendChild(el('button', {
        class: 'chip-btn',
        onclick: async () => {
          try { await asignarSustituto(registro.id, j.id, esCoach); toast(`${j.full_name} jugará en su lugar.`, 'success'); handle.close(); onChange(); }
          catch (err) { toast(humanizeError(err), 'error'); }
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

function abrirMulta(jugador, onChange) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, `Aplicar multa a ${jugador.full_name || ''}`));
  const amount = el('input', { class: 'input', type: 'number', min: '0', value: '250' });
  const reason = el('input', { class: 'input', type: 'text', placeholder: 'Motivo (opcional)' });
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Monto (MXN)'), amount]));
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Motivo'), reason]));
  const errBox = el('p', { class: 'text-tiny mt-1', style: 'color:var(--danger);display:none;' });
  content.appendChild(errBox);
  const btn = el('button', { class: 'btn btn-primary mt-2' }, 'Aplicar multa');
  btn.addEventListener('click', async () => {
    const n = Number(amount.value);
    if (!Number.isFinite(n) || n <= 0) { errBox.textContent = 'El monto debe ser un número mayor a 0.'; errBox.style.display = 'block'; return; }
    btn.disabled = true; btn.textContent = 'Aplicando…';
    try { await aplicarMulta(jugador.id, n, reason.value.trim() || null); toast('Multa aplicada.', 'success'); handle.close(); onChange(); }
    catch (err) { errBox.textContent = humanizeError(err); errBox.style.display = 'block'; btn.disabled = false; btn.textContent = 'Aplicar multa'; }
  });
  content.appendChild(btn);
  const handle = openSheet(content);
}

function abrirSuspension(jugador, onChange) {
  const content = el('div');
  content.appendChild(el('div', { class: 'sheet-title' }, `Suspender a ${jugador.full_name || ''}`));
  const start = el('input', { class: 'input', type: 'date', value: todayISO() });
  const end = el('input', { class: 'input', type: 'date' });
  const reason = el('input', { class: 'input', type: 'text', placeholder: 'Motivo (opcional)' });
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Desde'), start]));
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Hasta (opcional — vacío = indefinida)'), end]));
  content.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Motivo'), reason]));
  const errBox = el('p', { class: 'text-tiny mt-1', style: 'color:var(--danger);display:none;' });
  content.appendChild(errBox);
  const btn = el('button', { class: 'btn btn-danger mt-2' }, 'Aplicar suspensión');
  btn.addEventListener('click', async () => {
    if (!start.value) { errBox.textContent = 'La fecha de inicio es obligatoria.'; errBox.style.display = 'block'; return; }
    btn.disabled = true; btn.textContent = 'Aplicando…';
    try { await aplicarSuspension(jugador.id, start.value, end.value || null, reason.value.trim() || null); jugador.status = 'suspended'; toast('Suspensión aplicada.', 'success'); handle.close(); onChange(); }
    catch (err) { errBox.textContent = humanizeError(err); errBox.style.display = 'block'; btn.disabled = false; btn.textContent = 'Aplicar suspensión'; }
  });
  content.appendChild(btn);
  const handle = openSheet(content);
}
