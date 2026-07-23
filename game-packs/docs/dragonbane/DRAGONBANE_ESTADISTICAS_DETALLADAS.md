# Dragonbane - Estadisticas detalladas

## Archivos separados

- Ver skills en [DRAGONBANE_SKILLS_DETALLADAS.md](./DRAGONBANE_SKILLS_DETALLADAS.md)
- Ver magia en [DRAGONBANE_MAGIA_DETALLADA.md](./DRAGONBANE_MAGIA_DETALLADA.md)
- Ver equipo en [DRAGONBANE_EQUIPO_DETALLADO.md](./DRAGONBANE_EQUIPO_DETALLADO.md)
- Ver bestiario en [DRAGONBANE_BESTIARIO_DETALLADO.md](./DRAGONBANE_BESTIARIO_DETALLADO.md)

Documento de referencia mecanica para consultas especificas a IA.

Este archivo se conserva como compendio general. El contenido nuevo y ampliado se separo por tema en los cuatro archivos anteriores.

---

Objetivo:

- Tener campos concretos por tipo de entrada.
- Separar lo que el juego define como estadistica real de lo que solo es descripcion.
- Dejar fichas utiles para enemigos, skills, hechizos, herramientas y equipo.

## 1) Que cuenta como "estadistica" en Dragonbane

## 1.1 Skills

Las skills no tienen dano, durabilidad, coste ni alcance propio.
Sus datos mecanicos reales son:

- Nombre
- Atributo base
- Contexto de uso
- Si suelen usarse como tirada normal, enfrentada o reaccion
- Si interactuan con equipo, estados o reglas especiales

## 1.2 Hechizos

Los hechizos si tienen estadisticas concretas:

- Rango
- Prerrequisito
- Requisito
- Tiempo de lanzamiento
- Alcance
- Duracion
- Efecto base
- Escalado por nivel de poder

## 1.3 Armas y equipo

Las armas usan:

- Agarre
- FUE requerida
- Alcance
- Dano
- Resistencia
- Coste
- Disponibilidad
- Tipo

Las armaduras usan:

- Nivel de armadura
- Coste
- Disponibilidad
- Efecto

Las mercancias, herramientas y utilidades usan:

- Coste
- Disponibilidad
- Peso
- Efecto

## 1.4 Enemigos

Los monstruos usan:

- Ferocidad
- Tamano
- Movimiento
- Armadura
- PG
- Resistencia/Inmunidad si aplica
- Rasgos especiales
- Tabla de ataques de monstruo

Los no muertos humanoides y otros enemigos tipo PNJ usan a veces:

- Movimiento
- Bonificacion de dano
- Armadura tipica
- PG
- PV si lanzan magia o usan capacidades
- Habilidades
- Capacidades
- Arma tipica

---

## 2) Skills detalladas

Formato:
Nombre | Atributo | Tipo de uso | Datos mecanicos utiles

### 2.1 Generales

- Alerta | INT | Tirada reactiva/pasiva | Detecta peligros; puede sufrir desventaja por casco/yelmo.
- Artesania | FUE | Tirada de produccion/reparacion | Requiere herramientas apropiadas; aguja e hilo repara ropa.
- Atletismo | AGI | Tirada fisica | Se usa para trepar, saltar, escalar; arpeo y cuerdas dan ventaja; armadura completa da desventaja.
- Bestias | INT | Tirada de interaccion | Trato con animales o bestias naturales.
- Caza y pesca | AGI | Tirada de recursos | Cana de pescar y red de pesca dan comida; trampas permiten cazar.
- Cabalgar | AGI | Tirada de montura | Silla de montar evita una desventaja al combatir a caballo.
- Curacion | INT | Tirada de soporte vital | Vendas evitan desventaja al salvar vidas; instrumental quirurgico da ventaja al salvar vidas; hierbas curativas dan ventaja contra enfermedades.
- Dedos agiles | AGI | Tirada de precision | Ganzuas normales evitan desventaja; ganzuas de calidad dan ventaja.
- Descubrir | INT | Tirada de investigacion | Lupa da ventaja.
- Enganar | CAR | Tirada enfrentada social | Baraja de cartas puede resolverse con ENGANAR.
- Esquivar | AGI | Reaccion | Se usa contra ataques y varios efectos de monstruo; armaduras pueden dar desventaja.
- Idiomas | INT | Tirada de conocimiento | Sin dano ni coste propio.
- Interpretar | CAR | Tirada social/artistica | Instrumentos musicales modifican la capacidad Musica.
- Marineria | INT | Tirada de navegacion | Relacionada con embarcaciones.
- Mitos y leyendas | INT | Tirada de conocimiento | Soporte para informacion cultural o arcana.
- Nadar | AGI | Tirada de movimiento | Afectada por entorno acuatico.
- Persuadir | CAR | Tirada social | Muchos monstruos son inmunes salvo excepcion.
- Regatear | CAR | Tirada economica | Influye en comercio, no tiene dano ni coste.
- Sigilo | AGI | Tirada de ocultacion | Varias armaduras dan desventaja.
- Supervivencia | INT | Tirada de viaje/campo | Catalejo, mapa, cocinas, pieles, mantas, tiendas y ropa alteran esta skill.

### 2.2 Armas

