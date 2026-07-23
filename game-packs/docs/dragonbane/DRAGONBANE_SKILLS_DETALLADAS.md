# Dragonbane - Skills detalladas

Documento de referencia para consultas especificas sobre habilidades.

## 1) Como funcionan las skills en Dragonbane

Las skills no tienen dano, durabilidad, coste, alcance ni resistencia propios.
Sus datos mecanicos reales son:

- Nombre
- Atributo base
- Tipo de uso
- Interacciones con equipo, estados o reglas especiales

## 2) Skills generales

Formato:
Nombre | Atributo | Tipo de uso | Datos mecanicos utiles

- Alerta | INT | Tirada reactiva/pasiva | Detecta peligros; casco y yelmo pueden imponer desventaja.
- Artesania | FUE | Tirada de produccion/reparacion | Requiere herramientas adecuadas; aguja e hilo repara ropa.
- Atletismo | AGI | Tirada fisica | Sirve para trepar, saltar y escalar; arpeo y cuerdas dan ventaja; armadura completa da desventaja.
- Bestias | INT | Tirada de interaccion | Trato con animales y bestias naturales.
- Caza y pesca | AGI | Tirada de recursos | Cana de pescar, red de pesca y trampas la apoyan.
- Cabalgar | AGI | Tirada de montura | La silla de montar evita una desventaja al combatir a caballo.
- Curacion | INT | Tirada de soporte vital | Vendas evitan desventaja al salvar vidas; instrumental quirurgico da ventaja; hierbas curativas ayudan contra enfermedades.
- Dedos agiles | AGI | Tirada de precision | Ganzuas normales evitan una desventaja; ganzuas de calidad dan ventaja.
- Descubrir | INT | Tirada de investigacion | La lupa da ventaja.
- Enganar | CAR | Tirada enfrentada social | Puede aplicarse a faroles, disfraces y juegos con cartas.
- Esquivar | AGI | Reaccion | Se usa contra ataques, monstruos y varios hechizos; algunas armaduras dan desventaja.
- Idiomas | INT | Tirada de conocimiento | No tiene modificadores de dano o coste propios.
- Interpretar | CAR | Tirada social/artistica | Instrumentos musicales interactuan con la capacidad Musica.
- Marineria | INT | Tirada de navegacion | Relevante en barcos y tareas nauticas.
- Mitos y leyendas | INT | Tirada de conocimiento | Identifica referencias historicas, culturales y arcanas.
- Nadar | AGI | Tirada de movimiento | Se usa en agua y bajo riesgo de ahogo.
- Persuadir | CAR | Tirada social | Algunos monstruos concretos pueden ser persuadidos con desventaja.
- Regatear | CAR | Tirada economica | Influye en comercio; no tiene dano ni coste propio.
- Sigilo | AGI | Tirada de ocultacion | Varias armaduras dan desventaja.
- Supervivencia | INT | Tirada de viaje/campo | Mapa, catalejo, cocina, mantas, pieles y tiendas la modifican.

## 3) Skills de armas

La skill no define el dano del ataque: lo define el arma concreta.

Formato:
Nombre | Atributo | Tipo de uso | Datos mecanicos utiles

- Arcos | AGI | Tirada de ataque | Usa las estadisticas del arco concreto.
- Ballestas | AGI | Tirada de ataque | Usa las estadisticas de la ballesta concreta.
- Cuchillos | AGI | Tirada de ataque | Usa las estadisticas del cuchillo, daga o arma sutil concreta.
- Espadas | FUE | Tirada de ataque | Usa las estadisticas del arma concreta.
- Hachas | FUE | Tirada de ataque | Usa las estadisticas del arma concreta.
- Hondas | AGI | Tirada de ataque | Usa las estadisticas del arma concreta.
- Lanzas | FUE | Tirada de ataque | Usa las estadisticas del arma concreta.
- Pelea | FUE | Tirada de ataque | Desarmado tiene alcance 2 y dano D6 contundente.
- Martillos | FUE | Tirada de ataque | Usa las estadisticas del arma concreta.
- Varas | AGI | Tirada de ataque | Usa las estadisticas del arma concreta.

## 4) Reglas practicas para IA

- Si preguntas por el dano de una skill de arma, la respuesta correcta debe ir al arma concreta.
- Si preguntas por alcance o resistencia de una skill, normalmente no aplica; esos datos pertenecen al equipo o al hechizo.
- Si preguntas por modificadores, los mas comunes vienen de armadura, herramientas, estados, luz, montura o terreno.

## 5) Plantilla de consulta

- Skill:
- Accion que se intenta:
- Equipo involucrado:
- Estado del PJ:
- Entorno:
- Pregunta puntual:

Ejemplo:

"Skill: Dedos agiles. Accion: abrir cerradura de cofre. Equipo involucrado: ganzuas de calidad. Estado del PJ: ninguno. Entorno: oscuridad con vela. Pregunta puntual: tiro normal, con ventaja o con desventaja?"