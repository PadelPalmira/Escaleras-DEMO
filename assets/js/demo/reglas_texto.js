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

Un Admin del club es quien arranca la noche y captura los resultados según se van jugando los partidos. La noche empieza cuando recepción le da **"Comenzar escalera"**, ya con todos en cancha: hasta ese momento la lista sigue abierta.

Se juegan hasta 7 rondas. Al llegar a la 7 la app ya no deja generar más.

## El marcador de cada ronda
Cada ronda dura **15 minutos exactos**. Al llegar a los 15 se termina el game que se esté jugando y ahí se para: el marcador que quedó es el resultado de la ronda. No se juegan sets completos — eso es solo en la Liguilla.

Dentro de cada game se juega **punto de oro en 40-40** (sin ventajas). Y si al minuto 15 el marcador va igualado (por ejemplo 4-4), se juega **un punto de oro** para definir ese último game: siempre hay un ganador. La app no acepta un marcador empatado.
` },

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
No es un acumulado de toda tu vida en el club. La app toma tus **últimas 6 escaleras cerradas** y saca tu **promedio de puntos por noche**: ese promedio es el que te ordena en el Ranking.

Es el promedio y no la suma a propósito: si fuera la suma, iría arriba el que más veces juega en vez del que mejor juega, y el que se va de viaje dos semanas caería aunque llegara ganando.

- Cada **domingo a las 9:00 am** (hora CDMX), justo antes de que abran las convocatorias, el sistema recalcula todo.
- Una noche jugada cuenta durante **8 semanas**. Después sale de tu ventana: si dejas de venir, tu puntaje se apaga solo y le deja el lugar a quien sí está jugando.
- Mientras no llegues a **3 noches** en tu ventana, tu promedio sale marcado como **provisional**: se ve en el Ranking, pero todavía no te sube ni te baja de categoría.

## Y las penalizaciones
Si te cae una penalización (baja tardía o no-show) se resta de tu puntaje móvil, pero **la noche que no jugaste no te ocupa un lugar de tus 6**: te cuesta exactamente lo que la app te dijo, ni un punto más.` },

{ section_key: 'categorias', sort_order: 3, title: 'Tu categoría', body_markdown:
`El club tiene dos categorías: **A** (la más alta) y **B**. Tu categoría es una sola — combina tu desempeño en Individual y en Parejas, nunca se llevan por separado.

## Se sube y se baja, como en el futbol
Cada categoría conserva a su gente. Cada **domingo a las 9:00am** (hora CDMX) pasa una sola cosa:

- **Bajan a B los 2 con peor promedio de la tabla de A.**
- **Suben a A los 2 con mejor promedio de la tabla de B.**
- **Nadie más se mueve.**

Nada de recalcular todo cada semana: si vas a media tabla, tu categoría no cambia aunque tengas una mala noche. Solo se mueven las orillas.

## Quién entra al intercambio
Solo quien lleve al menos **3 noches** en su ventana móvil (tus últimas 6 escaleras de las últimas 8 semanas). Con menos, tu promedio todavía es **provisional** y la app no te mueve: ni te baja por una sola mala noche, ni te sube porque jugaste una vez y te fue bien.

## Si dos empatan en promedio
Se desempata con criterios de cancha, en este orden: **más partidos ganados**, luego **mejor diferencia de games**, luego **más noches jugadas** y, hasta el final, por orden alfabético. Nunca al azar.

## Zona de descenso y zona de ascenso
En la pestaña Ranking se marcan los **3 últimos de A** ("zona de descenso") y los **3 primeros de B** ("zona de ascenso"). Es solo un aviso para que sepas dónde estás parado; los que de verdad se mueven son 2 de cada lado.

## Si eres nuevo
Tu primera categoría sale del nivel que declaraste al registrarte. A partir de ahí subes o bajas jugando, como todos.

## Si te avisan
Cuando subes o bajas, la app te manda una notificación el domingo. No te enteras llegando a la cancha.` },

