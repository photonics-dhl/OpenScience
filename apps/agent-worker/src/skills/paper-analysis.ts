/** Runtime Hermes paper-analysis skill. The worker executes these phases; this is not a developer prompt. */
export const PAPER_ANALYSIS_SKILL = {
  id: 'paper-analysis',
  version: '3',
  sources: [
    'Future-House/paper-qa (Apache-2.0, reviewed 57e89f7): retrieval, reranking, contextual evidence and async pattern',
    'K-Dense-AI/scientific-agent-skills (MIT, reviewed 9cf7d9a): bounded paperclip map/reduce and peer-review pattern',
    'OpenDataLab MinerU skill (reviewed 5733c03): parser candidate only, never scientific understanding or approval',
  ],
  stages: ['inventory', 'advanced-parse', 'coverage-plan', 'section-map', 'global-reduce', 'evidence-check', 'science-review-packet', 'web-scientific-review', 'targeted-evidence', 'sdf-suggestion', 'user-review'],
  instructions: [
    '先核对附件哈希、解析器版本、页数、章节、图表、公式和补充材料清单；解析失败、材料未取得和作者未报告必须分开记录。',
    '按章节和语义单元完整阅读正文、图注、表格、公式与已提供补充材料，再做全局整合。六个SDF字段只是最终展示投影，不能代替全文阅读计划。',
    '每个阅读单元记录研究对象、输入条件、假设、方法步骤、公式关系、结果、局限、与其他章节的依赖、未解决问题及SourceMap定位。',
    '全局整合负责连接散布在引言、理论、方法、结果、图注和附录中的研究路径。允许明确标注为Hermes跨段归纳，但不得补造作者未给出的步骤或因果。',
    'BGE与证据问答用于召回、反查和矛盾核验；不能用相似度排序替代全文覆盖，也不能因图表相似度低而遗漏。',
    '定量主张必须绑定同一算例的条件、物理量定义、数值、单位、不确定性和来源。严格区分理论推导、数值模拟、实验测量、作者讨论与确定性换算。',
    '关键公式同时保留页面区域与机器表达；逐项核对≈、=、<、>、∝等关系符，指数、上下标、正负号、单位前缀和变量定义。乱码或区域缺失时调用高级解析/OCR，不猜写。',
    'MiniMax负责section-map与global-reduce初稿，不拥有最终科学放行权。最终建议前把完整六字段、去重直接原文、相邻限定、公式/图注与跨字段冲突索引交给网页ChatGPT 6 Pro独立复核。',
    '科学审稿包以6–9k token为压缩目标而非截断上限；不得只传支持候选的段落。网页要求补证时只从既有SourceMap定向回读，最多补充一轮，不重解析全文。',
    '网页回复收到、科学问题解决与用户确认分别记录。网页不可用、回应漏审、引用不存在、版本不符或补证后仍无法裁定时进入阻断状态，不回退MiniMax自审。',
    '六字段各司其职：results写有条件的研究输出，method写输入与处理链，insight写机制或认识，reproducibility写复现所需披露及缺口。跨字段重复或结果误放到复现字段时应重写，不能靠填满字段通过。',
    '证据限制用于防止无来源断言，不用于删除正确内容。单次输出容纳不下时分批保存和续读；容量失败不得改写为论文缺失。',
    '科学复核检查量纲、数量级、适用条件、不同算例混用、理论/模拟/实验身份和图文一致性。自动检查只能发现部分错误，不能声称证明物理正确。',
    '输出只进入建议区。用户确认科研内容后才能写入RO；分镜、实际图片和公开发布分别保留独立确认。',
  ].join('\n'),
} as const;
