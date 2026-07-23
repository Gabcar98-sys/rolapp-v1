# Cosmere RPG - Mecánicas Core

## Sistema Base de Dados

El sistema usa un d20 + modificador de habilidad vs DC (Difficulty Class). También se lanza un dado de trama (plot die) junto al d20 que puede generar Oportunidades (O) o Complicaciones (c).

El dado de trama produce:
- **Oportunidad (O)**: resultado ventajoso adicional; se puede gastar para efectos especiales.
- **Complicación (c1–c4)**: resultado perjudicial; generalmente cuesta focus o añade consecuencias.

### Resultados de Ataque

| Resultado | Nombre | Efecto |
|-----------|--------|--------|
| Menor al DC | Fallo (Miss) | Sin daño |
| DC o más con dado bajo | Roce (Graze) | Solo dados de daño (sin modificador); cuesta 1 foco al defensor |
| DC o más con dado normal | Impacto (Hit) | Dados de daño + modificador de habilidad |
| Impacto con Oportunidad gastada | Crítico | Maximiza todos los dados de daño |

### Grados de Dificultad (DC)

| Dificultad | DC |
|---|---|
| Fácil | 10 |
| Medio | 15 |
| Difícil | 20 |
| Muy Difícil | 25 |
| Casi Imposible | 30 |

### Ventaja y Desventaja

Con ventaja se tiran dos d20 y se usa el mayor. Con desventaja, el menor. Múltiples ventajas/desventajas se acumulan: dos ventajas = +1 d20 adicional, etc.

### Elevar las Apuestas (Raising the Stakes)

Se puede declarar antes de la tirada para doblar el riesgo/recompensa: en un éxito se obtiene una Oportunidad gratuita adicional; en un fallo se añade una Complicación adicional.

---

## Atributos

Hay 6 atributos, valorados de 0 a 5 (normalmente). El modificador de habilidad = atributo + rango de habilidad.

| Atributo | Abrev. | Descripción |
|----------|--------|-------------|
| Fuerza (Strength) | STR | Poder físico; gobierna combate melee y atletismo |
| Velocidad (Speed) | SPD | Agilidad y reflejos; gobierna armas ligeras y sigilo |
| Intelecto (Intellect) | INT | Razonamiento y conocimiento; gobierna artesanía y deducción |
| Voluntad (Willpower) | WIL | Determinación mental; gobierna disciplina e intimidación |
| Conciencia (Awareness) | AWA | Percepción y empatía; gobierna perspicacia y percepción |
| Presencia (Presence) | PRE | Carisma y autoridad; gobierna persuasión y liderazgo |

---

## Defensas

Las defensas son la DC que los enemigos deben superar para afectar al personaje.

| Defensa | Fórmula | Descripción |
|---------|---------|-------------|
| Física (Physical) | 10 + STR + SPD | Resistir daño físico y ataques cuerpo a cuerpo/a distancia |
| Cognitiva (Cognitive) | 10 + INT + AWA | Resistir engaños, intimidación, manipulación mental |
| Espiritual (Spiritual) | 10 + WIL + PRE | Resistir influencia social, magia espiritual |

---

## Recursos

### Salud (Health)

- **Máximo**: 10 + STR (personajes jugadores)
- Se pierde al recibir daño. Al llegar a 0 el personaje queda Inconsciente.
- Al recibir daño se hace una **tirada de herida** (injury roll): d20 + valor de deflect - 5 por cada herida existente.

### Foco (Focus)

- **Máximo**: 2 + WIL (personajes jugadores)
- Recurso dual: alimenta habilidades de talentos Y resistencia social en conversaciones.
- Se recupera parcialmente en descanso corto o completamente en descanso largo.

### Investidura (Investiture)

- Recurso para habilidades sobrenaturales (Estallidos de Luz Tormentosa, etc.).
- No todos los personajes lo tienen.

---

## Habilidades

Las habilidades tienen rangos del 0 al 4. Modificador = atributo que rige la habilidad + rango.

### Habilidades Físicas

| Habilidad | Atributo | Descripción |
|-----------|----------|-------------|
| Agilidad (Agility) | SPD | Movimientos acrobáticos, esquivar trampas, equilibrio |
| Atletismo (Athletics) | STR | Escalar, nadar, saltar, forcejear, lanzar |
| Armas Ligeras (Light Weaponry) | SPD | Cuchillos, espadas cortas, arcos cortos, armas de una mano livianas |
| Armas Pesadas (Heavy Weaponry) | STR | Hachas, martillos, lanzas largas, escudos, arcos largos |
| Sigilo (Stealth) | SPD | Moverse sin ser detectado, esconderse |
| Robo (Thievery) | SPD | Forzar cerraduras, abrir bolsillos, desactivar trampas, disfrazarse |

