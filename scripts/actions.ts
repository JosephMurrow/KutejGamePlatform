import { createRequire } from "node:module";

/**
 * Вызов серверных экшенов из смоуков — так, как их зовёт посторонний.
 *
 * Идентификаторы экшенов берутся из манифеста прод-сборки, аргументы
 * кодируются тем же `encodeReply`, что и в браузере, запрос уходит POST'ом с
 * заголовком `Next-Action`. Нужна прод-сборка (`npm run build`).
 *
 * Пользуются `smoke:guest` и `smoke:limits`.
 */

const require = createRequire(import.meta.url);

type Encoded = string | FormData | URLSearchParams;
const { encodeReply } =
  require("next/dist/compiled/react-server-dom-webpack/client.node.js") as {
    encodeReply: (value: unknown) => Promise<Encoded>;
  };

interface ActionEntry {
  exportedName?: string;
}
const manifest = require(
  `${process.cwd()}/.next/server/server-reference-manifest.json`,
) as {
  node: Record<string, ActionEntry>;
};

export const SMOKE_URL = process.env.SMOKE_URL ?? "http://localhost:3000";

export function actionId(name: string): string {
  const found = Object.entries(manifest.node).find(
    ([, entry]) => entry.exportedName === name,
  );
  if (!found) throw new Error(`Экшена ${name} нет в манифесте — собери заново`);
  return found[0];
}

export function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

export interface ActionReply {
  status: number;
  /** Куда экшен отправил редиректом, если отправил. */
  redirect: string | null;
  /** Тело ответа RSC как текст: сверяем по подстроке. */
  body: string;
}

export interface CallOptions {
  /** Сессия. Без неё — аноним. */
  token?: string;
  /** С какой страницы звать. Посторонний выберет любую, по умолчанию `/`. */
  path?: string;
  /**
   * Чьим адресом назваться. Локально прокси нет, и сервер верит
   * `X-Forwarded-For` — так смоук изображает разных клиентов
   * (docs/DEPLOY.md, «Адрес клиента»).
   */
  address?: string;
}

/** Позвать экшен так, как его зовёт браузер. */
export async function callAction(
  name: string,
  args: unknown[],
  { token, path = "/", address }: CallOptions = {},
): Promise<ActionReply> {
  const headers: Record<string, string> = {
    "Next-Action": actionId(name),
    Origin: SMOKE_URL,
    Accept: "text/x-component",
  };
  if (token) headers.Cookie = `pt_session=${token}`;
  if (address) headers["X-Forwarded-For"] = address;

  const res = await fetch(`${SMOKE_URL}${path}`, {
    method: "POST",
    headers,
    body: await encodeReply(args),
    redirect: "manual",
  });

  return {
    status: res.status,
    redirect: res.headers.get("x-action-redirect"),
    body: await res.text(),
  };
}
