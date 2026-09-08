import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Иконка вкладки по месту (docs/BACKLOG.md D7).
 *
 * Обычно её кладут файлом-соглашением в сегмент маршрута, и для витрины с
 * игровыми страницами этого хватило бы. Но комната `/r/<code>` не лежит в
 * дереве игры и узнаёт игру только из базы — там иконку приходится отдавать
 * кодом. Чтобы у знака не завелось двух копий, из `public` его читают все:
 * и корень, и страницы игры, и комната.
 *
 * Файловое соглашение сильнее `metadata.icons`: пока в корне лежала
 * `favicon.ico`, она объявлялась на всех страницах разом и спорила с иконкой
 * сегмента. Поэтому её нет.
 */

/** Знак платформы. Им подписано всё, что не принадлежит игре. */
export const PLATFORM_ICON = "/brand/icon.png";

/** Размер знака. Одинаков у платформы и у игр — см. docs/DESIGN.md. */
export const ICON_SIZE = { width: 512, height: 512 };

export const ICON_TYPE = "image/png";

/** Отдать картинку из `public` ответом иконки. */
export async function iconResponse(publicPath: string): Promise<Response> {
  const bytes = await readFile(
    path.join(process.cwd(), "public", publicPath.replace(/^\/+/, "")),
  );

  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": ICON_TYPE },
  });
}
