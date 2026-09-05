export const sceneTemplates=[
 {title:'让光来认数字',sub:'把训练好的规则，变成光的计算路径',caption:'输入手写数字 → 五层衍射结构 → 读取光强'},
 {title:'先训练，再制造',sub:'学习发生在计算机上',caption:'计算机优化相位分布；制造后，由固定结构完成光学推理'},
 {title:'光波如何完成计算',sub:'五层结构逐层改变相位',caption:'传播、衍射与干涉，让输出平面的能量重新分布'},
 {title:'读的是亮度，不是数字图像',sub:'每个探测区域对应一个类别',caption:'示意输入为 7：比较区域光强，最大值对应识别结果'},
 {title:'让结构承担一部分计算',sub:'原理示意 ≠ 实验实拍',caption:'实验采用 0.4 THz 辐射；制造与对准误差会影响表现'},
];

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
