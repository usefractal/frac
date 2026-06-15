import { Command, Flags } from "@oclif/core";
import {
  createFractalCloudCore,
  formatCloudStorageToken,
  handleCloudError,
  resolveEnvironment,
  resolveProjectId,
  resolveTokenFormat,
  resolveTokenTtl,
} from "../cli/fractal-cloud.js";

export default class Token extends Command {
  static override description = "Print a scoped FRACTAL_CLOUD_TOKEN";
  static override examples = [
    "frac token",
    "frac token --project project_123 --env prod --format raw",
  ];
  static override flags = {
    project: Flags.string({
      description: "Project ID, defaults to frac.json then FRACTAL_PROJECT_ID",
    }),
    env: Flags.string({
      description: "Cloud environment",
      options: ["dev", "prod"],
    }),
    ttl: Flags.integer({
      description: "Token lifetime in seconds, max 3600",
      min: 1,
    }),
    format: Flags.string({
      description: "Output format",
      options: ["env", "raw", "json"],
      default: "env",
    }),
  };

  public async run(): Promise<void> {
    try {
      const { flags } = await this.parse(Token);
      const projectId = await resolveProjectId(flags.project);
      const environment = resolveEnvironment(flags.env);
      const expiresInSeconds = resolveTokenTtl(flags.ttl);
      const format = resolveTokenFormat(flags.format);
      const token = await createFractalCloudCore().create_cloud_storage_token({
        projectId,
        environment,
        expiresInSeconds,
      });

      this.log(formatCloudStorageToken(token, format));
    } catch (error) {
      handleCloudError(this, error);
    }
  }
}
