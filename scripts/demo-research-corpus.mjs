/**
 * Curated launch corpus for the public Research Index.
 *
 * These records describe upstream open-source research projects. They are not
 * presented as submissions by the upstream authors. License evidence is pinned
 * to the Git blob SHA observed on 2026-08-10.
 */

const verifiedAt = '2026-08-10';

function complete(entry) {
  const scope = entry.summary;
  return {
    ...entry,
    tier: 'complete',
    verifiedAt,
    sdf: {
      problem: `Demonstration scope: ${scope} The upstream project defines the scientific problem; OpenScience only structures its public metadata.`,
      insight: `The Research Object links a citable source, declared license evidence, method context, and reusable artifacts without claiming upstream authorship.`,
      method: `This demonstration was assembled from the upstream repository metadata and its license file, whose Git blob SHA is recorded for verification.`,
      results: `The resulting OpenScience record demonstrates public reading, provenance inspection, SDF navigation, and artifact discovery for this source.`,
      limitations: `This is a metadata demonstration, not a peer-reviewed reproduction. Scientific conclusions and data-specific terms remain those of the upstream source.`,
      reproducibility: `Follow the source repository and its own documentation. Verify the recorded license blob before redistributing any upstream code or data.`,
    },
  };
}

function index(entry) {
  return { ...entry, tier: 'index', verifiedAt };
}

