import { Args, Command, Flags } from "@oclif/core";
import {
  createFractalCloudCore,
  handleCloudError,
  resolveEnvironment,
  resolveProjectId,
  resolveTokenTtl,
} from "../../../cli/fractal-cloud.js";

export default class CloudStoragePut extends Command {
  static override description = "Upload a file to Fractal Cloud Storage";
  static override examples = ["frac cloud storage put ./local.txt remote.txt"];
  static override args = {
    localFile: Args.string({
      description: "Local file to upload",
      required: true,
    }),
    remotePath: Args.string({
      description: "Remote object path",
      required: true,
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
    "content-type": Flags.string({
      description: "Content-Type for the uploaded object",
    }),
  };

  public async run(): Promise<void> {
    try {
      const { args, flags } = await this.parse(CloudStoragePut);
      const uploaded = await createFractalCloudCore().cloud_storage_put({
        projectId: await resolveProjectId(flags.project),
        environment: resolveEnvironment(flags.env),
        expiresInSeconds: resolveTokenTtl(flags.ttl),
        localFile: args.localFile,
        remotePath: args.remotePath,
        contentType: flags["content-type"],
      });
      this.log(`Uploaded ${uploaded.key} (${uploaded.size} bytes).`);
    } catch (error) {
      handleCloudError(this, error);
    }
  }
}
