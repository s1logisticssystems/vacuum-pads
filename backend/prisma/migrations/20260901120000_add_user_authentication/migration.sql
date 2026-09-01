-- Adds password credentials to User so operators and administrators can sign in.
-- Nullable by design: users that exist only to attribute historical movements
-- have no credentials and cannot sign in until an administrator sets one.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordUpdatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
