import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AccessibleLanguageMenu } from './AccessibleLanguageMenu';

function ensureSlot(parent: Element, className: string, before?: Element | null): HTMLElement {
  const existing = parent.querySelector<HTMLElement>(`:scope > .${className}`);
  if (existing) return existing;
  const slot = document.createElement('div');
  slot.className = className;
  parent.insertBefore(slot, before ?? null);
  return slot;
}

export function LanguageMenuPortals() {
  const [desktop, setDesktop] = useState<HTMLElement | null>(null);
  const [mobile, setMobile] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const locateSlots = () => {
      const others = document.querySelector('.rp-nav__others');
      if (others) {
        const firstMenuItem = others.querySelector('.rp-nav-menu__item');
        setDesktop(ensureSlot(others, 'msq-language-slot--desktop', firstMenuItem));
      }

      const screen = document.querySelector('.rp-nav-screen__container');
      if (screen) {
        const defaultLanguageRow = screen.querySelector('.rp-nav-screen-langs');
        setMobile(ensureSlot(screen, 'msq-language-slot--mobile', defaultLanguageRow));
      } else {
        setMobile(null);
      }
    };

    locateSlots();
    const observer = new MutationObserver(locateSlots);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelectorAll('.msq-language-slot--desktop, .msq-language-slot--mobile')
        .forEach((slot) => slot.remove());
    };
  }, []);

  return (
    <>
      {desktop && createPortal(<AccessibleLanguageMenu placement="desktop" />, desktop)}
      {mobile && createPortal(<AccessibleLanguageMenu placement="mobile" />, mobile)}
    </>
  );
}