- Arcos | AGI | Tirada de ataque | Usa las estadisticas del arma concreta.
- Ballestas | AGI | Tirada de ataque | Usa las estadisticas del arma concreta.
- Cuchillos | AGI | Tirada de ataque | Usa las estadisticas del arma concreta.
- Espadas | FUE | Tirada de ataque | Usa las estadisticas del arma concreta.
- Hachas | FUE | Tirada de ataque | Usa las estadisticas del arma concreta.
- Hondas | AGI | Tirada de ataque | Usa las estadisticas del arma concreta.
- Lanzas | FUE | Tirada de ataque | Usa las estadisticas del arma concreta.
- Pelea | FUE | Tirada de ataque | Desarmado hace alcance 2 y dano D6 contundente.
- Martillos | FUE | Tirada de ataque | Usa las estadisticas del arma concreta.
- Varas | AGI | Tirada de ataque | Usa las estadisticas del arma concreta.

Conclusiones para IA:

- Una skill no tiene "durabilidad" ni "coste".
- La skill de arma no define el dano: lo define el arma concreta.
- La skill base mas afectada por equipo utilitario es Supervivencia, Curacion, Atletismo, Dedos agiles y Descubrir.

---

## 3) Hechizos detallados

## 3.1 Elementalismo

### Bola de fuego

- Rango: 1
- Prerrequisito: Elementalismo
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 20 metros
- Duracion: instantaneo
- Efecto: puede esquivarse o detenerse como ataque a distancia; inflige 2D6 y prende fuego a objetos inflamables.
- Escalado: cada nivel adicional suma 1D6 o crea otra bola que golpea a otro objetivo dentro del alcance.

### Congelar

- Rango: 1
- Prerrequisito: Elementalismo
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 4 metros (esfera)
- Duracion: tramo corto
- Efecto: extingue fuegos naturales; criaturas vivientes pierden D6 PG y D6 PV; sufren frio; no recuperan PG ni PV hasta entrar en calor.
- Efecto adicional: humanoides en el area quedan congelados y no pueden moverse, actuar ni reaccionar; pueden intentar FUE cada turno para liberarse.
- Escalado: cada nivel adicional aumenta el alcance 4 metros.

### Rafaga de viento

- Rango: 1
- Prerrequisito: Elementalismo
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 10 metros (cono)
- Duracion: instantaneo
- Efecto: objetos y criaturas tamano humano o inferior salen empujados 2D4 metros, reciben la misma cantidad de dano y caen.
- Contra enjambres: inflige 2D6.
- Escalado: cada nivel adicional aumenta en 1 el numero de dados.
- Limitacion: no afecta a monstruos Grandes o Enormes.

### Columna

- Rango: 1
- Prerrequisito: Elementalismo
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 10 metros
- Duracion: tramo largo
- Efecto: levanta una columna de 3 metros de alto por 1 de ancho; quien este encima tira Atletismo o cae.
- Dano: si se crea en techo bajo y la victima falla, sufre 2D6 contundente.
- Escalado: cada nivel adicional suma 3 metros de altura.

### Romper

- Rango: 1
- Prerrequisito: Elementalismo
- Requisito: palabra
- Tiempo de lanzamiento: accion
- Alcance: toque
- Duracion: instantaneo
- Efecto: da 2D10 a objeto inanimado no magico; la armadura del objeto no cuenta.
- Escalado: cada nivel adicional suma 1D10.

### Explosion de fuego

- Rango: 2
- Prerrequisito: Bola de fuego
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 30 metros
- Duracion: instantaneo
- Efecto: puede esquivarse o detenerse como ataque a distancia; inflige 2D8 y prende fuego.
- Escalado: cada nivel adicional suma 1D8 o crea otra explosion contra otro objetivo.

### Escudo de piedra

- Rango: 2
- Prerrequisito: Columna
- Requisito: gesto, ingrediente (guijarros)
- Tiempo de lanzamiento: reaccion
- Alcance: personal
- Duracion: instantaneo
- Efecto: reduce el dano de un ataque en 2D6; se lanza despues de tirada de ataque y antes de dano; se combina con armadura.
- Escalado: cada nivel adicional reduce otro D6.

### Muro de piedra

- Rango: 2
- Prerrequisito: Columna
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 10 metros
- Duracion: tramo largo
- Efecto: crea muro de 1 m de grosor, 2 m de alto y 3 m de ancho; quien este ahi tira Atletismo o cae.
- Dano: en techo bajo, al fallar se sufren 2D6 contundente.
- Escalado: cada nivel adicional crea otro tramo igual.

### Ola gigante

- Rango: 2
- Prerrequisito: Congelar
- Requisito: palabra, gesto, ingrediente (fuente de agua)
- Tiempo de lanzamiento: accion
- Alcance: 20 metros (cono)
- Duracion: instantaneo
- Efecto: empuja 2D6 metros desde la fuente de agua y hace la misma cantidad de dano contundente.
- Escalado: cada nivel adicional aumenta el numero de dados en 1.

### Torbellino

- Rango: 2
- Prerrequisito: Rafaga de viento
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 4 metros (esfera)
- Duracion: instantaneo
- Efecto: objetos y criaturas tamano humano o inferior salen volando 2D4 metros, sufren esa misma cantidad de dano contundente y caen.
- Escalado: cada nivel adicional aumenta el alcance en 4 metros e inflige otro D4.

