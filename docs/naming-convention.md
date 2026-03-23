# File naming convention

SSGG generates a deterministic filename for every processed photo:

```
author_projectSlug_date_index
```

**Examples:**
```
philippeVollenweider_quelquesSpectaclesEtLive_20230425_001.webp
leaMullerGirard_summerInZurichPortraitsLandscapes_20250415_012.webp
```

**Rules:**
- `author` — camelCase from `project.author`, diacritics stripped
- `projectSlug` — camelCase from `project.title`
- `date` — `project.date` with non-digit chars removed (YYYYMMDD)
- `index` — zero-padded to 3 digits (001, 002, …)

If a field is absent it is omitted from the filename. Photos are sorted
alphabetically from the source folder before indexing.

**Dist folder name** (`dist/<slug>/`):
- Public galleries: slugified version of `project.name` or `project.title`
- Private galleries: 16-char SHA-256 hash of `author|title|date`
