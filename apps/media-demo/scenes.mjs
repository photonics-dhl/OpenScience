export const sceneTemplates=[
 {title:'让光来认数字',sub:'把训练好的规则，变成光的计算路径',caption:'输入手写数字 → 五层衍射结构 → 读取光强'},
 {title:'先训练，再制造',sub:'学习发生在计算机上',caption:'计算机优化相位分布；制造后，由固定结构完成光学推理'},
 {title:'光波如何完成计算',sub:'五层结构逐层改变相位',caption:'传播、衍射与干涉，让输出平面的能量重新分布'},
 {title:'读的是亮度，不是数字图像',sub:'每个探测区域对应一个类别',caption:'示意输入为 7：比较区域光强，最大值对应识别结果'},
 {title:'让结构承担一部分计算',sub:'原理示意 ≠ 实验实拍',caption:'实验采用 0.4 THz 辐射；制造与对准误差会影响表现'},
];

// Scene boundaries stay sample-time based; only the final video length rounds up.
export function continuousTimeline(templates, metadata, seconds, fps = 24) {
 if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 || !Number.isInteger(fps) || fps <= 0) throw new Error('Invalid continuous narration duration or frame rate');
 if (!metadata || !Array.isArray(metadata.scenes) || metadata.scenes.length !== 5 || templates.length !== 5) throw new Error('Continuous narration requires five metadata scenes');
 const starts = metadata.scenes.map(scene => scene?.start);
 if (starts[0] !== 0 || starts.some((start, i) => !Number.isFinite(start) || start < 0 || start >= seconds || (i > 0 && start <= starts[i - 1]))) throw new Error('Invalid continuous narration scene starts');
 const scenes = templates.map((scene, i) => ({ ...scene, start: starts[i], duration: (starts[i + 1] ?? seconds) - starts[i], voiceDuration: (starts[i + 1] ?? seconds) - starts[i] }));
 const narration = applyNarration(scenes, metadata);
 return { scenes, total: seconds, frameCount: Math.ceil(seconds * fps), narration };
}

export function applyNarration(scenes, metadata) {
 if (metadata === undefined) return 'Supplied pre-generated WAV; provider unknown; no TTS during rendering.';
 const string = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
 if (!metadata || !string(metadata.provider, 120) || !string(metadata.speaker, 80) || !Array.isArray(metadata.scenes) || metadata.scenes.length !== 5 || scenes.length !== 5) throw new Error('Invalid narration metadata');
 for (const [i, scene] of metadata.scenes.entries()) {
  if (!scene || !string(scene.text, 2000) || !Array.isArray(scene.cues) || scene.cues.length < 1 || scene.cues.length > 100) throw new Error(`Invalid narration scene ${i}`);
  let previousEnd = 0;
  for (const cue of scene.cues) {
   if (!cue || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < previousEnd || cue.start < 0 || cue.start >= cue.end || cue.end > scenes[i].voiceDuration || !string(cue.text, 80)) throw new Error(`Invalid narration cue in scene ${i}`);
   previousEnd = cue.end;
  }
 }
 metadata.scenes.forEach((scene, i) => { scenes[i].narrationText = scene.text; scenes[i].cues = scene.cues.map(({start, end, text}) => ({start, end, text})); });
 return `Supplied pre-generated WAV; provider: ${metadata.provider}; speaker: ${metadata.speaker}; no TTS during rendering.`;
}
