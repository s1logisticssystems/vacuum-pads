/**
 * Creates a user or sets an existing user's password.
 *
 * Used to bootstrap the first administrator, and afterwards to recover an
 * account whose password was lost. Credentials are passed in at run time and
 * never stored in the repository.
 *
 *   npm run set-password -- --username admin --password 'secret123' --role ADMIN
 *
 * Reads the password from the PASSWORD environment variable when --password is
 * omitted, which keeps it out of shell history and process listings.
 */
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 10;

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];

    if (current.startsWith('--')) {
      const key = current.slice(2);
      const next = argv[i + 1];

      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = 'true';
      }
    }
  }

  return args;
}

function assertPasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('Password must contain both letters and numbers.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const username = (args.username ?? '').trim().toLowerCase();
  const password = args.password ?? process.env.PASSWORD ?? '';
  const role = (args.role ?? 'ADMIN').trim().toUpperCase();
  const displayName = args['display-name']?.trim();

  if (!username) {
    throw new Error('--username is required.');
  }

  if (!/^[a-z0-9._-]{3,60}$/.test(username)) {
    throw new Error(
      'Username must be 3-60 characters: letters, numbers, dot, dash or underscore.',
    );
  }

  if (!password) {
    throw new Error('--password (or the PASSWORD variable) is required.');
  }

  assertPasswordStrength(password);

  if (!Object.values(UserRole).includes(role as UserRole)) {
    throw new Error(
      `--role must be one of: ${Object.values(UserRole).join(', ')}.`,
    );
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = new Date();

  const user = await prisma.user.upsert({
    where: { username },
    update: {
      passwordHash,
      passwordUpdatedAt: now,
      role: role as UserRole,
      isActive: true,
      deletedAt: null,
      ...(displayName ? { displayName } : {}),
    },
    create: {
      username,
      displayName: displayName ?? username,
      role: role as UserRole,
      isActive: true,
      passwordHash,
      passwordUpdatedAt: now,
    },
    select: { id: true, username: true, role: true },
  });

  console.log(
    `Password set for ${user.username} (role ${user.role}, id ${user.id}).`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
