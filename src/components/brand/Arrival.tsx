import { useEffect, useRef, useState } from 'react';
import { BrandMark } from './BrandMark';

export function Arrival({ onComplete }: { readonly onComplete: () => void }) {
  const center = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const images = Array.from(center.current?.querySelectorAll('img') ?? []);
    void Promise.allSettled([
      document.fonts.load('700 96px DynaPuff'),
      ...images.map((image) => image.decode()),
    ]).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(onComplete, reduced ? 400 : 2200);
    return () => window.clearTimeout(timer);
  }, [onComplete, ready]);
  return (
    <section className="arrival-screen" aria-label="낙찰 시작 화면" data-ready={ready}>
      <div className="arrival-center" ref={center}>
        <BrandMark animated={ready} />
        <p role="status">오늘은 어떤 물건을 만날까?</p>
      </div>
      <button type="button" className="arrival-skip" onClick={onComplete}>
        건너뛰기
      </button>
    </section>
  );
}
