/* ============================================================
   TUTORIAL GUIADO
   ------------------------------------------------------------
   Lecciones cortas que se hacen SOBRE la app, no leyendo. Cada
   paso dice qué hacer, y la app sola detecta cuándo ya lo
   hiciste y avanza. No bloquea nada: si te quieres salir del
   guion y explorar, puedes.
   ============================================================ */

import { DEMO, fechaClub } from './estado.js';
import { baseDeDatos, usuarioActual } from './cliente.js';


/* Cada paso tiene:
   texto  — qué hacer, en una frase
   porque — por qué importa (opcional, se muestra más chico)
   listo  — función que devuelve true cuando ya se hizo
   ir     — a dónde llevar al usuario si le pica "Llévame"       */

export const LECCIONES = [
  {
    titulo: 'Lección 1 · Ver la semana como jugador',
    quien: 'jugador',
    intro: 'Empieza por el lado más fácil: lo que ve un socio del club cuando abre la app.',
    pasos: [
      {
        texto: 'Entra como un jugador desde el selector de arriba y abre Convocatorias.',
        porque: 'Es la pantalla que más van a usar: ahí se apartan y se cancelan los lugares.',
        ir: '/convocatorias',
        listo: () => rolActual() === 'jugador' && ruta() === '/convocatorias',
      },
      {
        texto: 'Abre "Cómo se reparten los lugares" y léelo.',
        porque: 'Es la explicación de la ventana del domingo y del reparto 8 / 4 de los lugares. Si un socio pregunta, la respuesta está ahí.',
        listo: () => document.body.innerText.includes('ventana') || abierto('Cómo se reparten'),
      },
      {
        texto: 'Ve a la pestaña Ranking y busca tu nombre.',
        porque: 'El número grande es el PROMEDIO de puntos por noche de sus últimas 6 escaleras, no el total del año: por eso jugar más veces no sube de lugar.',
        ir: '/ranking',
        listo: () => ruta() === '/ranking',
      },
      {
        texto: 'Ahora abre Liguilla.',
        porque: 'Ahí ve cada jugador cuántos puntos le faltan para calificar. Es la pregunta #1 del mes.',
        ir: '/liguilla',
        listo: () => ruta() === '/liguilla',
      },
    ],
  },
  {
    titulo: 'Lección 2 · Correr una noche, ronda por ronda',
    quien: 'admin',
    intro: 'Esta es la lección importante para recepción: capturar los resultados de una noche completa.',
    pasos: [
      {
        texto: 'Cambia el reloj a "Lunes 8:05 pm" y entra como Recepción.',
        porque: 'Es el momento en que la gente ya llegó y hay que arrancar.',
        listo: () => rolActual() !== 'jugador' && esLunesDeNoche(),
      },
      {
        texto: 'En el Inicio, en el bloque de "Hoy", pícale al botón de la noche.',
        porque: 'El Inicio de recepción ya te lleva directo a la noche que toca: no tienes que buscarla.',
        ir: '/',
        listo: () => ruta().startsWith('/admin/escaleras') && /qui[eé]n va/i.test(document.body.innerText),
      },
      {
        texto: 'Revisa arriba cuántos van: tiene que decir 12 de 12.',
        porque: 'La escalera solo arranca con el cupo lleno. Si faltan, puedes agregar con "+ Agregar" a quien haya llegado, o cancelar la noche.',
        listo: () => /12\s*\/\s*12/.test(document.body.innerText) || rondasDeLaVista() >= 1,
      },
      {
        texto: 'Pícale a "Comenzar escalera" y confirma.',
        porque: 'Ese botón es el que cierra la convocatoria: hasta ese momento la gente se puede seguir anotando en la puerta. Al confirmar, la app reparte a los 12 en las 3 canchas.',
        listo: () => rondasDeLaVista() >= 1,
      },
      {
        texto: 'Captura el marcador de los 3 partidos de la ronda 1.',
        porque: 'Puedes usar el botón gris de la demo para llenarlos de golpe. En la app real se teclean.',
        listo: () => rondaCompleta(1),
      },
      {
        texto: 'Pícale a "Generar siguiente ronda" y fíjate bien en la ronda 2.',
        porque: 'Aquí está el corazón del formato: el que ganó subió de cancha con su compañero, y ahora ese compañero le toca de RIVAL. Ese emparejamiento no se puede saber antes: la app lo calcula con los resultados que acabas de capturar.',
        listo: () => rondasDeLaVista() >= 2,
      },
      {
        texto: 'Sigue capturando y generando hasta llegar a la ronda 7.',
        porque: 'Nunca te repite compañero dos rondas seguidas. Y en la 7 se acaba: la app ya no deja generar más.',
        listo: () => rondasDeLaVista() >= 7,
      },
      {
        texto: 'Cierra la noche.',
        porque: 'Ahí se reparten los bonos de posición final (10 / 5 / 0 según la cancha donde acabaron) y la noche entra al ranking. Esto no se puede deshacer.',
        listo: () => document.body.innerText.includes('ya está cerrada'),
      },
      {
        texto: 'Vuelve a Ranking y mira cómo se movió la tabla.',
        ir: '/ranking',
        listo: () => ruta() === '/ranking',
      },
    ],
  },
  {
    titulo: 'Lección 3 · Bajas, sustitutos y la lista de espera',
    quien: 'mixto',
    intro: 'Lo que más te van a preguntar en mostrador. Aquí se ve exactamente qué contesta la app.',
    pasos: [
      {
        texto: 'Entra como un jugador que tenga lugar y abre Convocatorias.',
        ir: '/convocatorias',
        listo: () => rolActual() === 'jugador' && ruta() === '/convocatorias',
      },
      {
        texto: 'Pícale a "Darme de baja" en una noche — pero NO confirmes todavía.',
        porque: 'Antes de confirmar, la app dice exactamente qué va a pasar: si hay penalización, de cuánto, y si arrastra a la pareja. Nunca es sorpresa.',
        listo: () => document.body.innerText.includes('penalización') || document.body.innerText.includes('penalizacion'),
      },
      {
        texto: 'Cancela ese diálogo y prueba "Buscar sustituto" en una noche de Individual.',
        porque: 'Dejar sustituto nunca tiene penalización. Los puntos se reparten 66% al ausente y 34% al sustituto.',
        listo: () => document.body.innerText.includes('sustituto'),
      },
      {
        texto: 'Cambia a Recepción y entra a Admin → Jugadores.',
        ir: '/admin/jugadores',
        listo: () => rolActual() !== 'jugador' && ruta().startsWith('/admin/jugadores'),
      },
      {
        texto: 'Busca a un jugador y mira sus opciones: sustituto, no-show, multa y suspensión.',
        porque: 'El sustituto "autorizado por administración" es el único que no reparte puntos y el único que funciona en Parejas Fijas. Es para emergencias de verdad.',
        listo: () => document.body.innerText.includes('No-show') || document.body.innerText.includes('Multa'),
      },
    ],
  },
  {
    titulo: 'Lección 4 · Cuando no se llena el cupo',
    quien: 'admin',
    intro: 'Regla del club: o se completan los 12, o no hay escalera. Esto es lo que tienes que hacer.',
    pasos: [
      {
        texto: 'Pon el reloj en "Miércoles 2:00 pm" (6 h antes del evento).',
        porque: 'La app solo te avisa cuando ya falta poco: antes de eso le da chance a la lista de espera.',
        listo: () => esMiercolesTarde(),
      },
      {
        texto: 'Entra como Recepción y abre la noche del miércoles.',
        ir: '/',
        listo: () => rolActual() !== 'jugador' && ruta().startsWith('/admin/escaleras'),
      },
      {
        texto: 'Fíjate que "Comenzar escalera" está apagado y dice cuántos faltan.',
        porque: 'Se juega de 4 en 4: con 10 no se pueden armar las canchas. No es que la app sea necia, es que no hay forma.',
        listo: () => /faltan/i.test(document.body.innerText),
      },
      {
        texto: 'Prueba "+ Agregar" y mete a alguien que haya llegado.',
        porque: 'Si alguien llega sin haberse anotado, tú lo metes desde aquí. Antes no se podía y era un problema real.',
        listo: () => /agregar a la noche/i.test(document.body.innerText) || /qui[eé]n va/i.test(document.body.innerText),
      },
      {
        texto: 'Si de plano no se completa, dale "Cancelar la noche".',
        porque: 'Nadie recibe penalización ni pierde puntos, y la app les avisa sola. Lo que se organice después ya es cosa de ustedes con los jugadores: no da puntos ni entra al ranking.',
        listo: () => /cancelar la noche/i.test(document.body.innerText),
      },
    ],
  },
  {
    titulo: 'Lección 5 · El domingo: quién sube y quién baja',
    quien: 'mixto',
    intro: 'Cada domingo a las 9 de la mañana el sistema mueve las categorías. Aquí lo ves pasar.',
    pasos: [
      {
        texto: 'Abre Ranking y fíjate quiénes están en zona de descenso y en zona de ascenso.',
        porque: 'Los últimos de A bajan y los primeros de B suben. Solo esos: nadie más se mueve.',
        ir: '/ranking',
        listo: () => ruta() === '/ranking',
      },
      {
        texto: 'Ahora pon el reloj en "Domingo que viene 9:05 am".',
        porque: 'Es el momento exacto en que el sistema recalcula. En la app real lo hace solo, sin que nadie lo dispare.',
        listo: () => esDomingoDeCorte(),
      },
      {
        texto: 'Vuelve a Ranking y compara: cambiaron dos de cada lado.',
        porque: 'Antes se volvía a partir el club a la mitad cada domingo y cambiaba casi un tercio de la gente. Ahora es un tope duro de 2 y 2.',
        ir: '/ranking',
        listo: () => ruta() === '/ranking',
      },
    ],
  },
  {
    titulo: 'Lección 6 · Lo que solo ve Dirección',
    quien: 'maestro',
    intro: 'La cuenta Maestro. Es la tuya, y nadie más la debe tener.',
    pasos: [
      {
        texto: 'Entra como "Dirección del club" y abre Maestro.',
        ir: '/maestro',
        listo: () => rolActual() === 'maestro' && ruta().startsWith('/maestro'),
      },
      {
        texto: 'Mira los horarios de la semana: día, formato, categoría, cupo y canchas.',
        porque: 'Ojo: el CUPO se lee en vivo y afecta convocatorias ya publicadas, pero las CANCHAS se copian al crear cada noche, así que solo aplican a semanas futuras.',
        listo: () => document.body.innerText.includes('Horario') || document.body.innerText.includes('lunes'),
      },
      {
        texto: 'Baja a Configuración y busca "puntos_por_game".',
        porque: 'Cambiar la fórmula NO recalcula hacia atrás. Durante 6 escaleras el ranking mezclaría dos fórmulas. El mejor momento para tocarla es el primer día del mes, después de la Liguilla.',
        listo: () => document.body.innerText.includes('puntos_por_game'),
      },
      {
        texto: 'Prueba a hacer Admin a un jugador y luego quítaselo.',
        porque: 'Así das de alta a un recepcionista nuevo. Maestro solo tú.',
        listo: () => document.body.innerText.includes('Admin'),
      },
    ],
  },
];

