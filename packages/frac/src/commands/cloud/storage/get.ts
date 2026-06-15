import { writeFile } from "node:fs/promises";
import { Args, Command, Flags } from "@oclif/core";
import {
  createFractalCloudCore,
  handleCloudError,
  resolveEnvironment,
  resolveProjectId,
  resolveTokenTtl,
} from "../../../cli/fractal-cloud.js";

export default class CloudStorageGet extends Command {
  static override description = "Download a Fractal Cloud Storage object";
  static override examples = ["frac cloud storage get remote.txt ./local.txt"];
  static override args = {
    remotePath: Args.string({
      description: "Remote object path",
      required: true,
    }),
    outputFile: Args.string({
      description: "Output file. Prints to stdout when omitted.",
      required: false,
    }),
  };
  static override flags = {
    project: Flags.string({
      description: "Project ID, defaults to frac.json then FRACTAL_PROJECT_ID",
    }),
    env: Flags.string({
      description: "Cloud environment",
      options: ["dev", "prod"],
    }),
    ttl: Flags.integer({
      description: "Storage token lifetime in seconds, max 3600",
      min: 1,
    }),
  };

  public async run(): Promise<void> {
    try {
      const { args, flags } = await this.parse(CloudStorageGet);
      const downloaded = await createFractalCloudCore().cloud_storage_get({
        projectId: await resolveProjectId(flags.project),
        environment: resolveEnvironment(flags.env),
        expiresInSeconds: resolveTokenTtl(flags.ttl),
        remotePath: args.remotePath,
      });

      if (args.outputFile) {
        await writeFile(args.outputFile, downloaded.body);
        this.log(`Wrote ${args.outputFile}.`);
        return;
      }

      process.stdout.write(Buffer.from(downloaded.body));
    } catch (error) {
      handleCloudError(this, error);
    }
  }
}
