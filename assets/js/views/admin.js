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
  wrap.appendChild(el('p', { class: 'text-muted' }, 'Todo lo del club en un solo lugar.'));

  wrap.appendChild(menuCard({
    titulo: 'Noches del club',
    descripcion: 'Quién se anotó, comenzar la noche, capturar los marcadores y cerrarla.',
    iconoSvg: icon.racket,
    path: '/admin/escaleras',
  }));
  wrap.appendChild(menuCard({
    titulo: 'Liguilla del mes',
    descripcion: 'Calificados, draft y el cuadro del torneo.',
    iconoSvg: icon.trophy,
    path: '/admin/liguilla',
  }));
  wrap.appendChild(menuCard({
    titulo: 'Jugadores',
    descripcion: 'Busca a alguien para ponerle sustituto, una multa o una suspensión.',
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
