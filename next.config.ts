import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Явно фиксируем корень: иначе Turbopack уходит вверх по дереву в поисках
  // lock-файла и цепляет посторонний package-lock.json из домашней папки.
  turbopack: {
    root: process.cwd(),
  },

  /**
   * Аватары. Страница профиля показывает сорок штук разом, и с настройками
   * `public` по умолчанию (`max-age=0`) каждый заход — сорок запросов на
   * переспрос. Сутки кеша убирают их и ничем не грозят: перерисовали набор —
   * через день его увидят все, а `stale-while-revalidate` отдаёт старую
   * картинку, пока подтягивается новая.
   *
   * Не `immutable`: имена файлов не содержат хеша, и год кеша заморозил бы
   * любую перерисовку намертво.
   */
  async headers() {
    return [
      {
        source: "/:dir(avatars|games)/:path*.svg",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },

  /**
   * Старые адреса игры. У людей они в закладках и в истории браузера, поэтому
   * живут редиректами, пока не перестанут появляться в логах
   * (docs/BACKLOG.md A7).
   *
   * Временные, а не постоянные: 308 браузер кеширует намертво, и передумать
   * потом будет нечем. Ссылки на комнаты (`/r/<code>`) здесь не значатся — они
   * не менялись вовсе.
   *
   * Срабатывают до proxy, поэтому защищать надо уже новые пути.
   */
  async redirects() {
    return [
      {
        source: "/play",
        destination: "/games/pricetitute/play",
        permanent: false,
      },
      {
        source: "/rooms/new",
        destination: "/games/pricetitute/rooms/new",
        permanent: false,
      },
      {
        source: "/leaderboard",
        destination: "/games/pricetitute/leaderboard",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