### Pajaro de fuego

- Rango: 3
- Prerrequisito: Explosion de fuego
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 40 metros
- Duracion: instantaneo
- Efecto: puede esquivarse o pararse como ataque a distancia; inflige 2D10 y prende fuego.
- Escalado: cada nivel adicional suma 1D10 o crea otro pajaro contra otro objetivo.

### Tormenta de fuego

- Rango: 3
- Prerrequisito: Explosion de fuego, Torbellino
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 4 metros (esfera)
- Duracion: instantaneo
- Efecto: todos los objetivos dentro del alcance sufren 2D6.
- Escalado: cada nivel adicional suma 4 metros de alcance e inflige otro D6.

### Gnomo

- Rango: 3
- Prerrequisito: Muro de piedra
- Requisito: palabra, gesto, ingrediente (piedra o tierra)
- Tiempo de lanzamiento: tramo corto
- Alcance: 4 metros
- Duracion: tramo corto
- Efecto: invoca elemental de tierra que actua como monstruo.
- Stats del gnomo:
- Movimiento: 8
- PG: 5 por nivel de poder
- Armadura: 4
- Armas: punos de piedra; golpea automaticamente en melee; puede esquivarse o pararse; inflige D6 contundente por nivel de poder.
- Poder asociado: puede lanzar Columna al mismo nivel usando los PV del mago.

### Salamandra

- Rango: 3
- Prerrequisito: Explosion de fuego
- Requisito: palabra, gesto, ingrediente (fogata)
- Tiempo de lanzamiento: tramo corto
- Alcance: 4 metros
- Duracion: tramo corto
- Efecto: invoca elemental de fuego.
- Stats de la salamandra:
- Movimiento: 12
- PG: 5 por nivel de poder
- Armadura: -
- Armas: presa ignea; golpe automatico en melee; se puede esquivar; inflige D6 por nivel de poder; la armadura no tiene efecto.
- Poder asociado: puede lanzar Explosion de fuego al mismo nivel usando los PV del mago.
- Resistencia: dano perforante a la mitad.
- Inmunidad: inmune al fuego, incluido el magico.

### Silfo

- Rango: 3
- Prerrequisito: Torbellino
- Requisito: palabra, gesto
- Tiempo de lanzamiento: tramo corto
- Alcance: 4 metros
- Duracion: tramo corto
- Efecto: invoca elemental de viento.
- Stats del silfo:
- Movimiento: 24
- PG: 5 por nivel de poder
- Armadura: -
- Armas: vientos aulladores; golpe automatico en melee; se puede esquivar; lanza a la victima D4 metros por nivel de poder e inflige la misma cantidad de dano contundente.
- Poder asociado: puede lanzar Rafaga de viento al mismo nivel usando PV del mago.
- Resistencia: dano perforante a la mitad.

### Ondina

- Rango: 3
- Prerrequisito: Ola gigante
- Requisito: palabra, gesto, ingrediente (agua)
- Tiempo de lanzamiento: tramo corto
- Alcance: 4 metros
- Duracion: tramo corto
- Efecto: invoca elemental de agua.
- Stats de la ondina:
- Movimiento: 12
- PG: 5 por nivel de poder
- Armadura: -
- Armas: abrazo asfixiante; golpe automatico en melee; se puede esquivar; inflige D6 por nivel de poder; la armadura no tiene efecto.
- Poder asociado: puede lanzar Ola gigante al mismo nivel usando PV del mago.
- Resistencia: dano perforante a la mitad.

## 3.2 Mentalismo

### Vision lejana

- Rango: 1
- Prerrequisito: Mentalismo
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 1 kilometro
- Duracion: concentracion
- Efecto: ver y escuchar un lugar visible o visitado antes.
- Escalado: x10 alcance por nivel adicional; 10 km a nivel 2, 100 km a nivel 3.

### Levitar

- Rango: 1
- Prerrequisito: Mentalismo
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 6 metros
- Duracion: instantaneo
- Efecto: eleva hasta 6 metros a ti, otra persona u objeto de tamano humano; luego aterriza suave o cae.
- Escalado: +2 metros de levitacion o un objetivo adicional por nivel.
- Penalizador: si el objetivo es involuntario, la tirada va con desventaja.

### Zancadas

- Rango: 1
- Prerrequisito: Mentalismo
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: toque
- Duracion: tramo corto
- Efecto: dobla el indice de movimiento del objetivo.
- Escalado: cada nivel adicional permite lanzarlo sobre otra persona.

### Puno de poder

- Rango: 1
- Prerrequisito: Mentalismo
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: personal
- Duracion: tramo corto
- Efecto: tus ataques sin armas aumentan en D6 por nivel de poder.

### Piel de piedra

- Rango: 1
- Prerrequisito: Mentalismo
- Requisito: palabra, gesto, ingrediente (piedra)
- Tiempo de lanzamiento: accion
- Alcance: toque
- Duracion: tramo corto
- Efecto: el objetivo obtiene armadura 4.
- Escalado: +2 armadura por nivel adicional.
- Limitacion: si lleva armadura, solo cuenta la mas alta.

### Adivinacion

- Rango: 2
- Prerrequisito: Vision lejana
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 100 metros
- Duracion: instantaneo
- Efecto: especifica objeto, sustancia, criatura, tipo de criatura o fenomeno y el hechizo muestra la direccion hacia el objetivo mas cercano.
- Escalado: duplica alcance por nivel adicional.

