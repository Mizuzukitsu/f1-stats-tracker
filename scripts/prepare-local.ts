import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareResearchInventory, summarizeInventory } from '../app/src/research.ts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0]?.trim()) {
    throw new Error('Usage: npm run prepare:local -- <source-file> (exactly one local JSON file path is required).');
  }

  const sourcePath = resolve(args[0]);
  let sourceText: string;
  try {
    sourceText = await readFile(sourcePath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read source inventory ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(sourceText) as unknown;
  } catch (error) {
    throw new Error(`Source inventory is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const inventory = prepareResearchInventory(raw);
  const serialized = `${JSON.stringify(inventory, null, 2)}\n`;
  const projectRoot = fileURLToPath(new URL('../', import.meta.url));
  const outputDirectory = resolve(projectRoot, '.local-data');
  const destination = resolve(outputDirectory, 'inventory.json');
  const temporaryPath = resolve(outputDirectory, `.inventory-${randomUUID()}.tmp`);
  let temporaryCreated = false;

  try {
    await mkdir(outputDirectory, { recursive: true });
    const temporary = await open(temporaryPath, 'wx', 0o600);
    temporaryCreated = true;
    try {
      await temporary.writeFile(serialized, 'utf8');
      await temporary.sync();
    } finally {
      await temporary.close();
    }
    await rename(temporaryPath, destination);
    temporaryCreated = false;
  } catch (error) {
    if (temporaryCreated) {
      try {
        await unlink(temporaryPath);
      } catch (cleanupError) {
        console.error(`Could not remove temporary inventory ${temporaryPath}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
      }
    }
    throw new Error(`Could not prepare .local-data/inventory.json; previous output was not replaced: ${error instanceof Error ? error.message : String(error)}`);
  }

  const counts = summarizeInventory(inventory.events);
  console.log(`Prepared local research inventory: ${inventory.events.length} source events across ${counts.seasons} seasons.`);
  console.log(`Result-recorded: ${counts.resultRecorded}; scheduled-future: ${counts.scheduledFuture}; source cutoff: ${inventory.cutoff}.`);
  console.log(`Qualification: ${inventory.qualification}.`);
  console.log('Saved .local-data/inventory.json. Local research only: source observations are not verified history or approved for public release.');
}

main().catch((error: unknown) => {
  console.error(`Preparation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
