import { el, escapeHtml } from '../utils.js';
import { getReglas } from '../api.js';
import { icon } from '../icons.js';

// Un ícono por sección — solo decorativo, ayuda a ubicarse rápido al
// hacer scroll por un reglamento que ahora es bastante más largo.
const SECTION_ICON = {
  bienvenida: icon.info,
  formato_de_juego: icon.clock,
  puntos: icon.coin,
  categorias: icon.ranking,
  zona_limite: icon.swap,
  convocatorias: icon.calendar,
  sustitutos: icon.shield,
  liguilla: icon.trophy,
  retas_abiertas: icon.racket,
};

/** Convierte markdown muy simple (encabezados, listas, negritas) a HTML seguro. */
function simpleMarkdownToHtml(md) {
  if (!md) return '';
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { if (inList) { html += '</ul>'; inList = false; } continue; }
    if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      const content = line.replace(/^-\s|^\*\s|^\d+\.\s/, '');
      html += `<li>${inlineFmt(content)}</li>`;
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (line.startsWith('### ')) html += `<h4>${inlineFmt(line.slice(4))}</h4>`;
    else if (line.startsWith('## ')) html += `<h3>${inlineFmt(line.slice(3))}</h3>`;
    else if (line.startsWith('# ')) html += `<h3>${inlineFmt(line.slice(2))}</h3>`;
    else html += `<p>${inlineFmt(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
}
function inlineFmt(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

export async function renderReglas() {
  const secciones = await getReglas();
  const wrap = el('div');
  wrap.appendChild(el('div', { class: 'h1 mb-2' }, 'Reglas'));
  wrap.appendChild(el('p', { class: 'text-muted mb-4' }, 'El reglamento completo del club, explicado a fondo — si eres nuevo, léelo de principio a fin antes de tu primera noche.'));

  if (!secciones || secciones.length === 0) {
    wrap.appendChild(el('div', { class: 'empty-state' }, [el('div', { class: 'emoji' }, '📖'), el('p', {}, 'El reglamento se está preparando.')]));
    return wrap;
  }

  // Navegación rápida: brinca directo a cualquier sección sin tener que
  // hacer scroll manual por las 9 — útil una vez que ya te la sabes y solo
  // quieres consultar un punto puntual.
  const nav = el('div', { class: 'tabs mb-2' });
  secciones.forEach((s) => {
    const chip = el('button', { class: 'tab-chip', type: 'button' }, s.title);
    chip.addEventListener('click', () => {
      document.getElementById(`regla-${s.section_key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    nav.appendChild(chip);
  });
  wrap.appendChild(nav);

  // Ya no es un acordeón — todo el reglamento se lee de corrido en scroll,
  // y cada sección aparece con una animación suave conforme entra en
  // pantalla (ver IntersectionObserver abajo). Un jugador nuevo puede
  // simplemente ir bajando y leer todo, sin tener que ir abriendo tarjetas
  // una por una.
  const sectionsWrap = el('div', { class: 'stack gap-3' });
  secciones.forEach((s) => {
    const card = el('div', { class: 'card reglas-section reveal', id: `regla-${s.section_key}` });
    card.appendChild(
      el('div', { class: 'row gap-3' }, [
        el('span', { class: 'reglas-section-icon', html: SECTION_ICON[s.section_key] || icon.info }),
        el('div', { style: 'font-weight:800;font-size:16px;' }, s.title),
      ])
    );
    const body = el('div', { class: 'text-muted mt-3 reglas-body' });
    body.innerHTML = simpleMarkdownToHtml(s.body_markdown);
    card.appendChild(body);
    sectionsWrap.appendChild(card);
  });
  wrap.appendChild(sectionsWrap);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    sectionsWrap.querySelectorAll('.reveal').forEach((node) => observer.observe(node));
  } else {
    // Sin soporte de IntersectionObserver: mostrar todo directo, sin animar.
    sectionsWrap.querySelectorAll('.reveal').forEach((node) => node.classList.add('reveal-in'));
  }

  return wrap;
}