### Hechizar arma

- Rango: 2
- Prerrequisito: Puno de poder
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: toque
- Duracion: tramo corto
- Efecto: los resultados 1 o 2 con el arma cuentan como Dragon al atacar y parar; el arma cuenta como magica.
- Escalado: aumenta la probabilidad en 1 por nivel de poder adicional.

### Golpe mental

- Rango: 2
- Prerrequisito: Puno de poder
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 10 metros
- Duracion: instantaneo
- Efecto: lanza a la victima 2D6 metros e inflige la misma cantidad de dano.
- Escalado: cada nivel adicional anade D6.
- Defensa: puede esquivarse o detenerse como ataque a distancia.

### Vislumbrar el pasado

- Rango: 2
- Prerrequisito: Vision lejana
- Requisito: gesto
- Tiempo de lanzamiento: accion
- Alcance: 10 metros
- Duracion: concentracion
- Efecto: obtienes informacion de hechos ocurridos en el lugar.
- Escalado temporal: nivel 1 = ultimo dia; nivel 2 = ultimo ano; nivel 3 = ultimo siglo.

### Telepatia

- Rango: 2
- Prerrequisito: Vision lejana
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 10 metros
- Duracion: concentracion
- Efecto: leer pensamientos superficiales; recuerdos profundos requieren nivel 2 o superior; tambien permite enviar pensamientos.

### Dominar

- Rango: 3
- Prerrequisito: Telepatia
- Requisito: palabra, gesto
- Tiempo de lanzamiento: accion
- Alcance: 10 metros
- Duracion: instantaneo
- Efecto: control mental puntual del objetivo. La pagina revisada no mostraba el cuerpo completo del texto, asi que conviene verificar el detalle exacto en el manual antes de automatizar este hechizo.

## 3.3 Trucos magicos

- Ganzua | Tipo: truco | Efecto: abres o cierras una cerradura no magica al tocarla.
- Taburete magico | Tipo: truco | Efecto: creas una superficie redonda de aprox. medio metro de diametro y altura; dura hasta que te vayas.
- Caida lenta | Tipo: truco | Efecto: ralentiza la caida y permite aterrizar suave, sin importar altura.

---

## 4) Armas, armaduras y herramientas con estadisticas exactas

## 4.1 Armaduras y cascos

Formato:
Nombre | Armadura | Coste | Disponibilidad | Efecto

- Armadura completa | 6 | 500 oro | Raro | Desventaja en Sigilo, Esquivar y Atletismo.
- Casco | +1 | 12 oro | Infrecuente | Desventaja en Alerta.
- Cota de malla | 4 | 50 oro | Infrecuente | Desventaja en Sigilo y Esquivar.
- Cuero | 1 | 2 oro | Comun | Sin penalizador.
- Cuero tachonado | 2 | 10 oro | Infrecuente | Desventaja en Sigilo.
- Yelmo | +2 | 100 oro | Raro | Desventaja en Alerta y ataque a distancia.

## 4.2 Armas cuerpo a cuerpo

Formato:
Nombre | Agarre | FUE | Alcance | Dano | Resistencia | Coste | Disponibilidad | Tipo

- Desarmado | - | - | 2 | D6 | - | - | - | Contundente
- Objeto contundente ligero | 1M | - | FUE | D8 | 3 | - | - | Contundente, lanzable
- Objeto contundente pesado | 2M | 16 | 2 | 2D8 | 3 | - | - | Contundente
- Cuchillo | 1M | - | FUE | D8 | 6 | 5 plata | Comun | Sutil, perforante, lanzable
- Daga | 1M | - | FUE | D8 | 9 | 1 oro | Comun | Sutil, perforante, lanzable
- Daga de guardamano | 1M | - | 2 | D6 | 15 | 2 oro | Infrecuente | Sutil, perforante, cortante
- Espada corta | 1M | 7 | 2 | D10 | 12 | 8 oro | Comun | Perforante, cortante
- Espada ancha | 1M | 10 | 2 | 2D6 | 15 | 12 oro | Comun | Perforante, cortante
- Espada larga | 1M | 13 | 2 | 2D8 | 15 | 25 oro | Infrecuente | Perforante, cortante
- Mandoble | 2M | 16 | 2 | 2D10 | 15 | 50 oro | Raro | Perforante, cortante
- Cimitarra | 1M | 10 | 2 | 2D6 | 12 | 10 oro | Infrecuente | Embestidora, cortante
- Hacha de mano | 1M | 7 | FUE | 2D6 | 9 | 2 oro | Comun | Embestidora, cortante, lanzable
- Hacha de batalla | 1M | 13 | 2 | 2D8 | 9 | 10 oro | Infrecuente | Embestidora, cortante
- Hacha a dos manos | 2M | 16 | 2 | 2D10 | 9 | 25 oro | Infrecuente | Embestidora, cortante
- Maza | 1M | 7 | 2 | 2D4 | 12 | 8 oro | Comun | Contundente
- Maza de armas | 1M | 13 | 2 | 2D8 | 12 | 14 oro | Infrecuente | Contundente
- Mayal | 1M | 13 | 2 | 2D8 | - | 16 oro | Infrecuente | Contundente, embestidora, no se puede usar para parar
- Martillo de guerra ligero | 1M | 10 | 2 | 2D6 | 12 | 10 oro | Infrecuente | Contundente, embestidora
- Martillo de guerra pesado | 2M | 16 | 2 | 2D10 | 12 | 20 oro | Infrecuente | Contundente, embestidora
- Clava de madera pequena | 1M | 7 | 2 | D8 | 9 | 1 plata | Comun | Contundente
- Garrote de madera grande | 2M | 16 | 2 | 2D8 | 12 | 2 plata | Comun | Contundente
- Baston | 2M | 7 | 2 | D8 | 9 | 2 plata | Comun | Contundente, embestidora
- Lanza corta | 1M | 7 | FUE x2 | D10 | 9 | 5 plata | Comun | Perforante, lanzable
- Lanza larga | 2M | 10 | 4 | 2D8 | 9 | 1 oro | Comun | Larga, perforante
- Lanza de caballeria | 1M | 13 | 4 | 2D10 | 12 | 12 oro | Raro | Larga, perforante, requiere montura entrenada en combate
- Alabarda | 2M | 13 | 4 | 2D8 | 12 | 20 oro | Raro | Larga, embestidora, perforante, cortante
- Tridente | 1M | 10 | FUE | 2D6 | 9 | 5 oro | Infrecuente | Embestidora, perforante, lanzable
- Escudo pequeno | 1M | 7 | 2 | D8 | 15 | 4 oro | Comun | Contundente
- Escudo grande | 1M | 13 | 2 | D8 | 18 | 12 oro | Comun | Contundente

