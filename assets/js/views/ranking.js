import { el, initials, formatFecha } from '../utils.js';
import { getRankingCompleto, getSession, getAjusteNum } from '../api.js';

const CAT_BADGE_CLASS = { A: 'badge-a', B: 'badge-b' };

export async function renderRanking() {
  const [{ fecha, filas }, session, nMueve] = await Promise.all([
    getRankingCompleto(), getSession(), getAjusteNum('ascenso_descenso_por_semana', 2)]);
  const meId = session ? session.user.id : null;

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Ranking'));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' },
    fecha ? `Actualizado al corte del ${formatFecha(fecha)}` : 'Aún no hay ranking calculado.'));

  if (!filas || filas.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'emoji' }, '🏆'),
      el('p', {}, 'Todavía no hay suficientes escaleras jugadas para calcular el ranking.'),
    ]));
    return wrap;
  }

  // El ranking es POR CATEGORÍA: dentro de A compites contra los de A. Se
  // abre en la categoría de quien está viendo, que es la que le importa.
  const mia = (filas.find((f) => f.player_id === meId) || {}).category;
  let filtro = mia === 'B' ? 'B' : 'A';

  const tabsWrap = el('div', { class: 'tabs' });
  const listWrap = el('div', { class: 'card' });
  const notaWrap = el('div');

  function draw() {
    tabsWrap.innerHTML = '';
    [['A', 'Categoría A'], ['B', 'Categoría B']].forEach(([key, label]) => {
      tabsWrap.appendChild(el('button', {
        class: `tab-chip ${filtro === key ? 'active' : ''}`,
        onclick: () => { filtro = key; draw(); },
      }, label));
    });

    const dela = filas
      .filter((f) => f.category === filtro)
      .sort((a, b) => (a.rank || 999) - (b.rank || 999));

    notaWrap.innerHTML = '';
    const cuantos = nMueve === 1 ? 'el último' : `los ${nMueve} últimos`;
    const cuantosArriba = nMueve === 1 ? 'el primero' : `los ${nMueve} primeros`;
    notaWrap.appendChild(el('p', { class: 'text-tiny mb-3' }, filtro === 'A'
      ? `Cada domingo baja${nMueve === 1 ? '' : 'n'} a B ${cuantos} de esta tabla.`
      : `Cada domingo sube${nMueve === 1 ? '' : 'n'} a A ${cuantosArriba} de esta tabla.`));

    listWrap.innerHTML = '';
    if (dela.length === 0) {
      listWrap.appendChild(el('p', { class: 'text-muted', style: 'padding:12px 0;' }, 'Nadie en esta categoría todavía.'));
      return;
    }
    dela.forEach((f) => {
      const nombre = (f.profiles && f.profiles.full_name) || 'Jugador';
      const esMe = f.player_id === meId;
      const zona = f.zona_limite_side;
      listWrap.appendChild(el('div', { class: `list-row ${esMe ? 'me' : ''}` }, [
        el('div', { class: 'rank' }, f.rank != null ? `#${f.rank}` : '—'),
        el('div', { class: 'avatar' }, initials(nombre)),
        el('div', {}, [
          el('div', { class: 'name' }, nombre + (esMe ? ' (tú)' : '')),
          el('div', { class: 'meta' }, [
            el('span', { class: `badge ${CAT_BADGE_CLASS[f.category] || 'badge-neutral'}`, style: 'font-size:10px;padding:2px 8px;' }, `Cat ${f.category}`),
            zona === 'bottom_a'
              ? el('span', { class: 'badge badge-danger', style: 'font-size:10px;padding:2px 8px;' }, 'Zona de descenso')
              : (zona === 'top_b'
                ? el('span', { class: 'badge badge-success', style: 'font-size:10px;padding:2px 8px;' }, 'Zona de ascenso')
                : null),
          ]),
        ]),
        el('div', { class: 'value' }, Number(f.rolling_points).toFixed(0)),
      ]));
    });
  }

  draw();
  wrap.appendChild(tabsWrap);
  wrap.appendChild(notaWrap);
  wrap.appendChild(listWrap);
  return wrap;
}
