import type { ReactNode } from 'react';

/** 三栏编辑器布局（§5.4 左大纲/中编辑/右面板）。 */
export default function EditorLayout({
  outline,
  main,
  aside,
}: {
  outline: ReactNode;
  main: ReactNode;
  aside: ReactNode;
}) {
  return (
    <div className="editor-layout">
      <aside className="editor-pane editor-outline">{outline}</aside>
      <main className="editor-pane editor-main">{main}</main>
      <aside className="editor-pane editor-aside">{aside}</aside>
    </div>
  );
}