Obra maestra:

- Regla: multiplica el coste por 10, reduce la FUE requerida en 3 y aumenta la resistencia en 3.

## 4.3 Armas a distancia

- Honda | 1M | - | 20 | D8 | - | 1 plata | Comun | Contundente, objeto diminuto
- Arco corto | 2M | 7 | 30 | D10 | 3 | 25 oro | Comun | Perforante, requiere carcaj
- Arco largo | 2M | 13 | 100 | D12 | 6 | 50 oro | Infrecuente | Perforante, requiere carcaj
- Ballesta ligera | 2M | 7 | 40 | 2D6 | 6 | 75 oro | Infrecuente | Perforante, requiere carcaj, sin bonificacion de dano
- Ballesta pesada | 2M | 13 | 60 | 2D8 | 9 | 200 oro | Raro | Perforante, requiere carcaj, sin bonificacion de dano
- Ballesta de mano | 1M | 7 | 30 | 2D6 | 6 | 90 oro | Raro | Perforante, requiere carcaj, sin bonificacion de dano

## 4.4 Ropa e instrumentos

Ropa:

- Botas | 2 oro | Infrecuente | Protege contra algunos contratiempos de viaje.
- Capa | 8 plata | Infrecuente | Protege contra algunos contratiempos de viaje.
- Harapos | 5 cobre | Comun | Desventaja a habilidades basadas en CAR, a criterio del DJ.
- Pieles | 1 oro | Infrecuente | Ventaja a Supervivencia para resistir el frio.
- Ropa normal | 5 plata | Comun | Necesaria para evitar desventaja en habilidades basadas en CAR.
- Ropajes elegantes | 10 oro | Infrecuente | Ventaja a habilidades basadas en CAR, a criterio del DJ.

Instrumentos musicales:

- Arpa | 8 oro | Infrecuente | Peso 2 | Reduce el coste de PV de Musica a 1.
- Cuerno | 6 oro | Comun | Peso 1 | Aumenta el alcance de Musica a 100 metros.
- Gaita | 30 oro | Infrecuente | Peso 1 | Reduce el coste de PV de Musica a 1 y aumenta el alcance a 50 metros.
- Flauta | 2 oro | Comun | Peso 1 | Reduce el coste de PV de Musica a 2.
- Lira | 20 oro | Infrecuente | Peso 1 | Reduce el coste de PV de Musica a 1.
- Tambor | 4 oro | Comun | Peso 1 | Aumenta el alcance de Musica a 20 metros.

## 4.5 Mercancias, estudio, luz, herramientas, recipientes y medicina

### Mercancias