### Habilidades Cognitivas

| Habilidad | Atributo | Descripción |
|-----------|----------|-------------|
| Artesanía (Crafting) | INT | Fabricar, reparar, diseñar objetos |
| Deducción (Deduction) | INT | Razonar clues, resolver misterios, análisis lógico |
| Disciplina (Discipline) | WIL | Mantener la calma, resistir el miedo, concentración prolongada |
| Intimidación (Intimidation) | WIL | Asustar, coaccionar, dominar con fuerza de voluntad |
| Lore | INT | Conocimiento de historia, culturas, criaturas, magia |
| Medicina (Medicine) | INT | Tratar heridas, diagnóstico, cirugía, primeros auxilios |

### Habilidades Espirituales

| Habilidad | Atributo | Descripción |
|-----------|----------|-------------|
| Engaño (Deception) | PRE | Mentir, disfrazar intenciones, crear ilusiones verbales |
| Perspicacia (Insight) | AWA | Leer emociones, detectar mentiras, empatía |
| Liderazgo (Leadership) | PRE | Inspirar, comandar, coordinar grupos |
| Percepción (Perception) | AWA | Notar detalles, detectar peligros, vigilar el entorno |
| Persuasión (Persuasion) | PRE | Convencer mediante lógica, encanto o negociación |
| Supervivencia (Survival) | AWA | Rastrear, orientarse, cazar, sobrevivir en la naturaleza |

---

## Expertises (Especializaciones)

Las expertises no son rangos de habilidad sino conocimientos especiales que otorgan ventaja en situaciones específicas. Tipos:
- **Cultural**: conocimiento de una cultura/región concreta.
- **Utility**: conocimiento de un oficio, actividad o área específica.
- **Weapon**: familiaridad con un tipo de arma (desbloquea el rasgo "expert" del arma).
- **Armor**: familiaridad con un tipo de armadura (desbloquea rasgo "expert" de la armadura).

---

## Valor de Deflect

El valor de deflect (de 0 a 4+) se resta al daño de tipos Energy, Impact y Keen. **No** aplica contra daño Spirit ni Vital.

---

## Tipos de Daño

| Tipo | Descripción |
|------|-------------|
| Energy | Fuego, relámpago, frío u otras energías. Reducido por Deflect. |
| Impact | Golpes contundentes. Reducido por Deflect. |
| Keen | Cortes y perforaciones. Reducido por Deflect. |
| Spirit | Daño espiritual/mágico. **No** reducido por Deflect. |
| Vital | Veneno, enfermedad, daño interno. **No** reducido por Deflect. |

---

## Sistema de Heridas (Injury Roll)

Cuando se recibe daño, si la salud llega a 0 (o en otras circunstancias de daño masivo), se hace una tirada de herida:

**Tirada**: d20 + valor de deflect - (5 × número de heridas existentes)

### Tabla de Heridas (d8)

| d8 | Efecto |
|----|--------|
| 1 | Muerte inmediata |
| 2 | Herida mortal (requiere tratamiento urgente) |
| 3 | Herida grave (penalización severa) |
| 4 | Herida moderada |
| 5 | Herida leve |
| 6 | Herida leve |
| 7 | Herida superficial |
| 8 | Magulladura (Flesh Wound) |

### Duración de Heridas

Las heridas persisten desde "el resto de la escena" hasta "permanente" según gravedad. Pueden tratarse con medicina.

### Muerte

Un personaje muere inmediatamente si: la tirada de herida lo indica, sufre una cuarta herida, o recibe daño igual o mayor a su salud máxima de un único golpe.

---

## Condiciones

| Condición | Efecto |
|-----------|--------|
| Determined (Determinado) | Una vez por escena, añade una Oportunidad a una tirada. Se consume al usarse. |
| Disoriented (Desorientado) | Desventaja en todas las tiradas de habilidad. |
| Empowered (Empoderado) | Ventaja en todas las tiradas de habilidad. |
| Exhausted (Agotado) | Penalización acumulativa en tiradas; valor de penalización según el nivel de agotamiento. |
| Focused (Concentrado) | Ventaja en la próxima tirada de habilidad específica. Se consume al usarse. |
| Immobilized (Inmovilizado) | No puede moverse; puede realizar otras acciones. |
| Prone (Tumbado) | Ventaja en ataques a distancia contra el objetivo; desventaja en sus propias tiradas. Levantarse cuesta 1 acción. |
| Restrained (Restringido) | No puede moverse; desventaja en sus tiradas de habilidad. |
| Slowed (Ralentizado) | Velocidad de movimiento reducida a la mitad. |
| Stunned (Aturdido) | Pierde una reacción; desventaja en sus tiradas de defensa. |
| Surprised (Sorprendido) | No puede actuar en el primer turno de combate; desventaja en sus defensas hasta que actúe. |
| Afflicted (Afectado) | Afectado por veneno, enfermedad u otro estado perjudicial. Aplica efectos específicos. |
| Blind (Ciego) | No puede percibir visualmente; desventaja en tiradas que dependan de la vista. |
| Unconscious (Inconsciente) | No puede actuar. Si recibe daño, hace tirada de herida. |
| Dead (Muerto) | Muerto; no puede actuar ni ser curado normalmente. |

