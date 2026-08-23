import { el, initials, formatFecha, formatFechaHora, formatPuntos, toast, humanizeError, ahora } from '../utils.js';
import { icon } from '../icons.js';
import { navigate } from '../router.js';
import {
  getMyProfile, updateMyProfile, getMiHistorialPuntos, signOut,
  getMisMultas, getMisSuspensiones, getMisNotificaciones, marcarNotificacionLeida,
} from '../api.js';

const FINE_STATUS = { pending: { text: 'Pendiente', cls: 'badge-warning' }, paid: { text: 'Pagada', cls: 'badge-success' }, waived: { text: 'Condonada', cls: 'badge-neutral' } };
const NOTIF_URGENT = new Set([
  'confirmacion_requerida', 'sustituto_encontrado', 'multa_aplicada', 'suspension',
  // Fase 6 — cosas que cambian el lugar del jugador y no puede enterarse tarde.
  'privilegio_perdido', 'preferencia_expirada', 'promocion_lista_espera',
  'pareja_cancelada', 'escalera_cancelada', 'invitacion_pareja',
]);

const REASON_LABEL = {
  match_result: 'Resultado de partido',
  position_bonus: 'Bono de posición final',
  substitute_bonus_ausente: 'Puntos por sustituto (ausente)',
  substitute_bonus_sustituto: 'Puntos por sustituir',
  late_cancel_penalty: 'Penalización — cancelación tardía',
  no_show_penalty: 'Penalización — no asististe',
  liguilla_bonus: 'Bono de Liguilla',
  manual_adjustment: 'Ajuste manual',
};