- Abaco | 2 oro | Comun | Peso 1 | Ventaja en tiradas de INT para problemas matematicos.
- Arpeo | 3 oro | Comun | Peso 1 | Asegura cuerda; se lanza y ancla con Atletismo hasta FUE metros, o FUE x2 con desventaja.
- Baraja de cartas | 5 plata | Infrecuente | Peso - | Tirada enfrentada de Enganar para determinar quien gana.
- Candado | 10 oro | Comun | Peso - | Cierra puerta o cofre; aguanta 20 puntos de dano, armadura 5.
- Canicas | 1 oro | Comun | Peso 1 | Se lanzan a humanoide a 10 m; luego el objetivo tira Esquivar para poder moverse.
- Carcaj con punta de hierro | 2 oro | Comun | Peso 1 | Necesario para disparar con arcos o ballestas.
- Carcaj con punta de madera | 5 plata | Comun | Peso 1 | Necesario para disparar; la efectividad de la armadura se duplica.
- Catalejo | 50 oro | Raro | Peso 1 | Ventaja en Supervivencia al encabezar la marcha.
- Cocina de campana | 4 oro | Comun | Peso 2 | Ventaja en Supervivencia para cocinar.
- Cuerda de canamo (10 m) | 1 oro | Comun | Peso 1 | Ventaja a Atletismo para escalar si esta asegurada.
- Cuerda de seda (10 m) | 10 oro | Infrecuente | Peso - | Ventaja a Atletismo para escalar si esta asegurada.
- Dados | 1 plata | Comun | Peso - | El azar determina quien gana.
- Ganzuas de calidad | 20 oro | Raro | Peso 1 | Ventaja a Dedos agiles para abrir cerraduras.
- Ganzuas normales | 1 oro | Infrecuente | Peso 1 | Evitan una desventaja al abrir cerraduras con Dedos agiles.
- Juego de ajedrez | 1 oro | Comun | Peso 1 | Tirada enfrentada de INT para determinar quien gana.
- Lupa | 30 oro | Infrecuente | Peso 1 | Ventaja a Descubrir.
- Manta | 5 plata | Comun | Peso 1 | Evita desventaja contra efectos del frio.
- Racion de viaje | 1 plata | Comun | Peso 1/4 | Hace falta una por dia para evitar hambre.
- Mapa | 5 oro | Infrecuente | Peso - | Evita desventaja en Supervivencia para liderar el camino.
- Perfume (10 dosis) | 5 oro | Comun | Peso 1 | Ventaja a habilidades basadas en CAR, a criterio del DJ.
- Pieles para dormir | 1 oro | Comun | Peso 1 | Necesarias para evitar desventaja en Supervivencia al acampar.
- Silbato | 5 plata | Comun | Peso - | Se oye hasta 100 metros.
- Silla de montar | 10 oro | Comun | Peso 1 | Evita desventaja al combatir a caballo.
- Tienda pequena | 2 oro | Comun | Peso 2 | 2 personas; ventaja en Supervivencia al acampar.
- Tienda grande | 4 oro | Comun | Peso 4 | 6 personas; ventaja en Supervivencia al acampar.

### Estudios y magia

- Amuleto | 3 oro | Infrecuente | Peso - | Foco para lanzar hechizos.
- Bola de cristal | 18 oro | Infrecuente | Peso 1 | Foco para lanzar hechizos.
- Broche | 5 oro | Infrecuente | Peso - | Foco para lanzar hechizos.
- Cuaderno | 5 oro | Comun | Peso 1 | Vacio; puede usarse como grimorio.
- Grimorio | 50 oro | Unico | Peso 1 | El coste depende del contenido y puede ser mucho mayor.
- Libro | 25 oro | Infrecuente | Peso 1 | Ventaja a tiradas de habilidad sobre un tema especifico.
- Papel (hoja) | 2 plata | Infrecuente | Peso - | Se puede usar para escribir hechizos.
- Pergamino (hoja) | 1 plata | Comun | Peso - | Se puede usar para escribir hechizos.
- Pluma y tinta | 10 oro | Infrecuente | Peso 1 | Se puede usar para escribir hechizos.
- Relicario | 5 oro | Infrecuente | Peso 1 | Foco para lanzar hechizos.
- Reloj de arena | 25 oro | Raro | Peso 1 | Foco para lanzar hechizos.
- Tiza | 1 cobre | Comun | Peso - | Foco para lanzar hechizos.
- Varita | 10 oro | Infrecuente | Peso 1 | Foco para lanzar hechizos.

### Fuentes de luz

- Aceite de lampara | 3 plata | Comun | Peso 1 | 10 dosis; cada una mantiene lampara o linterna hasta tramo largo.
- Antorcha | 5 cobre | Comun | Peso 1 | Ilumina 10 m; dura hasta tramo largo; tira D6 tras cada tramo corto o si portador ataca/es atacado; con 1 se apaga.
- Lampara | 1 oro | Comun | Peso 1 | Ilumina 10 m; dura hasta tramo largo; tira D6 tras cada tramo corto; con 1 se apaga y hay que rellenar y encender de nuevo.
- Linterna | 10 oro | Comun | Peso 1 | Ilumina 10 m; dura hasta tramo largo; tira D8 tras cada tramo corto; con 1 se apaga y hay que rellenar y encender.
- Vela de sebo | 1 cobre | Comun | Peso - | Ilumina 4 m; dura hasta tramo largo; tira D4 tras cada tramo corto o si portador ataca/es atacado; con 1 se apaga.
- Yesca y pedernal | 5 plata | Comun | Peso - | Necesario para hacer fuego y encender antorchas, velas o lamparas.

### Herramientas

- Aguja e hilo | 3 plata | Comun | Peso - | Repara ropa con Artesania.
- Herramientas de carpinteria | 8 oro | Infrecuente | Peso 1 | Necesarias para Artesania.
- Herramientas de curtidor | 5 oro | Infrecuente | Peso 1 | Necesarias para Artesania.
- Herramientas de forja | 20 oro | Infrecuente | Peso 1 | Necesarias para Artesania.
- Mandarria | 3 oro | Comun | Peso 2 | 2D10 contra puerta o pared; sin riesgo de danarse; golpe automatico.
- Martillo pilon | 1 oro | Comun | Peso 1 | 2D4 contra puerta o pared; golpe automatico.
- Pala | 2 oro | Comun | Peso 1 | Reduce a la mitad el tiempo de excavar.
- Palanqueta | 2 oro | Comun | Peso 1 | 2D6 contra puerta o pared; sin riesgo de danarse; golpe automatico.
- Pico | 3 oro | Comun | Peso 1 | 2D8 contra puerta o pared; sin riesgo de danarse; golpe automatico.
- Sierra | 5 oro | Infrecuente | Peso 1 | Corta metal o madera en un tramo corto.

