// Iconos SVG minimalistas (trazo, estilo outline) — sin dependencias externas.
function svg(paths, viewBox = '0 0 24 24') {
  return `<svg viewBox="${viewBox}" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export const icon = {
  home: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9"/>'),
  // Ranking = podio de tres escalones. Antes era una copa, igual que
  // Liguilla: dos copas seguidas en la barra de abajo no se distinguen.
  ranking: svg('<path d="M3 21h18"/><rect x="4" y="12.5" width="4.8" height="8.5" rx="1"/><rect x="9.6" y="7" width="4.8" height="14" rx="1"/><rect x="15.2" y="15.5" width="4.8" height="5.5" rx="1"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>'),
  book: svg('<path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7.5A2.5 2.5 0 0 0 5 22.5"/><path d="M5 4.5v15A2.5 2.5 0 0 1 7.5 22H19"/>'),
  user: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>'),
  chevronRight: svg('<path d="m9 6 6 6-6 6"/>'),
  check: svg('<path d="m5 13 4 4L19 7"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  logout: svg('<path d="M15 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8"/><path d="M10 12h11M17 8l4 4-4 4"/>'),
  // Copa CON asas: sin ellas se lee como copa de vino, no como trofeo
  // (se vio así en la barra de abajo y en el encabezado de Liguilla).
  trophy: svg('<path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4.5A1.5 1.5 0 0 0 3 7.5 3.5 3.5 0 0 0 6.5 11H7"/><path d="M17 6h2.5A1.5 1.5 0 0 1 21 7.5 3.5 3.5 0 0 1 17.5 11H17"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  swap: svg('<path d="M7 7h11l-3-3M17 17H6l3 3"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>'),
  shield: svg('<path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6L12 3Z"/><path d="m9 12 2 2 4-4"/>'),
  settings: svg('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.4-2-3.4-2.3.8a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.3-.8-2 3.4 2 1.4a7.6 7.6 0 0 0 0 3l-2 1.4 2 3.4 2.3-.8a7.6 7.6 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.8 2-3.4-2-1.4Z"/>'),
  coin: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.3c0-1.1 1.1-2 2.5-2s2.5.8 2.5 1.8-1 1.6-2.5 2-2.5 1-2.5 2 1.1 1.9 2.5 1.9 2.5-.8 2.5-1.9"/>'),
  ban: svg('<circle cx="12" cy="12" r="9"/><path d="m5.5 5.5 13 13"/>'),
  bell: svg('<path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z"/><path d="M9.5 17a2.5 2.5 0 0 0 5 0"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  // Raqueta de pádel: pala ovalada con perforaciones y grip. La versión
  // anterior (círculo + línea diagonal) se leía como lupa de búsqueda a
  // cualquier tamaño — y con los iconos ya visibles, se notaba de más.
  racket: svg('<path d="M12 2.6c3 0 5.3 2.3 5.3 5.3v3.4c0 2.9-2.4 5.3-5.3 5.3s-5.3-2.4-5.3-5.3V7.9c0-3 2.3-5.3 5.3-5.3Z"/><path d="M12 16.6V21"/><path d="M10.2 21h3.6"/>'),
  whatsapp: svg('<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z"/><path d="M8.3 8.7c.2-.6.5-.6.8-.6h.5c.2 0 .4 0 .5.4.2.5.6 1.6.7 1.7.1.1.1.3 0 .5-.1.2-.2.3-.3.4l-.4.5c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l.6-.7c.2-.3.4-.2.6-.1l1.5.7c.2.1.3.2.4.3.1.2.1.9-.2 1.4-.3.5-1.4 1.1-2 1.1-.6 0-1.3 0-4.2-1.7-2.9-1.7-3.7-4.6-3.8-4.8-.1-.2-.9-1.4-.9-2.6 0-1.2.6-1.8.8-2Z"/>'),
};
