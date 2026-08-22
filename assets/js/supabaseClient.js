/* En la app real este archivo crea el cliente de Supabase. En la demo se
   cambia por un cliente falso que responde igual pero contra una base de
   datos que vive en el navegador. Es el ÚNICO archivo de la app que cambia:
   todo lo demás (api.js, las vistas, los estilos) es idéntico a la app real,
   para que lo que veas aquí sea de verdad lo que hace la app. */
import { createClient } from './demo/cliente.js';

export const supabase = createClient();
