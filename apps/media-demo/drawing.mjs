/* global Image, document, window */
// Executed inside Chromium. Fixed D2NN illustration, not an arbitrary HTML renderer.
export const installDrawing = async ({ scenes, total, artworkData, visualStyle = 'technical' }) => {
    const watercolor = visualStyle === 'watercolor';
    const art = new Image();
    art.src = artworkData;
    await art.decode();
    const c = document.querySelector('canvas');
    let g = c.getContext('2d');
    const main = g, stage = document.createElement('canvas');
    stage.width = 1280;
    stage.height = 720;
    // Cache paper and pencil treatment once; every frame uses ordinary canvas draws.
    const grain = document.createElement('canvas'), pencil = document.createElement('canvas'), reveal = document.createElement('canvas');
    if (watercolor) {
        grain.width = 1280; grain.height = 720;
        const pg = grain.getContext('2d');
        let seed = 428312321;
        const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        for (let i = 0; i < 28000; i++) {
            pg.fillStyle = i % 3 ? 'rgba(83,68,47,.026)' : 'rgba(255,255,255,.19)';
            pg.fillRect(next() * 1280, next() * 720, .6 + next() * 1.3, .6 + next() * 1.2);
        }
        pencil.width = reveal.width = 1152; pencil.height = reveal.height = 384;
        const pgArt = pencil.getContext('2d');
        pgArt.filter = 'grayscale(1) contrast(.86) brightness(1.06)';
        const scale = Math.min(1152 / art.width, 384 / art.height);
        pgArt.drawImage(art, (1152 - art.width * scale) / 2, (384 - art.height * scale) / 2, art.width * scale, art.height * scale);
        pgArt.filter = 'none';
    }
    let motionClock = 0, suppressStageText = false;
    const ease = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
    function artCamera(u, duration) {
        if (watercolor) {
            g.drawImage(pencil, 64, 205);
            const rg = reveal.getContext('2d'), scale = Math.min(1152 / art.width, 384 / art.height);
            rg.clearRect(0, 0, 1152, 384);
            rg.drawImage(art, (1152 - art.width * scale) / 2, (384 - art.height * scale) / 2, art.width * scale, art.height * scale);
            const edge = -100 + 1352 * ease(u / Math.min(6, duration * .65));
            const wipe = rg.createLinearGradient(edge - 100, 0, edge + 100, 0);
            wipe.addColorStop(0, '#000'); wipe.addColorStop(1, 'rgba(0,0,0,0)');
            rg.globalCompositeOperation = 'destination-in'; rg.fillStyle = wipe; rg.fillRect(0, 0, 1152, 384);
            rg.globalCompositeOperation = 'source-over';
            g.drawImage(reveal, 64, 205);
            return;
        }
        g.save(); g.beginPath(); g.rect(64, 215, 1152, 330); g.clip(); const z = 1 + .035 * ease(u / duration); g.translate(640, 380); g.scale(z, z); g.drawImage(art, 0, 215, 1135, 325, -576, -165, 1152, 330); g.restore();
    }
    function response(x) { const front = 180 + (motionClock * 145 % 696); return Math.exp(-(((x - front) / 78) ** 2)); }
    const ink = watercolor ? '#303e3d' : '#133340', muted = watercolor ? '#68716a' : '#58717a', teal = watercolor ? '#487e7c' : '#168b94', gold = watercolor ? '#bf8a44' : '#db9a37', paper = watercolor ? '#f6f1e6' : '#f5f1e9';
    function text(s, x, y, size = 24, color = ink, weight = 400) { if (suppressStageText)
        return; g.fillStyle = color; g.font = `${weight} ${size}px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`; g.fillText(s, x, y); }
    function line(x, y, X, Y, color = teal, w = 2) { g.beginPath(); g.moveTo(x, y); if (watercolor) g.quadraticCurveTo((x + X) / 2 + .8, (y + Y) / 2 - .8, X, Y); else g.lineTo(X, Y); g.strokeStyle = color; g.lineWidth = watercolor ? w * .8 : w; g.stroke(); }
    function hatch(x, y, w, h) {
        g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
        g.strokeStyle = 'rgba(66,65,54,.10)'; g.lineWidth = .7;
        for (let k = -h; k < w; k += 11) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + h, y); g.stroke(); }
        g.restore();
    }
    function box(x, y, w, h, fill, stroke) { g.beginPath(); g.roundRect(x, y, w, h, 14); g.fillStyle = fill; g.fill(); if (stroke) {
        g.strokeStyle = stroke;
        g.lineWidth = 2;
        g.stroke();
    } if (watercolor) {
        g.save(); g.beginPath(); g.roundRect(x, y, w, h, Math.min(9, w / 3, h / 3)); g.clip();
        hatch(x, y, w, h);
        const wash = g.createLinearGradient(x, y, x + w, y + h); wash.addColorStop(0, 'rgba(255,250,235,.17)'); wash.addColorStop(.55, 'rgba(255,250,235,0)'); wash.addColorStop(1, 'rgba(89,87,65,.07)');
        g.fillStyle = wash; g.fillRect(x, y, w, h); g.restore();
        g.beginPath(); g.roundRect(x + .8, y + .6, Math.max(0, w - 1.6), Math.max(0, h - 1.2), Math.min(9, w / 3, h / 3)); g.strokeStyle = stroke || 'rgba(66,65,54,.32)'; g.lineWidth = .85; g.stroke();
    } }
    function arrow(x, y, X, Y) { line(x, y, X, Y); line(X, Y, X - 12, Y - 7); line(X, Y, X - 12, Y + 7); }
    function plate(x, y, n, pulse = 0) { g.save(); const entrance = ease((motionClock - .13 * (n - 1)) / .65); g.globalAlpha *= entrance; g.translate(x, y + 24 * (1 - entrance)); g.beginPath(); g.moveTo(0, 0); g.lineTo(44, 20); g.lineTo(44, 204); g.lineTo(0, 184); g.closePath(); g.fillStyle = watercolor ? '#ddd2b9' : '#e1d9c7'; g.fill(); g.strokeStyle = '#b3a68f'; g.stroke(); for (let a = 0; a < 6; a++)
        for (let b = 0; b < 22; b++) {
            g.fillStyle = `rgba(19,51,64,${.12 + .32 * (.5 + .5 * Math.sin(a * 8 + b * 4 + n))})`;
            g.fillRect(4 + a * 6, 13 + b * 7.5 + a * 2.6, 4, 5);
        } if (watercolor) { g.save(); g.clip(); hatch(0, 0, 44, 204); g.restore(); line(1, 2, 43, 22, 'rgba(74,70,56,.55)', 1); line(42, 23, 43, 201, 'rgba(74,70,56,.4)', 1); } text(String(n), 12, -18, 20, muted); if (pulse > 0) {
        g.shadowColor = teal;
        g.shadowBlur = (watercolor ? 3 : 24) * pulse;
        line(0, 0, 0, 184, teal, 3);
    } g.restore(); }
    function wave(t, x0 = 238, x1 = 908) { g.save(); g.beginPath(); g.rect(x0, 260, x1 - x0, 216); g.clip(); for (let j = 0; j < 13; j++) {
        g.beginPath();
        for (let x = x0; x <= x1; x += 3) {
            let y = 366 + (j - 6) * 14 + Math.sin(x * .033 - t * 4 + j * .3) * 9;
            if (x === x0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.strokeStyle = `rgba(22,139,148,${.12 + .25 * (.5 + .5 * Math.sin(j + t * 2))})`;
        g.lineWidth = 2;
        g.stroke();
    } for (let p = 0; p < (watercolor ? 0 : 8); p++) {
        let x = x0 + ((t * 115 + p * 100) % (x1 - x0));
        g.beginPath();
        g.arc(x, 366 + Math.sin(t + p) * 68, 3, 0, Math.PI * 2);
        g.fillStyle = teal;
        g.fill();
    } const front = x0 + (t * 145 % (x1 - x0)); const glow = g.createLinearGradient(front - 70, 0, front + 70, 0); glow.addColorStop(0, 'rgba(22,139,148,0)'); glow.addColorStop(.5, 'rgba(22,139,148,.23)'); glow.addColorStop(1, 'rgba(22,139,148,0)'); g.fillStyle = glow; g.fillRect(front - 70, 275, 140, 183); g.beginPath(); g.ellipse(front, 366, 17, 90, 0, 0, Math.PI * 2); g.strokeStyle = watercolor ? 'rgba(72,126,124,.2)' : 'rgba(22,139,148,.55)'; g.lineWidth = 2; g.stroke(); g.restore(); }
    function detectors(x, y, phase = 1, large = false) { let cell = large ? 74 : 36, gap = large ? 12 : 7; for (let j = 0; j < 10; j++) {
        let col = j % 5, row = Math.floor(j / 5), xx = x + col * (cell + gap), yy = y + row * (cell + gap + 22);
        box(xx, yy, cell, cell, j === 7 ? `rgba(219,154,55,${.2 + .75 * phase})` : '#d8e2df', j === 7 ? gold : undefined);
        if (j === 7) {
            let gr = g.createRadialGradient(xx + cell / 2, yy + cell / 2, 1, xx + cell / 2, yy + cell / 2, cell * .48);
            gr.addColorStop(0, '#fff5bf');
            gr.addColorStop(1, 'rgba(255,220,106,0)');
            g.fillStyle = gr;
            g.fillRect(xx, yy, cell, cell);
            if (large) {
                g.save();
                g.beginPath();
                g.roundRect(xx, yy, cell, cell, 14);
                g.clip();
                for (let r = 0; r < 2; r++) {
                    const q = (motionClock * .55 + r * .5) % 1;
                    g.beginPath();
                    g.arc(xx + cell / 2, yy + cell / 2, 12 + q * 34, 0, Math.PI * 2);
                    g.strokeStyle = 'rgba(255,251,217,' + (.7 * (1 - q) * phase) + ')';
                    g.lineWidth = 2.5;
                    g.stroke();
                }
                g.restore();
            }
        }
        text(String(j), xx + cell / 2 - 7, yy + cell + 21, 19, muted);
    } }
    function drawScene(index, u) {
        motionClock = u;
        const p = ease(u / 1.3);
        if (index === 0) {
            artCamera(u, scenes[index].duration);
            text('衍射神经网络 D²NN', watercolor ? 520 : 478, watercolor ? 610 : 590, watercolor ? 18 : 25, ink, 600);
            g.fillStyle = 'rgba(245,241,233,' + (1 - ease(u / .8)) + ')';
            g.fillRect(64, watercolor ? 205 : 215, 1152, watercolor ? 384 : 330);
        }
        if (index === 1) {
            box(83, 263, 304, 196, watercolor ? '#e2e6dc' : ink);
            for (let r = 0; r < 3; r++)
                for (let k = 0; k < 5; k++)
                    text(String((r * 5 + k) % 10), 108 + k * 52, 310 + r * 48, 29, watercolor ? ink : '#a8dcd9');
            line(67, 478, 405, 478, muted, 8);
            text('训练样本', 160, 535, 24);
            arrow(420, 360, 530, 360);
            for (let n = 1; n <= 5; n++)
                plate(557 + n * 43, 278, n);
            text('设计并制造五层结构', 540, 535, 24);
            arrow(845, 360, 932, 360);
            box(967, 282, 200, 155, '#e0ebe6');
            text('光学推理', 1005, 373, 27, teal, 600);
            text('固定结构', 1014, 535, 24);
            g.setLineDash([5, 7]);
            line(574, 230, 804, 230, gold, 3);
            g.setLineDash([]);
            text('反复调整相位分布', 117, 224, 20, teal);
            for (let k = 0; k < 5; k++) {
                g.beginPath();
                g.arc(606 + k * 40, 224, 4 + 2 * Math.sin(u * 3 + k), 0, Math.PI * 2);
                g.fillStyle = teal;
                g.fill();
            }
        }
        if (index === 2) {
            wave(u, 180, 876);
            for (let n = 1; n <= 5; n++)
                plate(197 + n * 116, 270, n, .15 + .85 * response(197 + n * 116));
            text('相位延迟', 391, 541, 25, ink, 600);
            text('相长与相消同时存在', 339, 578, 21, muted);
            box(940, 232, 277, 304, '#e5ece7');
            text('局部：波的叠加', 960, 267, 22, ink, 600);
            for (let r = 0; r < 2; r++) {
                for (let k = 0; k < 2; k++) {
                    g.beginPath();
                    for (let x = 960; x < 1198; x++) {
                        let y = 323 + r * 115 + Math.sin((x - 960) * .05 - u * 4 + (r === 1 ? k * Math.PI : 0)) * 14 + (k === 0 ? -5 : 5);
                        if (x === 960) g.moveTo(x, y); else g.lineTo(x, y);
                    }
                    g.strokeStyle = k ? gold : teal;
                    g.lineWidth = 2;
                    g.stroke();
                }
                text(r ? '反相 → 减弱' : '同相 → 增强', 975, 367 + r * 115, 20, muted);
            }
        }
        if (index === 3) {
            detectors(86, 244, p, true);
            text('输出平面：10 个探测区域', 91, 499, 23, muted);
            text('相对光强（示意）', 662, 228, 22, muted);
            const vals = [.14, .08, .19, .11, .09, .13, .2, .93, .12, .07];
            for (let j = 0; j < 10; j++) {
                let x = 663 + j * 46, h = vals[j] * 200 * ease((u - .08 * j) / 1.1);
                box(x, 465 - h, 27, Math.max(2, h), j === 7 ? gold : '#9cbdb9');
                text(String(j), x + 6, 493, 20, muted);
            }
            text('最大光强区域 → 类别 7', 676, 555, 29, ink, 600);
            text('数值仅作解释，非论文实验数据', 665, 593, 18, muted);
        }
        if (index === 4) {
            artCamera(u, scenes[index].duration);
            text('数字训练  →  实体结构  →  光学推理', watercolor ? 420 : 308, watercolor ? 610 : 590, watercolor ? 19 : 29, ink, 600);
        }
    }
    window.render = (t) => {
        let index = scenes.findIndex(s => t < s.start + s.duration);
        if (index < 0)
            index = 4;
        const s = scenes[index], u = t - s.start;
        g = main;
        g.fillStyle = paper;
        g.fillRect(0, 0, 1280, 720);
        // Blend only the illustration stage. Text never dissolves into competing text.
        const blend = index > 0 ? ease(u / .6) : 1;
        if (blend < 1) {
            suppressStageText = blend >= .5;
            drawScene(index - 1, scenes[index - 1].duration + u);
        }
        g = stage.getContext('2d');
        g.clearRect(0, 0, 1280, 720);
        g.fillStyle = paper;
        g.fillRect(0, 190, 1280, 424);
        suppressStageText = blend < .5;
        drawScene(index, u);
        g = main;
        g.save();
        g.globalAlpha = blend;
        g.drawImage(stage, 0, 190, 1280, 424, 0, 190, 1280, 424);
        g.restore();
        suppressStageText = false;
        if (watercolor) g.drawImage(grain, 0, 0);
        text('OPENSCIENCE  /  PAPER EXPLAINED', 64, 42, 15, muted, 600);
        text('0' + (index + 1) + ' / 05', 1135, 42, 15, muted);
        text(s.title, 64, 111, 40, ink, 600);
        text(s.sub, 66, 151, 23, muted);
        const caption = s.cues ? (s.cues.find(cue => u >= cue.start && u < cue.end)?.text ?? '') : s.caption;
        box(48, 620, 1184, 69, '#e6e6dc');
        g.font = '400 23px "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
        const lines = [''];
        for (const character of caption) {
            const last = lines.length - 1;
            if (g.measureText(lines[last] + character).width > 1140) lines.push(character);
            else lines[last] += character;
        }
        for (let i = 0; i < lines.length; i++) text(lines[i], 70, lines.length === 1 ? 663 : 647 + i * 28, 23, ink);
        text('Lin et al., 2018 · arXiv:1804.08711v2 · 颜色与波形为示意', 64, 707, 14, muted);
        g.fillStyle = teal;
        g.fillRect(0, 716, 1280 * t / total, 4);
        return c.toDataURL('image/png').split(',')[1];
    };
};
