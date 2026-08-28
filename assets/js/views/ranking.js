import { el, avatarContent, formatFecha } from '../utils.js';
import { getRankingCompleto, getSession, getAjusteNum } from '../api.js';

const CAT_BADGE_CLASS = { A: 'badge-a', B: 'badge-b' };

export async function renderRanking() {
  const [{ fecha, filas }, session, nMueve, minNoches] = await Promise.all([
    getRankingCompleto(), getSession(),
    getAjusteNum('ascenso_descenso_por_semana', 2),
    getAjusteNum('min_noches_para_mover', 3)]);
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

  const promedio = (f) => {
    const n = Number(f.escaleras_counted || 0);
    return n > 0 ? Number(f.rolling_points) / n : 0;
  };

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

    // La tabla se ordena por PROMEDIO por noche, no por suma: si no, subiría
    // el que más veces juega en vez del que mejor juega.
    notaWrap.innerHTML = '';
    const cuantos = nMueve === 1 ? 'el que peor promedia' : `los ${nMueve} que peor promedian`;
    const cuantosArriba = nMueve === 1 ? 'el que mejor promedia' : `los ${nMueve} que mejor promedian`;
    notaWrap.appendChild(el('p', { class: 'text-tiny mb-1' },
      'Te ordena tu PROMEDIO de puntos por noche de tus últimas 6 escaleras, no el total: jugar más veces no te sube de lugar.'));
    notaWrap.appendChild(el('p', { class: 'text-tiny mb-3' }, filtro === 'A'
      ? `Cada domingo baja${nMueve === 1 ? '' : 'n'} a B ${cuantos}, entre quienes ya llevan ${minNoches} noches o más.`
      : `Cada domingo sube${nMueve === 1 ? '' : 'n'} a A ${cuantosArriba}, entre quienes ya llevan ${minNoches} noches o más.`));

    listWrap.innerHTML = '';
    if (dela.length === 0) {
      listWrap.appendChild(el('p', { class: 'text-muted', style: 'padding:12px 0;' }, 'Nadie en esta categoría todavía.'));
      return;
    }
    dela.forEach((f) => {
      const nombre = (f.profiles && f.profiles.full_name) || 'Jugador';
      const esMe = f.player_id === meId;
      const zona = f.zona_limite_side;
      const noches = Number(f.escaleras_counted || 0);
      const provisional = noches < minNoches;
      listWrap.appendChild(el('div', { class: `list-row ${esMe ? 'me' : ''}` }, [
        el('div', { class: 'rank' }, f.rank != null ? `#${f.rank}` : '—'),
        el('div', { class: 'avatar' }, avatarContent(f.profiles || {})),
        el('div', {}, [
          el('div', { class: 'name' }, nombre + (esMe ? ' (tú)' : '')),
          el('div', { class: 'meta' }, [
            el('span', { class: `badge ${CAT_BADGE_CLASS[f.category] || 'badge-neutral'}`, style: 'font-size:10px;padding:2px 8px;' }, `Cat ${f.category}`),
            provisional
              ? el('span', { class: 'badge badge-warning', style: 'font-size:10px;padding:2px 8px;' }, 'Provisional')
              : (zona === 'bottom_a'
                ? el('span', { class: 'badge badge-danger', style: 'font-size:10px;padding:2px 8px;' }, 'Zona de descenso')
                : (zona === 'top_b'
                  ? el('span', { class: 'badge badge-success', style: 'font-size:10px;padding:2px 8px;' }, 'Zona de ascenso')
                  : null)),
          ]),
          el('div', { class: 'text-tiny', style: 'color:var(--text-tertiary);' },
            noches === 0
              ? 'Sin noches en las últimas 8 semanas'
              : `${noches} ${noches === 1 ? 'noche' : 'noches'} · ${Number(f.rolling_points).toFixed(0)} pts en total`),
        ]),
        el('div', { class: 'value' }, promedio(f).toFixed(0)),
      ]));
    });
  }

  draw();
  wrap.appendChild(tabsWrap);
  wrap.appendChild(notaWrap);
  wrap.appendChild(listWrap);
  wrap.appendChild(el('p', { class: 'text-tiny mt-3', style: 'color:var(--text-tertiary);' },
    `El número grande es tu promedio por noche. "Provisional" quiere decir que todavía no llegas a ${minNoches} noches jugadas: no subes ni bajas de categoría hasta entonces. Las noches dejan de contar a las 8 semanas.`));
  return wrap;
}
