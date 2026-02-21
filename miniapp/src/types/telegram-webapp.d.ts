export {};

interface TelegramWebAppThemeParams {
  bg_color?: string;
}

interface TelegramWebApp {
  initData: string;
  themeParams: TelegramWebAppThemeParams;
  ready: () => void;
  expand: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
}

interface TelegramNamespace {
  WebApp: TelegramWebApp;
}

declare global {
  interface Window {
    Telegram?: TelegramNamespace;
  }
}
