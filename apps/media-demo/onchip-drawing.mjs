/* global document, window, Image */
// Fixed explanatory profile for arXiv:2009.06045. No quantitative simulation or user code.
export async function installOnchipDrawing({ scenes, total, locale = 'zh', artwork = [] }) {
  if (!Array.isArray(scenes) || scenes.length !== 5 || !Number.isFinite(total) || total <= 0 || total > 90) throw Error('Invalid on-chip timeline');
  if (scenes.some((scene, index) => !Number.isFinite(scene.start) || !Number.isFinite(scene.duration) || scene.duration <= 0
    || (index === 0 ? scene.start !== 0 : Math.abs(scene.start - scenes[index - 1].start - scenes[index - 1].duration) > .001)
    || typeof scene.title !== 'string' || scene.title.length > 120)
    || Math.abs(scenes[4].start + scenes[4].duration - total) > .001) throw Error('Invalid on-chip scene boundaries');
  const canvas = document.querySelector('canvas');
  const g = canvas.getContext('2d');
  const art = await Promise.all(artwork.map(async source => { const image = new Image(); image.src = source; await image.decode(); return image; }));
  const zh = locale === 'zh';
  const colors = { paper: '#f7f3e8', ink: '#263d42', faint: '#dfdfd4', red: '#b74335', blue: '#267b92', gold: '#bc9450' };
  const text = (cn, en) => zh ? cn : en;
  const line = (x1, y1, x2, y2, color, width = 2) => { g.strokeStyle = color; g.lineWidth = width; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  const label = (value, x, y, size = 22, color = colors.ink) => { g.fillStyle = color; g.font = `${size}px "Noto Sans CJK SC", sans-serif`; g.fillText(value, x, y); };
  function circle(x, y, radius, color) { g.fillStyle = color; g.beginPath(); g.arc(x, y, radius, 0, Math.PI * 2); g.fill(); }
  function waveform(x, y, width, height, center, phase, color) {
    g.beginPath(); g.strokeStyle = color; g.lineWidth = 3;
    for (let i = 0; i <= width; i += 2) {
      const u = i / width;
      const value = Math.exp(-(((u - center) / .19) ** 2)) * Math.sin(u * Math.PI * 14 - phase);
      const py = y - value * height;
      if (i === 0) g.moveTo(x + i, py); else g.lineTo(x + i, py);
    }
    g.stroke();
  }
  function arrow(x1, y1, x2, y2, color) {
    line(x1, y1, x2, y2, color, 2);
    const a = Math.atan2(y2 - y1, x2 - x1);
    line(x2, y2, x2 - 10 * Math.cos(a - .5), y2 - 10 * Math.sin(a - .5), color);
    line(x2, y2, x2 - 10 * Math.cos(a + .5), y2 - 10 * Math.sin(a + .5), color);
  }
  function device(time, emission = false, enlarged = false) {
    g.save();
    if (enlarged) { g.translate(-150, -55); g.scale(1.15, 1.15); }
    g.fillStyle = '#e8e1cf'; g.fillRect(310, 435, 570, 28);
    g.fillStyle = colors.gold; g.beginPath(); g.moveTo(380, 260); g.lineTo(660, 365); g.lineTo(380, 435); g.closePath(); g.fill();
    g.fillRect(825, 270, 30, 165);
    line(390, 429, 390, 505, colors.ink); line(840, 435, 840, 505, colors.ink); line(390, 505, 840, 505, colors.ink);
    circle(610, 505, 19, colors.paper); g.strokeStyle = colors.ink; g.stroke(); label('I', 606, 512, 20);
    const driver = Math.cos(time * 3.5);
    const weak = .16 * Math.sin(time * 1.2);
    const strength = .35 + .65 * Math.max(0, driver + weak);
    for (let i = 0; i < 5; i++) {
      g.strokeStyle = `rgba(183,67,53,${strength * (1 - i / 7)})`; g.lineWidth = 2;
      g.beginPath(); g.ellipse(663, 365, 14 + i * 11, 12 + i * 13, 0, -1.25, 1.25); g.stroke();
    }
    if (emission) {
      const gateOpen = driver > .9;
      const barrierWidth = gateOpen ? 28 : 82;
      line(92, 548, 288, 548, colors.faint);
      g.strokeStyle = gateOpen ? colors.red : colors.ink; g.lineWidth = 3;
      g.beginPath(); g.moveTo(130, 548); g.lineTo(130, 477); g.lineTo(130 + barrierWidth, 548); g.stroke();
      label(gateOpen ? text('有利极性：势垒变薄', 'Favorable polarity: thinner barrier') : text('当前相位：发射门关闭', 'Current phase: emission gate closed'), 60, 458, 17);
      // Bursts illustrate gated emission; trajectory timing/amplitudes are not physical data.
      const cycle = time * 3.5 / (2 * Math.PI);
      const burstTime = Math.floor(cycle) * 2 * Math.PI / 3.5;
      const charge = Math.round(6 + 3 * Math.sin(burstTime * 1.2));
      for (let i = 0; i < charge; i++) {
        const phase = cycle % 1 - i * .008;
        if (phase >= 0 && phase < .72) circle(674 + phase / .72 * 146, 364 + Math.sin(i * 1.7) * 13, 3.6, colors.ink);
      }
      label(text('窄发射门 ≠ 跨隙飞行时间', 'Emission gate width ≠ transit time'), 420, 595, 18);
    }
    label(text('金纳米天线', 'Gold nanoantenna'), 335, 238, 20);
    label(text('金线阳极', 'Gold wire anode'), 790, 238, 20);
    label(text('50 nm 间隙 · 非等比例', '50 nm gap · not to scale'), 660, 475, 17);
    label(text('平均电流', 'Average current'), 540, 553, 20);
    g.restore();
  }
  function delayScan(time, progress) {
    label(text('局部弱信号', 'Weak local signal'), 114, 236, 21, colors.blue);
    waveform(120, 315, 980, 72, .5, 0, colors.blue);
    const gate = 150 + progress * 910;
    g.fillStyle = 'rgba(183,67,53,.1)'; g.fillRect(gate - 14, 240, 28, 155);
    line(gate, 240, gate, 395, colors.red, 3);
    label(text('采样门随延迟移动', 'Delay moves the sampling gate'), 370, 420, 20, colors.red);
    line(120, 535, 1100, 535, colors.faint);
    g.strokeStyle = colors.ink; g.lineWidth = 3; g.beginPath();
    for (let x = 0; x <= progress * 980; x += 2) {
      const u = x / 980;
      const y = 505 - 48 * Math.sin(u * 14 * Math.PI) * Math.exp(-(((u - .5) / .23) ** 2));
      if (!x) g.moveTo(120, y); else g.lineTo(120 + x, y);
    }
    g.stroke();
    label(text('每次电荷 → 重复脉冲平均 → ΔI(τ)', 'Charge per pulse → repetition average → ΔI(τ)'), 140, 570, 20);
    label(text('时间平均电流变化：非实验数据', 'Time-averaged current change: not experimental data'), 140, 600, 18);
    circle(gate, 395, 4 + Math.sin(time * 5) * 1.5, colors.red);
  }
  function artworkInset(index) {
    const image = art[index]; if (!image) return;
    const ratio = Math.min(230 / image.width, 140 / image.height);
    g.drawImage(image, 965 + (230 - image.width * ratio) / 2, 225 + (140 - image.height * ratio) / 2, image.width * ratio, image.height * ratio);
    label(text('已批准插图 · 非原文证据', 'Approved art · not source evidence'), 948, 390, 14);
  }
  function subtitle(value) {
    g.font = '23px "Noto Sans CJK SC", sans-serif';
    const lines = []; let current = '';
    for (const character of value) {
      if (g.measureText(current + character).width > 1120) { lines.push(current); current = ''; }
      current += character;
    }
    if (current) lines.push(current);
    if (lines.length > 2) throw Error('Narration cue exceeds readable subtitle space');
    lines.forEach((value, index) => label(value, 80, 635 + index * 29, 23));
  }
  function title(value) {
    let size = 32;
    while (size > 18) { g.font = `${size}px "Noto Sans CJK SC", sans-serif`; if (g.measureText(value).width <= 2200) break; size--; }
    const lines = []; let current = '';
    for (const character of value) {
      if (g.measureText(current + character).width > 1120) { lines.push(current); current = ''; }
      current += character;
    }
    if (current) lines.push(current);
    if (lines.length > 2) throw Error('Scene title exceeds readable space');
    lines.forEach((value, index) => label(value, 64, lines.length === 1 ? 115 : 90 + index * 35, size));
  }
  window.render = rawTime => {
    if (!Number.isFinite(rawTime)) throw Error('Invalid frame time');
    const time = Math.max(0, Math.min(total - .0001, rawTime));
    const index = Math.max(0, scenes.findIndex(scene => time >= scene.start && time < scene.start + scene.duration));
    const scene = scenes[index]; const local = time - scene.start; const progress = local / scene.duration;
    g.fillStyle = colors.paper; g.fillRect(0, 0, 1280, 720);
    label(`${String(index + 1).padStart(2, '0')} / 05`, 64, 61, 18, colors.red);
    title(scene.title);
    label(text('片上光场采样 · 说明性动画，非数值模拟', 'On-chip field sampling · Explanatory animation, not a numerical simulation'), 64, 160, 18);
    g.save(); g.translate(15, 65); g.scale(.76, .76);
    if (index === 0) {
      waveform(120, 290, 810, 72, .2 + progress * .6, time * 3, colors.red);
      waveform(120, 440, 810, 28, .15 + progress * .6, time * 3, colors.blue);
      label(text('强驱动脉冲', 'Strong driver pulse'), 120, 225, 22, colors.red);
      label(text('弱信号脉冲：振幅已放大', 'Weak signal: amplitude enlarged for visibility'), 120, 520, 22, colors.blue);
      arrow(930, 305, 1100, 305, colors.ink); label(text('到达器件', 'To device'), 955, 355, 20);
    } else if (index === 1 || index === 2) {
      device(time, index === 2, index === 1);
      waveform(82, 334, 260, 36, .5, time * 4, colors.red);
      arrow(120, 405, 312, 405, colors.red);
      waveform(82, 385, 260, 14, .5, time * 1.2, colors.blue);
      if (index === 2) label(text('弱信号改变发射量；单独不能驱动发射', 'Weak signal changes burst charge; alone it cannot emit'), 150, 635, 20);
    } else if (index === 3) delayScan(time, progress);
    else {
      label(text('入射信号场 E_S', 'Incident signal E_S'), 120, 220, 22);
      waveform(120, 300, 400, 45, .5, time * .7, colors.blue);
      arrow(535, 300, 645, 300, colors.ink); label('H_Pl', 560, 270, 22);
      label(text('局域场 E_S^L', 'Local field E_S^L'), 680, 220, 22);
      waveform(680, 300, 400, 70, .55, time * .7 + .8, '#184e63');
      label(text('再经采样响应 H_Det → 平均 ΔI(τ)', 'Sampling response H_Det → average ΔI(τ)'), 230, 450, 25);
      label(text('局域场 ≠ 入射场；波形为原理示意', 'Local ≠ incident field; waveforms are schematic'), 160, 510, 22);
      label(text('少周期驱动 · 轴向偏振 · 相位/带宽条件 · 弱扰动', 'Few-cycle driver · axial polarization · phase/bandwidth · weak perturbation'), 120, 570, 21);
    }
    g.restore();
    artworkInset(index);
    const cue = scene.cues?.find(cue => local >= cue.start && local < cue.end);
    if (cue) subtitle(cue.text);
    line(64, 699, 1216, 699, colors.faint, 3); line(64, 699, 64 + 1152 * time / total, 699, colors.blue, 3);
    return canvas.toDataURL('image/png').split(',')[1];
  };
}