{ section_key: 'zona_limite', sort_order: 4, title: 'Zona de descenso y de ascenso', body_markdown:
`En la tabla de tu categoría se marcan las orillas, para que sepas qué está en juego cada semana.

## Si estás en Categoría A
Los **3 últimos** de la tabla aparecen marcados en **zona de descenso**. De esos, los **2 con peor promedio por noche** bajan a B el domingo. Estar marcado no significa que ya bajaste: significa que una buena noche te saca de ahí.

## Si estás en Categoría B
Los **3 primeros** aparecen en **zona de ascenso**, y los **2 con mejor promedio** suben a A el domingo. Es la forma directa de subir: ganar en B.

## Si tu puntaje dice "Provisional"
Quiere decir que todavía no llegas a 3 noches jugadas en tu ventana. Apareces en la tabla, pero fuera del intercambio: ni bajas ni subes hasta completar esas noches.

## Por qué solo se mueven 2
Porque el puntaje móvil son tus últimas 6 escaleras y los de media tabla están muy cerca unos de otros: si se recalculara todo cada semana, media liga andaría cambiando de categoría todo el tiempo y nadie llegaría a conocer a su grupo. Con 2 y 2, la categoría se siente estable y aun así siempre hay algo que pelear.

## Si las categorías se desbalancean
Si por altas o bajas una categoría queda con dos o más jugadores activos de diferencia que la otra, ese domingo se mueve **uno extra** hacia la más chica, para que las dos tengan gente suficiente para llenar sus noches.` },

{ section_key: 'convocatorias', sort_order: 5, title: 'Convocatorias y listas de espera', body_markdown:
`## Cuándo abren
Las convocatorias de **toda la semana** se publican de golpe cada **domingo a las 10:00 am** (hora CDMX), una hora después de que se recalculan las categorías.

## Cada noche parte sus lugares en dos
De los 12 lugares de cada noche:
- **8 se apartan para el top 12 del ranking** de tu categoría durante el domingo.
- **4 quedan abiertos para el resto de la categoría**, por orden de llegada, desde las 10:00 am.

Así el ranking sigue valiendo, pero la noche nunca se cierra completa a las 10:01 del domingo: siempre hay puerta de entrada aunque no vayas arriba.

## Domingo de 10:00 am a 6:00 pm
Si vas en el **top 12**, puedes apartar uno de los 8 lugares reservados. Si esos 8 ya se llenaron, te formas en la lista de espera: los 4 abiertos son para los demás hasta las 6:00 pm.

Si **no** vas en el top 12, puedes tomar uno de los 4 lugares abiertos en cuanto abre la convocatoria. Si ya se acabaron, te anotas a la lista de espera.

En **Individual** apartas tu lugar directo. En **Parejas Fijas** te inscribes con la pareja que quieras; si entran por los lugares del ranking, su lugar es **provisional** hasta las 6:00 pm, porque esas parejas se ordenan por el **promedio de puntos de las dos personas**.

## Domingo 6:00 pm — se acaba la separación
A esa hora:
1. Quien tenía ventaja y no la usó, la pierde para esa semana.
2. Los lugares que sobren se reparten **por orden de llegada** entre quienes ya estaban en la lista de espera, sin distinguir top o no top.
3. La convocatoria queda **abierta para cualquiera** el resto de la semana, también por orden de llegada.

## Cada quien ve su categoría
En Convocatorias solo aparecen las noches de **tu** categoría. Si crees que te toca otra, habla con recepción: ellos sí pueden meterte, pero tienen que confirmarlo a propósito.

## Lista de espera
Es estrictamente **por orden de solicitud**: el primero que la pidió es el primero que entra. Cuando alguien se da de baja, el sistema mete al siguiente de la fila automáticamente y le manda aviso.

## Hasta cuándo te puedes anotar
La lista sigue abierta **hasta que recepción arranca la noche**, no hasta la hora de inicio. Si llegas al club y todavía hay lugar, te puedes anotar ahí mismo desde tu teléfono o pedirle a recepción que te meta. En cuanto le dan "Comenzar escalera" la lista se cierra: ya nadie entra.

## Si no se llena el cupo, no hay escalera
Se juega **2 contra 2**, o sea de 4 en 4: con 10 personas no se pueden armar las canchas. Por eso la escalera **solo arranca con los 12 lugares llenos**.

Cuando faltan 6 horas la app le avisa a recepción cuántos faltan, y ellos pueden meter a quien llegue. Si de plano no se completa, **se cancela la noche**: nadie recibe penalización ni pierde puntos, y la app les avisa a todos. Lo que se organice después entre los que llegaron es cosa de ustedes con recepción — no lo arma la app, no da puntos y no cuenta para el ranking.` },

