/* ============================================================
   LA CONSOLA DE LA DEMO
   ------------------------------------------------------------
   La barra de arriba: quién eres, en qué momento de la semana
   estás, el atajo para llenar marcadores y el botón de reiniciar.
   Nada de esto existe en la app real — es el andamio para poder
   practicar.
   ============================================================ */

import { DEMO, fechaClub, instanteClub, sumarDias, diaSemanaDe } from './estado.js';
import { baseDeDatos, reiniciarDemo, entrarComo, usuarioActual } from './cliente.js';
import * as motor from './motor.js';
import { montarTutorial, refrescarTutorial } from './tutorial.js';

const DIAS_CORTOS = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom' };

/* La primera vez que alguien abre la demo, el reloj se planta el lunes de la
   semana sembrada a las 8:05 pm: la convocatoria ya cerró, hay 12 confirmados
   y la noche está lista para arrancar. Es el punto donde la demo se explica
   sola. */
function plantarReloj() {
  const db = baseDeDatos();
  // Sin sesión la app enseñaría la pantalla de "entra con tu correo", que en
  // la demo no lleva a ningún lado. Se entra solo como un jugador cualquiera
  // y de ahí en adelante se cambia desde la barra.
  if (!usuarioActual()) {
    const yo = db.profiles.find((p) => p.full_name === 'Fernando Velasco')
      || db.profiles.find((p) => p.role === 'jugador');
    if (yo) entrarComo(yo.id);
  }
  if (localStorage.getItem('escaleras_demo_arrancado') === '1') return;
  if (db.__lunes_demo) DEMO.irA(db.__lunes_demo, '20:05');
  try { localStorage.setItem('escaleras_demo_arrancado', '1'); } catch { /* sin guardado */ }
}

function momentosDeLaSemana() {
  const db = baseDeDatos();
  const lunes = db.__lunes_demo || fechaClub(DEMO.ahora());
  const domingo = sumarDias(lunes, -1);
  return [
    { etiqueta: 'Domingo 11:00 am', pista: 'ventana del top 12 abierta', fecha: domingo, hora: '11:00' },
    { etiqueta: 'Domingo 7:00 pm', pista: 'ya cerró: abierto a todos', fecha: domingo, hora: '19:00' },
    { etiqueta: 'Lunes 8:05 pm', pista: 'noche de Individual A', fecha: lunes, hora: '20:05' },
    { etiqueta: 'Miércoles 2:00 pm', pista: '6 h antes: revisar cupo', fecha: sumarDias(lunes, 2), hora: '14:00' },
    { etiqueta: 'Miércoles 8:05 pm', pista: 'noche de Parejas Fijas A', fecha: sumarDias(lunes, 2), hora: '20:05' },
  ];
}

/* ---------- pintado ---------- */

function el(tag, attrs, hijos) {
  const n = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  });
  (Array.isArray(hijos) ? hijos : [hijos]).forEach((h) => {
    if (h === null || h === undefined || h === false) return;
    n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
  });
  return n;
}

let barra = null;

export function montarConsola() {
  plantarReloj();
  if (barra) barra.remove();
  barra = el('div', { class: 'demo-barra', id: 'demo-barra' });
  document.body.appendChild(barra);
  document.body.classList.add('con-demo-barra');
  pintar();
  montarTutorial();
}

function pintar() {
  const db = baseDeDatos();
  const yo = usuarioActual();
  barra.innerHTML = '';

  const fila1 = el('div', { class: 'demo-fila' }, [
    el('span', { class: 'demo-sello' }, 'DEMO'),
    el('span', { class: 'demo-nota' }, 'Datos falsos. No toca la app real.'),
    el('span', { class: 'demo-espacio' }),
    el('button', { class: 'demo-btn demo-btn-ghost', onclick: abrirAyuda }, '¿Qué es esto?'),
    el('button', { class: 'demo-btn demo-btn-ghost', onclick: confirmarReinicio }, 'Reiniciar'),
  ]);

  const selUsuario = el('select', { class: 'demo-select', onclick: (e) => e.stopPropagation(), onchange: (e) => cambiarUsuario(e.target.value) });
  const grupos = [
    ['Dirección (acceso Maestro)', db.profiles.filter((p) => p.role === 'maestro')],
    ['Recepción (acceso Admin)', db.profiles.filter((p) => p.role === 'admin')],
    ['Jugadores', db.profiles.filter((p) => p.role === 'jugador')],
  ];
  grupos.forEach(([titulo, gente]) => {
    if (!gente.length) return;
    const g = el('optgroup', { label: titulo });
    gente.forEach((p) => {
      const cat = motor.categoriaEfectiva(db, p.id);
      const rank = cat ? (motor.rankingVivo(db, cat).find((r) => r.player_id === p.id) || {}).rnk : null;
      const etiqueta = p.role === 'jugador'
        ? `${p.full_name} — Cat ${cat || '?'}${rank ? ` · #${rank}` : ''}`
        : p.full_name;
      const o = el('option', { value: p.id }, etiqueta);
      if (yo && yo.id === p.id) o.selected = true;
      g.appendChild(o);
    });
    selUsuario.appendChild(g);
  });

  const selMomento = el('select', { class: 'demo-select', onchange: (e) => saltarA(Number(e.target.value)) });
  selMomento.appendChild(el('option', { value: '-1' }, momentoActual()));
  momentosDeLaSemana().forEach((m, i) => {
    selMomento.appendChild(el('option', { value: String(i) }, `${m.etiqueta} — ${m.pista}`));
  });

  const fila2 = el('div', { class: 'demo-fila' }, [
    el('div', { class: 'demo-par' }, [el('label', { class: 'demo-etiqueta' }, 'Eres'), selUsuario]),
    el('div', { class: 'demo-par' }, [el('label', { class: 'demo-etiqueta' }, 'Reloj'), selMomento]),
  ]);

  barra.appendChild(fila1);
  barra.appendChild(fila2);
  medirBarra();
}

