import type { MetadataRoute } from "next";
import { PLATFORM, PLATFORM_TAGLINE } from "@/lib/brand";
import { PLATFORM_SURFACE } from "@/lib/theme";
import { GAMES } from "@/lib/games/registry";

/**
 * Манифест приложения (docs/BACKLOG.md A1).
 *
 * Файловое соглашение: отсюда Next отдаёт `/manifest.webmanifest` с нужным
 * типом содержимого и сам ставит `<link rel="manifest">` на все страницы.
 * Своих заголовков не надо — то, что он выставляет, уже правильное.
 *
 * Игры берутся из реестра, а не поимённо: платформе нельзя знать игру в лицо,
 * и правило это проверяет `npm run lint` (docs/BACKLOG.md A6).
 */

export default function manifest(): MetadataRoute.Manifest {
  return {
    /**
     * Чем приложение опознаётся при обновлениях. Без него Chrome считает
     * приложение по `start_url`, и стоит когда-нибудь передумать насчёт
     * стартовой страницы — у всех, кто уже поставил, останется жить старое,
     * а новое поставится вторым. Меняться не должно никогда.
     */
    id: "/",

    name: PLATFORM,
    short_name: PLATFORM,
    description: PLATFORM_TAGLINE,
    lang: "ru",
    dir: "ltr",

    /**
     * Витрина, а не корень: `/` отвечает редиректом на неё, и каждый запуск
     * приложения начинался бы с лишнего похода в сеть ровно в тот момент,
     * когда человек смотрит на пустой экран.
     */
    start_url: "/games",

    /**
     * Весь сайт. Уже комната `/r/<code>` лежит вне дерева игры, и с более
     * узким скоупом она открывалась бы в браузере поверх приложения.
     */
    scope: "/",

    display: "standalone",

    /**
     * Оба цвета одинаковые и равны фону витрины: заглушка при запуске
     * переходит в саму витрину без стыка.
     *
     * Цвет один на всё приложение — подставить сюда цвет игры нельзя. Внутри
     * игр цвет шапки задаётся мета-тегом страницы (docs/BACKLOG.md B3).
     */
    theme_color: PLATFORM_SURFACE,
    background_color: PLATFORM_SURFACE,

    categories: ["games", "entertainment"],

    /**
     * Знак платформы, а не игры: ставится приложение целиком.
     *
     * Обычные и «под маску» — отдельными записями, а не одной с
     * `purpose: "any maskable"`. Совмещённая заставляет андроид рисовать
     * иконку с запасом по краям как обычную, и она выглядит мелкой.
     */
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],

    /** Долгий тап по иконке на андроиде. На айфоне не работает вовсе. */
    shortcuts: GAMES.map((game) => ({
      name: game.title,
      short_name: game.title,
      description: game.tagline,
      url: game.routes.home,
      icons: [{ src: game.icon, sizes: "512x512", type: "image/png" }],
    })),
  };
}
