# OpenScience launch research corpus

Last verified: 2026-08-10

## Purpose and boundary

This corpus gives the empty development deployment a credible public Research
Index. It contains six complete OpenScience demonstration records and twelve
lighter index records. Every record points to an upstream scientific software
or data project and records license evidence by Git blob SHA.

These are **OpenScience-authored metadata demonstrations**, not submissions by
the upstream authors, reproduced experiments, peer reviews, or endorsements.
The upstream license listed below describes the upstream project materials.
The catalog metadata and the six generated provenance Markdown artifacts use
CC-BY-4.0. A software license must not be assumed to cover externally hosted
datasets unless the upstream project explicitly says so.

## Complete demonstrations

| OpenScience ID | Source | Field | Upstream license evidence |
| --- | --- | --- | --- |
| OSR-DEMO-000001 | [WrightTools](https://github.com/wright-group/WrightTools) | Multidimensional spectroscopy | MIT, `b326efb13785867b0c4d2d06294c74a030590827` |
| OSR-DEMO-000002 | [skultrafast](https://github.com/Tillsten/skultrafast) | Time-resolved spectroscopy | BSD-3-Clause, `8c2a517200c747cb72d5e06eb2337214a5d73e61` |
| OSR-DEMO-000003 | [PyTASER](https://github.com/WMD-group/PyTASER) | Materials / transient absorption | MIT, `656ebe37cf6f53e75bf0c4e94a086a2b9012b5e2` |
| OSR-DEMO-000004 | [BSCCM](https://github.com/Waller-Lab/BSCCM) | Blood-cell microscopy | BSD-3-Clause, `75e5ec616bfbb48eef508f9448522192f728b2f7` |
| OSR-DEMO-000005 | [climateR](https://github.com/mikejohnson51/climateR) | Geospatial climate data | MIT declaration, `9aa281704b3b78a19cff83da0049cfc146dfafee` |
| OSR-DEMO-000006 | [Materials Images & Spectra](https://github.com/helgestein/materials-images-spectra) | Materials images / spectra | GPL-3.0, `f288702d2fa16d3cdf0035b15a9fcbc552cd88e7` |

Each complete record has all six SDF nodes and a content-addressed provenance
Markdown artifact in object storage. The artifact contains only catalog
metadata and links; it does not copy an upstream dataset.

## Lightweight index records

| OpenScience ID | Source | Field | Upstream license |
| --- | --- | --- | --- |
| OSR-DEMO-000007 | [RamanSPy](https://github.com/barahona-research-group/RamanSPy) | Raman spectroscopy | BSD-3-Clause |
| OSR-DEMO-000008 | [MNE-NIRS](https://github.com/mne-tools/mne-nirs) | Near-infrared spectroscopy | BSD-3-Clause |
| OSR-DEMO-000009 | [Larch](https://github.com/xraypy/xraylarch) | X-ray spectroscopy | MIT |
| OSR-DEMO-000010 | [Foundry](https://github.com/MLMI2-CSSI/foundry) | Scientific ML datasets | MIT |
| OSR-DEMO-000011 | [Fluorescence denoising](https://github.com/yinhaoz/denoising-fluorescence) | Bioimaging | MIT |
| OSR-DEMO-000012 | [BrightEyes-ISM](https://github.com/VicidominiLab/BrightEyes-ISM) | Image-scanning microscopy | GPL-3.0 |
| OSR-DEMO-000013 | [Climate Data Toolbox](https://github.com/chadagreene/CDT) | Earth science | Apache-2.0 |
| OSR-DEMO-000014 | [DeepTrack 2](https://github.com/DeepTrackAI/DeepTrack2) | Experimental imaging | MIT |
| OSR-DEMO-000015 | [Unsupervised deep video denoising](https://github.com/sreyas-mohan/udvd) | Computational imaging | MIT |
| OSR-DEMO-000016 | [SED](https://github.com/OpenCOMPES/sed) | Photoemission event data | MIT |
| OSR-DEMO-000017 | [MPES](https://github.com/mpes-kit/mpes) | Multidimensional photoemission | MIT |
| OSR-DEMO-000018 | [FID-A](https://github.com/CIC-methods/FID-A) | MR spectroscopy | BSD-3-Clause |

The exact license URLs and Git blob SHAs for these records are maintained in
`scripts/demo-research-corpus.mjs` and enforced by its test. Lightweight
records intentionally do not claim locally stored upstream artifacts.

## Seed operation

The command is non-writing by default:

```bash
npx pnpm@9.15.0 seed:demo-research
```

Production write requires explicit confirmation and the server's existing
database/object-storage environment:

```bash
npx pnpm@9.15.0 seed:demo-research -- --confirm
```

The seed uses stable `demo-source:<slug>` idempotency keys, never deletes data,
and reports existing records on replay. It creates a disabled, non-routable
catalog identity rather than a login-capable demonstration user.
