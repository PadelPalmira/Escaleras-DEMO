/* ============================================================
   ESTADO DE LA DEMO
   ------------------------------------------------------------
   El reloj, quién está usando la app y el guardado en el
   navegador. Todo vive en la máquina de quien abre la página:
   nada sale a internet y nada toca la app real.
   ============================================================ */

const LLAVE_BD = 'escaleras_demo_bd_v2';
const LLAVE_ESTADO = 'escaleras_demo_estado_v1';

export const CLUB_TZ = 'America/Mexico_City';

// La demo se guarda sola en el navegador para que no se pierda al recargar,
// pero un navegador puede tenerlo bloqueado (modo privado, cookies apagadas).
// Si falla, la demo sigue funcionando: solo se reinicia en cada recarga.
function leer(llave) {
  try { const t = localStorage.getItem(llave); return t ? JSON.parse(t) : null; } catch { return null; }
}
function guardar(llave, valor) {
  try { localStorage.setItem(llave, JSON.stringify(valor)); return true; } catch { return false; }
}
function borrar(llave) {
  try { localStorage.removeItem(llave); } catch { /* sin guardado disponible */ }
}

const estadoGuardado = leer(LLAVE_ESTADO) || {};

export const DEMO = {
  // Desfase en milisegundos entre el reloj real y el de la demo.
  desfaseMs: Number(estadoGuardado.desfaseMs) || 0,
  // Quién está usando la app ahora mismo.
  uid: estadoGuardado.uid || null,
  // Lección del tutorial en curso.
  leccion: estadoGuardado.leccion == null ? null : Number(estadoGuardado.leccion),
  paso: Number(estadoGuardado.paso) || 0,
  tutorialCerrado: !!estadoGuardado.tutorialCerrado,

  /* Equivalente de public.ahora() en la app real: un solo lugar del que
     TODO el código saca la hora, para poder moverla sin tocar nada más. */
  ahora() { return new Date(Date.now() + this.desfaseMs); },

  hoyISO() { return fechaClub(this.ahora()); },

  /* Mueve el reloj de la demo a una fecha y hora del club. */
  irA(fechaISO, hhmm) {
    const destino = instanteClub(fechaISO, hhmm);
    this.desfaseMs = destino.getTime() - Date.now();
    this.persistir();
  },

  volverAlPresente() { this.desfaseMs = 0; this.persistir(); },

  persistir() {
    guardar(LLAVE_ESTADO, {
      desfaseMs: this.desfaseMs, uid: this.uid, leccion: this.leccion,
      paso: this.paso, tutorialCerrado: this.tutorialCerrado,
    });
  },
};

/* ---------- base de datos de la demo, guardada en el navegador ---------- */

export function cargarBd() { return leer(LLAVE_BD); }
export function guardarBd(db) { return guardar(LLAVE_BD, db); }
export function borrarTodo() { borrar(LLAVE_BD); borrar(LLAVE_ESTADO); }

/* ---------- fechas en hora del club ---------- */

// CDMX no cambia de horario desde 2022: es UTC-6 todo el año.
export const OFFSET_CDMX_MIN = -360;

export function fechaClub(d) {
  const t = new Date(d.getTime() + OFFSET_CDMX_MIN * 60000);
  return t.toISOString().slice(0, 10);
}

export function instanteClub(fechaISO, hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  const base = Date.UTC(
    Number(fechaISO.slice(0, 4)), Number(fechaISO.slice(5, 7)) - 1, Number(fechaISO.slice(8, 10)));
  return new Date(base + ((h * 60 + (m || 0)) - OFFSET_CDMX_MIN) * 60000);
}

export function sumarDias(fechaISO, dias) {
  const d = new Date(fechaISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Lunes de la semana de esa fecha (semana ISO: lunes a domingo).
export function lunesDe(fechaISO) {
  const d = new Date(fechaISO + 'T12:00:00Z');
  return sumarDias(fechaISO, -((d.getUTCDay() + 6) % 7));
}

export const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

export function diaSemanaDe(fechaISO) {
  const d = new Date(fechaISO + 'T12:00:00Z');
  return DIAS[(d.getUTCDay() + 6) % 7];
}
