/**
 * Project runtime adaptation of scientific-writing/citation-management methodology.
 * References: https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/scientific-writing
 * Use with server-owned SourceMap excerpts and the existing MiniMax Gateway.
 * Defining this skill does not activate a model call or authorize external processing.
 */
export const SCIENTIFIC_WRITING_SKILL = {
  id: 'scientific-writing',
  version: '1',
  instructions: [
    '先识别用户要的产物和范围：研究笔记用于理解与整理；文献综述用于有来源的比较综合；论文初稿用于组织用户自己的研究及待补内容。产物属于当前研究的私有可编辑稿，不能覆盖六字段、替用户发布或把文献结果冒充用户实验。',
    '先围绕用户目标形成短提纲，再一次产出连贯初稿；用户只要求某一节时只改这一节。续写保留用户已有结构、语气和已改内容，对缺少必要输入的实质问题集中说明，不反复让用户填长表单。',
    '只有服务端给定的原文摘录可支持文献事实。未校正观察、旧草稿、用户推测都不是文献证据。区分作者明示、受来源约束的综合、用户自己的想法和待查证问题，不编造实验、数据、结论、引用、DOI或复现成功。',
    '每个重要来源性断言紧邻一个或多个给定[S编号]标记。只用实际提供的编号；引用原文不可润色替换。提炼摘要可以改写，但条件、否定、物理量身份、单位、算例、理论/仿真/实验性质必须保持。无来源的原创想法明确归给用户，不伪装成已发表事实。',
    '检查拟输出结论的三个要点：适用条件是否保留，参数和结果是否属于同一算例，运算对象及量定义是否被替换。作者未披露的实现细节写为可定位的缺口；解析损坏写入必要未解问题，不冒充论文科学局限。',
    '模型续写是草稿修订而非科学认证；需要补证时保留可负责表达的内容并缩小断言范围，不让局部未知清空整篇稿件。引用不足以支持核心论断时不要给出肯定结论。',
    'sourceCoverage说明本轮摘录是否覆盖整份已解析原文；不完整时不得暗示已穷尽全文，并把source_packet_incomplete列入必要未解问题。用户直接保存的改动不触发模型复核，后续明确要求修订时再按原文重新核对。',
    '正文使用用户指定语言；未指定时使用当前界面语言。短句与自然段承载论证，避免空泛赞美、重复小结、审查日志或内部提示词。长稿与精炼RO分开；科学图和视频的详细制作指令进入独立内部brief。',
    '只返回调用方要求的结构。稿件标题、文体、正文、所用来源编号与必要未解问题分开；不得生成脚本、嵌入网页代码或执行命令。按需写作，不默认联网、搜整领域、生成图片或反复整篇重写。',
  ].join('\n'),
} as const;
