import { Command, Flags } from "@oclif/core";
import {
  createFractalCloudCore,
  handleCloudError,
  resolveProjectId,
} from "../cli/fractal-cloud.js";

export default class Deploy extends Command {
  static override description = "Deploy the current directory using frac.json";
  static override examples = [
    "frac deploy",
    "frac deploy --project project_123",
  ];
  static override flags = {
    project: Flags.string({
      description: "Project ID, defaults to frac.json then FRACTAL_PROJECT_ID",
    }),
  };

  public async run(): Promise<void> {
    try {
      const { flags } = await this.parse(Deploy);
      const deployment = await createFractalCloudCore().deploy_project({
        projectId: await resolveProjectId(flags.project),
        sourceDir: process.cwd(),
      });

      if (deployment.deploymentId) {
        this.log(`Deployment started: ${deployment.deploymentId}`);
      } else {
        this.log("Deployment started.");
      }
    } catch (error) {
      handleCloudError(this, error);
    }
  }
}
