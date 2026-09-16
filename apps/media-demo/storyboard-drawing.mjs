/* global document, window, Image */
// Serialized into our static Canvas page. Inputs are data, never HTML or scripts.
export async function installStoryboardDrawing({scenes, artwork, total, visualStyle, locale}) {
  const canvas = document.querySelector('canvas'); const ctx = canvas.getContext('2d');
  const images = await Promise.all(artwork.map(src => new Promise((accept, reject) => {
    const image = new Image(); image.onload = () => accept(image); image.onerror = () => reject(new Error('Scene artwork cannot be decoded')); image.src = src;
  })));
  const paper = visualStyle === 'technical' ? '#edf1f1' : '#f3eee4';
  const ink = '#252b2c'; const accent = visualStyle === 'ink' ? '#47504c' : '#b25c3e';
  const palette = { ink: '#252b2c', blue: '#356b8c', teal: '#2b7a78', amber: '#b8792c', muted: '#747b78' };
  const diagram = { x: 64, y: 154, width: 816, height: 402 };
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
  const progressFor = (action, progress) => smooth((progress-action.start)/(action.end-action.start));
  function objectState(object, actions, progress) {
    const state = {x: object.x, y: object.y, alpha: 1, scale: 1, draw: 1, highlight: 0};
    for (const action of actions.filter(item => item.target === object.id)) {
      const amount = progressFor(action, progress);
      if (action.kind === 'enter') state.alpha *= amount;
      else if (action.kind === 'fade') state.alpha *= 1-amount;
      else if (action.kind === 'translate') {state.x = object.x+(action.toX-object.x)*amount; state.y = object.y+(action.toY-object.y)*amount;}
      else if (action.kind === 'pulse' && amount > 0 && amount < 1) state.scale *= 1+.09*Math.sin(Math.PI*amount);
      else if (action.kind === 'draw') state.draw = amount;
      else if (action.kind === 'highlight') state.highlight = amount > 0 && amount < 1 ? Math.sin(Math.PI*amount) : 0;
    }
    return state;
  }
  function traced(points, amount) {
    const lengths = points.slice(1).map((point, index) => Math.hypot(point.x-points[index].x, point.y-points[index].y));
    const target = lengths.reduce((sum, value) => sum+value, 0)*amount;
    let traversed = 0; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) {
      const length = lengths[index-1];
      if (traversed+length <= target) ctx.lineTo(points[index].x, points[index].y);
      else {const ratio = length ? Math.max(0,(target-traversed)/length) : 0; ctx.lineTo(points[index-1].x+(points[index].x-points[index-1].x)*ratio,points[index-1].y+(points[index].y-points[index-1].y)*ratio); break;}
      traversed += length;
    }
    ctx.stroke();
  }
  function drawObject(object, actions, progress, opacity) {
    const state = objectState(object, actions, progress); const color = palette[object.color];
    const x = diagram.x+state.x*diagram.width, y = diagram.y+state.y*diagram.height;
    const width = object.width*diagram.width, height = object.height*diagram.height;
    ctx.save(); ctx.globalAlpha = opacity*state.alpha; ctx.strokeStyle = color; ctx.fillStyle = `${color}22`; ctx.lineWidth = 4;
    ctx.shadowColor = color; ctx.shadowBlur = 18*state.highlight;
    ctx.translate(x+width/2,y+height/2); ctx.scale(state.scale,state.scale); ctx.translate(-width/2,-height/2);
    if (object.kind === 'rect') {ctx.beginPath();ctx.roundRect(0,0,width,height,10);ctx.fill();ctx.stroke();}
    else if (object.kind === 'ellipse') {ctx.beginPath();ctx.ellipse(width/2,height/2,width/2,height/2,0,0,Math.PI*2);ctx.fill();ctx.stroke();}
    else if (object.kind === 'label') {ctx.font = `600 ${Math.max(14,Math.min(24,height*.55))}px "Noto Sans CJK SC", sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(object.label,width/2,height/2,Math.max(20,width));}
    else if (object.kind === 'arrow') {
      const start={x:object.points[0].x*width,y:object.points[0].y*height};const finish={x:object.points[1].x*width,y:object.points[1].y*height};
      const end={x:start.x+(finish.x-start.x)*state.draw,y:start.y+(finish.y-start.y)*state.draw};ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);ctx.stroke();
      if(state.draw>.98){const angle=Math.atan2(finish.y-start.y,finish.x-start.x);ctx.beginPath();ctx.moveTo(finish.x,finish.y);ctx.lineTo(finish.x-16*Math.cos(angle-.55),finish.y-16*Math.sin(angle-.55));ctx.moveTo(finish.x,finish.y);ctx.lineTo(finish.x-16*Math.cos(angle+.55),finish.y-16*Math.sin(angle+.55));ctx.stroke();}
    } else if (object.kind === 'trace') traced(object.points.map(point=>({x:point.x*width,y:point.y*height})),state.draw);
    ctx.restore();
  }
  function drawReferenceImage(image, progress, opacity) {
    const frame={x:930,y:176,width:286,height:322}; const scale=Math.min(frame.width/image.width,frame.height/image.height)*(0.985+.015*progress);
    const width=image.width*scale,height=image.height*scale;
    ctx.save();ctx.globalAlpha=opacity;ctx.fillStyle='#ffffff99';ctx.fillRect(frame.x-10,frame.y-10,frame.width+20,frame.height+20);
    ctx.drawImage(image,frame.x+(frame.width-width)/2,frame.y+(frame.height-height)/2,width,height);ctx.restore();
  }
  function drawScene(index, time, opacity) {
    ctx.save(); ctx.globalAlpha = opacity;
    const scene = scenes[index]; const image = images[index];
    const progress = smooth((time - scene.start) / scene.duration);
    ctx.strokeStyle='#aeb6b2';ctx.lineWidth=1;ctx.strokeRect(diagram.x,diagram.y,diagram.width,diagram.height);
    scene.animation?.objects.forEach(object=>drawObject(object,scene.animation.actions,progress,opacity));
    drawReferenceImage(image,progress,opacity);
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
    ctx.fillText(locale === 'zh' ? '概念示意，非实测或仿真；尺寸与时间不按比例' : 'Conceptual illustration, not measurement or simulation; size and time not to scale',64,35);
    ctx.fillText(locale === 'zh' ? '审核后的机制动态图层' : 'Reviewed mechanism animation',64,582);
    ctx.fillText(locale === 'zh' ? '审核后的场景示意图' : 'Reviewed scene illustration',930,522);
    ctx.fillStyle = accent; ctx.fillRect(64,688,1152*Math.max(0,Math.min(1,time/total)),3);
    ctx.font = '14px sans-serif'; ctx.fillText(`${index+1} / ${scenes.length}`,1168,35);
    return canvas.toDataURL('image/png').split(',')[1];
  };
}