export const DEMO_RESEARCH_CORPUS = [
  complete({
    slug: 'wrighttools-multidimensional-spectroscopy', title: 'WrightTools · multidimensional spectroscopy',
    author: 'WrightTools Developers', field: 'ultrafast-optics', artifactTypes: ['code', 'data'],
    summary: 'Tools for loading, processing, and plotting multidimensional spectroscopy data.',
    sourceUrl: 'https://github.com/wright-group/WrightTools', licenseId: 'MIT', licenseBlobSha: 'b326efb13785867b0c4d2d06294c74a030590827',
    licenseUrl: 'https://github.com/wright-group/WrightTools/blob/master/LICENSE.txt',
  }),
  complete({
    slug: 'skultrafast-time-resolved-spectroscopy', title: 'skultrafast · time-resolved spectroscopy',
    author: 'Till Stensitzki', field: 'ultrafast-optics', artifactTypes: ['code', 'data'],
    summary: 'A Python toolbox for analysing time-resolved spectroscopy measurements.',
    sourceUrl: 'https://github.com/Tillsten/skultrafast', licenseId: 'BSD-3-Clause', licenseBlobSha: '8c2a517200c747cb72d5e06eb2337214a5d73e61',
    licenseUrl: 'https://github.com/Tillsten/skultrafast/blob/master/LICENSE.txt',
  }),
  complete({
    slug: 'pytaser-transient-absorption', title: 'PyTASER · transient absorption simulation',
    author: 'WMD Group', field: 'materials-science', artifactTypes: ['code'],
    summary: 'A Python package for simulating differential absorption spectra of crystals from first principles.',
    sourceUrl: 'https://github.com/WMD-group/PyTASER', licenseId: 'MIT', licenseBlobSha: '656ebe37cf6f53e75bf0c4e94a086a2b9012b5e2',
    licenseUrl: 'https://github.com/WMD-group/PyTASER/blob/main/LICENSE',
  }),
  complete({
    slug: 'bsccm-blood-cell-microscopy', title: 'BSCCM · blood-cell microscopy',
    author: 'Waller Lab', field: 'bioimaging', artifactTypes: ['image', 'data', 'code'],
    summary: 'A benchmark single-cell collection for microscopy with code, metadata, notebooks, and figures.',
    sourceUrl: 'https://github.com/Waller-Lab/BSCCM', licenseId: 'BSD-3-Clause', licenseBlobSha: '75e5ec616bfbb48eef508f9448522192f728b2f7',
    licenseUrl: 'https://github.com/Waller-Lab/BSCCM/blob/main/LICENSE',
  }),
  complete({
    slug: 'climater-geospatial-retrieval', title: 'climateR · geospatial data retrieval',
    author: 'Mike Johnson and contributors', field: 'earth-science', artifactTypes: ['code', 'data'],
    summary: 'An R package for finding, subsetting, and retrieving geospatial data by area of interest.',
    sourceUrl: 'https://github.com/mikejohnson51/climateR', licenseId: 'MIT', licenseBlobSha: '9aa281704b3b78a19cff83da0049cfc146dfafee',
    licenseUrl: 'https://github.com/mikejohnson51/climateR/blob/master/DESCRIPTION',
  }),
  complete({
    slug: 'materials-images-spectra', title: 'Materials Images & Spectra',
    author: 'Helge Stein', field: 'materials-science', artifactTypes: ['code', 'image'],
    summary: 'A small materials-science project for obtaining example material images and spectra.',
    sourceUrl: 'https://github.com/helgestein/materials-images-spectra', licenseId: 'GPL-3.0', licenseBlobSha: 'f288702d2fa16d3cdf0035b15a9fcbc552cd88e7',
    licenseUrl: 'https://github.com/helgestein/materials-images-spectra/blob/master/LICENSE',
  }),
  index({ slug: 'ramanspy', title: 'RamanSPy · Raman spectroscopy analysis', author: 'Dimitar Georgiev and contributors', field: 'spectroscopy', artifactTypes: ['code'], summary: 'A Python package for Raman spectroscopy research and analysis workflows.', sourceUrl: 'https://github.com/barahona-research-group/RamanSPy', licenseId: 'BSD-3-Clause', licenseBlobSha: 'c19d15f335a8c7ac89cbc2f88125f5be3f30c57b', licenseUrl: 'https://github.com/barahona-research-group/RamanSPy/blob/main/LICENSE' }),
  index({ slug: 'mne-nirs', title: 'MNE-NIRS · near-infrared spectroscopy', author: 'Robert Luke and MNE contributors', field: 'neuroimaging', artifactTypes: ['code'], summary: 'Processing and analysis tools for near-infrared spectroscopy data in the MNE ecosystem.', sourceUrl: 'https://github.com/mne-tools/mne-nirs', licenseId: 'BSD-3-Clause', licenseBlobSha: '96a755561fee9cc598bb7f9d2f18c07cbc536d27', licenseUrl: 'https://github.com/mne-tools/mne-nirs/blob/main/LICENSE' }),
  index({ slug: 'xraylarch', title: 'Larch · X-ray spectroscopy analysis', author: 'Matthew Newville and contributors', field: 'spectroscopy', artifactTypes: ['code'], summary: 'A scientific analysis toolkit for X-ray spectroscopy and related experimental methods.', sourceUrl: 'https://github.com/xraypy/xraylarch', licenseId: 'MIT', licenseBlobSha: 'f6bcb49034326e53eefb2ec2852f58bedee2b0bc', licenseUrl: 'https://github.com/xraypy/xraylarch/blob/master/LICENSE' }),
  index({ slug: 'foundry-ml-datasets', title: 'Foundry · machine-learning datasets', author: 'The University of Chicago', field: 'materials-science', artifactTypes: ['code', 'data'], summary: 'A platform-oriented project for making scientific machine-learning datasets accessible and usable.', sourceUrl: 'https://github.com/MLMI2-CSSI/foundry', licenseId: 'MIT', licenseBlobSha: '741631b452c6f424f9e26d838ad97052a5432401', licenseUrl: 'https://github.com/MLMI2-CSSI/foundry/blob/main/LICENSE' }),
  index({ slug: 'denoising-fluorescence', title: 'Fluorescence microscopy denoising', author: 'Yinhao Zhu and Yide Zhang', field: 'bioimaging', artifactTypes: ['code', 'image'], summary: 'Methods and examples for denoising fluorescence microscopy images with deep learning.', sourceUrl: 'https://github.com/yinhaoz/denoising-fluorescence', licenseId: 'MIT', licenseBlobSha: '85eaef262579339e42329323f92e7836e9a267ce', licenseUrl: 'https://github.com/yinhaoz/denoising-fluorescence/blob/master/LICENSE.md' }),
  index({ slug: 'brighteyes-ism', title: 'BrightEyes-ISM · image-scanning microscopy', author: 'Vicidomini Lab', field: 'bioimaging', artifactTypes: ['code', 'image'], summary: 'Open tools for acquisition and analysis in image-scanning microscopy workflows.', sourceUrl: 'https://github.com/VicidominiLab/BrightEyes-ISM', licenseId: 'GPL-3.0', licenseBlobSha: 'f288702d2fa16d3cdf0035b15a9fcbc552cd88e7', licenseUrl: 'https://github.com/VicidominiLab/BrightEyes-ISM/blob/master/LICENSE' }),
  index({ slug: 'climate-data-toolbox', title: 'Climate Data Toolbox', author: 'Chad Greene and contributors', field: 'earth-science', artifactTypes: ['code', 'data'], summary: 'A MATLAB toolbox for analysing climate and Earth-science datasets.', sourceUrl: 'https://github.com/chadagreene/CDT', licenseId: 'Apache-2.0', licenseBlobSha: '261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64', licenseUrl: 'https://github.com/chadagreene/CDT/blob/master/LICENSE' }),
  index({ slug: 'deeptrack2', title: 'DeepTrack 2 · experimental imaging pipelines', author: 'Soft Matter Lab', field: 'bioimaging', artifactTypes: ['code', 'image'], summary: 'A modular library for generating, manipulating, and analysing experimental imaging data pipelines.', sourceUrl: 'https://github.com/DeepTrackAI/DeepTrack2', licenseId: 'MIT', licenseBlobSha: '795fdb722f7993fba95a78956fb789a675c503e2', licenseUrl: 'https://github.com/DeepTrackAI/DeepTrack2/blob/develop/LICENSE' }),
  index({ slug: 'unsupervised-video-denoising', title: 'Unsupervised deep video denoising', author: 'Sreyas Mohan and contributors', field: 'computational-imaging', artifactTypes: ['code', 'video'], summary: 'Research code for unsupervised denoising of scientific and natural video sequences.', sourceUrl: 'https://github.com/sreyas-mohan/udvd', licenseId: 'MIT', licenseBlobSha: '4d813980f562aa25ee7bdde3645ed26de9923b9e', licenseUrl: 'https://github.com/sreyas-mohan/udvd/blob/main/LICENSE' }),
  index({ slug: 'opencompes-sed', title: 'SED · single-event data frames', author: 'OpenCOMPES', field: 'photoemission', artifactTypes: ['code', 'data'], summary: 'A processing backend for photoelectron-resolved single-event data streams.', sourceUrl: 'https://github.com/OpenCOMPES/sed', licenseId: 'MIT', licenseBlobSha: '7961f2d189a2de85ddbfe9492c18d5088d1117c8', licenseUrl: 'https://github.com/OpenCOMPES/sed/blob/main/LICENSE' }),
  index({ slug: 'mpes', title: 'MPES · multidimensional photoemission', author: 'R. Patrick Xian and contributors', field: 'photoemission', artifactTypes: ['code', 'data'], summary: 'Distributed routines for processing multidimensional photoemission spectroscopy data.', sourceUrl: 'https://github.com/mpes-kit/mpes', licenseId: 'MIT', licenseBlobSha: 'bf471772d34599059864b6aaafee8f71d4a70ab7', licenseUrl: 'https://github.com/mpes-kit/mpes/blob/master/LICENSE.md' }),
  index({ slug: 'fida-mr-spectroscopy', title: 'FID-A · MR spectroscopy', author: 'Jamie Near and contributors', field: 'magnetic-resonance', artifactTypes: ['code', 'data'], summary: 'An open analysis and simulation toolbox with example data for magnetic-resonance spectroscopy.', sourceUrl: 'https://github.com/CIC-methods/FID-A', licenseId: 'BSD-3-Clause', licenseBlobSha: '96d29e9d6a10854ffb17ef493408f28347635684', licenseUrl: 'https://github.com/CIC-methods/FID-A/blob/master/LICENSE.txt' }),
];
