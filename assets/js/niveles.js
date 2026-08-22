// Escala de nivel declarado (varonil por ahora — femenil vendrá después) y
// la lógica de qué convocatoria(s) recomendarle a un jugador nuevo según su
// nivel, mientras junta historial real de partidos y el sistema le calcula
// su categoría de verdad. Un solo lugar para esto — lo usan tanto
// completar_perfil.js (la pregunta) como guia_app.js (la explicación).

export const NIVELES = [
  { value: '2da_varonil', label: '2da varonil' },
  { value: '3ra_varonil', label: '3ra varonil' },
  { value: '4ta_varonil', label: '4ta varonil' },
  { value: '5ta_varonil', label: '5ta varonil' },
  { value: '6ta_varonil', label: '6ta varonil' },
  { value: '7ma_varonil', label: '7ma varonil' },
  { value: '7ma_varonil_principiante', label: '7ma varonil principiante' },
];

export const WEEKDAY_LABEL = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo' };
export const FORMAT_LABEL = { individual: 'Individual', parejas: 'Parejas Fijas', retas_abiertas: 'Retas Abiertas' };

function nivelLabel(nivel) {
  return (NIVELES.find((n) => n.value === nivel) || {}).label || nivel;
}

// 2da a 5ta ya juegan a nivel competitivo alto -> Categoría A.
// 6ta ya compite pero en el escalón parejo con más gente -> Categoría B.
// 7ma / 7ma principiante -> recomendamos Retas Abiertas para agarrar
// confianza sin presión de puntos, aunque nada les impide anotarse directo
// a Categoría B si prefieren competir desde ya (se los dejamos claro en la
// recomendación, nunca se los bloqueamos).
const NIVEL_A_CATEGORIA = {
  '2da_varonil': 'A', '3ra_varonil': 'A', '4ta_varonil': 'A', '5ta_varonil': 'A',
  '6ta_varonil': 'B',
  '7ma_varonil': 'retas', '7ma_varonil_principiante': 'retas',
};

/**
 * A partir del nivel declarado y los horarios reales activos
 * (weekday_schedule), arma la recomendación de a qué convocatoria(s) entrar.
 * Devuelve null si el nivel no es reconocido.
 */
export function recomendacionPorNivel(nivel, weekdaySchedules) {
  const modo = NIVEL_A_CATEGORIA[nivel];
  if (!modo) return null;
  const activos = (weekdaySchedules || []).filter((ws) => ws.active);

  if (modo === 'retas') {
    const dias = activos.filter((ws) => ws.format === 'retas_abiertas');
    return { nivelLabel: nivelLabel(nivel), categoria: null, modo: 'retas', dias };
  }
  const dias = activos.filter((ws) => ws.category === modo);
  return { nivelLabel: nivelLabel(nivel), categoria: modo, modo: 'categoria', dias };
}

export function textoDia(ws) {
  return `${WEEKDAY_LABEL[ws.weekday] || ws.weekday} — ${FORMAT_LABEL[ws.format] || ws.format}`;
}
