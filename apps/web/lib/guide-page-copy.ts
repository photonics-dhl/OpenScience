interface GuideStep {
  title: string; roles: string; heading: string;
  notes: readonly { title: string; body: string }[];
  entry: string; href: string;
}
interface GuideCopy {
  pageName: string; eyebrow: string;
  headline: readonly [string, string]; introduction: readonly [string, string];
  invitation: string; beginning: string; workspace: string; contents: string;
  chapters: readonly string[]; lifecycle: string; step: string; steps: readonly GuideStep[];
  exampleTitle: string; exampleLink: string; newTab: string;
  formats: readonly [string, string, string]; formatLabel: string;
  loading: string; unavailable: string; missingImage: string; retry: string; imageAlt: string;
  videoExplanation: string; htmlExplanation: string; sampleAvailability: string;
  discussion: string; commentButton: string; quote: string; comment: string;
  exampleComment: string; commentHelp: string; illustration: string;
  faqTitle: string; questions: readonly { title: string; body: string }[];
  explore: string; journals: string;
}
export const guidePageCopy: Record<'zh' | 'en', GuideCopy> = {
  zh: {
    pageName: '使用指南', eyebrow: 'OpenScience 使用指南',
    headline: ['论文彼此相连，', '思想在交流中生长。'],
    introduction: ['在 OpenScience，一项研究可以被阅读、引用和讨论，', '也能随着新的发现继续完善。'],
    invitation: '分享您的研究与想法', beginning: '从一篇论文或一个问题开始。', workspace: '进入研究桌面',
    contents: '本页目录', chapters: ['认识 OpenScience', '开始与继续', '操作指南', '研究示例', '常见问题'],
    lifecycle: '了解研究的每一步', step: '步骤',
    steps: [
      { title: '开始研究', roles: '研究者', heading: '从论文或想法开始', notes: [
        { title: '带来研究材料', body: '上传论文和相关文件，或直接写下研究想法。' },
        { title: '继续已有研究', body: '在研究桌面找到已有研究，接着补充材料、修改内容。' },
      ], entry: '进入研究桌面', href: '/dashboard' },
      { title: '整理内容', roles: '研究者 · Hermes', heading: '与 Hermes 一起整理研究', notes: [
        { title: '先读全文，再梳理', body: 'Hermes 根据材料整理问题、方法、结果等内容，形成待核对的草稿。' },
        { title: '回到原文确认', body: '检查表述和依据，补上遗漏，保留您对研究的判断。' },
      ], entry: '回到研究桌面', href: '/dashboard' },
      { title: '展示研究', roles: '研究者 · 读者', heading: '展示研究，与读者交流', notes: [
        { title: '添加展示内容', body: '用图片、视频或交互页面（HTML）说明研究。' },
        { title: '引用内容发表评论', body: '下方示意如何引用文字或媒体，让问题与建议有明确的上下文。公开评论尚未开放。' },
      ], entry: '阅读这项研究', href: '/research/OSR-2026-000022/v/4' },
      { title: '确认公开', roles: '研究者', heading: '核对之后，再与读者分享', notes: [
        { title: '检查公开内容', body: '确认正文、媒体与来源，决定哪些内容随这次版本公开。' },
        { title: '由您确认发布', body: '日常保存是私有草稿。公开发布需要单独确认，Hermes 不会替您决定。' },
      ], entry: '回到研究桌面', href: '/dashboard' },
      { title: '阅读与协作', roles: '读者 · 期刊 · 协作者', heading: '让研究继续被阅读和使用', notes: [
        { title: '阅读与引用', body: '从研究页面了解内容，沿原文和来源核对，并引用明确的公开版本。' },
        { title: '继续完善研究', body: '新的发现与修订形成后续版本，已有公开内容和版本记录仍会保留。' },
      ], entry: '探索公开研究', href: '/explore' },
    ],
    exampleTitle: '公开研究示例', exampleLink: '打开公开版本', newTab: '（在新标签页打开）',
    formats: ['图文', '视频', '交互页面'], formatLabel: '展示方式',
    loading: '正在读取公开研究的图片…', unavailable: '研究示例暂时未能载入。您仍可继续阅读指南。',
    missingImage: '这一公开版本没有可展示的图片。', retry: '重新载入示例',
    imageAlt: 'deep-sub-cycle pulse 公开版本中的研究展示图',
    videoExplanation: '视频适合说明随时间变化的过程，或展示实验与操作。',
    htmlExplanation: '交互页面适合让读者调整参数、观察变化，或逐步查看研究内容。',
    sampleAvailability: '这是展示方式的说明。本示例的公开版本目前提供图片；其他媒体以实际研究页为准。',
    discussion: '评论', commentButton: '查看评论示意', quote: '引用：图 1',
    comment: '这张图对应正文的哪一段？', exampleComment: '示例评论',
    commentHelp: '这里展示研究页统一评论、引用具体内容的方式。公开评论功能尚未开放。',
    illustration: '界面与评论为示意', faqTitle: '常见问题',
    questions: [
      { title: '还没有完整论文，可以开始吗？', body: '可以。从研究桌面新建研究，直接写下问题、想法或已有内容，再逐步补充材料。也可以继续修改已有草稿。' },
      { title: 'Hermes 整理的内容会自动公开吗？', body: '不会。整理后的内容先保留在私有草稿中，由您核对和修改。公开发布需要单独确认。' },
      { title: '研究公开后，如何修改？', body: '从研究桌面继续修改这项研究。修订内容通过新的公开版本或明确勘误发布，原公开版本与记录保留。' },
    ],
    explore: '探索', journals: '期刊',
  },
  en: {
    pageName: 'Guide', eyebrow: 'OpenScience guide',
    headline: ['Papers connect.', 'Ideas grow in conversation.'],
    introduction: ['On OpenScience, research can be read, cited and discussed,', 'and developed further as new discoveries emerge.'],
    invitation: 'Share your research and ideas', beginning: 'Start with a paper or a question.', workspace: 'Open research desk',
    contents: 'On this page', chapters: ['About OpenScience', 'Start or continue', 'Using OpenScience', 'Research example', 'Common questions'],
    lifecycle: 'Follow each step of your research', step: 'Step',
    steps: [
      { title: 'Start research', roles: 'Researcher', heading: 'Start with a paper or an idea', notes: [
        { title: 'Bring your materials', body: 'Upload a paper and related files, or write down a research idea.' },
        { title: 'Continue your work', body: 'Find existing research on your desk to add materials and revise the content.' },
      ], entry: 'Open research desk', href: '/dashboard' },
      { title: 'Organize content', roles: 'Researcher · Hermes', heading: 'Organize your research with Hermes', notes: [
        { title: 'Read first, then organize', body: 'Hermes uses your materials to draft the question, methods, results and other sections for review.' },
        { title: 'Check against the source', body: 'Review the wording and sources, fill in gaps and keep your own judgment of the research.' },
      ], entry: 'Return to research desk', href: '/dashboard' },
      { title: 'Present research', roles: 'Researcher · Reader', heading: 'Present your research and invite discussion', notes: [
        { title: 'Add ways to explore', body: 'Explain your research through images, video or an interactive page (HTML).' },
        { title: 'Comment with context', body: 'The example shows how references to text or media give questions context. Public comments are not available yet.' },
      ], entry: 'Read this study', href: '/research/OSR-2026-000022/v/4' },
      { title: 'Confirm publication', roles: 'Researcher', heading: 'Review your work before sharing it', notes: [
        { title: 'Check the public content', body: 'Review the text, media and sources, and choose what this version will include.' },
        { title: 'You decide when to publish', body: 'Saving keeps your draft private. Publication needs a separate confirmation; Hermes does not decide for you.' },
      ], entry: 'Return to research desk', href: '/dashboard' },
      { title: 'Read and collaborate', roles: 'Reader · Journal · Collaborator', heading: 'Keep research available for others to use', notes: [
        { title: 'Read and cite', body: 'Read the research page, check the original sources and cite a specific public version.' },
        { title: 'Develop the work further', body: 'New discoveries and revisions become later versions. Previous public content and version records remain available.' },
      ], entry: 'Explore public research', href: '/explore' },
    ],
    exampleTitle: 'A public research example', exampleLink: 'Open public version', newTab: ' (opens in a new tab)',
    formats: ['Images', 'Video', 'Interactive page'], formatLabel: 'Presentation formats',
    loading: 'Loading the published research image…', unavailable: 'The research example could not be loaded. You can still read the guide.',
    missingImage: 'This public version has no image to display.', retry: 'Reload example', imageAlt: 'Research image from the public version of deep-sub-cycle pulse',
    videoExplanation: 'Video can explain processes over time, or show an experiment or procedure.',
    htmlExplanation: 'Interactive pages let readers adjust parameters, observe changes or explore research step by step.',
    sampleAvailability: 'This explains the format. This public example currently includes an image; see each research page for its available media.',
    discussion: 'Comments', commentButton: 'See comment example', quote: 'Referring to: Figure 1',
    comment: 'Which part of the text does this figure refer to?', exampleComment: 'Example comment',
    commentHelp: 'This illustrates one research-page discussion with references to specific content. Public comments are not available yet.',
    illustration: 'Interface and comments are illustrative', faqTitle: 'Common questions',
    questions: [
      { title: 'Can I start without a complete paper?', body: 'Yes. Create research from your desk, write down a question, idea or existing content, and add materials as you go. You can also continue an existing draft.' },
      { title: 'Will Hermes publish my work automatically?', body: 'No. Organized content stays in a private draft for you to check and revise. Publication requires a separate confirmation.' },
      { title: 'How do I revise published research?', body: 'Continue the research from your desk. Publish revisions as a new public version or an explicit correction; the original public version and its record remain available.' },
    ],
    explore: 'Explore', journals: 'Journals',
  },
};
