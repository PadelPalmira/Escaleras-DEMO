// Configuración pública del proyecto Supabase.
// La publishable key es segura de exponer en el cliente: el acceso real
// está controlado por Row Level Security (RLS) en la base de datos, no por
// mantener esta clave en secreto.
export const SUPABASE_URL = 'https://lgcflspltyamhozzpjvg.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vLRpApr7wqKQQxxWEl1NVA_7cL5gjW2';

// Zona horaria oficial del club — TODOS los cortes de tiempo del sistema se
// muestran/calculan en esta zona, sin importar dónde esté el usuario.
export const CLUB_TZ = 'America/Mexico_City';

// WhatsApp del club — botón de ayuda/contacto en toda la app.
export const CLUB_WHATSAPP_NUMBER = '527778798613';
export function whatsappHelpUrl(mensaje = 'Hola, tengo una duda sobre Escaleras Palmira 🎾') {
  return `https://wa.me/${CLUB_WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`;
}

// URL pública donde los jugadores entran a la app — para armar links que los
// manden directo ahí (p.ej. desde un WhatsApp de recepción).
export const APP_URL = 'https://padelpalmira.github.io/Escaleras/';
