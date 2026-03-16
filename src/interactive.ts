import checkbox from "@inquirer/checkbox";
import confirm from "@inquirer/confirm";
import { unlink } from "node:fs/promises";

export async function runInteractiveDelete(deadFiles: string[]): Promise<void> {
  if (deadFiles.length === 0) {
    console.log("\nNo unused files found.\n");
    return;
  }

  const count = deadFiles.length;
  console.log(
    `\n\x1b[33mdead-files\x1b[0m -- ${count} unused file${count === 1 ? "" : "s"} found\n`
  );

  console.log("\x1b[2m  Space to toggle, A to select all, I to invert, Enter to confirm\x1b[0m\n");

  const selected = await checkbox({
    message: "Select files to delete:",
    loop: false,
    choices: deadFiles.map((file) => ({ name: file, value: file, checked: false })),

  });

  if (selected.length === 0) {
    console.log("\nNothing deleted.\n");
    return;
  }

  const confirmed = await confirm({
    message: `Delete ${selected.length} selected file${selected.length === 1 ? "" : "s"}?`,
    default: false,
  });

  if (!confirmed) {
    console.log("\nNothing deleted.\n");
    return;
  }

  console.log("\nDeleted:");
  for (const file of selected) {
    try {
      await unlink(file);
      console.log(`  \x1b[32m✓\x1b[0m ${file}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  \x1b[31m✗\x1b[0m ${file}: ${message}`);
    }
  }
  console.log();
}
