import { NextResponse, type NextRequest } from "next/server";
import { readSessionClaims, SESSION_COOKIE } from "@/lib/auth/token";

/**
 * Быстрая развилка по сессии: без похода в базу, только проверка подписи.
 * Настоящая авторизация всё равно происходит на сервере в экшенах и страницах.
 *
 * Файл называется proxy.ts, а не middleware.ts: в Next 16 старое соглашение
 * объявлено устаревшим.
 */
const PROTECTED = ["/profile", "/play", "/leaderboard"];
const ANONYMOUS_ONLY = ["/login", "/register"];

/**
 * Куда гостю нельзя. Он заведён ради одной стримерской комнаты: ни общего
 * зала, ни своей комнаты, ни рейтинга, ни профиля у него нет — и профиля-то
 * нет буквально, гость исчезает вместе с комнатой (см. src/games/pricetitute/docs/BACKLOG.md O3).
 */
const CLOSED_TO_GUESTS = [
  "/profile",
  "/play",
  "/leaderboard",
  "/rooms",
  "/login",
  "/register",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = await readSessionClaims(token);
  const userId = claims?.userId ?? null;

  if (!userId && PROTECTED.some((path) => pathname.startsWith(path))) {
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
    url.pathname = "/profile";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/profile/:path*",
    "/play/:path*",
    "/leaderboard/:path*",
    "/rooms/:path*",
    "/login",
    "/register",
  ],
};
