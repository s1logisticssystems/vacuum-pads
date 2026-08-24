import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  DEFAULT_MASTER_DATA_WORKBOOK_PATH,
  MasterDataImportResult,
  MasterDataImportService,
} from '../src/master-data/master-data-import.service';

loadLocalEnvFile(path.resolve(process.cwd(), '..', '.env'));
loadLocalEnvFile(path.resolve(process.cwd(), '.env'));
ensureDatabaseUrl();

const prisma = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const workbookPath = getWorkbookPathArgument() ?? DEFAULT_MASTER_DATA_WORKBOOK_PATH;
  const service = new MasterDataImportService(prisma);
  const result = await service.importFromWorkbook({ workbookPath, dryRun });

  printImportResult(result);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

function getWorkbookPathArgument() {
  const pathArg = process.argv.find((argument) =>
    argument.startsWith('--workbook='),
  );

  return pathArg ? pathArg.slice('--workbook='.length) : undefined;
}

function loadLocalEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    return;
  }

  process.env.DATABASE_URL =
    'postgresql://vacuum_user:vacuum_pass@localhost:5432/vacuum_traceability?schema=public';
}

function printImportResult(result: MasterDataImportResult) {
  console.info(
    `${result.dryRun ? 'Dry-run' : 'Import'} master data from ${result.workbookPath}`,
  );

  for (const [entity, summary] of Object.entries(result.entities)) {
    console.info(
      `${entity}: rows=${summary.rowsRead}, creates=${summary.creates}, updates=${summary.updates}, unchanged=${summary.unchanged}, incomplete=${summary.incomplete}`,
    );
  }

  printMessages('Warnings', result.warnings);
  printMessages('Errors', result.errors);

  console.info(result.ok ? 'Import validation OK.' : 'Import validation failed.');
}

function printMessages(label: string, messages: string[]) {
  if (messages.length === 0) {
    console.info(`${label}: none`);
    return;
  }

  console.info(`${label}:`);

  for (const message of messages) {
    console.info(`- ${message}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error('Master data import failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
