import { Command, Flags } from "@oclif/core";
import {
  createFractalCloudCore,
  handleCloudError,
  resolveEnvironment,
  resolveProjectId,
  resolveTokenTtl,
} from "../../../cli/fractal-cloud.js";

export default class CloudStorageList extends Command {
  static override description = "List Fractal Cloud Storage objects";
  static override examples = ["frac cloud storage list --prefix uploads/"];
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
    prefix: Flags.string({
      description: "Remote object key prefix",
    }),
    limit: Flags.integer({
      description: "Maximum objects to list",
      min: 1,
    }),
  };

  public async run(): Promise<void> {
    try {
      const { flags } = await this.parse(CloudStorageList);
      const listing = await createFractalCloudCore().cloud_storage_list({
        projectId: await resolveProjectId(flags.project),
        environment: resolveEnvironment(flags.env),
        expiresInSeconds: resolveTokenTtl(flags.ttl),
        prefix: flags.prefix,
        limit: flags.limit,
      });

      if (listing.objects.length === 0) {
        this.log("No objects found.");
        return;
      }

      for (const object of listing.objects) {
        this.log(`${object.key}\t${object.size}\t${object.uploadedAt}`);
      }
      if (listing.truncated) {
        this.log(`More objects available. Cursor: ${listing.cursor ?? ""}`);
      }
    } catch (error) {
      handleCloudError(this, error);
    }
  }
}
