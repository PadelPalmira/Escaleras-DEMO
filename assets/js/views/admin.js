import { el } from '../utils.js';
import { icon } from '../icons.js';
import { getMyProfile, esAdminOMaestro, esMaestro } from '../api.js';
import { navigate } from '../router.js';

function menuCard({ titulo, descripcion, iconoSvg, path }) {
  return el('div', { class: 'card mt-4 card-tappable', onclick: () => navigate(path) }, [
    el('div', { class: 'row-between' }, [
      el('div', { class: 'row gap-3' }, [
        el('span', { html: iconoSvg, style: 'width:22px;height:22px;color:var(--cyan);flex-shrink:0;' }),
        el('div', { style: 'font-weight:700;font-size:15px;' }, titulo),
      ]),
      el('span', { html: icon.chevronRight, style: 'width:18px;height:18px;color:var(--text-tertiary);' }),
    ]),
    el('p', { class: 'text-tiny mt-2' }, descripcion),
  ]);
}

export async function renderAdmin() {
  const profile = await getMyProfile();
  if (!esAdminOMaestro(profile)) {
    return el('div', { class: 'empty-state' }, [
      el('div', { class: 'emoji' }, '🔒'),
      el('p', {}, 'No tienes permiso para ver esta sección.'),
    ]);
  }

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Admin'));
  wrap.appendChild(el('p', { class: 'text-muted' }, 'Captura resultados, gestiona jugadores y la Liguilla.'));

  wrap.appendChild(menuCard({
    titulo: 'Resultados de escaleras',
    descripcion: 'Captura marcadores ronda por ronda, genera la siguiente ronda y cierra la noche.',
    iconoSvg: icon.racket,
    path: '/admin/escaleras',
  }));
  wrap.appendChild(menuCard({
    titulo: 'Liguilla / Torneo de Ascenso',
    descripcion: 'Crea el evento del mes, califica jugadores, arranca el draft y captura el bracket.',
    iconoSvg: icon.trophy,
    path: '/admin/liguilla',
  }));
  wrap.appendChild(menuCard({
    titulo: 'Jugadores',
    descripcion: 'Busca a un jugador para asignar sustituto, aplicar una multa o una suspensión.',
    iconoSvg: icon.user,
    path: '/admin/jugadores',
  }));

  if (esMaestro(profile)) {
    wrap.appendChild(el('div', { class: 'section-title' }, 'Solo Maestro'));
    wrap.appendChild(menuCard({
      titulo: 'Configuración del sistema',
      descripcion: 'Fórmula de puntos, horarios, categorías y quién es Admin.',
      iconoSvg: icon.settings,
      path: '/maestro',
    }));
  }

  return wrap;
}
