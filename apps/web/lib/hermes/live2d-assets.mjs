// Existing source identity of the native Wanko export; change with its assets.
export const LIVE2D_ASSET_ROOT = '/hermes/live2d/f4ae3a93';
export const LIVE2D_ASSET_FILES = [
  'live2dcubismcore.min.js',
  'wanko/wanko_touch.model3.json', 'wanko/wanko_touch.moc3',
  'wanko/wanko_touch.physics3.json', 'wanko/wanko_touch.cdi3.json',
  'wanko/wanko_touch.1024/texture_00.png', 'wanko/wanko_touch.1024/texture_01.png',
  ...['idle_01', 'idle_02', 'idle_03', 'idle_04', 'shake_01', 'shake_02', 'touch_01', 'touch_02', 'touch_03', 'touch_04', 'touch_05', 'touch_06'].map(name => `wanko/motion/${name}.motion3.json`),
];
