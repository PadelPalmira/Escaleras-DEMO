import { el, initials, formatFecha } from '../utils.js';
import { getRankingCompleto, getSession } from '../api.js';

const CAT_BADGE_CLASS = { A: 'badge-a', B: 'badge-b', limite: 'badge-limite' };

export async function renderRanking() {
  const [{ fecha, filas }, session] = await Promise.all([getRankingCompleto(), getSession()]);
  const meId = session ? session.user.id : null;

  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Ranking'));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, fecha ? `Actualizado al corte del ${formatFecha(fecha)}` : 'Aún no hay ranking calculado.'));

  if (!filas || filas.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, [
      el('div', { class: 'emoji' }, '🏆'),
      el('p', {}, 'Todavía no hay suficientes escaleras jugadas para calcular el ranking.'),
    ]));
    return wrap;
  }

  let filtro = 'todos';
  const tabsWrap = el('div', { class: 'tabs' });
  const listWrap = el('div', { class: 'card' });

  function draw() {
    tabsWrap.innerHTML = '';
    [['todos', 'Todos'], ['A', 'Categoría A'], ['B', 'Categoría B'], ['limite', 'Zona Límite']].forEach(([key, label]) => {
      tabsWrap.appendChild(
        el('button', {
          class: `tab-chip ${filtro === key ? 'active' : ''}`,
          onclick: () => { filtro = key; draw(); },
        }, label)
      );
    });

    const filas2 = filtro === 'todos' ? filas : filas.filter((f) => f.category === filtro);
    listWrap.innerHTML = '';
    if (filas2.length === 0) {
      listWrap.appendChild(el('p', { class: 'text-muted', style: 'padding:12px 0;' }, 'Nadie en esta categoría todavía.'));
    }
    filas2.forEach((f) => {
      const nombre = (f.profiles && f.profiles.full_name) || 'Jugador';
      const esMe = f.player_id === meId;
      listWrap.appendChild(
        el('div', { class: `list-row ${esMe ? 'me' : ''}` }, [
          el('div', { class: 'rank' }, f.rank != null ? `#${f.rank}` : '—'),
          el('div', { class: 'avatar' }, initials(nombre)),
          el('div', {}, [
            el('div', { class: 'name' }, nombre + (esMe ? ' (tú)' : '')),
            el('div', { class: 'meta' }, [
              el('span', { class: `badge ${CAT_BADGE_CLASS[f.category] || 'badge-neutral'}`, style: 'font-size:10px;padding:2px 8px;' }, f.category === 'limite' ? 'Límite' : `Cat ${f.category}`),
            ]),
          ]),
          el('div', { class: 'value' }, Number(f.rolling_points).toFixed(0)),
        ])
      );
    });
  }

  draw();
  wrap.appendChild(tabsWrap);
  wrap.appendChild(listWrap);
  return wrap;
}
