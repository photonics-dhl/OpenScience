export const guidePageCopy = {
  zh: {
    pageName: '上传／创建研究', workspace: '个人工作空间',
    slogan: 'Turn papers into structured, verifiable, machine-readable research objects.',
    subtitle: '带上论文，与 Hermes 一起梳理思路、打磨表达。',
    lifecycle: {
      title: '一条研究生命周期主线',
      intro: '从研究者交付材料，到 Hermes 协助整理，再到读者、期刊与协作者接力使用同一份可核验记录。展开节点查看说明与入口。',
      roleLabel: '角色', entryLabel: '入口', openLabel: '展开节点',
      nodes: [
        { id: 'P04', title: '研究者提交问题与材料', summary: '从一篇论文、预出版成果或直接填写的研究想法开始。', detail: '研究者选择上传／创建研究入口，保留来源、版本和私有草稿；提交前仍可修改材料。', roles: '研究者', entry: '上传／创建研究', href: '/guide' },
        { id: 'P05', title: 'Hermes 提炼结构化研究', summary: 'Hermes 先理解全文，再按六字段整理 Claims 与 Evidence。', detail: 'Hermes 通过工作台协助提炼问题、洞见、方法、结果、局限与可复现性；结果先进入待核对草稿，不自动公开。', roles: 'Hermes', entry: 'Hermes 研究工作台', href: '/guide?mode=direct' },
        { id: 'P06', title: '研究者核对与修订', summary: '研究者检查原文、证据和表达，决定保存草稿或形成新版本。', detail: '核对是公开前的责任边界。研究者可以返回来源、修改六字段，并通过个人工作空间继续处理。', roles: '研究者 · Hermes', entry: '个人工作空间', href: '/dashboard' },
        { id: 'P07', title: '读者阅读与核验', summary: '读者沿研究页面与原始来源理解问题、方法、结果和局限。', detail: '公开研究页面提供固定版本与来源入口，让读者能够复查整理后的内容；平台不替读者证明结论。', roles: '读者', entry: '公开研究', href: '/explore' },
        { id: 'P08', title: '期刊与协作者接力', summary: '期刊和协作者在各自入口发现、关联和继续维护研究。', detail: '期刊从目录与编辑入口管理公开内容，协作者从研究页面和版本记录接续讨论；公开修改通过新版本或明确勘误。', roles: '期刊 · 协作者', entry: '期刊目录', href: '/journals' },
      ],
    },
    exampleHint: '想先看看整理后的研究？', example: '查看研究页面示例', newTab: '（在新标签页打开）',
    faqTitle: '常见问题',
    questions: [
      { title: '还没有完整论文，也可以开始吗？', body: '可以。选择“直接填写”，粘贴或输入一段研究内容、想法或说明，再告诉 Hermes 希望怎样处理。整理后可以核对和完善六字段，并继续补充相关材料。' },
      { title: '以前创建的研究在哪里？', body: '在右上方“个人工作空间”查看和管理已有研究。若要继续修改某一项，也可以在本页“更新研究版本”中选择研究。' },
      { title: 'Hermes 整理后的内容会自动公开吗？', body: '不会。整理结果与研究草稿需要由你检查和修改；公开发布是单独的确认操作。修订已发表的版本时，会保留原来的公开内容与版本记录。' },
      { title: '“可核验”具体指什么？', body: '研究页面通过关联原文、材料和相关依据，让读者能够核对整理后的内容。它不表示平台已经证明研究结论正确。' },
    ],
  },
  en: {
    pageName: 'Upload / create research', workspace: 'Personal workspace',
    slogan: 'Turn papers into structured, verifiable, machine-readable research objects.',
    subtitle: 'Bring your paper. Refine your ideas and expression with Hermes.',
    lifecycle: {
      title: 'One research lifecycle',
      intro: 'A single path from researcher materials, through Hermes-assisted structuring, to readers, journals and collaborators using the same verifiable record. Expand a node for its explanation and entry point.',
      roleLabel: 'Role', entryLabel: 'Entry', openLabel: 'Expand node',
      nodes: [
        { id: 'P04', title: 'Researcher brings the question and materials', summary: 'Start with a paper, preprint or a research idea entered directly.', detail: 'The researcher uses the upload/create entry, keeps sources and versions attached, and can revise the private draft before submitting.', roles: 'Researcher', entry: 'Upload / create research', href: '/guide' },
        { id: 'P05', title: 'Hermes structures the research', summary: 'Hermes understands the full text, then organizes six fields, claims and evidence.', detail: 'Hermes helps draft problem, insight, method, results, limitations and reproducibility; the result remains a reviewable draft and is not published automatically.', roles: 'Hermes', entry: 'Hermes research workspace', href: '/guide?mode=direct' },
        { id: 'P06', title: 'Researcher reviews and revises', summary: 'Check sources, evidence and wording before saving a draft or creating a new version.', detail: 'Review is the publication boundary. The researcher can return to sources, edit the six fields and continue from the personal workspace.', roles: 'Researcher · Hermes', entry: 'Personal workspace', href: '/dashboard' },
        { id: 'P07', title: 'Reader reads and verifies', summary: 'Follow the research page and original sources to understand the problem, method, results and limits.', detail: 'Public research provides fixed-version and source entries so readers can check the structured account; the platform does not prove the conclusions for them.', roles: 'Reader', entry: 'Public research', href: '/explore' },
        { id: 'P08', title: 'Journals and collaborators continue the work', summary: 'Journals and collaborators discover, connect and maintain research through their own entries.', detail: 'Journals use the directory and editorial entry to manage public content; collaborators follow research pages and version history. Public changes use a new version or explicit erratum.', roles: 'Journal · Collaborator', entry: 'Journal directory', href: '/journals' },
      ],
    },
    exampleHint: 'See what a structured study looks like.', example: 'View an example research page', newTab: ' (opens in a new tab)',
    faqTitle: 'Common questions',
    questions: [
      { title: 'Can I start without a complete paper?', body: 'Yes. Choose “Fill in directly” and paste or write your research content, ideas or notes, then tell Hermes how you want to work with them. Review the six fields after they are organized and add materials as needed.' },
      { title: 'Where can I find my existing research?', body: 'Open “Personal workspace” at the top right to manage your studies. To continue revising one here, use “Update a research version” and choose the study.' },
      { title: 'Will Hermes publish my work automatically?', body: 'No. Review and edit the suggestions and your research draft first. Publication requires a separate confirmation. Revising published research preserves the existing public content and version history.' },
      { title: 'What does “verifiable” mean here?', body: 'Links to the original paper, materials and supporting sources let readers check the structured content. This does not mean the platform has proven the research conclusions correct.' },
    ],
  },
} as const;
