export {};

interface TelegramWebAppThemeParams {
  bg_color?: string;
}

interface TelegramBackButton {
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
  isVisible: boolean;
}

interface TelegramWebApp {
  initData: string;
  themeParams: TelegramWebAppThemeParams;
  ready: () => void;
  expand: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  openLink?: (url: string) => void;
  /** Bot API 7.7+: разворачивает Mini App на весь экран */
  requestFullscreen?: () => void;
  /** Bot API 7.7+: выходит из полноэкранного режима */
  exitFullscreen?: () => void;
  /** Bot API 7.7+: true если Mini App в полноэкранном режиме */
  isFullscreen?: boolean;
  BackButton?: TelegramBackButton;
}

interface TelegramNamespace {
  WebApp: TelegramWebApp;
}

declare global {
  interface Window {
    Telegram?: TelegramNamespace;
  }
}
