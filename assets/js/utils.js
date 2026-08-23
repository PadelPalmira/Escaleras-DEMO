import { CLUB_TZ } from './config.js';

/* ---------------- DOM helpers ---------------- */

export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    // Cualquier valor que no sea ya un Node (strings, numbers, etc.) se
    // convierte a texto — evita un crash cuando se pasa un número directo
    // (p.ej. un conteo) en vez de una plantilla de texto ya convertida.
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function initials(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ---------------- Fecha / hora (CDMX) ---------------- */

const fmtDate = new Intl.DateTimeFormat('es-MX', { timeZone: CLUB_TZ, weekday: 'long', day: 'numeric', month: 'long' });
const fmtDateShort = new Intl.DateTimeFormat('es-MX', { timeZone: CLUB_TZ, day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('es-MX', { timeZone: CLUB_TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const fmtDateTime = new Intl.DateTimeFormat('es-MX', { timeZone: CLUB_TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

export function formatFecha(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00Z'); // fecha pura (date), evitar corrimiento de día
  const s = fmtDate.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function formatFechaCorta(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00Z');
  return fmtDateShort.format(d);
}
export function formatHora(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const d = new Date(); d.setUTCHours(0, 0, 0, 0);
  const local = new Date(`2000-01-01T${timeStr}`);
  return local.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true });
}
export function formatFechaHora(isoTs) {
  if (!isoTs) return '';
  return fmtDateTime.format(new Date(isoTs));
}

/* ============================================================
   El reloj de la app
   ------------------------------------------------------------
   TODO el código que necesita saber "qué hora es" pasa por aquí,
   igual que en la base de datos pasa por public.ahora(). En
   producción es el reloj de verdad y no cambia nada; existe para
   poder probar la app en otro momento de la semana sin esperar a
   que llegue el domingo.
   ============================================================ */
let _reloj = () => new Date();
export function setReloj(fn) { _reloj = typeof fn === 'function' ? fn : (() => new Date()); }
export function ahora() { return _reloj(); }

/** Regresa "hace X" / "en X" en español, redondeado a la unidad más clara. */
export function relativeTime(isoTs) {
  const diffMs = new Date(isoTs).getTime() - ahora().getTime();
  const diffH = diffMs / 3600000;
  const abs = Math.abs(diffH);
  const futuro = diffH > 0;
  let texto;
  if (abs < 1) texto = `${Math.round(abs * 60)} min`;
  else if (abs < 48) texto = `${Math.round(abs)} h`;
  else texto = `${Math.round(abs / 24)} días`;
  return futuro ? `en ${texto}` : `hace ${texto}`;
}

export function todayISO() {
  // Fecha de "hoy" según CDMX, en formato YYYY-MM-DD.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ahora());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

/* ---------------- Números / puntos ---------------- */

export function formatPuntos(n) {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  const sign = num > 0 ? '+' : '';
  return sign + num.toLocaleString('es-MX', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

/* ---------------- Toasts ---------------- */

let toastWrap = null;
export function toast(message, type = 'info', ms = 3200) {
  if (!toastWrap) {
    toastWrap = el('div', { class: 'toast-wrap' });
    document.body.appendChild(toastWrap);
  }
  const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : '💬';
  const node = el('div', { class: `toast ${type}` }, [el('span', {}, icon), el('span', {}, message)]);
  toastWrap.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity 200ms ease';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, ms);
}

/* ---------------- Bottom sheet / confirmación ---------------- */

export function openSheet(contentNode, { onClose } = {}) {
  const backdrop = el('div', { class: 'sheet-backdrop' });
  const sheet = el('div', { class: 'sheet' });
  sheet.appendChild(el('div', { class: 'sheet-handle' }));
  sheet.appendChild(contentNode);
  backdrop.appendChild(sheet);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  function close() {
    backdrop.remove();
    document.body.style.overflow = '';
    if (onClose) onClose();
  }
  return { close, sheet };
}

export function confirmSheet({ title, body, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const content = el('div', {}, [
      el('div', { class: 'sheet-title' }, title),
      body ? el('p', { class: 'text-muted mb-4' }, body) : null,
      el('div', { class: 'btn-row mt-4' }, [
        el('button', { class: 'btn btn-secondary', onclick: () => { resolve(false); sheetHandle.close(); } }, 'Cancelar'),
        el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => { resolve(true); sheetHandle.close(); } }, confirmLabel),
      ]),
    ]);
    const sheetHandle = openSheet(content, { onClose: () => resolve(false) });
  });
}

/* ---------------- Errores de Supabase → mensaje humano ---------------- */

export function humanizeError(err) {
  if (!err) return 'Algo salió mal. Intenta de nuevo.';
  const msg = err.message || String(err);
  // Los mensajes de nuestras funciones Postgres ya están en español claro —
  // Supabase los entrega tal cual dentro de err.message.
  return msg.replace(/^.*?:\s*/, '').trim() || msg;
}
