import { Args, Command, Flags } from "@oclif/core";
import spawn from "cross-spawn";

function passthrough(args: string[]): never {
  const { status, error } = spawn.sync(
    "npx",
    ["--yes", "@usefractal/create-frac@latest", ...args],
    { stdio: "inherit" },
  );
  if (error) {
    console.error(error);
    process.exit(1);
  }
  process.exit(status ?? 1);
}

export default class Create extends Command {
  static override description = "Scaffold a new frac project";
  static override strict = false;
  static override args = {
    path: Args.string({
      description: "Where the project will be created",
      required: false,
    }),
  };
  static override examples = [
    "frac create",
    "frac create my-app --yes",
    "frac create my-app --demo",
  ];
  static override flags = {
    demo: Flags.boolean({
      description: "Scaffold the richer demo project",
    }),
    overwrite: Flags.boolean({
      description: "Remove existing files if the target directory is not empty",
    }),
    pm: Flags.string({
      description: "Package manager to use",
      options: ["bun", "deno", "npm", "pnpm", "yarn"],
    }),
    "skip-skills": Flags.boolean({
      description: "Skip installing coding agent skills",
    }),
    start: Flags.boolean({
      description: "Start the dev server after scaffolding",
    }),
    yes: Flags.boolean({
      description: "Skip prompts and use default values for unprovided options",
    }),
  };

  public async run(): Promise<void> {
    passthrough(this.argv);
  }
}
