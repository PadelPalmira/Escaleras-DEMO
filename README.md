# Escaleras Palmira — versión DEMO

Copia de práctica de la app del club, con un club inventado adentro:
32 jugadores, cinco semanas de noches ya jugadas y la semana en curso lista
para practicar.

**No toca la app real ni sus datos.** Esta copia no tiene llaves de la base
de datos ni dirección a la cual llamar: todo corre dentro del navegador de
quien abre la página y se guarda solo ahí.

## Para qué sirve

- Que recepción y gerencia aprendan a usar la app sin miedo a descomponer nada.
- Ver la lógica funcionando ronda por ronda para poder pedir correcciones.

Trae un tutorial guiado de cinco lecciones que se hacen **sobre** la app: cada
paso se marca solo cuando lo haces.

## Qué cambia respecto a la app real

Solo tres archivos, y ninguno de ellos es de la app en sí:

| Archivo | Qué cambia |
|---|---|
| `assets/js/supabaseClient.js` | En vez del cliente de Supabase, carga el cliente falso de la demo. |
| `assets/js/config.js` | Las llaves del proyecto real se dejan **vacías** a propósito. |
| `index.html` | Título con "DEMO", se quita el SDK de Supabase y se cargan la barra y los estilos de la demo. |

Todo lo demás —`api.js`, `app.js`, `router.js`, `utils.js`, `icons.js`,
`niveles.js`, `styles.css` y las 14 pantallas de `views/`— es **byte por byte
el mismo archivo que la app real**. Por eso lo que se ve aquí es lo que hace
la app allá.

Lo que se agrega (y no existe en la app real):

```
assets/css/demo.css        la barra de arriba y el panel de tutorial
assets/js/demo/motor.js    el motor de escaleras traducido de Postgres a JS
assets/js/demo/semilla.js  arma el club falso jugando las noches de verdad
assets/js/demo/cliente.js  el cliente falso de Supabase
assets/js/demo/estado.js   el reloj de la demo y el guardado en el navegador
assets/js/demo/consola.js  barra: quién eres, reloj, reiniciar
assets/js/demo/tutorial.js las cinco lecciones
assets/js/demo/reglas_texto.js  el reglamento real, copiado de la base
pruebas/                   la prueba de fidelidad contra la base real
```

## Por qué se le puede creer a la demo

El motor de escaleras existe dos veces: en SQL para la app real y en
JavaScript para la demo. Para que la demo no enseñe algo que la app no hace,
`pruebas/verificar_motor.js` corre los **mismos** escenarios que se corrieron
contra la base de datos real y exige resultado idéntico: mismos
emparejamientos ronda por ronda y mismos puntos hasta los centavos.

```
node pruebas/verificar_motor.js
```

`pruebas/golden.json` es la salida real de Postgres, tal cual salió.

Si alguna vez cambia el SQL de la app real, hay que volver a generar el golden
y volver a correr esta prueba: si falla, la demo está mintiendo.
