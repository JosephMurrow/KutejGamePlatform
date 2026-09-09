import { NextResponse, type NextRequest } from "next/server";
import { readSessionClaims, SESSION_COOKIE } from "@/lib/auth/token";

/**
 * Быстрая развилка по сессии: без похода в базу, только проверка подписи.
 * Настоящая авторизация всё равно происходит на сервере в экшенах и страницах.
 *
 * Файл называется proxy.ts, а не middleware.ts: в Next 16 старое соглашение
 * объявлено устаревшим.
 */
/**
 * За стол и в рейтинг — только со своим аккаунтом.
 *
 * Игры здесь не перечисляются поимённо: их адреса ловит `insideGame`. Список
 * из трёх страниц платитутки означал бы, что каждая новая игра дописывает сюда
 * свои три — и однажды забудет (src/games/chess/docs/BACKLOG.md A4).
 *
 * Старые адреса перечислены наравне с новыми, хотя редиректы из next.config
 * срабатывают раньше proxy и досюда их не доводят. Это подстраховка: уберут
 * редирект — защита останется на месте, а не исчезнет молча.
 */
const PROTECTED = ["/profile", "/play", "/rooms", "/leaderboard"];
const ANONYMOUS_ONLY = ["/login", "/register"];

/**
 * Разделы игры, куда пускают только со своим аккаунтом. Одни и те же у всех
 * игр — это платформенные адреса из `GameRoutes`, а не выдумка каждой.
 */
const GAME_SECTIONS = ["play", "rooms", "leaderboard"];

/**
 * Внутренности игры: общий зал, своя комната, рейтинг.
 *
 * Витрина `/games` и страница самой игры `/games/<игра>` остаются открытыми:
 * посторонний должен увидеть, во что тут играют, до всякой регистрации, а
 * войти просят на пороге стола, а не на пороге полки (docs/BACKLOG.md C1).
 *
 * Раздел сверяется со списком, а не «всё, что глубже первой страницы»: под
 * адресом игры лежат ещё её знак, иконка вкладки и картинки ботов, и запрет
 * на всё подряд отдавал бы вместо них редирект на вход — незаметно, потому
 * что у вошедшего всё работает (src/games/chess/docs/BACKLOG.md A4).
 */
export function insideGame(pathname: string): boolean {
  const [root, game, section] = pathname.split("/").filter(Boolean);

  return (
    root === "games" && !!game && !!section && GAME_SECTIONS.includes(section)
  );
}

/**
 * Куда гостю нельзя. Он заведён ради одной стримерской комнаты: ни общего
 * зала, ни своей комнаты, ни рейтинга, ни профиля у него нет — и профиля-то
 * нет буквально, гость исчезает вместе с комнатой (см. src/games/pricetitute/docs/BACKLOG.md O3).
 */
const CLOSED_TO_GUESTS = [
  "/profile",
  // Вся полка целиком: гостю не во что играть, кроме своей комнаты, и
  // объяснять ему про другие игры незачем (docs/BACKLOG.md C1).
  "/games",
  "/play",
  "/leaderboard",
  "/rooms",
  "/login",
  "/register",
];

/**
 * Куда можно вести по параметру `next`: только внутрь сайта. Протокольно
 * относительный путь (`//чужой-домен`) увёл бы наружу.
 */
function safePath(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = await readSessionClaims(token);
  const userId = claims?.userId ?? null;

  const closed =
    PROTECTED.some((path) => pathname.startsWith(path)) || insideGame(pathname);

  if (!userId && closed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Гостя разворачиваем на главную: объяснять ему про рейтинг и профиль
  // бессмысленно, у него их нет и не будет.
  if (
    claims?.guest &&
    CLOSED_TO_GUESTS.some((path) => pathname.startsWith(path))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (userId && !claims?.guest && ANONYMOUS_ONLY.includes(pathname)) {
    const url = request.nextUrl.clone();

    // Вошедший на странице входа — это чаще всего человек, пришедший по
    // приглашению: комната отправила его сюда, а сессия у него уже была.
    // Раньше `next` здесь терялся, и приглашение пропадало ровно в тот
    // момент, когда должно было сработать.
    const next = safePath(request.nextUrl.searchParams.get("next"));
    if (next) {
      const target = new URL(next, request.nextUrl.origin);
      url.pathname = target.pathname;
      url.search = target.search;
    } else {
      url.pathname = "/games";
      url.search = "";
    }

    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/profile/:path*",
    "/games/:path*",
    "/play/:path*",
    "/leaderboard/:path*",
    "/rooms/:path*",
    "/login",
    "/register",
  ],
};
