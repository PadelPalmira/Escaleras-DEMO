import { supabase } from './supabaseClient.js';
import { el, qs } from './utils.js';
import { icon } from './icons.js';
import { whatsappHelpUrl } from './config.js';
import { registerRoute, initRouter, navigate, currentRoute } from './router.js';
import { getMyProfile, esAdminOMaestro } from './api.js';
import { renderLoginScreen } from './views/login.js';
import { renderCompletarPerfil } from './views/completar_perfil.js';
import { renderGuiaApp } from './views/guia_app.js';
import { renderHome } from './views/home.js';
import { renderRanking } from './views/ranking.js';
import { renderConvocatorias } from './views/convocatorias.js';
import { renderReglas } from './views/reglas.js';
import { renderPerfil } from './views/perfil.js';
import { renderLiguilla } from './views/liguilla.js';
import { renderAdmin } from './views/admin.js';
import { renderAdminEscaleras } from './views/admin_escaleras.js';
import { renderAdminLiguilla } from './views/admin_liguilla.js';
import { renderAdminJugadores } from './views/admin_jugadores.js';
import { renderMaestro } from './views/maestro.js';

// La Liguilla tiene pestaña propia porque es la meta del mes para todos:
// ahí se ve cuándo es, quién va calificado y cuántos puntos te faltan. Las
// Reglas se mueven a Perfil (se leen una vez, no todos los días) para que la
// barra no se sature — el reglamento sigue completo, solo cambia de puerta.
const NAV_ITEMS_BASE = [
  { path: '/inicio', label: 'Inicio', icon: icon.home },
  { path: '/ranking', label: 'Ranking', icon: icon.ranking },
  { path: '/convocatorias', label: 'Convocatorias', icon: icon.calendar },
  { path: '/liguilla', label: 'Liguilla', icon: icon.trophy },
  { path: '/perfil', label: 'Perfil', icon: icon.user },
];
const NAV_ITEM_ADMIN = { path: '/admin', label: 'Admin', icon: icon.shield };

let appEl, headerEl, viewEl, navEl;

function buildShell(navItems) {
  appEl = document.getElementById('app');
  appEl.innerHTML = '';

  headerEl = el('header', { class: 'app-header' }, [
    el('div', { class: 'brand' }, [
      el('img', { class: 'brand-logo', src: 'assets/img/logo-icon-white.png', alt: '' }),
      'Escaleras Palmira',
    ]),
    el('div', { class: 'header-actions' }, [
      el('a', {
        class: 'help-btn', href: whatsappHelpUrl(), target: '_blank', rel: 'noopener',
        title: 'Ayuda por WhatsApp', 'aria-label': 'Ayuda por WhatsApp',
      }, [el('span', { html: icon.whatsapp })]),
    ]),
  ]);

  viewEl = el('main', { id: 'view' });

  // Con la pestaña de Admin son 6 botones y "Convocatorias" ya no cabe a
  // tamaño normal en un teléfono angosto: la clase compacta baja la
  // tipografía lo justo para que ninguna etiqueta se corte.
  navEl = el('nav', { class: `bottom-nav${navItems.length >= 6 ? ' bottom-nav-compact' : ''}` });
  navItems.forEach((item) => {
    const btn = el('button', {
      class: 'nav-item',
      onclick: () => navigate(item.path),
    }, [el('span', { html: item.icon }), el('span', {}, item.label)]);
    btn.dataset.path = item.path;
    navEl.appendChild(btn);
  });

  appEl.append(headerEl, viewEl, navEl);
}

function updateActiveNav(path) {
  Array.from(navEl.children).forEach((btn) => {
    // /admin/* y /maestro también resaltan el tab "Admin".
    const active = path === btn.dataset.path || (btn.dataset.path === '/admin' && (path.startsWith('/admin') || path === '/maestro'));
    btn.classList.toggle('active', active);
  });
}

function showLoginScreen() {
  appEl.innerHTML = '';
  appEl.appendChild(renderLoginScreen());
}

async function showApp() {
  // El rol determina si se muestra el tab de Admin — la app nunca confía
  // solo en esto para permisos reales: cada RPC/tabla lo vuelve a exigir
  // en el servidor (RLS + guardas internas). Esto es solo la interfaz.
  let profile = null;
  try { profile = await getMyProfile(); } catch (err) { console.error('No se pudo cargar el perfil para la navegación:', err); }

  // Nombre completo y celular son obligatorios (además del correo, que ya
  // viene de la cuenta) — si faltan, bloqueamos el resto de la app hasta
  // completarlos (y de paso, dentro de esa misma pantalla, también se pide
  // el nivel de juego — ver completar_perfil.js). Cubre tanto cuentas
  // nuevas como perfiles viejos que se crearon antes de que estos campos
  // fueran requeridos. A propósito NO se revalida `declared_level` aquí
  // para cuentas que ya tenían el perfil completo antes de que existiera
  // este campo (p.ej. el Maestro) — obligarlas a declarar un nivel
  // retroactivamente repetiría el mismo bug de "pedir datos de nuevo a
  // cuentas viejas" que ya se corrigió una vez.
  if (profile && (!profile.full_name?.trim() || !profile.phone?.trim())) {
    appEl.innerHTML = '';
    appEl.appendChild(renderCompletarPerfil(profile, (updatedProfile, recomendacion) => {
      // Justo después de completar el perfil, un jugador nuevo ve la guía
      // rápida de la app (con su recomendación de nivel ya integrada) antes
      // de entrar — es la única vez que la va a ver.
      appEl.innerHTML = '';
      appEl.appendChild(renderGuiaApp({ profile: updatedProfile, recomendacion, esNuevo: true, onDone: () => showApp() }));
    }));
    return;
  }

  // Un jugador que ya tenía cuenta de antes de que esta guía existiera la ve
  // una sola vez, la primera vez que entra tras esta actualización — para
  // que entienda qué cambió (sobre todo el nuevo sistema de convocatorias y
  // de cancha 1) sin tener que descubrirlo jugando.
  if (profile && !profile.app_guide_seen_at) {
    appEl.innerHTML = '';
    appEl.appendChild(renderGuiaApp({ profile, recomendacion: null, esNuevo: false, onDone: () => showApp() }));
    return;
  }

  const navItems = esAdminOMaestro(profile) ? [...NAV_ITEMS_BASE, NAV_ITEM_ADMIN] : NAV_ITEMS_BASE;

  buildShell(navItems);
  registerRoute('/inicio', renderHome);
  registerRoute('/ranking', renderRanking);
  registerRoute('/convocatorias', renderConvocatorias);
  registerRoute('/reglas', renderReglas);
  registerRoute('/perfil', renderPerfil);
  registerRoute('/liguilla', renderLiguilla);
  registerRoute('/admin', renderAdmin);
  registerRoute('/admin/escaleras', renderAdminEscaleras);
  registerRoute('/admin/liguilla', renderAdminLiguilla);
  registerRoute('/admin/jugadores', renderAdminJugadores);
  registerRoute('/maestro', renderMaestro);
  initRouter(viewEl, { onNavigateCb: updateActiveNav });
}

async function boot() {
  appEl = document.getElementById('app');
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    await showApp();
  } else {
    showLoginScreen();
  }

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && !appEl.querySelector('.bottom-nav')) {
      showApp();
    } else if (event === 'SIGNED_OUT') {
      showLoginScreen();
    }
  });
}

boot();
