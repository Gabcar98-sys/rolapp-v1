# Game Packs

Los **game packs** son archivos JSON versionados que definen un sistema de juego entero
(atributos, habilidades, objetos, slots de equipo, mecánicas, personajes base y metadatos
de documentos). Son **datos importables**, no seeds: nunca se siembran automáticamente en
migraciones. El DM los importa desde la UI o vía endpoint.

Este directorio incluye dos ejemplos:

- `stormlight.json` — Stormlight RPG completo (13 atributos, 15 habilidades, armas, slots y mecánicas). Portado del seed M021 de la v0.
- `dragonbane.json` — Dragonbane reducido pero válido (6 atributos core + recursos, habilidades y carga).

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
      "inventory": [{ "item_name": "Espada", "quantity": 1 }]
    }
  ],

  "docs": [                        // SOLO metadatos; el contenido .md se ingiere en F6 (RAG)
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
- **`docs` son metadatos.** El contenido de los `.md` y su chunking/embedding se hacen en F6.

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
