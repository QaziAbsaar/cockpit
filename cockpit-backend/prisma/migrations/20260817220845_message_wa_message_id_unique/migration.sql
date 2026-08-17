-- AlterTable
-- Adds a unique constraint on Message.waMessageId so redelivered webhook
-- payloads (same WhatsApp messageId) cannot be inserted twice. Postgres
-- treats multiple NULLs as distinct, so rows without a waMessageId are
-- unaffected.
CREATE UNIQUE INDEX "Message_waMessageId_key" ON "Message"("waMessageId");
