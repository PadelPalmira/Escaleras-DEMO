import { supabase } from './supabaseClient.js';
import { todayISO, ahora } from './utils.js';

/* ============================================================
   Sesión / perfil
   ============================================================ */

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function sendMagicLink(email, { full_name, phone } = {}) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
      // Se guarda en auth.users.raw_user_meta_data — el trigger handle_new_user
      // lo usa para sembrar el perfil la primera vez que alguien entra.
      data: { full_name, phone },
    },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getMyProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(fields) {
  const session = await getSession();
  const { data, error } = await supabase.from('profiles').update(fields).eq('id', session.user.id).select().single();
  if (error) throw error;
  return data;
}

/**
 * Sube la foto de perfil (ya comprimida en el celular, ver avatar.js) y
 * actualiza profiles.avatar_url. `upsert:true` reemplaza el archivo anterior
 * en vez de acumular uno nuevo por cada cambio de foto. El parámetro ?v= es
 * solo para que el navegador no siga mostrando la foto vieja en caché justo
 * después de cambiarla — el nombre real del archivo no cambia.
 */
export async function subirFotoPerfil(blob, tipo = 'image/webp') {
  const session = await getSession();
  if (!session) throw new Error('No hay sesión activa.');
  const ext = tipo === 'image/jpeg' ? 'jpg' : 'webp';
  const path = `${session.user.id}.${ext}`;
  const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, {
    upsert: true, contentType: tipo, cacheControl: '3600',
  });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  // El ?v= es solo para romper el caché del navegador tras cambiar de foto —
  // no aplica a un data: URL (como el que usa la demo), que ya cambia solo.
  const url = data.publicUrl.startsWith('data:') ? data.publicUrl : `${data.publicUrl}?v=${Date.now()}`;
  await updateMyProfile({ avatar_url: url });
  return url;
}
/** Quita la foto de perfil (vuelve al avatar de iniciales). */
export async function borrarFotoPerfil() {
  const session = await getSession();
  if (!session) throw new Error('No hay sesión activa.');
  await supabase.storage.from('avatars').remove([`${session.user.id}.webp`, `${session.user.id}.jpg`]);
  await updateMyProfile({ avatar_url: null });
}

/* ============================================================
   Categoría / ranking
   ============================================================ */