/* ---------- estado del tutorial ---------- */

function rolActual() {
  const u = usuarioActual();
  return u ? u.role : null;
}
function ruta() { return (location.hash || '#/').slice(1) || '/'; }
function abierto(txt) { return document.body.innerText.includes(txt); }

function esLunesDeNoche() {
  const db = baseDeDatos();
  const f = fechaClub(DEMO.ahora());
  return f === db.__lunes_demo && DEMO.ahora().getUTCHours() >= 1;
}
// El domingo que cierra la semana sembrada: es cuando corre el recalculo.
function esDomingoDeCorte() {
  const db = baseDeDatos();
  if (!db.__lunes_demo) return false;
  const d = new Date(db.__lunes_demo + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return fechaClub(DEMO.ahora()) >= d.toISOString().slice(0, 10);
}

function esMiercolesTarde() {
  const db = baseDeDatos();
  const f = fechaClub(DEMO.ahora());
  if (!db.__lunes_demo) return false;
  const mie = new Date(db.__lunes_demo + 'T12:00:00Z');
  mie.setUTCDate(mie.getUTCDate() + 2);
  return f === mie.toISOString().slice(0, 10);
}

function escaleraVista() {
  const db = baseDeDatos();
  return window.__demoEscaleraVista
    || (db.escaleras.find((e) => e.status === 'in_progress') || {}).id || null;
}
function rondasDeLaVista() {
  const db = baseDeDatos();
  const id = escaleraVista();
  return id ? db.rounds.filter((r) => r.escalera_id === id).length : 0;
}
function rondaCompleta(n) {
  const db = baseDeDatos();
  const id = escaleraVista();
  if (!id) return false;
  const rd = db.rounds.find((r) => r.escalera_id === id && r.round_number === n);
  if (!rd) return false;
  return db.round_matches.filter((m) => m.round_id === rd.id).every((m) => m.status === 'completed');
}

/* ---------- interfaz ---------- */

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

let panel = null;
let observador = null;

export function montarTutorial() {
  // En celular el panel abierto taparia media pantalla en el primer vistazo,
  // asi que arranca como pastilla. En pantalla grande cabe abierto.
  if (DEMO.leccion == null && !localStorage.getItem('escaleras_demo_tuto_visto')) {
    DEMO.tutorialCerrado = window.innerWidth < 640;
    try { localStorage.setItem('escaleras_demo_tuto_visto', '1'); } catch { /* sin guardado */ }
    DEMO.persistir();
  }
  if (panel) panel.remove();
  panel = el('div', { class: 'demo-tuto', id: 'demo-tuto' });
  document.body.appendChild(panel);
  pintarTutorial();

  // La app repinta sola al navegar; el tutorial se vuelve a evaluar cuando
  // eso pasa, para poder marcar los pasos que ya se cumplieron.
  if (!observador) {
    observador = new MutationObserver(() => {
      clearTimeout(observador.__t);
      observador.__t = setTimeout(() => { avanzarSiProcede(); inyectarAtajo(); }, 250);
    });
    const app = document.getElementById('app');
    if (app) observador.observe(app, { childList: true, subtree: true });
    window.addEventListener('hashchange', () => setTimeout(() => { avanzarSiProcede(); inyectarAtajo(); }, 350));
  }
}

export function refrescarTutorial() { avanzarSiProcede(); pintarTutorial(); inyectarAtajo(); }

function avanzarSiProcede() {
  if (DEMO.leccion == null) return;
  const lec = LECCIONES[DEMO.leccion];
  if (!lec) return;
  let movido = false;
  while (DEMO.paso < lec.pasos.length && seguro(lec.pasos[DEMO.paso].listo)) {
    DEMO.paso += 1;
    movido = true;
  }
  if (movido) { DEMO.persistir(); pintarTutorial(); }
}

function seguro(fn) { try { return !!fn(); } catch { return false; } }

function pintarTutorial() {
  if (!panel) return;
  panel.innerHTML = '';
  panel.classList.toggle('cerrado', DEMO.tutorialCerrado);
  ponerFondo(!DEMO.tutorialCerrado && window.innerWidth < 640);

  if (DEMO.tutorialCerrado) {
    const lec = DEMO.leccion == null ? null : LECCIONES[DEMO.leccion];
    panel.appendChild(el('button', { class: 'demo-tuto-abrir', onclick: () => {
      DEMO.tutorialCerrado = false; DEMO.persistir(); pintarTutorial();
    } }, lec ? `Tutorial · paso ${Math.min(DEMO.paso + 1, lec.pasos.length)}/${lec.pasos.length}` : 'Tutorial · 6 lecciones'));
    return;
  }

  const cabeza = el('div', { class: 'demo-tuto-cabeza' }, [
    el('strong', {}, DEMO.leccion == null ? 'Tutorial' : LECCIONES[DEMO.leccion].titulo),
    el('button', { class: 'demo-tuto-x', title: 'Ocultar', onclick: () => {
      DEMO.tutorialCerrado = true; DEMO.persistir(); pintarTutorial();
    } }, '×'),
  ]);
  panel.appendChild(cabeza);

  if (DEMO.leccion == null) {
    panel.appendChild(el('p', { class: 'demo-tuto-intro' },
      'Seis lecciones cortas. Se hacen sobre la app: cada paso se marca solo cuando lo haces.'));
    const lista = el('div', { class: 'demo-tuto-lista' });
    LECCIONES.forEach((l, i) => {
      lista.appendChild(el('button', { class: 'demo-tuto-item', onclick: () => empezar(i) }, [
        el('span', { class: 'demo-tuto-num' }, String(i + 1)),
        el('span', {}, l.titulo.replace(/^Lección \d+ · /, '')),
      ]));
    });
    panel.appendChild(lista);
    return;
  }

  const lec = LECCIONES[DEMO.leccion];
  const terminada = DEMO.paso >= lec.pasos.length;

  if (terminada) {
    panel.appendChild(el('p', { class: 'demo-tuto-ok' }, '✓ Lección terminada.'));
    panel.appendChild(el('div', { class: 'demo-tuto-pies' }, [
      DEMO.leccion + 1 < LECCIONES.length
        ? el('button', { class: 'demo-btn', onclick: () => empezar(DEMO.leccion + 1) }, 'Siguiente lección')
        : el('span', { class: 'demo-tuto-intro' }, 'Ya viste las cinco. Explora libremente.'),
      el('button', { class: 'demo-btn demo-btn-ghost', onclick: alMenu }, 'Menú'),
    ]));
    return;
  }

  panel.appendChild(el('p', { class: 'demo-tuto-intro' }, lec.intro));

  const pasos = el('ol', { class: 'demo-tuto-pasos' });
  lec.pasos.forEach((p, i) => {
    const estado = i < DEMO.paso ? 'hecho' : (i === DEMO.paso ? 'ahora' : 'pendiente');
    const li = el('li', { class: `demo-tuto-paso ${estado}` }, [
      el('div', {}, p.texto),
      i === DEMO.paso && p.porque ? el('div', { class: 'demo-tuto-porque' }, p.porque) : null,
    ]);
    pasos.appendChild(li);
  });
  panel.appendChild(pasos);

  const actual = lec.pasos[DEMO.paso];
  panel.appendChild(el('div', { class: 'demo-tuto-pies' }, [
    actual.ir ? el('button', { class: 'demo-btn', onclick: () => { location.hash = '#' + actual.ir; } }, 'Llévame ahí') : null,
    el('button', { class: 'demo-btn demo-btn-ghost', onclick: () => { DEMO.paso += 1; DEMO.persistir(); pintarTutorial(); } }, 'Saltar paso'),
    el('button', { class: 'demo-btn demo-btn-ghost', onclick: alMenu }, 'Menú'),
  ]));
}

/* En celular el panel abierto tapa la app; el fondo deja claro que está
   encima y permite cerrarlo tocando fuera, como cualquier hoja de la app. */
let fondo = null;
function ponerFondo(mostrar) {
  if (mostrar && !fondo) {
    fondo = el('div', { class: 'demo-tuto-fondo', onclick: () => {
      DEMO.tutorialCerrado = true; DEMO.persistir(); pintarTutorial();
    } });
    document.body.appendChild(fondo);
  } else if (!mostrar && fondo) {
    fondo.remove(); fondo = null;
  }
}

function empezar(i) {
  DEMO.leccion = i; DEMO.paso = 0; DEMO.tutorialCerrado = false; DEMO.persistir();
  avanzarSiProcede(); pintarTutorial();
}
function alMenu() { DEMO.leccion = null; DEMO.paso = 0; DEMO.persistir(); pintarTutorial(); }

/* ============================================================
   Atajo de captura (solo demo)
   ------------------------------------------------------------
   Se inyecta junto al aviso de "faltan N partidos por capturar"
   para poder recorrer una noche completa sin teclear 21 marcadores.
   En la app real no existe: el Admin captura lo que pasó en cancha.
   ============================================================ */

function inyectarAtajo() {
  const app = document.getElementById('app');
  if (!app) return;
  const previo = app.querySelector('.demo-atajo');
  const aviso = [...app.querySelectorAll('p')].find(
    (p) => /por capturar en la ronda/i.test(p.textContent || ''));
  if (!aviso) { if (previo) previo.remove(); return; }
  if (previo && previo.previousElementSibling === aviso) return;
  if (previo) previo.remove();

  const boton = el('button', { class: 'btn btn-secondary demo-atajo', onclick: llenarRonda },
    'Llenar marcadores al azar (atajo de la demo)');
  aviso.insertAdjacentElement('afterend', boton);
}

/* Llena los marcadores MANEJANDO LA APP, no por debajo: abre la hoja de
   captura de cada partido pendiente, escribe los games y le da Guardar. Así
   la pantalla se refresca sola igual que cuando lo hace una persona, y el
   atajo prueba de verdad el mismo camino que usa recepción. */
async function llenarRonda(ev) {
  const boton = ev.currentTarget;
  boton.disabled = true;
  boton.textContent = 'Llenando…';

  for (let i = 0; i < 6; i++) {
    const app = document.getElementById('app');
    const botones = [...app.querySelectorAll('button')]
      .filter((b) => b.textContent.trim() === 'Capturar resultado');
    if (!botones.length) break;
    botones[0].click();
    await esperar(180);

    const hoja = document.querySelector('.sheet');
    if (!hoja) break;
    const campos = [...hoja.querySelectorAll('input[type="number"]')];
    const sets = setsAlAzar();
    sets.slice(0, campos.length / 2).forEach((s, k) => {
      escribir(campos[k * 2], s.team1);
      escribir(campos[k * 2 + 1], s.team2);
    });
    const guardar = [...hoja.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Guardar marcador');
    if (!guardar) break;
    guardar.click();
    await esperar(420);
  }
  setTimeout(() => { refrescarTutorial(); inyectarAtajo(); }, 350);
}

function escribir(input, valor) {
  if (!input) return;
  input.value = String(valor);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function esperar(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* Un marcador cualquiera: 2-0 o 2-1 con súper muerte. */
// Un parcial de 15 minutos, que es lo que se captura en una escalera.
function setsAlAzar() {
  const gana1 = Math.random() < 0.5;
  const alto = 4 + Math.floor(Math.random() * 3);            // 4, 5 o 6
  const bajo = Math.max(0, alto - 1 - Math.floor(Math.random() * 4));
  return [gana1 ? { team1: alto, team2: bajo } : { team1: bajo, team2: alto }];
}


