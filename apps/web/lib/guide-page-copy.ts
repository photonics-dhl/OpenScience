export const guidePageCopy = {
  zh: {
    pageName: '上传／创建研究', workspace: '个人工作空间',
    slogan: 'Turn papers into structured, verifiable, machine-readable research objects.',
    subtitle: '带上论文，与 Hermes 一起梳理思路、打磨表达。',
    exampleHint: '想先看看整理后的研究？', example: '查看研究页面示例', newTab: '（在新标签页打开）',
    faqTitle: '常见问题',
    questions: [
      { title: '还没有完整论文，也可以开始吗？', body: '可以。选择“直接填写”，从研究问题、核心贡献或已有发现开始。后续可以继续补充六字段和相关材料，并请 Hermes 协助整理。' },
      { title: '以前创建的研究在哪里？', body: '在右上方“个人工作空间”查看和管理已有研究。若要继续修改某一项，也可以在本页“更新研究版本”中选择研究。' },
      { title: 'Hermes 整理后的内容会自动公开吗？', body: '不会。整理结果与研究草稿需要由你检查和修改；公开发布是单独的确认操作。修订已发表的版本时，会保留原来的公开内容与版本记录。' },
      { title: '“可核验”具体指什么？', body: '研究页面通过关联原文、材料和相关依据，让读者能够核对整理后的内容。它不表示平台已经证明研究结论正确。' },
    ],
  },
  en: {
    pageName: 'Upload / create research', workspace: 'Personal workspace',
    slogan: 'Turn papers into structured, verifiable, machine-readable research objects.',
    subtitle: 'Bring your paper. Refine your ideas and expression with Hermes.',
    exampleHint: 'See what a structured study looks like.', example: 'View an example research page', newTab: ' (opens in a new tab)',
    faqTitle: 'Common questions',
    questions: [
      { title: 'Can I start without a complete paper?', body: 'Yes. Choose “Write directly” and begin with your research question, contribution or findings. You can fill in the six fields, add materials and ask Hermes for help as you go.' },
      { title: 'Where can I find my existing research?', body: 'Open “Personal workspace” at the top right to manage your studies. To continue revising one here, use “Update a research version” and choose the study.' },
      { title: 'Will Hermes publish my work automatically?', body: 'No. Review and edit the suggestions and your research draft first. Publication requires a separate confirmation. Revising published research preserves the existing public content and version history.' },
      { title: 'What does “verifiable” mean here?', body: 'Links to the original paper, materials and supporting sources let readers check the structured content. This does not mean the platform has proven the research conclusions correct.' },
    ],
  },
} as const;
