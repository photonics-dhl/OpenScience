# Optical Editorial V3 — Figma Canonical Map

**Canonical file:** [OpenScience Web Design System](https://www.figma.com/design/gjhowMG7cG4clKwvhvF08E)

**Owner:** long-term project account, verified through the `figma-primary` OAuth session and Full-seat write access on 2026-08-10.

**Runtime authority:** browser code remains the visual and behavioral truth. Figma documents tokens, layout anatomy, component states and product-surface intent; it does not replace real Canvas, form, i18n or API behavior.

## V3 Foundations

| Collection | Figma ID | Count | Code authority |
|---|---:|---:|---|
| `V3 / Color` | `VariableCollectionId:2100:2` | 13 | `apps/web/app/tokens.css` color and rule tokens |
| `V3 / Structure` | `VariableCollectionId:2100:3` | 14 | spacing, radius and z-index tokens |
| `V3 / Typography` | `VariableCollectionId:2100:4` | 9 | four font roles and canonical sizes |
| `V3 / Motion` | `VariableCollectionId:2100:5` | 8 | durations, easing and reduced-motion semantics |

All 44 variables have explicit Web scopes and `WEB` code syntax. The final audit found zero `ALL_SCOPES` variables and zero missing Web syntax entries.

Text styles: `V3 / Display / Hero`, `Hero CJK`, `Heading XL`, `Heading LG`, `Heading MD`, `Body Editorial`, `Body UI`, `Label UI`, `Data Mono`. Effects: `V3 / Shadow / Card`, `Evidence`, `Overlay`.

| Page / root | Node ID |
|---|---:|
| `01 Foundations / V3 Optical Editorial` | `2102:2` |
| Header / Color / Typography / Grid / Motion | `2102:3` / `2102:4` / `2102:5` / `2102:6` / `2102:7` |
| `02 Components / V3 real component mapping` | `2112:7` |
| `04 Screens / V3 eight-surface matrix` | `2123:141` |

## Real Component Mapping

| Figma set | Node ID | Variant axis | React authority |
|---|---:|---|---|
| `StatusBadge` | `2117:7` | five `Status` values | `apps/web/components/ui/status-badge.tsx` |
| `Dropzone` | `2118:156` | two `State` values | `apps/web/components/ui/dropzone.tsx` |
| `ProgressRail` | `2119:7` | three `State` values | `apps/web/components/ui/progress-rail.tsx` |
| `EvidenceCard` | `2120:160` | three `Status` values | `apps/web/components/ui/evidence-card.tsx` |

Existing Button and Input sets are referenced only where their current exported API is exact. Destructive/icon-only button variants and browser-owned native input behavior are not invented in Figma.

Code Connect is optional and must remain honest: next-intl labels, callbacks, native file selection, computed progress, API-derived state and Canvas Optical Field behavior cannot be represented as static component properties. A missing Organization/Enterprise Code Connect entitlement does not block the canonical map or browser delivery.

## Eight Product Surfaces

| Surface | Node ID | Canonical route / responsibility |
|---|---:|---|
| Landing | `2125:141` | `/`; editorial hero, optical aperture and public reading transition |
| Workspace | `2125:146` | `/research-objects/:id/edit`; 19/56/25 SDF work planes |
| Public | `2126:141` | `/public/:publicId`; citable paper and provenance rail |
| Auth | `2126:146` | `/auth/register`, `/auth/login`; code registration and independent sign-in |
| Dashboard | `2127:141` | `/dashboard`; continue research and actionable Hermes confirmations |
| Intake | `2127:146` | `/research-objects/new`; mixed evidence, roles, primary manuscript and progress |
| Explore | `2128:141` | `/explore`; public reading index and launch corpus |
| Collection | `2128:146` | `/collections/ultrafast-science`; selected journal items, SDF metadata, image/video media |

Every frame records its shell, anatomy and operational states. There are exactly eight canonical surface frames and no placeholder nodes.

## Browser Comparison and Limits

The Figma structure was compared with `apps/web/app/tokens.css`, the real React primitives and the existing deterministic captures in `apps/web/test/visual/out/` for Landing/Open RO, Workspace, Public reading, Explore, Intake and Task 12 product surfaces. Those ignored screenshots are working evidence rather than versioned design assets; Task 14 will replace the ad-hoc scripts with a canonical manifest and CI artifact policy.

The pointer-local text distortion, aperture, diffraction wavefront, reduced-motion fallback, font loading, focus behavior and live data are browser-owned. A static Figma approximation must never be used as evidence that those runtime requirements pass.

## Final Audit

- Long-term owner write and read-back: passed.
- Variables: 44; `ALL_SCOPES=0`; missing Web syntax `=0`.
- Styles: 9 text + 3 effect.
- Components: four real sets with descriptions and variant axes.
- Product surfaces: eight; placeholders: zero.
- Root dimensions: foundations `1440×2176`, components `1440×2116`, screens `1440×2052`.
- OAuth, account credentials and session material: excluded from repository documentation.
