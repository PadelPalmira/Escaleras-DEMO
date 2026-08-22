import { el, toast, humanizeError } from '../utils.js';
import { icon } from '../icons.js';
import { sendMagicLink } from '../api.js';
import { whatsappHelpUrl } from '../config.js';

// Una sola pantalla de entrada — no existe "regístrate" separado de "inicia
// sesión". Con correo + enlace mágico basta: si es la primera vez, Supabase
// crea la cuenta sola; si ya existe, entra directo. Nombre y celular NO se
// piden aquí (se pedían antes, pero eso obligaba a cualquiera que ya tenía
// cuenta a volver a escribirlos cada vez que entraba desde un dispositivo
// nuevo, sin necesidad — esos datos ya viven en su perfil en Supabase). Se
// piden una sola vez, justo después de entrar, en la pantalla obligatoria
// "Completa tu perfil" (views/completar_perfil.js) — y solo si todavía
// faltan, sin importar desde qué dispositivo se conecte.
export function renderLoginScreen() {
  const wrap = el('div', { class: 'login-screen' });

  const logo = el('div', { class: 'login-logo' }, [el('img', { src: 'assets/img/logo-icon-white.png', alt: 'Padel Palmira', class: 'login-logo-img' })]);
  const title = el('div', { class: 'h1' }, ['Escaleras', el('br'), el('span', { class: 'text-gradient' }, 'Padel Palmira')]);
  const sub = el('p', { class: 'text-muted' }, 'Entra con tu correo — te mandamos un enlace mágico, sin contraseñas. Si es tu primera vez, tu cuenta se crea sola.');

  const emailField = el('div', { class: 'field' }, [
    el('label', {}, 'Correo electrónico'),
    el('input', { class: 'input', type: 'email', placeholder: 'tu@correo.com', autocomplete: 'email', id: 'login-email' }),
  ]);

  const btn = el('button', { class: 'btn btn-primary' }, 'Enviar enlace mágico');
  const status = el('div', { class: 'text-tiny mt-3' });
  const helpLink = el('a', { class: 'login-help-link', href: whatsappHelpUrl('Hola, tengo una duda para entrar a la app de Escaleras Palmira 🎾'), target: '_blank', rel: 'noopener' }, [
    el('span', { html: icon.whatsapp }),
    '¿Problemas para entrar? Escríbenos',
  ]);

  btn.addEventListener('click', async () => {
    const emailInput = document.getElementById('login-email');
    const email = (emailInput.value || '').trim();

    if (!email || !email.includes('@')) {
      status.textContent = 'Escribe un correo válido.';
      status.style.color = 'var(--danger)';
      emailInput.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    status.textContent = '';
    try {
      await sendMagicLink(email);
      wrap.replaceChildren(
        logo,
        el('div', { class: 'h1 mb-2' }, 'Revisa tu correo'),
        el('p', { class: 'text-muted' }, [
          'Te enviamos un enlace a ',
          el('strong', {}, email),
          '. Ábrelo desde este mismo dispositivo para entrar.',
        ]),
        el('div', { class: 'card mt-6', style: 'display:flex;gap:12px;align-items:flex-start;' }, [
          el('div', { html: icon.mail, style: 'width:20px;height:20px;color:var(--cyan);flex-shrink:0;margin-top:2px;' }),
          el('p', { class: 'text-tiny' }, 'Si no lo ves en unos minutos, revisa spam o promociones.'),
        ])
      );
    } catch (err) {
      status.textContent = humanizeError(err);
      status.style.color = 'var(--danger)';
      toast('No se pudo enviar el enlace.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Enviar enlace mágico';
    }
  });

  emailField.querySelector('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });

  wrap.append(logo, title, sub, emailField, btn, status, helpLink);
  return wrap;
}
