'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

type InViewProps = {
  children: ReactNode;
  className?: string;
  /** 触发后的 animation-delay（ms），用于组内 stagger */
  delay?: number;
};

/**
 * 滚动进入触发器：元素进入视口时加 `landing-inview--seen`，播放一次 landing-reveal。
 * - 初始隐藏由 CSS `html.js .landing-inview` 门控：无 JS 时内容始终可见（SEO/降级安全）。
 * - reduced-motion 用户：CSS 侧整体不加载动效，此处直接置 seen，不挂 observer。
 */
export default function InView({ children, className, delay = 0 }: InViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  const classes = [
    'landing-inview',
    seen ? 'landing-inview--seen' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      className={classes}
      style={seen && delay > 0 ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
