'use client';

import type { ReactNode } from 'react';
import Drawer from './Drawer';
import MobileTabs, { type MobileTab } from './MobileTabs';
import { useState } from 'react';

/** 三栏编辑器布局（§5.4）：桌面 grid 三栏，移动端单栏 + 抽屉（不删功能，§18.2）。 */
export default function EditorLayout({
  outline,
  main,
  aside,
}: {
  outline: ReactNode;
  main: ReactNode;
  aside: ReactNode;
}) {
  const [mobileTab, setMobileTab] = useState<MobileTab>('edit');
  const [drawer, setDrawer] = useState<'outline' | 'panel' | null>(null);

  return (
    <>
      {/* 桌面三栏 */}
      <div className="editor-layout desktop-only">
        <aside className="editor-pane editor-outline" aria-label="大纲">
          {outline}
        </aside>
        <main className="editor-pane editor-main" aria-label="正文编辑">
          {main}
        </main>
        <aside className="editor-pane editor-aside" aria-label="SDF/AI 面板">
          {aside}
        </aside>
      </div>

      {/* 移动端：顶栏 tab + 单栏 */}
      <div className="mobile-only">
        <div className="mobile-header">
          <button className="btn" onClick={() => setDrawer(drawer === 'outline' ? null : 'outline')} aria-label="打开大纲">
            ☰ 大纲
          </button>
          <MobileTabs active={mobileTab} onSelect={setMobileTab} />
          <button className="btn" onClick={() => setDrawer(drawer === 'panel' ? null : 'panel')} aria-label="打开面板">
            面板 ☰
          </button>
        </div>
        <div className="mobile-body">
          {mobileTab === 'outline' && <div className="editor-pane">{outline}</div>}
          {mobileTab === 'edit' && <div className="editor-pane">{main}</div>}
          {mobileTab === 'panel' && <div className="editor-pane">{aside}</div>}
        </div>
      </div>

      {/* 移动抽屉（大纲 + 面板） */}
      <Drawer open={drawer === 'outline'} onClose={() => setDrawer(null)} label="大纲" side="left">
        {outline}
      </Drawer>
      <Drawer open={drawer === 'panel'} onClose={() => setDrawer(null)} label="SDF/AI 面板" side="right">
        {aside}
      </Drawer>
    </>
  );
}