/** Última fecha de corte (week_start_date) con snapshots calculados. */
async function ultimaFechaSnapshot() {
  const { data, error } = await supabase
    .from('category_snapshots')
    .select('week_start_date')
    .order('week_start_date', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data && data[0] ? data[0].week_start_date : null;
}

export async function getMiCategoria(playerId) {
  const { data, error } = await supabase
    .from('category_snapshots')
    .select('*')
    .eq('player_id', playerId)
    .order('week_start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Ranking completo de la última semana calculada, con nombre de jugador. */
export async function getRankingCompleto() {
  const fecha = await ultimaFechaSnapshot();
  if (!fecha) return { fecha: null, filas: [] };
  const { data, error } = await supabase
    .from('category_snapshots')
    .select('*, profiles(full_name, avatar_url)')
    .eq('week_start_date', fecha)
    .order('rank', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return { fecha, filas: data };
}

/* ============================================================
   Escaleras / convocatorias
   ============================================================ */

/** Convocatorias abiertas o próximas de los siguientes N días, con su horario. */
export async function getProximasEscaleras(dias = 8) {
  const desde = todayISO();
  const hastaDate = new Date(desde + 'T00:00:00Z');
  hastaDate.setUTCDate(hastaDate.getUTCDate() + dias);
  const hasta = hastaDate.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('escaleras')
    .select('*, weekday_schedule(*)')
    .gte('session_date', desde)
    .lte('session_date', hasta)
    .not('status', 'in', '("cancelled")')
    .order('session_date', { ascending: true });
  if (error) throw error;
  return data;
}

/** Mis registros (pasados y futuros) con el detalle de la escalera. */
export async function getMisRegistros({ soloFuturas = true } = {}) {
  const session = await getSession();
  if (!session) return [];
  let query = supabase
    .from('escalera_registrations')
    .select('*, escaleras(*, weekday_schedule(*))')
    .eq('player_id', session.user.id)
    .order('created_at', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  if (!soloFuturas) return data;
  const hoy = todayISO();
  return data.filter((r) => r.escaleras && r.escaleras.session_date >= hoy);
}

export async function getJugadoresParaPareja(escaleraId, excluirPlayerId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('status', 'active')
    .neq('id', excluirPlayerId)
    .order('full_name', { ascending: true });
  if (error) throw error;
  // Un perfil sin nombre no se puede elegir a ciegas: se ve como
  // "(sin nombre)" en la lista y nadie sabe a quién está escogiendo.
  return (data || []).filter((j) => (j.full_name || '').trim());
}

/* ---------------- Acciones (RPC) ---------------- */

/**
 * Estado completo de las convocatorias de los próximos días para el jugador
 * de la sesión: cupo, lista de espera, ventana de ventaja del domingo, si
 * trae ventaja de ranking y cómo está su propio registro. Una sola llamada
 * en vez de cinco, y toda la lógica de fechas vive en la base de datos —
 * que es la única que puede decidirla sin que el reloj del teléfono influya.
 */
export async function getMisConvocatorias(dias = 9) {
  const { data, error } = await supabase.rpc('mis_convocatorias', { p_dias: dias });
  if (error) throw error;
  return data || [];
}

/**
 * @param aListaEspera true = "quiero entrar a la lista de espera", que es la
 * única forma de anotarse durante la ventana del domingo si no traes ventaja
 * de ranking. Nunca es automático: el jugador lo tiene que pedir.
 */
export async function registrarJugador(escaleraId, playerId, partnerId = null, aListaEspera = false) {
  const { data, error } = await supabase.rpc('registrar_jugador', {
    p_escalera_id: escaleraId,
    p_player_id: playerId,
    p_partner_id: partnerId,
    p_a_lista_espera: aListaEspera,
  });
  if (error) throw error;
  return data && data[0] ? data[0] : data;
}

/** Qué pasaría si me doy de baja ahorita — alimenta los avisos antes de confirmar. */
export async function previewCancelacion(registrationId) {
  const { data, error } = await supabase.rpc('preview_cancelacion', { p_registration_id: registrationId });
  if (error) throw error;
  return data && data[0] ? data[0] : data;
}

export async function responderInvitacionPareja(registrationId, aceptar) {
  const { error } = await supabase.rpc('responder_invitacion_pareja', {
    p_registration_id: registrationId,
    p_aceptar: aceptar,
  });
  if (error) throw error;
}

/**
 * Devuelve { estado, penalizado, puntos_penalizacion, perdio_ventaja,
 * cubierto, mensaje }. El mensaje ya viene redactado desde la base de datos
 * para que app y reglamento nunca digan cosas distintas.
 */
export async function cancelarRegistro(registrationId) {
  const { data, error } = await supabase.rpc('cancelar_registro', { p_registration_id: registrationId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || { estado: 'cancelled_ontime', mensaje: 'Listo, te dimos de baja.' };
}

export async function asignarSustituto(registrationId, sustitutoPlayerId, esCoach = false) {
  const { data, error } = await supabase.rpc('asignar_sustituto', {
    p_registration_id: registrationId,
    p_sustituto_player_id: sustitutoPlayerId,
    p_es_coach: esCoach,
  });
  if (error) throw error;
  return data;
}

/**
 * Sustituto autorizado por administración, para emergencias reales: entra
 * alguien en el lugar del ausente SIN reparto de puntos y SIN penalización.
 * Es la única forma de meter un sustituto en Parejas Fijas, para que la
 * pareja del ausente no se quede sin jugar.
 */
export async function asignarSustitutoAdmin(registrationId, sustitutoPlayerId, motivo = null) {
  const { data, error } = await supabase.rpc('asignar_sustituto_admin', {
    p_registration_id: registrationId,
    p_sustituto_player_id: sustitutoPlayerId,
    p_motivo: motivo,
  });
  if (error) throw error;
  return data;
}

/* ---------------- Retas Abiertas: registro social simple ----------------
   Sin cupo, sin lista de espera, sin puntos ni penalizaciones — solo sirve
   para que todo el club vea quién va y cuántos, y decidir si se anima. */

/** Registrarme (o volver a anotarme si antes salí) en una noche de Retas Abiertas. */
export async function registrarseRetasAbiertas(escaleraId) {
  const { data, error } = await supabase.rpc('registrarse_retas_abiertas', { p_escalera_id: escaleraId });
  if (error) throw error;
  return data && data[0] ? data[0] : data;
}

/* Cambio de jugador con la noche YA en juego: alguien se lesiona en la ronda 3
   y otro entra en su lugar. Esto SI mueve las canchas, a diferencia de
   "asignar sustituto", que solo tocaba la lista de inscritos y dejaba al que
   se fue jugando (y sumando puntos) en la pantalla. */
export async function reemplazarJugadorEnCancha(escaleraId, salePlayerId, entraPlayerId, motivo) {
  const { data, error } = await supabase.rpc('reemplazar_jugador_en_cancha', {
    p_escalera_id: escaleraId,
    p_sale_player_id: salePlayerId,
    p_entra_player_id: entraPlayerId,
    p_motivo: motivo || null,
  });
  if (error) throw error;
  return data;
}

/** Salirme de una noche de Retas Abiertas — nunca aplica penalización. */
export async function salirRetasAbiertas(registrationId) {
  const { data, error } = await supabase.rpc('salir_retas_abiertas', { p_registration_id: registrationId });
  if (error) throw error;
  return data;
}

/** Quiénes están anotados (confirmados) en una noche de Retas Abiertas, con nombre. */
export async function getInscritosRetas(escaleraId) {
  const { data, error } = await supabase
    .from('escalera_registrations')
    .select('id, player_id, confirmed_at, profiles(full_name)')
    .eq('escalera_id', escaleraId)
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: true });
  if (error) throw error;
  return data;
}

/* ============================================================
   Reglas
   ============================================================ */

export async function getReglas() {
  const { data, error } = await supabase.from('rules_content').select('*').order('sort_order', { ascending: true });
  if (error) throw error;
  return data;
}

/* ============================================================
   Historial de puntos (perfil)
   ============================================================ */

export async function getMiHistorialPuntos(playerId, limite = 30) {
  const { data, error } = await supabase
    .from('points_ledger')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data;
}

/* ============================================================
   Liguilla / Torneo de Ascenso
   ============================================================ */

/** A/B (o ambos, si está en Zona Límite) según la categoría vigente del jugador. */
export function tiersElegiblesPorCategoria(categoria) {
  if (!categoria) return [];
  if (categoria.category === 'A') return ['liguilla_a'];
  if (categoria.category === 'B') return ['ascenso_b'];
  if (categoria.category === 'limite') {
    return categoria.zona_limite_side === 'bottom_a' ? ['liguilla_a'] : ['ascenso_b'];
  }
  return [];
}

/** El evento de Liguilla/Ascenso más reciente para alguno de los tiers dados (cualquier estado). */
export async function getEventoLiguillaActivo(tiers) {
  if (!tiers || tiers.length === 0) return null;
  const { data, error } = await supabase
    .from('liguilla_events')
    .select('*')
    .in('tier', tiers)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Crea (si falta) la Liguilla y el Torneo de Ascenso del mes. Es idempotente
 * y la fecha sale del horario semanal, no de las convocatorias: por eso el
 * jugador ve la fecha del mes desde el primer día, aunque las convocatorias
 * de esa semana todavía no existan.
 */
export async function autoprogramarLiguillaMes(monthKey = null) {
  const { data, error } = await supabase.rpc('autoprogramar_liguilla_mes', { p_month_key: monthKey });
  if (error) throw error;
  return data || [];
}

/** La carrera del mes en vivo: quién va calificado ahorita mismo. */
export async function getLiguillaTablaVivo(tier, limite = 20) {
  const { data, error } = await supabase.rpc('liguilla_tabla_vivo', { p_tier: tier, p_limite: limite });
  if (error) throw error;
  return data || [];
}

/** Mi situación personal: lugar, puntos que faltan y si todavía es posible. */
export async function getMiCarreraLiguilla(tier, playerId = null) {
  const { data, error } = await supabase.rpc('mi_carrera_liguilla', { p_tier: tier, p_player_id: playerId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

/** El evento del mes en curso para un tier (si ya está programado). */
export async function getEventoLiguillaDelMes(tier, monthKey = null) {
  const mes = monthKey || ahora().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }).slice(0, 7);
  const { data, error } = await supabase
    .from('liguilla_events').select('*').eq('tier', tier).eq('month_key', mes).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMiCalificacionLiguilla(liguillaEventId, playerId) {
  const { data, error } = await supabase
    .from('liguilla_qualifiers')
    .select('*')
    .eq('liguilla_event_id', liguillaEventId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Calificados confirmados de este evento, con nombre — pool base para el draft. */
export async function getCalificadosConfirmados(liguillaEventId) {
  const { data, error } = await supabase
    .from('liguilla_qualifiers')
    .select('id, player_id, status, profiles(full_name, avatar_url)')
    .eq('liguilla_event_id', liguillaEventId)
    .eq('status', 'confirmed');
  if (error) throw error;
  return data;
}

/** Todas las parejas ya formadas de este evento, con nombres. */
export async function getParejasLiguilla(liguillaEventId) {
  const { data, error } = await supabase
    .from('liguilla_pairs')
    .select('*, player1:profiles!liguilla_pairs_player1_id_fkey(full_name), player2:profiles!liguilla_pairs_player2_id_fkey(full_name)')
    .eq('liguilla_event_id', liguillaEventId);
  if (error) throw error;
  return data;
}

export async function getMiParejaLiguilla(liguillaEventId, playerId) {
  const parejas = await getParejasLiguilla(liguillaEventId);
  return parejas.find((p) => p.player1_id === playerId || p.player2_id === playerId) || null;
}

/** El pick de draft actualmente activo (pending = por elegir, offered = por responder). */
export async function getPickActualDraft(liguillaEventId) {
  const { data, error } = await supabase
    .from('liguilla_draft_picks')
    .select('*, picker:profiles!liguilla_draft_picks_picker_player_id_fkey(full_name), picked:profiles!liguilla_draft_picks_picked_player_id_fkey(full_name)')
    .eq('liguilla_event_id', liguillaEventId)
    .in('status', ['pending', 'offered'])
    .order('pick_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Todos los partidos del bracket de este evento (sin anidar parejas — se cruza en el cliente). */
export async function getPartidosLiguilla(liguillaEventId) {
  const { data, error } = await supabase
    .from('liguilla_matches')
    .select('*')
    .eq('liguilla_event_id', liguillaEventId);
  if (error) throw error;
  return data;
}

export async function responderCalificacionLiguilla(qualifierId, aceptar) {
  const { data, error } = await supabase.rpc('responder_calificacion_liguilla', {
    p_qualifier_id: qualifierId,
    p_aceptar: aceptar,
  });
  if (error) throw error;
  return data;
}

export async function hacerPickDraft(liguillaEventId, pickedPlayerId) {
  const { data, error } = await supabase.rpc('hacer_pick_draft', {
    p_liguilla_event_id: liguillaEventId,
    p_picked_player_id: pickedPlayerId,
  });
  if (error) throw error;
  return data;
}

export async function responderPickDraft(pickId, aceptar) {
  const { data, error } = await supabase.rpc('responder_pick_draft', {
    p_pick_id: pickId,
    p_aceptar: aceptar,
  });
  if (error) throw error;
  return data;
}

/* ============================================================
   RBAC — helpers de solo-lectura sobre el rol ya cargado en el
   perfil de sesión. La aplicación real de permisos siempre ocurre
   en el servidor (RLS + guardas internas de cada función); esto es
   únicamente para decidir qué mostrar en la interfaz.
   ============================================================ */

export function esAdminOMaestro(profile) {
  return !!profile && (profile.role === 'admin' || profile.role === 'maestro');
}
export function esMaestro(profile) {
  return !!profile && profile.role === 'maestro';
}

/* ============================================================
   Admin — jugadores (buscar, sustituir, multas, suspensiones)
   ============================================================ */

export async function buscarJugadores(query, limite = 20) {
  let q = supabase.from('profiles').select('*').order('full_name', { ascending: true }).limit(limite);
  const f = (query || '').trim();
  if (f) q = q.ilike('full_name', `%${f}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

/** Registros activos (confirmed/substitute) de un jugador en escaleras futuras — para poder asignarle sustituto o marcarlo no-show desde su ficha. */
export async function getRegistrosActivosDeJugador(playerId) {
  const hoy = todayISO();
  const { data, error } = await supabase
    .from('escalera_registrations')
    .select('*, escaleras(*, weekday_schedule(*))')
    .eq('player_id', playerId)
    .in('status', ['confirmed', 'substitute', 'waitlist'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).filter((r) => r.escaleras && r.escaleras.session_date >= hoy);
}

export async function marcarNoShow(registrationId) {
  const { error } = await supabase.rpc('marcar_no_show', { p_registration_id: registrationId });
  if (error) throw error;
}

export async function aplicarMulta(playerId, amountMxn, reason, escaleraId = null) {
  const { data, error } = await supabase
    .from('fines')
    .insert({ player_id: playerId, amount_mxn: amountMxn, reason: reason || null, escalera_id: escaleraId })
    .select().single();
  if (error) throw error;
  return data;
}

export async function marcarMultaEstado(fineId, status) {
  const fields = { status };
  if (status === 'paid') fields.paid_at = ahora().toISOString();
  const { error } = await supabase.from('fines').update(fields).eq('id', fineId);
  if (error) throw error;
}

export async function getMultasAdmin({ soloPendientes = false } = {}) {
  let q = supabase.from('fines').select('*, profiles(full_name)').order('applied_at', { ascending: false });
  if (soloPendientes) q = q.eq('status', 'pending');
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function aplicarSuspension(playerId, startDate, endDate, reason) {
  const { data, error } = await supabase
    .from('suspensions')
    .insert({ player_id: playerId, start_date: startDate, end_date: endDate || null, reason: reason || null })
    .select().single();
  if (error) throw error;
  // Refleja el estado en profiles para que el resto de la app (registro, etc.) lo vea de inmediato.
  await supabase.from('profiles').update({ status: 'suspended', suspended_until: endDate || null }).eq('id', playerId);
  return data;
}

export async function levantarSuspension(suspensionId, playerId) {
  const { error } = await supabase.from('suspensions').update({ lifted_at: ahora().toISOString() }).eq('id', suspensionId);
  if (error) throw error;
  await supabase.from('profiles').update({ status: 'active', suspended_until: null }).eq('id', playerId);
}

export async function getSuspensionesAdmin() {
  const { data, error } = await supabase
    .from('suspensions')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

/* ============================================================
   Admin — captura de resultados de escaleras
   ============================================================ */

export async function getEscalerasAdmin() {
  const desde = ahora();
  desde.setUTCDate(desde.getUTCDate() - 14);
  const { data, error } = await supabase
    .from('escaleras')
    .select('*, weekday_schedule(*)')
    .gte('session_date', desde.toISOString().slice(0, 10))
    .not('status', 'in', '("cancelled")')
    .order('session_date', { ascending: false });
  if (error) throw error;
  return (data || []).filter((e) => !e.is_liguilla);
}

/* Cuantos van y cuantos esperan en varias noches de un jalon: lo usa el
   Inicio del Admin, que necesita el numero de todas las noches de la semana
   sin hacer una consulta por cada una. */
export async function getConteosRegistros(escaleraIds) {
  if (!escaleraIds || !escaleraIds.length) return {};
  const { data, error } = await supabase
    .from('escalera_registrations')
    .select('escalera_id, status')
    .in('escalera_id', escaleraIds);
  if (error) throw error;
  const out = {};
  escaleraIds.forEach((id) => { out[id] = { confirmados: 0, espera: 0 }; });
  (data || []).forEach((r) => {
    const c = out[r.escalera_id];
    if (!c) return;
    if (r.status === 'confirmed' || r.status === 'substitute') c.confirmados += 1;
    else if (r.status === 'waitlist') c.espera += 1;
  });
  return out;
}

export async function getRegistrosEscalera(escaleraId) {
  const { data, error } = await supabase
    .from('escalera_registrations')
    .select('*, profiles(full_name, avatar_url)')
    .eq('escalera_id', escaleraId)
    .order('status', { ascending: true });
  if (error) throw error;
  return data;
}

// OJO: los alias NUNCA deben llamarse igual que la columna uuid original
// (p.ej. "team1_player1") — PostgREST no sabe distinguir el embed del
// campo crudo y el resultado queda ambiguo/roto. Por eso cada alias aquí
// termina en "_nombre".
const NOMBRES_SEAT = 'team1_player1_nombre:profiles!round_matches_team1_player1_fkey(full_name, avatar_url), team1_player2_nombre:profiles!round_matches_team1_player2_fkey(full_name, avatar_url), team2_player1_nombre:profiles!round_matches_team2_player1_fkey(full_name, avatar_url), team2_player2_nombre:profiles!round_matches_team2_player2_fkey(full_name, avatar_url)';

export async function getRondasConPartidos(escaleraId) {
  const { data: rounds, error } = await supabase
    .from('rounds').select('*').eq('escalera_id', escaleraId).order('round_number', { ascending: true });
  if (error) throw error;
  if (!rounds || rounds.length === 0) return [];
  const { data: matches, error: err2 } = await supabase
    .from('round_matches')
    .select(`*, ${NOMBRES_SEAT}`)
    .in('round_id', rounds.map((r) => r.id))
    .order('court_number', { ascending: true });
  if (err2) throw err2;
  return rounds.map((r) => ({ ...r, partidos: (matches || []).filter((m) => m.round_id === r.id) }));
}

/* La noche arranca cuando recepcion confirma que la gente ya esta en cancha:
   cierra la convocatoria y genera la ronda 1 de un solo golpe. Solo funciona
   con el cupo completo — la app no arma escaleras incompletas. */
export async function comenzarEscalera(escaleraId) {
  const { data, error } = await supabase.rpc('comenzar_escalera', { p_escalera_id: escaleraId });
  if (error) throw error;
  return data;
}

/* Recepcion mete a alguien que llego sin haberse anotado. */
export async function adminAgregarJugador(escaleraId, playerId, partnerId = null, forzar = false) {
  const { data, error } = await supabase.rpc('admin_agregar_jugador', {
    p_escalera_id: escaleraId, p_player_id: playerId, p_partner_id: partnerId, p_forzar: forzar,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function generarRondaInicial(escaleraId) {
  const { data, error } = await supabase.rpc('generar_ronda_inicial', { p_escalera_id: escaleraId });
  if (error) throw error;
  return data;
}
/* El cronometro de la ronda. Se arranca cuando recepcion ve que los 12 ya
   estan en su cancha, no cuando se genera la ronda. La cuenta regresiva se
   calcula desde la marca de tiempo del servidor, no contando en el telefono:
   asi sobrevive a recargas y a que se apague la pantalla. */
export async function iniciarCronometroRonda(roundId, reiniciar = false) {
  const { data, error } = await supabase.rpc('iniciar_cronometro_ronda', {
    p_round_id: roundId, p_reiniciar: reiniciar,
  });
  if (error) throw error;
  return data;
}

/* La hora del servidor, para no depender de que el reloj del telefono este
   bien puesto. */
export async function horaServidor() {
  const { data, error } = await supabase.rpc('ahora');
  if (error) throw error;
  return new Date(data);
}

/* Lo que un jugador necesita a media noche: cancha, companero y rivales. */
export async function getMiRondaActual() {
  const { data, error } = await supabase.rpc('mi_ronda_actual');
  if (error) throw error;
  return Array.isArray(data) ? (data[0] || null) : (data || null);
}

export async function generarSiguienteRonda(escaleraId) {
  const { data, error } = await supabase.rpc('generar_siguiente_ronda', { p_escalera_id: escaleraId });
  if (error) throw error;
  return data;
}
export async function registrarResultadoPartido(matchId, sets, goldenPointWinner = null) {
  const { data, error } = await supabase.rpc('registrar_resultado_partido', {
    p_match_id: matchId, p_sets: sets, p_golden_point_winner: goldenPointWinner,
  });
  if (error) throw error;
  return data;
}
export async function corregirResultadoPartido(matchId, sets, nota = null, goldenPointWinner = null) {
  const { data, error } = await supabase.rpc('corregir_resultado_partido', {
    p_match_id: matchId, p_sets: sets, p_nota: nota, p_golden_point_winner: goldenPointWinner,
  });
  if (error) throw error;
  return data;
}
export async function cerrarEscalera(escaleraId) {
  const { data, error } = await supabase.rpc('cerrar_escalera', { p_escalera_id: escaleraId });
  if (error) throw error;
  return data;
}

/* ---------------- Cupo incompleto ----------------
   La app no opina hasta que faltan pocas horas (por defecto 6): antes de eso
   el club prefiere darle tiempo a la lista de espera a llenar los huecos
   sola. Cuando llega el momento, sugiere por canchas completas — pero la
   última palabra siempre es del admin. */

export async function getRecomendacionCupo(escaleraId) {
  const { data, error } = await supabase.rpc('recomendacion_cupo', { p_escalera_id: escaleraId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function cancelarEscaleraAdmin(escaleraId, motivo) {
  const { error } = await supabase.rpc('cancelar_escalera_admin', {
    p_escalera_id: escaleraId, p_motivo: motivo,
  });
  if (error) throw error;
}

/* ============================================================
   Admin — Liguilla / Ascenso
   ============================================================ */

export async function getLiguillaEventosAdmin() {
  const { data, error } = await supabase.from('liguilla_events').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
export async function crearEventoLiguilla(monthKey, tier, eventDate = null, escaleraId = null) {
  const { data, error } = await supabase.rpc('crear_evento_liguilla', {
    p_month_key: monthKey, p_tier: tier, p_event_date: eventDate, p_escalera_id: escaleraId,
  });
  if (error) throw error;
  return data;
}
export async function generarCalificadosLiguilla(eventId, waitlistDepth = 8) {
  const { data, error } = await supabase.rpc('generar_calificados_liguilla', {
    p_liguilla_event_id: eventId, p_waitlist_depth: waitlistDepth,
  });
  if (error) throw error;
  return data && data[0] ? data[0] : data;
}
export async function getCalificadosLiguillaAdmin(eventId) {
  const { data, error } = await supabase
    .from('liguilla_qualifiers')
    .select('*, profiles(full_name, avatar_url)')
    .eq('liguilla_event_id', eventId)
    .order('seed', { ascending: true });
  if (error) throw error;
  return data;
}
export async function cerrarConfirmacionesLiguilla(eventId, force = false) {
  const { data, error } = await supabase.rpc('cerrar_confirmaciones_liguilla', {
    p_liguilla_event_id: eventId, p_force: force,
  });
  if (error) throw error;
  return data && data[0] ? data[0] : data;
}
export async function iniciarDraftLiguilla(eventId) {
  const { data, error } = await supabase.rpc('iniciar_draft_liguilla', { p_liguilla_event_id: eventId });
  if (error) throw error;
  return data;
}
export async function autogenerarParejasRestantes(eventId, force = false) {
  const { data, error } = await supabase.rpc('autogenerar_parejas_restantes', {
    p_liguilla_event_id: eventId, p_force: force,
  });
  if (error) throw error;
  return data;
}
export async function cancelarLiguillaSinJugadores(eventId, player1Id = null, player2Id = null) {
  const { data, error } = await supabase.rpc('cancelar_liguilla_sin_jugadores', {
    p_liguilla_event_id: eventId, p_player1_id: player1Id, p_player2_id: player2Id,
  });
  if (error) throw error;
  return data;
}
export async function generarRonda1Liguilla(eventId) {
  const { data, error } = await supabase.rpc('generar_ronda1_liguilla', { p_liguilla_event_id: eventId });
  if (error) throw error;
  return data;
}
export async function registrarResultadoLiguillaMatch(matchId, sets, winnerPairId = null) {
  const { data, error } = await supabase.rpc('registrar_resultado_liguilla_match', {
    p_match_id: matchId, p_sets: sets, p_winner_pair_id: winnerPairId,
  });
  if (error) throw error;
  return data && data[0] ? data[0] : data;
}
export async function sustituirCalificadoLiguilla(qualifierId, substitutePlayerId = null) {
  const { data, error } = await supabase.rpc('sustituir_calificado_liguilla', {
    p_qualifier_id: qualifierId, p_substitute_player_id: substitutePlayerId,
  });
  if (error) throw error;
  return data;
}

/* ============================================================
   Maestro — configuración del sistema
   ============================================================ */

let _ajustesCache = null;
/** Un ajuste numerico del sistema, leido una sola vez por carga de pagina. */
export async function getAjusteNum(key, porDefecto) {
  try {
    if (!_ajustesCache) {
      const { data, error } = await supabase.from('system_settings').select('key, value');
      if (error) throw error;
      _ajustesCache = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
    }
    const n = Number(_ajustesCache[key]);
    return Number.isFinite(n) ? n : porDefecto;
  } catch {
    return porDefecto;
  }
}

export async function getSystemSettingsAll() {
  const { data, error } = await supabase.from('system_settings').select('*').order('key', { ascending: true });
  if (error) throw error;
  return data;
}
export async function updateSystemSetting(key, value) {
  const { error } = await supabase.from('system_settings').update({ value }).eq('key', key);
  if (error) throw error;
}
export async function getWeekdayScheduleAll() {
  const { data, error } = await supabase
    .from('weekday_schedule')
    .select('*, escaleras(count)')
    .order('weekday', { ascending: true });
  if (error) throw error;
  // escaleras(count) llega como [{ count: N }] — lo aplanamos a un número para
  // que la pantalla decida ahí mismo si un horario se puede borrar (nunca
  // generó convocatorias) o solo desactivar (ya tiene historial que conservar).
  return (data || []).map((ws) => {
    const { escaleras, ...resto } = ws;
    return { ...resto, escaleras_generadas: escaleras?.[0]?.count ?? 0 };
  });
}
export async function updateWeekdaySchedule(id, fields) {
  const { error } = await supabase.from('weekday_schedule').update(fields).eq('id', id);
  if (error) throw error;
}
/** Crea un horario semanal nuevo (nueva escalera/categoría recurrente). Solo Maestro (RLS). */
export async function crearWeekdaySchedule(fields) {
  const { data, error } = await supabase.from('weekday_schedule').insert(fields).select().single();
  if (error) throw error;
  return data;
}
/**
 * Borra un horario semanal por completo. Solo Maestro (RLS), y solo tiene
 * sentido llamarlo cuando el horario nunca generó ninguna convocatoria —
 * si ya generó alguna, la base de datos rechaza el borrado (hay historial
 * de puntos/partidos que depende de ese horario) y hay que desactivarlo
 * en vez de borrarlo.
 */
export async function borrarWeekdaySchedule(id) {
  const { error } = await supabase.from('weekday_schedule').delete().eq('id', id);
  if (error) throw error;
}
/**
 * Crea las convocatorias (filas reales de `escaleras`, con fecha) de una
 * semana a partir de weekday_schedule. Corre sola cada domingo 10am CDMX
 * vía cron, pero el Maestro también puede forzarla manualmente aquí (p.ej.
 * si acaba de activar un horario nuevo a media semana, o si necesita
 * confirmar que ya están creadas). Devuelve solo las que se crearon en
 * esta llamada — si ya existían, no se duplican ni se vuelven a listar.
 */
export async function generarEscalerasSemana(weekStart = null) {
  const { data, error } = await supabase.rpc('generar_escaleras_semana', { p_week_start: weekStart });
  if (error) throw error;
  return data;
}
export async function getStaff() {
  const { data, error } = await supabase.from('profiles').select('*').in('role', ['admin', 'maestro']).order('full_name', { ascending: true });
  if (error) throw error;
  return data;
}
/** Solo el Maestro puede llamar esto con éxito — lo hace cumplir el trigger guard_profile_privileged_fields en la base de datos, no solo la interfaz. */
export async function setProfileRole(playerId, role) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', playerId);
  if (error) throw error;
}

/* ============================================================
   CRM del jugador — multas, suspensiones, notificaciones
   ============================================================ */

export async function getMisMultas(playerId) {
  const { data, error } = await supabase.from('fines').select('*').eq('player_id', playerId).order('applied_at', { ascending: false });
  if (error) throw error;
  return data;
}
export async function getMisSuspensiones(playerId) {
  const { data, error } = await supabase.from('suspensions').select('*').eq('player_id', playerId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
export async function getMisNotificaciones(playerId, limite = 30) {
  const { data, error } = await supabase
    .from('notifications').select('*').eq('player_id', playerId)
    .order('created_at', { ascending: false }).limit(limite);
  if (error) throw error;
  return data;
}
/* Cuantas trae sin leer, para el punto rojo de la pestana Perfil. */
export async function contarNotificacionesSinLeer(playerId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', playerId)
    .is('read_at', null);
  if (error) throw error;
  return count || 0;
}

/* Las que no puede permitirse no ver: un lugar que se le abrio, una noche
   cancelada, una invitacion de pareja. Van hasta arriba del Inicio. */
export async function getNotificacionesUrgentes(playerId, limite = 3) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('player_id', playerId)
    .is('read_at', null)
    .in('type', ['promocion_lista_espera', 'escalera_cancelada', 'invitacion_pareja',
                 'confirmacion_requerida', 'sustituto_encontrado', 'cambio_categoria',
                 'privilegio_perdido', 'pareja_cancelada', 'multa_aplicada', 'suspension',
                 'suspension_levantada', 'cambio_en_cancha'])
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data || [];
}

export async function marcarNotificacionLeida(notifId) {
  const { error } = await supabase.from('notifications').update({ read_at: ahora().toISOString() }).eq('id', notifId);
  if (error) throw error;
}
