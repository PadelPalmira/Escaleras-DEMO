// DEMO: aquí NO van las llaves del proyecto real. Se dejan vacías a
// propósito para que esta copia no tenga forma de llegar a la base de datos
// del club aunque alguien cambiara el código: no hay dirección a la cual
// llamar. La demo corre contra assets/js/demo/cliente.js.
export const SUPABASE_URL = '';
export const SUPABASE_PUBLISHABLE_KEY = '';

// Zona horaria oficial del club — TODOS los cortes de tiempo del sistema se
// muestran/calculan en esta zona, sin importar dónde esté el usuario.
export const CLUB_TZ = 'America/Mexico_City';

// WhatsApp del club — botón de ayuda/contacto en toda la app.
export const CLUB_WHATSAPP_NUMBER = '527778798613';
export function whatsappHelpUrl(mensaje = 'Mensaje de prueba desde la DEMO de Escaleras Palmira (ignorar) 🎾') {
  return `https://wa.me/${CLUB_WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`;
}
