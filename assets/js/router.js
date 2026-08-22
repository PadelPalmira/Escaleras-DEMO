const routes = {};
let currentPath = null;
let mountEl = null;
let onNavigate = null;

export function registerRoute(path, renderFn) {
  routes[path] = renderFn;
}

export function initRouter(mountElement, { onNavigateCb } = {}) {
  mountEl = mountElement;
  onNavigate = onNavigateCb;
  window.addEventListener('hashchange', () => render());
  render();
}

export function navigate(path) {
  if (window.location.hash === `#${path}`) { render(); return; }
  window.location.hash = path;
}

export function currentRoute() {
  return currentPath;
}

async function render() {
  const hash = window.location.hash.replace(/^#/, '') || '/inicio';
  const path = hash.split('?')[0];
  currentPath = path;
  const renderFn = routes[path] || routes['/inicio'];
  mountEl.innerHTML = '';
  const loading = document.createElement('div');
  loading.className = 'stack';
  loading.style.paddingTop = '80px';
  loading.innerHTML = '<div class="spinner"></div>';
  mountEl.appendChild(loading);
  if (onNavigate) onNavigate(path);
  try {
    const node = await renderFn();
    mountEl.innerHTML = '';
    if (node) mountEl.appendChild(node);
  } catch (err) {
    console.error(err);
    mountEl.innerHTML = '';
    const errBox = document.createElement('div');
    errBox.className = 'empty-state';
    errBox.innerHTML = `<div class="emoji">😕</div><p>No se pudo cargar esta sección.</p><p class="text-tiny mt-2">${(err && err.message) || ''}</p>`;
    mountEl.appendChild(errBox);
  }
}
