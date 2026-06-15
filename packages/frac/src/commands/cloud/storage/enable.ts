import { Command, Flags } from "@oclif/core";
import {
  createFractalCloudCore,
  handleCloudError,
  resolveProjectId,
} from "../../../cli/fractal-cloud.js";

export default class CloudStorageEnable extends Command {
  static override description = "Enable Fractal Cloud Storage for a project";
  static override examples = ["frac cloud storage enable"];
  static override flags = {
    project: Flags.string({
      description: "Project ID, defaults to frac.json then FRACTAL_PROJECT_ID",
    }),
  };

  public async run(): Promise<void> {
    try {
      const { flags } = await this.parse(CloudStorageEnable);
      const project = await createFractalCloudCore().enable_cloud_storage({
        projectId: await resolveProjectId(flags.project),
      });
      this.log(`Cloud Storage enabled for ${project.id}.`);
    } catch (error) {
      handleCloudError(this, error);
    }
  }
}