/* La barra crece o se encoge según el ancho: el alto se mide y se le avisa
   al CSS, para que el contenido de la app nunca quede tapado. */
function medirBarra() {
  requestAnimationFrame(() => {
    if (!barra) return;
    const alto = Math.ceil(barra.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--demo-alto', alto + 'px');
  });
}

function momentoActual() {
  const t = DEMO.ahora();
  const f = fechaClub(t);
  const min = Math.floor((t.getTime() - instanteClub(f, '00:00').getTime()) / 60000);
  const h = Math.floor(min / 60), m = min % 60;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${DIAS_CORTOS[diaSemanaDe(f)]} ${f.slice(8)}/${f.slice(5, 7)} · ${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function saltarA(i) {
  if (i < 0) return;
  const m = momentosDeLaSemana()[i];
  DEMO.irA(m.fecha, m.hora);
  recargarVista();
}

function cambiarUsuario(id) {
  entrarComo(id);
  location.hash = '#/';
  recargarVista();
}

function recargarVista() {
  pintar();
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  setTimeout(refrescarTutorial, 400);
}

/* ---------- reiniciar ---------- */

function confirmarReinicio() {
  abrirHoja('Reiniciar la demo',
    el('div', {}, [
      el('p', {}, 'Se borra todo lo que hayas hecho aquí y el club falso se vuelve a armar desde cero: mismos 32 jugadores, mismas 5 semanas de historial, misma semana por jugar.'),
      el('p', { class: 'demo-p-chica' }, 'La app real no se toca: la demo nunca ha hablado con ella.'),
    ]),
    [
      { texto: 'Cancelar', ghost: true },
      { texto: 'Sí, reiniciar', peligro: true, accion: () => {
        try {
          localStorage.removeItem('escaleras_demo_arrancado');
          localStorage.removeItem('escaleras_demo_tuto_visto');
        } catch { /* sin guardado */ }
        reiniciarDemo();
        location.reload();
      } },
    ]);
}

function abrirAyuda() {
  abrirHoja('Qué es esta demo',
    el('div', {}, [
      el('p', {}, 'Es la app de Escaleras Palmira completa, con un club inventado: 32 jugadores, cinco semanas de noches ya jugadas y la semana en curso lista para practicar.'),
      el('p', {}, el('strong', {}, 'No hay riesgo.') ),
      el('p', { class: 'demo-p-chica' }, 'Esta página no tiene forma de contactar a la app real: no hay internet de por medio. Todo se guarda en este navegador y solo tú lo ves. Si le picas a algo y se descompone, "Reiniciar" lo deja como nuevo.'),
      el('p', {}, el('strong', {}, 'Lo que ves aquí sí es lo que hace la app.')),
      el('p', { class: 'demo-p-chica' }, 'Los emparejamientos, los puntos y las reglas se calcularon con una copia del motor real, y se comprobó contra la base de datos verdadera que dan resultado idéntico ronda por ronda.'),
      el('p', {}, el('strong', {}, 'Con quién entrar')),
      el('p', { class: 'demo-p-chica' }, 'Arriba puedes cambiar de persona cuando quieras: Dirección ve todo, Recepción maneja las noches y los jugadores ven lo suyo. El reloj te mueve al momento de la semana que quieras ver.'),
    ]),
    [{ texto: 'Entendido' }]);
}

/* ---------- hoja de diálogo, con el estilo de la app ---------- */

export function abrirHoja(titulo, contenido, botones) {
  const fondo = el('div', { class: 'demo-fondo', onclick: (e) => { if (e.target === fondo) fondo.remove(); } });
  const hoja = el('div', { class: 'demo-hoja' }, [
    el('h3', {}, titulo),
    contenido,
    el('div', { class: 'demo-hoja-botones' }, (botones || []).map((b) => el('button', {
      class: `demo-btn${b.ghost ? ' demo-btn-ghost' : ''}${b.peligro ? ' demo-btn-peligro' : ''}`,
      onclick: () => { fondo.remove(); if (b.accion) b.accion(); },
    }, b.texto))),
  ]);
  fondo.appendChild(hoja);
  document.body.appendChild(fondo);
  return fondo;
}

montarConsola();
window.__demo = { DEMO, baseDeDatos, reiniciarDemo, entrarComo, recargarVista, abrirHoja };
