import {
  Nav as OriginalNav,
  type NavProps,
} from '@rspress/core/theme-original';
import { LanguageMenuPortals } from './LanguageMenuPortals';
import './language-menu.css';

export function Nav(props: NavProps) {
  return (
    <OriginalNav
      {...props}
      beforeNavMenu={
        <>
          {props.beforeNavMenu}
          <LanguageMenuPortals />
        </>
      }
    />
  );
}
