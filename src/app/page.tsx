import { redirect } from "next/navigation";

/**
 * Корень — это витрина. Отдельного лендинга у платформы нет: полка с играми и
 * есть её лицо, а держать две страницы с одним и тем же содержимым незачем.
 */
export default function Home() {
  redirect("/games");
}