### Recipientes

- Alforja | 6 oro | Comun | Peso - | Aumenta carga de un animal en 2; maximo dos alforjas por animal.
- Barril | 2 oro | Comun | Peso 2 | Contiene 15 unidades de peso; aguanta 10 puntos de dano, armadura 3.
- Botella | 1 oro | Comun | Peso 1 | Contiene 1 unidad de liquido.
- Cesta | 4 plata | Comun | Peso 1 | Soporta 10 unidades de peso.
- Cofre | 5 oro | Comun | Peso 3 | Contiene 20 unidades de peso; aguanta 25 puntos de dano, armadura 5.
- Cubo | 5 cobre | Comun | Peso 1 | Contiene 5 unidades de liquido.
- Jarra de barro | 5 plata | Comun | Peso 1 | Contiene 1 unidad de liquido.
- Mochila | 3 oro | Comun | Peso - | Aumenta la capacidad de carga en 2.

### Medicina y venenos

- Hierbas curativas | 1 oro | Infrecuente | Peso 1 | Ventaja a Curacion para resistir enfermedades.
- Instrumental quirurgico | 15 oro | Infrecuente | Peso 1 | Ventaja a Curacion para salvar vidas.
- Pocion curativa (dosis) | 50 oro | Raro | Peso 1 | Cura 2D6 PG al instante.
- Vendas (10) | 5 plata | Comun | Peso 1 | Necesarias para evitar desventaja al salvar vidas; cada intento consume una venda.
- Veneno letal (dosis) | 2 oro x potencia | Infrecuente | Peso 1 | Ver reglas de veneno.
- Veneno paralizante (dosis) | 12 plata x potencia | Infrecuente | Peso 1 | Ver reglas de veneno.
- Veneno somnifero (dosis) | 6 plata x potencia | Infrecuente | Peso 1 | Ver reglas de veneno.

### Caza, transporte y animales

- Cana de pescar | 8 plata | Comun | Peso 1 | Da D4 raciones al pescar.
- Red de pesca | 2 oro | Comun | Peso 2 | Da D4 raciones al pescar.
- Trampa de lazo | 5 cobre | Comun | Peso 1 | Sirve para cazar; un uso.
- Trampa para osos | 3 oro | Infrecuente | Peso 1 | Sirve para cazar.
- Bote de remos | 15 oro | Comun | Lleva 4 personas y 50 unidades de peso.
- Canoa | 6 oro | Comun | Lleva 2 personas y 10 unidades de peso.
- Carreta | 15 oro | Comun | Tirada por 1 caballo o burro; lleva 2 personas y 50 de peso.
- Carro | 30 oro | Comun | Tirado por 2 caballos o burros; lleva 4 personas y 100 de peso.
- Embarcacion a vela | 40 oro | Infrecuente | Lleva 6 personas y 100 de peso.
- Burro | 12 oro | Comun | Lleva 10 unidades; no se monta.
- Caballo de monta | 60 oro | Infrecuente | Lleva 1 jinete y 10 unidades, o 2 jinetes.
- Caballo de guerra | 400 oro | Raro | Lleva 1 jinete y 10 unidades, o 2 jinetes.
- Paloma mensajera en jaula | 2 oro | Infrecuente | Vuela a su palomar cuando se libera.
- Perro guardian | 15 oro | Comun | Protege a su dueno.

---

## 5) Enemigos con estadisticas especificas

## Reglas base de monstruos

- Esquivar/parar monstruos: nivel fijo 15, salvo excepciones.
- Los monstruos atacan con exito automatico usando su tabla de ataque.
- Un ataque de monstruo suele contar como una accion.
- Los monstruos pueden infligir estados, miedo o dano en area.
- Muchos tienen armadura natural, resistencia o inmunidad.

## 5.1 Arana gigante

- Ferocidad: 2
- Tamano: normal
- Movimiento: 24
- Armadura: -
- PG: 36
- Ataques:
- Mandibulas: 2D8 cortante.
- Ataque desgarrador: todos en radio 2 m sufren D8 perforante.
- Mirada hipnotica: VOL contra miedo en radio 10 m.
- Picadura venenosa: D10 perforante; si hace al menos 1 punto, veneno paralizante potencia 16; puede pararse.
- Telarana: Esquivar o quedar atrapado; para liberarse, FUE con desventaja.
- Embestida: 2D6 contundente y derribo.

## 5.2 Arpia

- Ferocidad: 1 por arpia
- Tamano: enjambre
- Movimiento: 24
- Armadura: -
- PG: 12 por arpia
- Rasgos:
- Bandada: cuentan como un solo monstruo con Ferocidad igual al numero de arpias; cada arpia conserva sus PG.
- Aladas: atacan desde el aire; solo se las golpea con armas a distancia o armas largas en melee.
- Cobardes: huyen cuando muere la mitad de la bandada.
- Ataques:
- Cacareo amenazante: VOL contra miedo a 10 m.
- Ataque coordinado: 2D6 cortante; si impacta, eleva y deja caer a la victima desde D3+3 metros.
- Muerte desde el cielo: todos a 10 m sufren D6 contundente.
- Arrancaojos: 2D6 perforante y ceguera durante un tramo corto.
- Ataque en masa: ataca a varios objetivos dentro de 10 m igual al numero de arpias; cada ataque hace D8 cortante.
- Ataque con excrementos: todos a 10 m eligen un estado; puede pararse con escudo.