---

## Movimiento

- **Velocidad base**: 25 ft. (los personajes en Roshar se mueven por cuadrículas de 5 ft.)
- La acción de Mover permite moverse hasta la velocidad de movimiento.
- **Movimientos lentos** (SPD): gatear, trepar, nadar, moverse sigilosamente - cuesta el doble de movimiento (condición Slowed aplica).
- **Caída**: 1d6 daño de Impact por cada 10 ft. caídos.

---

## Alcance y Rango

- **Alcance de melé (Reach)**: 5 ft. por defecto; algunas armas tienen Reach +5 (melee[+5]).
- **Rango corto/largo**: Los ataques a distancia tienen dos valores (ej: 80/320). Más allá del rango corto se tiene desventaja; no se puede atacar más allá del rango largo.
- **Línea de Efecto**: Para atacar se necesita línea de efecto hasta el objetivo. La cobertura puede imponer desventaja.

---

## Tamaños de Criatura

| Tamaño | Espacio |
|--------|---------|
| Tiny | 2.5 ft. |
| Small | 5 ft. |
| Medium | 5 ft. |
| Large | 10 ft. |
| Huge | 15 ft. |
| Gargantuan | 20+ ft. |

---

## Terreno Peligroso

El terreno peligroso cuesta el doble de movimiento al cruzarlo. También puede causar daño (varía según el tipo).

---

## Descanso

### Descanso Corto (Short Rest)
- Duración: al menos 1 hora.
- El personaje puede tirar su dado de recuperación y distribuir los puntos recuperados entre Salud y Foco.
- **Dado de recuperación**: varía según el personaje (normalmente d8 para PJs humanos).
- Solo se puede recuperar un máximo de la mitad del total perdido.

### Descanso Largo (Long Rest)
- Duración: al menos 8 horas.
- Recupera toda la Salud y todo el Foco.
- Elimina condiciones temporales.
- Reduce heridas leves.

---

## Avance de Personaje

| Nivel | Tier | Habilidades máximas | Talentos disponibles |
|-------|------|--------------------|--------------------|
| 1 | 1 | 2 rangos en cualquier habilidad | 1 (Key Talent) |
| 2 | 1 | 2 | 2 |
| 3 | 1 | 2 | 3 |
| 4 | 1 | 2 | 4 |
| 5 | 1 | 2 | 5 |
| 6 | 2 | 3 | 6 |
| 7–10 | 2 | 3 | +1 cada nivel |
| 11 | 3 | 4 | nivel 11 |
| 12–15 | 3 | 4 | +1 cada nivel |
| 16 | 4 | 5 | nivel 16 |
| 17–20 | 4 | 5 | +1 cada nivel |
| 21+ | 5 | 5 | +1 cada nivel |

---

## Esferas (Moneda)

La moneda de Roshar son las esferas: gemas infusadas con Luz Tormentosa encapsuladas en cristal.

| Denominación | Valor en marks |
|---|---|
| Chip | 0.2 mk |
| Mark (mk) | 1 mk |
| Broam | 4 mk (5 chips) |

Las esferas se clasifican también por tipo de gema (diamante, rubí, zafiro, etc.). Los precios en este documento usan marks (mk) como referencia.

---

## Turnos en Combate

El combate se divide en rondas. Cada ronda sigue este orden:

1. **Turno Rápido de PJs** (Fast PC Turn): Los PJs pueden tomar 2 acciones.
2. **Turno Rápido de PNJs** (Fast NPC Turn): Los PNJs toman sus acciones rápidas.
3. **Turno Lento de PJs** (Slow PC Turn): Los PJs pueden tomar 3 acciones.
4. **Turno Lento de PNJs** (Slow NPC Turn): Los PNJs toman sus acciones lentas.

Cada turno también incluye **1 reacción** disponible (se repone al inicio del turno siguiente).

Los PJs eligen antes de actuar si van en turno rápido o lento en cada ronda.