{ section_key: 'sustitutos', sort_order: 6, title: 'Sustitutos y penalizaciones', body_markdown:
`## Buscar sustituto (solo Individual)
Si ya tienes lugar pero no vas a poder ir, tú mismo eliges tu sustituto desde la app (Convocatorias → Buscar sustituto). Los puntos que se ganen esa noche se reparten:
- **66% para ti** (el ausente).
- **34% para tu sustituto.**

Dejar sustituto **nunca tiene penalización**, aunque falten menos de 12 horas.

## En Parejas Fijas no hay sustituto
Si uno de los dos no puede ir, **se cae la pareja completa** y se libera su lugar. Es la única forma justa: el formato depende de que jueguen los mismos dos toda la noche. Al compañero arrastrado no le cae ninguna penalización.

## Bajas: la regla de las 12 horas
- **12 horas o más antes** de la sesión: sin penalización, tu lugar simplemente se libera.
- **Menos de 12 horas**: solo hay penalización **si nadie toma tu lugar**. Si consigues sustituto, o si alguien de la lista de espera entra en tu lugar de inmediato, no se te cobra nada. Si no, se descuenta el **15% de tu puntaje móvil** (el de tus últimas 6 noches).

Se cobra sobre el puntaje móvil y no sobre "los puntos del mes" justamente para que cueste lo mismo faltar el día 2 que el día 28. Y la noche que no jugaste **no te ocupa un lugar de tus 6**: el castigo es solo el que la app te anuncia.

La app te dice exactamente qué va a pasar **antes** de que confirmes la baja: nunca es sorpresa.

## Perder la ventaja de ranking por abusar
Si en una misma semana **confirmas todos tus eventos y luego te das de baja de todos** sin dejar sustituto y sin que nadie tome tu lugar, pierdes la **ventaja de ranking de la semana siguiente**: ese domingo no puedes apartar lugar de 10 am a 6 pm, te formas como todos por orden de llegada. A la siguiente semana la recuperas.

La app te avisa antes de la baja que te va a costar la ventaja, y te manda una notificación cuando pasa.

## Sustituto de coach
Si quien cubre es un coach del club, el coach **no acumula puntos** y a ti esa noche **no te cuenta**: no ganas puntos, pero tampoco te entra un cero al promedio. Si te bajaste tarde y nadie más iba a tomar tu lugar, la penalización por la baja sí aplica normal.

## Sustituto autorizado por administración
Para emergencias reales (médicas, por ejemplo), recepción puede meter un sustituto **sin reparto de puntos**: el sustituto se lleva el 100% de lo que gane porque sí jugó, y al ausente esa noche simplemente **no le cuenta** — ni puntos ni penalización. Es el único caso en el que sí se puede meter sustituto en Parejas Fijas, para que su compañero no se quede sin jugar. Queda a criterio del administrador.

## No presentarse
Si no llegas y no avisaste, es **no-show**: se descuenta el **50% de tu puntaje móvil** y puede aplicar multa.` },

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
Los **12 mejores** de cada categoría según el ranking (promedio por noche) al cierre del mes. La confirmación de asistencia se cierra **24 horas antes** del evento.

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
