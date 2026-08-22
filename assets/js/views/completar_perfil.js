import { el, toast, humanizeError } from '../utils.js';
import { updateMyProfile, getWeekdayScheduleAll } from '../api.js';
import { NIVELES, recomendacionPorNivel, textoDia } from '../niveles.js';

/**
 * Pantalla obligatoria que bloquea el resto de la app hasta que el perfil
 * tenga nombre completo, celular y nivel de juego (el correo ya viene de la
 * cuenta). Se muestra tanto a cuentas nuevas (por si el enlace mágico se
 * generó sin metadata, p.ej. reenviado desde otro flujo) como a cuentas que
 * ya existían de antes de que estos campos fueran obligatorios.
 *
 * El nivel es lo que nos deja recomendarle de inmediato a qué convocatoria
 * entrar — antes de que tenga un solo partido jugado en el sistema. La
 * recomendación se recalcula en vivo según el nivel que va eligiendo
 * (sin necesitar guardar nada todavía), usando los horarios reales del
 * club — si el Maestro cambia los horarios más adelante, esto no se
 * desactualiza solo.
 */
export function renderCompletarPerfil(profile, onDone) {
  const wrap = el('div', { class: 'login-screen' });

  const logo = el('div', { class: 'login-logo' }, [el('img', { src: 'assets/img/logo-icon-white.png', alt: 'Padel Palmira', class: 'login-logo-img' })]);
  const title = el('div', { class: 'h1' }, 'Completa tu perfil');
  const sub = el('p', { class: 'text-muted' }, 'Nos falta un par de datos para terminar tu registro en el club — son obligatorios.');

  const nameInput = el('input', { class: 'input', type: 'text', value: profile.full_name || '', placeholder: 'Como te identificamos en el club', autocomplete: 'name', id: 'onb-name' });
  const emailField = el('div', { class: 'field' }, [
    el('label', {}, 'Correo electrónico'),
    el('input', { class: 'input', type: 'email', value: profile.email || '', disabled: true }),
  ]);
  const nameField = el('div', { class: 'field' }, [el('label', {}, 'Nombre completo'), nameInput]);
  const phoneInput = el('input', { class: 'input', type: 'tel', value: profile.phone || '', placeholder: '10 dígitos', autocomplete: 'tel', id: 'onb-phone' });
  const phoneField = el('div', { class: 'field' }, [el('label', {}, 'Celular'), phoneInput]);

  const nivelSelect = el('select', { class: 'input', id: 'onb-nivel' }, [
    el('option', { value: '' }, '¿Cuál es tu nivel de juego?'),
    ...NIVELES.map((n) => el('option', { value: n.value }, n.label)),
  ]);
  if (profile.declared_level) nivelSelect.value = profile.declared_level;
  const nivelHelp = el('p', { class: 'text-tiny mt-2' }, '¿No sabes tu nivel? Elige el que más se acerque — no es definitivo, en cuanto juegues tus primeras escaleras el sistema te ubica solo según tus resultados.');
  const recomendacionBox = el('div', { class: 'card mt-3', style: 'display:none;background:var(--surface-2);' });
  const nivelField = el('div', { class: 'field' }, [el('label', {}, 'Tu nivel de juego'), nivelSelect, nivelHelp, recomendacionBox]);

  let weekdaySchedules = null;
  async function pintarRecomendacion() {
    const nivel = nivelSelect.value;
    if (!nivel) { recomendacionBox.style.display = 'none'; return; }
    if (!weekdaySchedules) {
      try { weekdaySchedules = await getWeekdayScheduleAll(); } catch (err) { weekdaySchedules = []; }
    }
    const rec = recomendacionPorNivel(nivel, weekdaySchedules);
    recomendacionBox.innerHTML = '';
    if (!rec) { recomendacionBox.style.display = 'none'; return; }

    recomendacionBox.appendChild(el('div', { class: 'text-tiny', style: 'font-weight:700;color:var(--cyan);text-transform:uppercase;letter-spacing:0.04em;' }, 'Te recomendamos'));
    if (rec.modo === 'retas') {
      recomendacionBox.appendChild(el('p', { class: 'text-muted mt-2', style: 'font-size:13.5px;' }, 'Empieza en Retas Abiertas — 100% social, sin presión de puntos, perfecto para agarrar ritmo. En cuanto quieras, también puedes anotarte directo a Categoría B si prefieres competir desde ya.'));
    } else {
      recomendacionBox.appendChild(el('p', { class: 'text-muted mt-2', style: 'font-size:13.5px;' }, `Categoría ${rec.categoria} — es donde arrancas mientras el sistema calcula tu categoría real con tus primeros resultados.`));
    }
    if (rec.dias.length) {
      const lista = el('div', { class: 'stack gap-1 mt-3' });
      rec.dias.forEach((ws) => lista.appendChild(el('div', { class: 'text-tiny', style: 'font-weight:600;' }, `📅 ${textoDia(ws)}`)));
      recomendacionBox.appendChild(lista);
    }
    recomendacionBox.style.display = 'block';
  }
  nivelSelect.addEventListener('change', pintarRecomendacion);
  if (profile.declared_level) pintarRecomendacion();

  const btn = el('button', { class: 'btn btn-primary' }, 'Guardar y continuar');
  const status = el('div', { class: 'text-tiny mt-3' });

  btn.addEventListener('click', async () => {
    const full_name = (nameInput.value || '').trim();
    const phoneDigits = (phoneInput.value || '').replace(/\D/g, '');
    const declared_level = nivelSelect.value;

    if (!full_name) {
      status.textContent = 'Escribe tu nombre completo.';
      status.style.color = 'var(--danger)';
      nameInput.focus();
      return;
    }
    if (phoneDigits.length !== 10) {
      status.textContent = 'Escribe tu celular a 10 dígitos.';
      status.style.color = 'var(--danger)';
      phoneInput.focus();
      return;
    }
    if (!declared_level) {
      status.textContent = 'Selecciona tu nivel de juego.';
      status.style.color = 'var(--danger)';
      nivelSelect.focus();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    status.textContent = '';
    try {
      const updated = await updateMyProfile({ full_name, phone: phoneDigits, declared_level });
      toast('Perfil completado.', 'success');
      const recomendacion = recomendacionPorNivel(declared_level, weekdaySchedules);
      onDone(updated, recomendacion);
    } catch (err) {
      status.textContent = humanizeError(err);
      status.style.color = 'var(--danger)';
      btn.disabled = false;
      btn.textContent = 'Guardar y continuar';
    }
  });

  [nameField, phoneField].forEach((field) => {
    field.querySelector('input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn.click();
    });
  });

  wrap.append(logo, title, sub, nameField, emailField, phoneField, nivelField, btn, status);
  return wrap;
}
