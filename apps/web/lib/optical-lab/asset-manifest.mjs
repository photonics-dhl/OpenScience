export const OPTICAL_ASSETS = Object.freeze({
  energyPlate: Object.freeze({
    sha256: '52cbf993a05e8d008b64b3d4b849ab9c5e038262513ce0910f2ccd1d8365093c',
    source: '/optical-lab/energy-plate-black-alpha-v1.png',
    versioned: '/optical-lab/energy-plate-black-alpha-v1.52cbf993a05e8d00.png',
  }),
  targetReference: Object.freeze({
    sha256: '1622d38cd152f41483a86da739328b56ba50caeff1b8ff7a5ba59e1633a2ae3c',
    source: '/optical-lab/target-reference.png',
    versioned: '/optical-lab/target-reference.1622d38cd152f414.png',
  }),
});

export const OPTICAL_ASSET_URLS = Object.freeze({
  energyPlate: OPTICAL_ASSETS.energyPlate.versioned,
  targetReference: OPTICAL_ASSETS.targetReference.versioned,
});
