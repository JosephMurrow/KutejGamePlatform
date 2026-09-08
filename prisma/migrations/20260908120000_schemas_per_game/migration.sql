-- У каждой игры своя среда обитания в базе: схема платформы и схема игры
-- (docs/BACKLOG.md A5).
--
-- Миграция написана руками намеренно. Автогенератор на такой разнице выдал бы
-- DROP и CREATE — то есть снёс бы всё содержимое. ALTER ... SET SCHEMA
-- переносит таблицы вместе с данными, индексами и внешними ключами, ничего не
-- переливая.
--
-- Отдельные базы вместо схем не годятся: игровые таблицы ссылаются на
-- platform.users внешними ключами, а между базами ссылочной целостности нет.

CREATE SCHEMA IF NOT EXISTS "platform";
CREATE SCHEMA IF NOT EXISTS "pricetitute";

-- Типы переезжают первыми: таблицы ссылаются на них по идентификатору, поэтому
-- порядок на работоспособность не влияет, но так читается понятнее.
ALTER TYPE "public"."RoomKind" SET SCHEMA "platform";
ALTER TYPE "public"."LinkPurpose" SET SCHEMA "platform";

ALTER TYPE "public"."QuestionPack" SET SCHEMA "pricetitute";
ALTER TYPE "public"."QuestionMode" SET SCHEMA "pricetitute";
ALTER TYPE "public"."HostRotation" SET SCHEMA "pricetitute";
ALTER TYPE "public"."RoomEndMode" SET SCHEMA "pricetitute";

-- Платформа: аккаунты, одноразовые ссылки, комната как оболочка.
ALTER TABLE "public"."users" SET SCHEMA "platform";
ALTER TABLE "public"."one_time_links" SET SCHEMA "platform";
ALTER TABLE "public"."private_rooms" SET SCHEMA "platform";

-- Платитутка: вопросы, раунды, ставки, очки, очередь вопросов.
ALTER TABLE "public"."questions" SET SCHEMA "pricetitute";
ALTER TABLE "public"."rounds" SET SCHEMA "pricetitute";
ALTER TABLE "public"."round_bets" SET SCHEMA "pricetitute";
ALTER TABLE "public"."scores" SET SCHEMA "pricetitute";
ALTER TABLE "public"."room_question_queues" SET SCHEMA "pricetitute";

-- Журнал миграций остаётся в public: он принадлежит инструменту, а не игре.
