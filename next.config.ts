import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Явно фиксируем корень: иначе Turbopack уходит вверх по дереву в поисках
  // lock-файла и цепляет посторонний package-lock.json из домашней папки.
  turbopack: {
    root: process.cwd(),
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