export async function renderPerfil() {
  const profile = await getMyProfile();
  if (!profile) return el('div', { class: 'empty-state' }, 'No se pudo cargar tu perfil.');
  const [historial, notificaciones, multas, suspensiones] = await Promise.all([
    getMiHistorialPuntos(profile.id, 20),
    getMisNotificaciones(profile.id, 20),
    getMisMultas(profile.id),
    getMisSuspensiones(profile.id),
  ]);

  const wrap = el('div');

  wrap.appendChild(
    el('div', { class: 'card', style: 'text-align:center;' }, [
      el('div', { class: 'avatar-btn', style: 'width:72px;height:72px;font-size:22px;margin:0 auto 12px;' }, initials(profile.full_name)),
      el('div', { class: 'h2' }, profile.full_name || 'Sin nombre'),
      el('div', { class: 'text-tiny mt-1' }, profile.email),
      profile.status !== 'active' ? el('span', { class: 'badge badge-warning mt-2' }, profile.status === 'suspended' ? 'Suspendido' : 'Inactivo') : null,
    ])
  );

  // Acceso al reglamento. Ya no tiene pestaña propia (la barra de abajo se
  // la quedó la Liguilla), así que vive aquí y en Inicio — bien visible, no
  // enterrado: en la versión 2.0 cambiaron reglas importantes.
  wrap.appendChild(
    el('button', {
      class: 'card mt-3 fila-enlace',
      onclick: () => navigate('/reglas'),
    }, [
      el('div', { class: 'row gap-2', style: 'align-items:center;' }, [
        el('span', { html: icon.book, style: 'width:19px;height:19px;color:var(--cyan);' }),
        el('div', {}, [
          el('div', { style: 'font-weight:700;font-size:14px;' }, 'Reglamento completo'),
          el('div', { class: 'text-tiny mt-1' }, 'Cómo se juega, puntos, categorías y penalizaciones'),
        ]),
      ]),
      el('span', { html: icon.chevronRight, style: 'width:18px;height:18px;color:var(--text-tertiary);' }),
    ])
  );

  // Notificaciones
  const sinLeer = (notificaciones || []).filter((n) => !n.read_at);
  wrap.appendChild(el('div', { class: 'section-title' }, `Notificaciones${sinLeer.length > 0 ? ` (${sinLeer.length})` : ''}`));
  if (!notificaciones || notificaciones.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'No tienes notificaciones.')));
  } else {
    const list = el('div', { class: 'card' });
    notificaciones.slice(0, 10).forEach((n, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const urgente = !n.read_at && NOTIF_URGENT.has(n.type);
      const row = el('div', {
        class: 'row-between',
        style: n.read_at ? 'opacity:0.55;' : '',
        onclick: async () => { if (!n.read_at) { try { await marcarNotificacionLeida(n.id); n.read_at = ahora().toISOString(); row.style.opacity = '0.55'; dot && dot.remove(); } catch (err) { toast(humanizeError(err), 'error'); } } },
      }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600;font-size:13.5px;' }, n.title),
          el('div', { class: 'text-tiny mt-1' }, n.body),
          el('div', { class: 'text-tiny mt-1' }, formatFechaHora(n.created_at)),
        ]),
      ]);
      let dot = null;
      if (!n.read_at) { dot = el('span', { class: `badge ${urgente ? 'badge-danger' : 'badge-neutral'}` }, urgente ? 'Urgente' : 'Nuevo'); row.appendChild(dot); }
      list.appendChild(row);
    });
    wrap.appendChild(list);
  }

  // Edición rápida de datos
  wrap.appendChild(el('div', { class: 'section-title' }, 'Tus datos'));
  const nameInput = el('input', { class: 'input', type: 'text', value: profile.full_name || '' });
  const phoneInput = el('input', { class: 'input', type: 'tel', value: profile.phone || '', placeholder: '10 dígitos' });
  const saveBtn = el('button', { class: 'btn btn-secondary mt-2' }, 'Guardar cambios');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Guardando…';
    try {
      await updateMyProfile({ full_name: nameInput.value.trim(), phone: phoneInput.value.trim() || null });
      toast('Datos actualizados.', 'success');
    } catch (err) { toast(humanizeError(err), 'error'); }
    saveBtn.disabled = false; saveBtn.textContent = 'Guardar cambios';
  });
  wrap.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'field' }, [el('label', {}, 'Nombre completo'), nameInput]),
    el('div', { class: 'field', style: 'margin-bottom:0;' }, [el('label', {}, 'Teléfono'), phoneInput]),
    saveBtn,
  ]));

  // Multas (solo se muestra la sección si tiene alguna, para no saturar a la mayoría)
  if (multas && multas.length > 0) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Multas'));
    const list = el('div', { class: 'card' });
    multas.forEach((m, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const st = FINE_STATUS[m.status] || { text: m.status, cls: 'badge-neutral' };
      list.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:700;' }, `$${Number(m.amount_mxn).toLocaleString('es-MX')} MXN`),
          el('div', { class: 'text-tiny' }, `${m.reason || 'Sin motivo especificado'} · ${formatFecha(m.applied_at.slice(0, 10))}`),
        ]),
        el('span', { class: `badge ${st.cls}` }, st.text),
      ]));
    });
    wrap.appendChild(list);
  }

  // Suspensiones (solo si tiene alguna)
  if (suspensiones && suspensiones.length > 0) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Suspensiones'));
    const list = el('div', { class: 'card' });
    suspensiones.forEach((s, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const hoy = ahora().toISOString().slice(0, 10);
      const activa = !s.lifted_at && (!s.end_date || s.end_date >= hoy);
      list.appendChild(el('div', { class: 'row-between' }, [
        el('div', {}, [
          el('div', { style: 'font-weight:600;' }, `${formatFecha(s.start_date)} — ${s.end_date ? formatFecha(s.end_date) : 'indefinida'}`),
          el('div', { class: 'text-tiny' }, s.reason || 'Sin motivo especificado'),
        ]),
        el('span', { class: `badge ${activa ? 'badge-danger' : 'badge-neutral'}` }, s.lifted_at ? 'Levantada' : (activa ? 'Activa' : 'Terminada')),
      ]));
    });
    wrap.appendChild(list);
  }

  // Historial de puntos
  wrap.appendChild(el('div', { class: 'section-title' }, 'Historial de puntos'));
  if (!historial || historial.length === 0) {
    wrap.appendChild(el('div', { class: 'card' }, el('p', { class: 'text-muted' }, 'Todavía no tienes movimientos de puntos.')));
  } else {
    const list = el('div', { class: 'card' });
    historial.forEach((h, i) => {
      if (i > 0) list.appendChild(el('hr', { class: 'sep', style: 'margin:10px 0;' }));
      const positivo = Number(h.points) >= 0;
      list.appendChild(
        el('div', { class: 'row-between' }, [
          el('div', {}, [
            el('div', { style: 'font-weight:600;font-size:13.5px;' }, REASON_LABEL[h.reason] || h.reason),
            el('div', { class: 'text-tiny' }, formatFechaHora(h.created_at)),
          ]),
          el('div', { style: `font-weight:800;font-variant-numeric:tabular-nums;color:${positivo ? 'var(--success)' : 'var(--danger)'}` }, formatPuntos(h.points)),
        ])
      );
    });
    wrap.appendChild(list);
  }

  // Logout
  const logoutBtn = el('button', { class: 'btn btn-ghost mt-6', style: 'color:var(--danger);' }, ['Cerrar sesión']);
  logoutBtn.addEventListener('click', async () => { await signOut(); window.location.reload(); });
  wrap.appendChild(logoutBtn);

  return wrap;
}
