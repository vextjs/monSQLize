import {
  addLeadingSlash,
  normalizeHrefInRuntime,
  removeBase,
  useLocation,
  usePage,
  useSite,
  useVersion,
} from '@rspress/core/runtime';
import { IconArrowDown, Link, SvgWrapper } from '@rspress/core/theme-original';
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

type LanguageItem = {
  text: string;
  link: string;
  lang: string;
};

function replaceLanguage(
  rawUrl: string,
  language: { current: string; target: string; default: string },
  version: { current: string; default: string },
  cleanUrls: boolean,
  isPageNotFound: boolean,
) {
  let url = removeBase(rawUrl);
  if (!url || isPageNotFound) {
    url = '/';
  }

  if (language.target === language.current) {
    return normalizeHrefInRuntime(url);
  }

  const parts = normalizeHrefInRuntime(url).split('/').filter(Boolean);
  const versionPart = version.current && version.current !== version.default
    ? parts.shift() || ''
    : '';
  let languagePart = '';

  if (language.target !== language.default) {
    languagePart = language.target;
    if (language.current !== language.default) {
      parts.shift();
    }
  } else {
    parts.shift();
  }

  let pagePart = parts.join('/');
  if ((versionPart || languagePart) && !pagePart) {
    pagePart = cleanUrls ? 'index' : 'index.html';
  }

  return addLeadingSlash(
    [versionPart, languagePart, pagePart].filter(Boolean).join('/'),
  );
}

export function AccessibleLanguageMenu() {
  const { page } = usePage();
  const { site } = useSite();
  const currentVersion = useVersion();
  const { pathname, search } = useLocation();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const locales = Object.values(site.locales || site.themeConfig.locales || {});
  const currentLanguage = page.lang || site.lang || '';
  const defaultLanguage = site.lang || '';
  const defaultVersion = site.multiVersion.default || '';
  const cleanUrls = site.route?.cleanUrls || false;

  const items: LanguageItem[] = locales.map(locale => ({
    text: locale.label || locale.lang,
    lang: locale.lang,
    link: replaceLanguage(
      pathname + search,
      {
        current: currentLanguage,
        target: locale.lang,
        default: defaultLanguage,
      },
      { current: currentVersion, default: defaultVersion },
      cleanUrls,
      page.pageType === '404',
    ),
  }));
  const activeItem = items.find(item => item.lang === currentLanguage) ?? items[0];
  const menuLabel = currentLanguage === 'zh' ? '语言' : 'Languages';

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isOpen]);

  if (items.length < 2 || !activeItem) {
    return null;
  }

  const openAndFocus = (index: number) => {
    setIsOpen(true);
    window.requestAnimationFrame(() => itemRefs.current[index]?.focus());
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(open => !open);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      openAndFocus(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAndFocus(items.length - 1);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleItemKeyDown = (
    event: KeyboardEvent<HTMLAnchorElement>,
    index: number,
  ) => {
    event.stopPropagation();
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      itemRefs.current[index]?.click();
      return;
    }

    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown') nextIndex = (index + 1) % items.length;
    if (event.key === 'ArrowUp') nextIndex = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;

    if (nextIndex !== undefined) {
      event.preventDefault();
      itemRefs.current[nextIndex]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div className="msq-language-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="msq-language-menu__trigger"
        aria-label={`${menuLabel}: ${activeItem.text}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen(open => !open)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="msq-language-menu__label">{activeItem.text}</span>
        <span className="msq-language-menu__compact" aria-hidden="true">
          {currentLanguage === 'zh' ? '中' : 'EN'}
        </span>
        <SvgWrapper
          icon={IconArrowDown}
          className="msq-language-menu__icon"
          aria-hidden="true"
        />
      </button>
      <ul
        id={menuId}
        className="msq-language-menu__list"
        role="menu"
        aria-label={menuLabel}
        hidden={!isOpen}
      >
        {items.map((item, index) => (
          <li key={item.lang} role="none">
            <Link
              ref={element => { itemRefs.current[index] = element; }}
              href={item.link}
              role="menuitem"
              className="msq-language-menu__item"
              hrefLang={item.lang}
              lang={item.lang}
              rel="alternate"
              aria-current={item.lang === currentLanguage ? 'page' : undefined}
              onClick={() => setIsOpen(false)}
              onKeyDown={event => handleItemKeyDown(event, index)}
            >
              {item.text}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
