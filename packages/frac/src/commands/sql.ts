import { Command, Flags } from "@oclif/core";
import {
  createFractalCloudCore,
  handleCloudError,
  resolveEnvironment,
  resolveProjectId,
} from "../cli/fractal-cloud.js";

export default class Sql extends Command {
  static override description = "Open a SQL shell for a project database";
  static override examples = ["frac sql", "frac sql --project project_123"];
  static override flags = {
    project: Flags.string({
      description: "Project ID, defaults to frac.json then FRACTAL_PROJECT_ID",
    }),
    env: Flags.string({
      description: "Cloud environment",
      options: ["dev", "prod"],
    }),
  };

  public async run(): Promise<void> {
    try {
      const { flags } = await this.parse(Sql);
      await createFractalCloudCore().open_database_shell({
        projectId: await resolveProjectId(flags.project),
        environment: resolveEnvironment(flags.env),
      });
    } catch (error) {
      handleCloudError(this, error);
    }
  }
}
