-- Email de connexion optionnel sur l'utilisateur, unique globalement (login par email).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "email" text;
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_key" ON "user"("email");
