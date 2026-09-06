/* global document, window, Image */
// Serialized into our static Canvas page. Inputs are data, never HTML or scripts.
export async function installStoryboardDrawing({scenes, artwork, total, visualStyle, locale}) {
  const canvas = document.querySelector('canvas'); const ctx = canvas.getContext('2d');
  const images = await Promise.all(artwork.map(src => new Promise((accept, reject) => {
    const image = new Image(); image.onload = () => accept(image); image.onerror = () => reject(new Error('Scene artwork cannot be decoded')); image.src = src;
  })));
  const paper = visualStyle === 'technical' ? '#edf1f1' : '#f3eee4';
  const ink = '#252b2c'; const accent = visualStyle === 'ink' ? '#47504c' : '#b25c3e';
  const smooth = x => { const t = Math.max(0, Math.min(1, x)); return t*t*(3-2*t); };
  function lines(text, maxWidth) {
    const result = []; let line = '';
    for (const ch of text) {
      if (line && ctx.measureText(line + ch).width > maxWidth) {result.push(line); line = '';}
      line += ch;
    }
    if (line) result.push(line);
    return result;
  }
  function label(text, y, size, width, maxLines) {
    let rows;
    do {ctx.font = `500 ${size}px "Noto Sans CJK SC", sans-serif`; rows = lines(text, width); if (rows.length <= maxLines || size <= 14) break; size -= 1;} while (size >= 14);
    rows.forEach((line, i) => ctx.fillText(line, 64, y + i*(size+6)));
  }
  function drawScene(index, time, opacity) {
    ctx.save(); ctx.globalAlpha = opacity;
    const scene = scenes[index]; const image = images[index];
    // All scientific objects stay inside the frame, including during movement.
    const progress = smooth((time - scene.start) / scene.duration);
    const scale = Math.min(1152/image.width, 438/image.height)*(0.965 + .035*progress);
    const width = image.width*scale, height = image.height*scale;
    const x = (1280-width)/2, y = 350-height/2;
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
  }
  window.render = time => {
    ctx.globalAlpha = 1; ctx.fillStyle = paper; ctx.fillRect(0,0,1280,720);
    let index = scenes.findLastIndex(scene => time >= scene.start); index = Math.max(0,index);
    const local = time-scenes[index].start;
    const transition = Math.min(.65, scenes[index].duration/3);
    const blend = index > 0 ? smooth(local/transition) : 1;
    if (index > 0 && blend < 1) drawScene(index-1, time, 1-blend);
    drawScene(index,time,blend);
    ctx.fillStyle = ink; label(scenes[index].title, 91, 32, 1152, 2);
    // Current captions remain crisp during the visual crossfade.
    const cue = scenes[index].cues.find(c => local >= c.start && local < c.end);
    if (cue) {ctx.fillStyle = ink; label(cue.text, 626, 28, 1152, 2);}
    ctx.font = '14px "Noto Sans CJK SC", sans-serif'; ctx.fillStyle = '#565d5a';
    ctx.fillText(locale === 'zh' ? '科学可视化 · 解释性素材，非原始证据' : 'Scientific visualization · explanatory artwork, not original evidence',64,35);
    ctx.fillStyle = accent; ctx.fillRect(64,688,1152*Math.max(0,Math.min(1,time/total)),3);
    ctx.font = '14px sans-serif'; ctx.fillText(`${index+1} / ${scenes.length}`,1168,35);
    return canvas.toDataURL('image/png').split(',')[1];
  };
}
