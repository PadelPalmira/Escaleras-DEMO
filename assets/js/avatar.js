/* ============================================================
   Fotos de perfil — compresión en el celular ANTES de subir
   ------------------------------------------------------------
   El plan de Supabase de este club no incluye redimensionado de
   imágenes en el servidor (eso es solo del plan Pro en adelante),
   así que la foto se recorta, se achica y se comprime aquí mismo,
   en el navegador del jugador, antes de que salga a internet.
   Se recorta a un cuadrado y se prueba con calidades/tamaños cada
   vez más chicos hasta quedar dentro del límite (por defecto 80 KB)
   — así una foto de celular de 4-8 MB termina pesando unos 20-70 KB.
   ============================================================ */

function soportaWebp() {
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    return c.toDataURL('image/webp').indexOf('data:image/webp') === 0;
  } catch { return false; }
}

/**
 * Comprime una foto de perfil a un cuadrado pequeño y liviano.
 * @param {File|Blob} archivo - la foto elegida por el jugador.
 * @param {{maxBytes?: number, maxDim?: number, minDim?: number}} opts
 * @returns {Promise<{blob: Blob, tipo: string}>}
 */
export async function comprimirFotoPerfil(archivo, opts = {}) {
  const maxBytes = opts.maxBytes ?? 80 * 1024;
  const maxDim = opts.maxDim ?? 480;
  const minDim = opts.minDim ?? 160;

  if (!archivo || !String(archivo.type || '').startsWith('image/')) {
    throw new Error('Elige un archivo de imagen (foto o captura de pantalla).');
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(archivo);
  }

  const tipo = soportaWebp() ? 'image/webp' : 'image/jpeg';
  const lado = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - lado) / 2;
  const sy = (bitmap.height - lado) / 2;

  let dim = maxDim;
  let mejorIntento = null;
  while (dim >= minDim) {
    const canvas = document.createElement('canvas');
    canvas.width = dim; canvas.height = dim;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, sx, sy, lado, lado, 0, 0, dim, dim);

    for (const calidad of [0.82, 0.65, 0.5, 0.35, 0.22]) {
      // eslint-disable-next-line no-await-in-loop
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad));
      if (!blob) continue;
      if (!mejorIntento || blob.size < mejorIntento.size) mejorIntento = blob;
      if (blob.size <= maxBytes) return { blob, tipo };
    }
    dim = Math.round(dim * 0.75);
  }

  if (!mejorIntento) throw new Error('No se pudo procesar esa imagen. Intenta con otra foto.');
  // No se logró bajar del tope exacto (foto muy compleja) — se entrega el
  // intento más chico que se pudo lograr en vez de fallar por completo.
  return { blob: mejorIntento, tipo };
}
