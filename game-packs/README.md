# Game Packs

Los **game packs** son archivos JSON versionados que definen un sistema de juego entero
(atributos, habilidades, objetos, slots de equipo, mecánicas, personajes base y metadatos
de documentos). Son **datos importables**, no seeds: nunca se siembran automáticamente en
migraciones. El DM los importa desde la UI o vía endpoint.

Este directorio incluye dos ejemplos:

- `stormlight.json` — Stormlight RPG completo (13 atributos, 21 habilidades, armas, slots, mecánicas y los **6 pregens de Bridge Nine** — Abena, Jomari, Palinor, Talani, Vedd, Zvynda — con atributos, inventario y skills con rank). Portado de los seeds M021/M030 de la v0.
- `dragonbane.json` — Dragonbane reducido pero válido (6 atributos core + recursos, habilidades, carga y 2 pregens: Brakka y Sella).
- `docs/stormlight/STORMLIGHT_RPG_GUIDE.md` — guía completa del Stormlight RPG que el seed ingiere como documento RAG del sistema (contenido para la IA).

---

## Formato del pack (`pack_version: "1.0"`)

```jsonc
{
  "pack_version": "1.0",            // versión soportada (obligatoria)
  "name": "Nombre del sistema",     // obligatorio
  "description": "...",

  "attributes": [
    {
      "name": "Fuerza",             // obligatorio; las skills lo referencian por NOMBRE
      "type": "number",             // number | text | boolean
      "category": "core",           // agrupación libre (core, resources, defenses, ...)
      "sort_order": 0,
      "is_core": true,              // atributo principal del sistema
      "has_max": false,             // recurso con valor máximo (HP, Foco, ...)
      "formula": "10 + Fuerza"      // fórmula derivada (texto libre; se evalúa en F3)
    }
  ],

  "skill_formats": [
    {
      "name": "Habilidades",
      "fields": [{ "name": "attribute", "type": "text" }],   // campos parametrizables
      "skills": [
        {
          "name": "Atletismo",
          "description": "...",
          "values": { "attribute": "Fuerza" }                // claves = nombres de campo
        }
      ]
    }
  ],

  "item_formats": [
    {
      "name": "Armas",
      "fields": [{ "name": "damage", "type": "text" }],
      "items": [
        { "name": "Espada", "equippable": true, "values": { "damage": "1d8" } }
      ]
    }
  ],

  "equipment_slots": [
    { "name": "Mano derecha", "slot_key": "right_hand", "max_items": 1, "sort_order": 0 }
  ],

  "mechanics": [
    {
      "name": "Carga",
      "type": "inventory_weight",   // inventory_weight | inventory_type | inventory_slot | custom
      "affects": "inventory",       // inventory | equipment | attributes | combat | general
      "description": "...",
      "params": [
        { "param_name": "max_weight", "param_type": "number", "param_value": "50" }
      ]
    }
  ],

  "base_characters": [             // pregens opcionales
    {
      "name": "Guerrero",
      "avatar_icon": "⚔️",
      "is_public": true,
      "attrs": [{ "attr_name": "Fuerza", "attr_type": "number", "attr_category": "core", "value": "3" }],
      "inventory": [{ "item_name": "Espada", "quantity": 1 }],
      "skill_links": [{ "skill_name": "Atletismo", "rank": 2 }]   // enlaza a skills del pack por NOMBRE + rank
    }
  ],

  "docs": [                        // SOLO metadatos; el contenido .md se ingiere con el seed (RAG)
    { "title": "Reglas core", "path": "stormlight/01-core.md" }
  ]
}
```

### Notas de diseño

- **Referencias por nombre, no por id.** Dentro del pack, las habilidades y objetos referencian
  atributos/campos por su `name`. El importador mapea esos nombres a ids internos en una
  transacción, así el pack es portable entre instalaciones.
- **Campos no obligatorios** tienen defaults sensatos (`type: "text"`, `category: "general"`,
  `max_items: 1`, etc.). Solo `pack_version`, `name` y el `name` de cada entidad son obligatorios.
- **`skill_links` de un pregen** referencian habilidades del propio pack por `skill_name` + `rank`.
  El importador las resuelve al `skill_id` interno; un nombre inexistente aborta el import. Los
  `attrs` del pregen se ligan al `attribute_template_id` del sistema por nombre (+ categoría),
  lo que permite que "adoptar" el pregen copie sus valores a un personaje de jugador.
- **`docs` en el pack son metadatos** (título + ruta). El contenido `.md` vive en `docs/<sistema>/`
  y lo ingiere el seed (`scripts/seed-examples.js`) — ver más abajo.

---

## Seed de ejemplos (sistemas listos + contenido para la IA)

`backend/scripts/seed-examples.js` deja el entorno listo de forma **idempotente** (correrlo dos
veces no duplica nada):

1. Asegura un usuario **DM** (`--dm <username>`, default `dm`). Si no existe, lo crea con **PIN
   por defecto `0000`** (cámbialo desde la app; es red local, hash SHA-256).
2. Importa `stormlight.json` y `dragonbane.json` (no reimporta si ya existe un sistema con ese
   nombre para ese DM). Los pregens embebidos se crean con el import.
3. Ingiere `docs/stormlight/STORMLIGHT_RPG_GUIDE.md` como `game_doc` de Stormlight: **doc +
   chunks + FTS siempre**; los **embeddings/vectores solo si hay proveedor disponible**.

```bash
# Entorno canónico (Docker). game-packs se monta en el contenedor como datos.
docker compose exec backend node scripts/seed-examples.js --dm dm
```

### Ingesta sin Ollama (resiliente) y reindexado de vectores

El seed **no falla sin Ollama**: la guía queda con doc + chunks + FTS (la búsqueda por
palabra clave / BM25 funciona ya). Los **vectores** (búsqueda semántica) quedan pendientes.
Cuando Ollama esté arriba (o configures una API de embeddings), reindexa para generarlos —
sin re-chunkear:

```bash
# 1) Levanta Ollama y descarga el modelo de embeddings (idempotente)
docker compose --profile ai up -d --build
docker compose --profile ai run --rm ai-bootstrap

# 2) Encuentra el docId de la guía
curl -s "http://localhost:3000/api/game-systems/<stormlight_id>/docs"

# 3) Reindexa (re-embebe los chunks existentes en sitio)
curl -s -X POST "http://localhost:3000/api/game-systems/<stormlight_id>/docs/<docId>/reindex" \
  -H 'Content-Type: application/json' -d '{"dm_id": 1}'
```

Alternativamente, volver a correr el seed tras levantar Ollama re-ingiere solo si el contenido
cambió; para forzar la generación de vectores usa el endpoint de reindex de arriba.

---

## Cómo importar

### Desde la UI (recomendado)

1. Entra como DM al lobby → **🎲 Sistemas de juego**.
2. En la barra superior pulsa **Importar pack** y elige un archivo `.json` de este directorio.
3. El sistema aparece en la lista con sus atributos, habilidades, slots y mecánicas.

### Vía endpoint

```bash
curl -s -X POST http://localhost:3000/api/game-packs/import \
  -H 'Content-Type: application/json' \
  -d "{\"dm_id\": 1, \"pack\": $(cat game-packs/stormlight.json)}"
```

Respuesta: `{ "game_system_id": <id>, "system": { ... } }`.

## Cómo exportar

```bash
curl -s http://localhost:3000/api/game-systems/<id>/export
```

Devuelve `{ "pack": { ... } }` con el mismo formato. Desde la UI, el botón **Exportar** de un
sistema seleccionado descarga el `.json` directamente.
