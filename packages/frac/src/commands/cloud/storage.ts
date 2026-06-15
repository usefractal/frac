import { Command } from "@oclif/core";

export default class CloudStorage extends Command {
  static override description = "Manage Fractal Cloud Storage";
  static override examples = [
    "frac cloud storage enable",
    "frac cloud storage list",
    "frac cloud storage put ./local.txt remote.txt",
    "frac cloud storage get remote.txt ./local.txt",
  ];

  public async run(): Promise<void> {
    this.log("Manage Fractal Cloud Storage.");
    this.log("");
    this.log("Commands:");
    this.log("  frac cloud storage enable");
    this.log("  frac cloud storage list [--prefix <prefix>] [--limit <n>]");
    this.log("  frac cloud storage put <local-file> <remote-path>");
    this.log("  frac cloud storage get <remote-path> [output-file]");
  }
}