## 5.3 Demonio

- Ferocidad: 2
- Tamano: grande
- Movimiento: 16
- Armadura: 4
- PG: 64
- Ataques:
- Terror demoniaco: ataque de miedo a todos a 10 m.
- Zarpazo: 2D10 cortante; puede pararse.
- Maldicion: a menos de 10 m; no se puede esquivar; varias maldiciones temporales o permanentes segun D6.
- Furia invisible: lanza a la victima 2D8 m, recibe el mismo dano contundente y cae.
- Picadura de escorpion: D12 perforante; si hace al menos 1 punto, veneno paralizante potencia 16; puede pararse.
- Posesion: VOL con desventaja o el demonio controla movimiento y accion; la victima pierde tambien su proximo turno.

## 5.4 Dragon

- Ferocidad: 3
- Tamano: enorme
- Movimiento: 24
- Armadura: 6
- PG: 84
- Rasgo: Alas, puede moverse libremente por el aire.
- Ataques:
- Rugido de dragon: ataque de miedo a 20 m con desventaja en VOL.
- Zarpazo: 2D10 cortante a dos personajes.
- Viento de dragon: todos a 10 m salen volando 2D6 m, sufren ese dano contundente y caen derribados.
- Coletazo: todos a 6 m sufren 2D8 contundente y caen derribados.
- Mordedura de dragon: 4D10 cortante.
- Aliento de fuego: cono de 10 m; 3D10 de dano; la armadura no tiene efecto.

## 5.5 Esqueleto

No cuentan como monstruos en combate, sino como PNJs normales.

Rasgos generales:

- Resistencia: todo el dano perforante se reduce a la mitad, redondeando hacia arriba.
- Inmunidad: miedo y Persuadir.

Guerrero:

- Movimiento: 8
- Bonificacion de dano: -
- Armadura tipica: cuero tachonado (2)
- PG: 8
- Habilidades: Alerta 8, Esquivar 6
- Arma tipica: espada corta, nivel 12, dano D10

Arquero:

- Movimiento: 8
- Bonificacion de dano: -
- Armadura tipica: cuero (1)
- PG: 8
- Habilidades: Alerta 8, Esquivar 6
- Armas tipicas: daga nivel 10 dano D8; ballesta nivel 12 dano 2D6

Campeon:

- Movimiento: 10
- Bonificacion de dano: FUE + D6
- Armadura tipica: cota de mallas (4)
- PG: 24
- PV: 15
- Habilidades: Alerta 12, Esquivar 8
- Capacidades: Veterano, Parada refleja, Tajo doble, Robusto x4
- Armas tipicas: espada larga nivel 16 dano 2D8, escudo grande

## 5.6 Espectro

- Ferocidad: 2
- Tamano: normal
- Movimiento: 10
- Armadura: igual a la armadura equipada
- PG: 38
- Resistencia: mitad de dano de armas no magicas, excepto fuego que hace dano normal.
- Equipo tipico: maza de armas, cota de malla
- Ataques:
- Aullido impio: ataque de miedo a 10 m.
- Mirada espantosa: la victima queda Asustada y sufre un ataque de miedo con desventaja.
- La mano del muerto: lanza al objetivo 2D4 m, inflige la misma cantidad de dano, no se puede esquivar y derriba.
- Ataque de barrido: todos a 2 m sufren dano de arma; pueden parar.
- Frio paralizante: D6; la armadura no cuenta; obliga a Esquivar o pierde su proximo turno; ademas aplica frio y bloquea curacion de PG y PV hasta entrar en calor.
- Ataque poderoso: doble del dano normal del arma y derribo; puede pararse.

---

## 6) Como preguntarle a la IA con este archivo

Formato recomendado:

- Categoria: skill | hechizo | arma | herramienta | armadura | monstruo
- Nombre exacto:
- Campo que quieres consultar: dano | alcance | resistencia | coste | disponibilidad | requisito | armadura | PG | ataque | efecto | duracion
- Contexto de escena:
- Pregunta puntual:

Ejemplo:

"Categoria: monstruo. Nombre exacto: Arpia. Campo: ataques. Contexto: bandada de 4 arpias contra 3 PJs en campo abierto. Pregunta puntual: cual de sus ataques conviene usar para separar al guerrero del grupo?"

## 7) Limite actual del documento

Este archivo ya contiene estadisticas exactas sacadas de las paginas revisadas del manual para:

- Skills: modelo mecanico completo
- Hechizos: un bloque amplio y detallado de Elementalismo y Mentalismo
- Armas y equipo: tablas con datos exactos de varias paginas
- Enemigos: varias fichas completas de bestiario y elementales invocados

Si quieres cerrar el 100 por ciento del manual, el siguiente paso correcto es seguir extrayendo el resto del bestiario y las paginas de magia que falten con el mismo formato.
