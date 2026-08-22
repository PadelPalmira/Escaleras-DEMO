/* Reglamento REAL del club, copiado tal cual de la tabla rules_content de
   producción (9 secciones). En la app real esto vive en la base de datos y el
   Maestro lo puede editar; en la demo va aquí porque no hay base de datos. */

export const REGLAS = [
{ section_key: 'bienvenida', sort_order: 0, title: 'Bienvenido a Escaleras Palmira', body_markdown:
`Bienvenido al sistema de liga interna del club. Esta pantalla es tu guía completa — léela con calma antes de tu primera noche para que entiendas exactamente cómo funciona todo.

## En pocas palabras
Cada semana hay 5 noches de juego (lunes a viernes). Lo que haces en cancha te da **puntos**, tus puntos te ubican en una **categoría** (A o B), y una vez al mes se juega la **Liguilla**/**Torneo de Ascenso** para pelear tu lugar en la categoría A. Los viernes son 100% social — Retas Abiertas, sin puntos ni presión.

## Qué puedes hacer en la app
- **Convocatorias**: confirmar tu lugar (o el de tu pareja), buscar sustituto o cancelar.
- **Ranking**: ver tu categoría, tu puntaje y el de todos los demás.
- **Reglas**: esta sección — el reglamento completo, siempre a la mano.
- **Perfil**: tu historial de puntos, multas y notificaciones del club.

Si en algún momento algo no te queda claro, hay un botón de ayuda por WhatsApp directo con el club — no dudes en usarlo.` },

{ section_key: 'formato_de_juego', sort_order: 1, title: 'Así se juega una noche de Escaleras', body_markdown:
`Las noches de escalera (lunes a jueves) son de **8:00 a 10:00 pm** hora CDMX, en las 3 canchas del club. Los viernes de Retas Abiertas son de **7:00 a 11:00 pm**.

## El horario de la semana
- **Lunes** — Individual, Categoría A
- **Martes** — Individual, Categoría B
- **Miércoles** — Parejas Fijas, Categoría A
- **Jueves** — Parejas Fijas, Categoría B
- **Viernes** — Retas Abiertas, nivel libre (ver sección aparte)

Cada sesión de escalera tiene cupo para 12 jugadores repartidos en las 3 canchas (en Parejas Fijas eso equivale a 6 parejas).

## En Individual nunca juegas solo
Se llama Individual porque **te anotas solo**, no porque juegues solo: siempre se juega 2 contra 2. Lo que cambia es que **tu compañero te lo asigna la app y cambia en cada ronda**.

Funciona así:
1. En la **ronda 1** te toca un compañero al azar dentro de tu cancha.
2. Si ganan, **suben juntos** a la cancha de arriba. Si pierden, **bajan juntos**.
3. En la cancha nueva se encuentran con la otra pareja que llegó ahí, y la app vuelve a repartir a los cuatro.
4. **Tu compañero de la ronda anterior siempre pasa a ser tu rival.** Nunca repites compañero dos rondas seguidas.
5. Para elegir a tu nuevo compañero, la app prefiere a alguien con quien **no hayas jugado esa noche**. Si ya jugaste con los dos candidatos, te empareja con **el de hace más tiempo**.

Por eso el emparejamiento no se puede saber de antemano: la app lo calcula ronda por ronda, en cuanto el Admin captura los marcadores y sabe quién subió y quién bajó.

## En Parejas Fijas es al revés
Llegas con tu pareja, juegas **toda la noche con ella** y suben o bajan de cancha juntos. Aquí no hay sustitutos: si uno no puede ir, se cae la pareja completa.

## Cómo se arma cada noche
Dentro de las 2 horas se juegan varias rondas de 15 minutos cada una (hasta 7 rondas). La cancha 1 es la de mayor nivel dentro de tu categoría esa noche, la cancha 3 la de menor nivel — por eso jugar en cancha 1 vale más puntos (ver "Cómo funcionan tus puntos").

Subir y bajar de cancha según ganes o pierdas es el corazón del formato y siempre ha sido así: nadie se queda fijo en una cancha toda la noche.

Un Admin del club es quien arranca cada ronda y captura los resultados según se van jugando los partidos.` },

{ section_key: 'puntos', sort_order: 2, title: 'Cómo funcionan tus puntos', body_markdown:
`Tus puntos se ganan jugando — así se calculan:

## Por partido
- **2 puntos por cada game que ganas.**
- **+3 puntos de bono si ganas el partido.**

## Multiplicador de cancha
Todo lo anterior se multiplica según la cancha en la que jugaste esa ronda:
- Cancha 1 (la más alta): **×1.2**
- Cancha 2: **×1.0**
- Cancha 3 (la más baja): **×0.9**

Por eso subir de cancha dentro de tu categoría no solo se siente bien — también vale más puntos.

## Bono de cierre de noche
Al terminar la escalera, según en qué posición terminaste dentro de tu cancha se suma un bono extra:
- 1er lugar de tu cancha: **+10 puntos**
- 2do lugar: **+5 puntos**
- 3er lugar: **+0 puntos**

## Tu puntaje "móvil" (el que ves en Ranking)
No es un acumulado de toda tu vida en el club — es la suma de tus **últimas 6 escaleras cerradas**. Cada domingo a las 9:00am (hora CDMX), justo antes de que abran las convocatorias de la semana, el sistema recalcula todo: las escaleras más viejas van saliendo de la ventana y las más recientes van entrando. Esto significa que tu forma reciente siempre pesa más que resultados de hace meses.` },

{ section_key: 'categorias', sort_order: 3, title: 'Tu categoría', body_markdown:
`El club tiene dos categorías: **A** (la más alta) y **B**. Tu categoría es una sola — combina tu desempeño en Individual y en Parejas, nunca se llevan por separado.

## Cómo se calcula
Cada domingo a las 9:00am (hora CDMX) el sistema toma el puntaje móvil (últimas 6 escaleras) de todos los jugadores activos, los ordena de mayor a menor, y divide el grupo a la mitad: la mitad de arriba queda en **A**, la mitad de abajo en **B**. Esa es tu categoría para las convocatorias de esa semana.

## Si eres nuevo
Mientras no tengas suficiente historial de partidos jugados, la app te muestra todas las convocatorias abiertas sin restringirte por categoría — juega, acumula tus primeras escaleras, y en cuanto tengas resultados suficientes el sistema te asigna tu categoría automáticamente.

## Si llevas tiempo sin jugar
Si pasas 4 semanas o más sin registrar actividad, al volver entras temporalmente en una categoría "límite" mientras el sistema vuelve a tener suficiente información reciente tuya para ubicarte con precisión.` },

{ section_key: 'zona_limite', sort_order: 4, title: 'Zona Límite', body_markdown:
`Justo en la frontera entre categoría A y B hay una banda de los 3 jugadores más bajos de A y los 3 más altos de B — a esto le llamamos **Zona Límite**.

## Qué significa estar en Zona Límite
Si tu puntaje móvil te ubica en esa banda, tienes flexibilidad: puedes **quedarte** en tu categoría actual, o **probar el otro lado** (subir a A o bajar a B) para esa semana.

## Cómo se mantiene el balance
Cuando alguien de la banda decide cambiarse de lado, el sistema hace un intercambio 1x1 automático con alguien del otro extremo de la Zona Límite, para que ninguna categoría se quede con más o menos cupo del que le corresponde.

Es la forma en que el club te deja "probar tu siguiente nivel" sin que sea un salto brusco ni definitivo — tu resultado de esa semana sigue contando normal para tu puntaje móvil.` },

{ section_key: 'convocatorias', sort_order: 5, title: 'Convocatorias y listas de espera', body_markdown:
`## Cuándo abren
Las convocatorias de **toda la semana** se publican de golpe cada **domingo a las 10:00 am** (hora CDMX), una hora después de que se recalculan las categorías.

## Domingo de 10:00 am a 6:00 pm — ventana del top 12
Durante esas 8 horas, los **12 mejores del ranking** de tu categoría pueden apartar su lugar en **todos los eventos de la semana**. Es la ventaja de ir arriba en el ranking: escoges primero.

En **Individual** apartas tu lugar directo. En **Parejas Fijas** te inscribes con la pareja que quieras; tu lugar es **provisional** hasta las 6:00 pm, porque las parejas se ordenan por el **promedio de puntos de los dos**. Si se anota una pareja con mejor promedio, pueden desplazarlos a lista de espera.

Si **no** estás en el top 12, durante esas horas puedes **pedir entrar a la lista de espera**. No es automático: si no lo pides, no te formas.

## Domingo 6:00 pm — se acaba la preferencia
A esa hora:
1. Quien tenía ventaja y no la usó, la pierde para esa semana.
2. Los lugares que sobren se reparten **por orden de llegada** entre quienes ya estaban en la lista de espera.
3. La convocatoria queda **abierta para cualquiera** el resto de la semana, también por orden de llegada.

## Lista de espera
Es estrictamente **por orden de solicitud**: el primero que la pidió es el primero que entra. No influyen los puntos ni la categoría. Cuando alguien se da de baja, el sistema mete al siguiente de la fila automáticamente y le manda aviso.

## Si no se llena el cupo
El club **no cancela de inmediato**. Se le da tiempo a la lista de espera para llenar los huecos. Cuando faltan **6 horas** para la sesión, la app le muestra al administrador cuántos confirmados hay y le sugiere qué hacer (jugar con menos canchas o cancelar la noche). La decisión final siempre es del administrador. Si se cancela la noche, **nadie recibe penalización ni pierde puntos**.` },

{ section_key: 'sustitutos', sort_order: 6, title: 'Sustitutos y penalizaciones', body_markdown:
`## Buscar sustituto (solo Individual)
Si ya tienes lugar pero no vas a poder ir, tú mismo eliges tu sustituto desde la app (Convocatorias → Buscar sustituto). Los puntos que se ganen esa noche se reparten:
- **66% para ti** (el ausente).
- **34% para tu sustituto.**

Dejar sustituto **nunca tiene penalización**, aunque falten menos de 12 horas.

## En Parejas Fijas no hay sustituto
Si uno de los dos no puede ir, **se cae la pareja completa** y se libera su lugar. Es la única forma justa: el formato depende de que jueguen los mismos dos toda la noche.

## Bajas: la regla de las 12 horas
- **12 horas o más antes** de la sesión: sin penalización, tu lugar simplemente se libera.
- **Menos de 12 horas**: solo hay penalización **si nadie toma tu lugar**. Si consigues sustituto, o si alguien de la lista de espera entra en tu lugar de inmediato, no se te cobra nada. Si no, se descuenta el **15% de tus puntos del mes**.

La app te dice exactamente qué va a pasar **antes** de que confirmes la baja: nunca es sorpresa.

## Perder la ventaja de ranking por abusar
Si en una misma semana **confirmas todos tus eventos y luego te das de baja de todos** sin dejar sustituto y sin que nadie tome tu lugar, pierdes la **ventaja de ranking de la semana siguiente**: ese domingo no puedes apartar lugar de 10 am a 6 pm, te formas como todos por orden de llegada. A la siguiente semana la recuperas.

La app te avisa antes de la baja que te va a costar la ventaja, y te manda una notificación cuando pasa.

## Sustituto de coach
Si quien cubre es un coach del club, el coach **no acumula puntos** y tú recibes la penalización completa según el tiempo de aviso — igual que si no hubieras conseguido sustituto.

## Sustituto autorizado por administración
Para emergencias reales (médicas, por ejemplo), recepción puede meter un sustituto **sin reparto de puntos**: el sustituto se lleva el 100% de lo que gane porque sí jugó, y al ausente esa noche simplemente **no le cuenta** — ni puntos ni penalización. Es el único caso en el que sí se puede meter sustituto en Parejas Fijas, para que su compañero no se quede sin jugar. Queda a criterio del administrador.

## No presentarse
Si no llegas y no avisaste, es **no-show**: se descuenta el **50% de tus puntos del mes** y puede aplicar multa.` },

{ section_key: 'liguilla', sort_order: 7, title: 'Liguilla y Torneo de Ascenso', body_markdown:
`Una vez al mes, en lugar de la sesión normal de esa semana, se juega la **Liguilla** (Categoría A) y el **Torneo de Ascenso** (Categoría B).

## Cuándo es — se programa sola
La Liguilla de cada mes es siempre la **última noche de Parejas Fijas del mes** de tu categoría (miércoles para A, jueves para B). El sistema la programa automáticamente, así que desde el **primer día del mes** ya puedes ver la fecha exacta en la pestaña **Liguilla** de la app.

## La carrera en tiempo real
En esa misma pestaña, durante todo el mes, ves:
- La **tabla de líderes en vivo** de tu categoría y la línea de corte del top 12.
- Tu lugar y tus puntos actualizados con cada noche que se juega.
- **Cuántos puntos te faltan** para entrar al top 12 y aproximadamente cuánto necesitas en tu siguiente escalera.
- Si matemáticamente ya no alcanzas este mes, también te lo dice claro.

## Quién califica
Los **12 mejores** de cada categoría por puntaje móvil al cierre del mes. La confirmación de asistencia se cierra **24 horas antes** del evento.

## El draft
El jugador mejor posicionado (rank 1) elige primero a su pareja de entre los calificados; el elegido tiene que **aceptar**. Si a alguna pareja le quedan menos de 2 horas sin formarse, el sistema la autogenera para no atrasar el evento.

## El formato — "Torneo Relámpago" (Lucky Loser)
- **Ronda 1** (sembrada): 1 vs 6, 2 vs 5, 3 vs 4.
- **Ronda 2**: el mejor sembrado de la Ronda 1 juega contra el "Lucky Loser" (el perdedor con mejor desempeño); los otros dos ganadores se enfrentan entre sí; los dos perdedores de Ronda 1 que no fueron Lucky Loser juegan la consolación por el 5°/6° lugar.
- **Final**: solo entre el 1° y 2° lugar. El 3° y 4° lugar quedan definidos directamente por los resultados de Ronda 2, sin partido extra.

Desempate para elegir al Lucky Loser: primero games ganados, luego sets ganados.

## Formato de los sets
Se juega a 2 de 3 sets; el tercer set es súper muerte a 10 puntos; en 40-40 se juega punto de oro (sin ventajas).

## El premio
Los campeones de Liguilla y de Ascenso se ganan un **cupo garantizado en Categoría A** el mes siguiente. Si no hay suficientes jugadores para armar el torneo completo, ganan por default los 2 jugadores con más puntos ese mes.` },

{ section_key: 'retas_abiertas', sort_order: 8, title: 'Retas Abiertas', body_markdown:
`Los **viernes de 7:00 a 11:00 pm** son noche libre y social — nivel abierto, sin categoría, sin puntos ni ranking de por medio.

## Cuesta $150 por persona
Se paga en recepción y **juegas todo el tiempo que quieras** dentro del horario. No hay cupo ni lista de espera: llegas y juegas.

## Formato
"Rey de la cancha": se juega a 4 games, el que gana se queda, y la fila para entrar es ilimitada.

## Anótate para que se vea quién va
Puedes anotarte desde la app (Convocatorias → esa noche del viernes) para que todo el club vea cuántos van y quiénes. Anotarte **no aparta lugar ni cuesta puntos**: es puro ambiente. Puedes salirte cuando quieras, sin penalización.` },
];
