-- Настройки партии уезжают из платформенной таблицы комнат в схему игры
-- (docs/BACKLOG.md A4).
--
-- Платформа не знает, какие у игры настройки, и для второй игры завести под
-- них колонки у себя не смогла бы. Тайминги фаз, режим вопросов, ротация
-- ведущего и условие конца партии — правила платитутки, и живут они там же,
-- где её раунды и очки.
--
-- Внешнего ключа на комнату нет намеренно: у раундов и очков он тоже строкой.
-- Убирает эти строки сама игра, когда платформа сообщает ей об удалении
-- комнаты.

CREATE TABLE "pricetitute"."room_settings" (
    "roomId" TEXT NOT NULL,
    "bettingMs" INTEGER NOT NULL,
    "revealMs" INTEGER NOT NULL,
    "includeAdult" BOOLEAN NOT NULL,
    "mode" "pricetitute"."QuestionMode" NOT NULL,
    "hostRotation" "pricetitute"."HostRotation" NOT NULL,
    "endMode" "pricetitute"."RoomEndMode" NOT NULL,
    "endValue" INTEGER,

    CONSTRAINT "room_settings_pkey" PRIMARY KEY ("roomId")
);

-- Переливаем то, что есть. Живых приватных комнат к этому моменту единицы:
-- комната умирает через полчаса после ухода последнего игрока.
INSERT INTO "pricetitute"."room_settings" (
    "roomId", "bettingMs", "revealMs", "includeAdult",
    "mode", "hostRotation", "endMode", "endValue"
)
SELECT
    "id", "bettingMs", "revealMs", "includeAdult",
    "mode", "hostRotation", "endMode", "endValue"
FROM "platform"."private_rooms";

ALTER TABLE "platform"."private_rooms"
    DROP COLUMN "bettingMs",
    DROP COLUMN "revealMs",
    DROP COLUMN "includeAdult",
    DROP COLUMN "mode",
    DROP COLUMN "hostRotation",
    DROP COLUMN "endMode",
    DROP COLUMN "endValue";
