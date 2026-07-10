import {
  Nav as OriginalNav,
  type NavProps,
} from '@rspress/core/theme-original';
import { AccessibleLanguageMenu } from './AccessibleLanguageMenu';
import './language-menu.css';

export function Nav(props: NavProps) {
  return (
    <OriginalNav
      {...props}
      beforeNavMenu={
        <>
          {props.beforeNavMenu}
          <AccessibleLanguageMenu />
        </>
      }
    />
  );
}
