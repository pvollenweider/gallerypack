# File naming convention

SSGG generates deterministic, human-readable file names for every processed photo.

---

## Photo file names

**Pattern:** `authorCamel_titleCamel_YYYYMMDD_NNN.webp`

```
philippeVollenweider_quelquesSpectaclesEtLive_20230425_001.webp
leaMullerGirard_summerInZurichPortraitsLandscapes_20250415_012.webp
```

### Segments

| Segment | Source | Transformation |
|---------|--------|----------------|
| `authorCamel` | `project.author` | diacritics stripped, camelCase |
| `titleCamel` | `project.title` | diacritics stripped, camelCase |
| `YYYYMMDD` | `project.date` | non-digits stripped |
| `NNN` | photo index | zero-padded to 3 digits |

### Rules
- Photos are sorted alphabetically from the source folder before indexing
- If `author` is absent, the segment is omitted
- If `date` is `"auto"`, the earliest EXIF date is used; if none, today's date is used
- The index always starts at `001`, regardless of the source file name

### Examples

| Config | Source | Output |
|--------|--------|--------|
| author: "Léa Müller", title: "Été à Zürich", date: "2025-06-01" | IMG_0042.jpg | `leaMuller_eteAZurich_20250601_001.webp` |
| author: "", title: "Insects", date: "auto" (EXIF: 2026-01-17) | IMG_0715.jpeg | `insects_20260117_003.webp` |
| author: "Philippe V.", title: "Live", date: "2023-04-25" | DSC_0001.jpg | `philippeV_live_20230425_001.webp` |

---

## Dist folder names

**Public galleries:** slugified version of `project.name` or `project.title`

```
"Summer in Zürich — Portraits & Landscapes"  →  summer-in-zurich-portraits-landscapes
"Quelques spectacles et live"                →  quelques-spectacles-et-live
```

**Private galleries (`private: true`):** 16-char SHA-256 hash of `"author|title|date"`

```
"Léa Müller|Summer in Zürich|2025-04-15"  →  a3f8c2d1e4b9f7a0
```

The hash is **deterministic** — same config always produces the same folder name.
To rotate the URL, change `title`, `author`, or `date`.

---

## Slug algorithm

`slugify()` transforms any string to a URL-safe slug:
1. Normalize to NFD (decompose diacritics)
2. Strip combining characters (`[\u0300-\u036f]`)
3. Lowercase
4. Replace non-alphanumeric runs with `-`
5. Trim leading/trailing hyphens

```
"Été à Zürich — 2025!"  →  "ete-a-zurich-2025"
"Quelques spectacles"   →  "quelques-spectacles"
```
