import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PLATFORM } from "@/components/Brand";
import { PLATFORM_SURFACE } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: PLATFORM,
  description: "Угадай, за какую сумму человек согласился бы это сделать.",
  applicationName: PLATFORM,

  /**
   * Приложение на домашнем экране (docs/BACKLOG.md A2). Отсюда Next печатает
   * `mobile-web-app-capable`, `apple-mobile-web-app-title` и
   * `apple-mobile-web-app-status-bar-style`.
   *
   * Подпись задана явно: без неё под иконкой оказался бы заголовок вкладки,
   * а он у каждой страницы свой.
   */
  appleWebApp: {
    capable: true,
    title: PLATFORM,
    statusBarStyle: "default",
  },

  /**
   * А этот тег Next не печатает вовсе — ни из `appleWebApp`, ни откуда-либо
   * ещё: его вырезали в пятнадцатой версии и возвращать не собираются
   * (`grep -rn "apple-mobile-web-app-capable" node_modules/next/dist` — пусто).
   *
   * Без него Safari до iOS 26 не открывает ярлык приложением, и никакая
   * настройка манифеста этого не заменяет. Коварство в том, что
   * `appleWebApp.capable` выше выглядит как «сделано».
   */
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /**
   * Экранная клавиатура на телефоне уменьшает саму раскладку, а не наезжает
   * на неё. Без этого поле ввода чата уезжает под клавиатуру, а вёрстка,
   * завязанная на высоту экрана, дёргается при каждом нажатии.
   */
  interactiveWidget: "resizes-content",

  /**
   * Цвет шапки и полосы статуса (docs/BACKLOG.md B3). Равен фону страницы:
   * в установленном приложении полоса статуса тогда не отделяется от неё.
   *
   * Это цвет платформы. Внутри игры его перебивает `viewport` её макета —
   * вложенный сегмент сильнее корневого, ровно как со знаком на вкладке.
   */
  themeColor: PLATFORM_SURFACE,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      {/*
        Высота — `svh`, а не `dvh`: `svh` считает панели браузера показанными,
        то есть берёт меньшую из высот. На андроиде строка адреса у части
        браузеров живёт внизу и уезжает только при прокрутке — с `dvh` страница
        оказывалась ровно в высоту экрана, прокручивать было нечего, панель не
        уезжала никогда и накрывала нижние кнопки.

        Нижний отступ — второй половиной той же починки: под панелью остаётся
        пустота, а не кнопка «Ни за какие деньги». На больших экранах панелей
        нет, поэтому там отступа тоже нет. `viewport-fit=cover` сознательно не
        включаем: он поднял бы `env(safe-area-inset-*)` в полную силу, но
        заодно пустил бы содержимое под вырез и под индикатор на iPhone, а
        iOS-вёрстку просили не трогать.
      */}
      <body className="flex min-h-svh flex-col pb-16 lg:pb-0">{children}</body>
    </html>
  );
}
