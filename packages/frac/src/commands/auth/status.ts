import { Command } from "@oclif/core";
import {
  createFractalCloudCore,
  handleCloudError,
} from "../../cli/fractal-cloud.js";

export default class AuthStatus extends Command {
  static override description = "Show the current login status";
  static override examples = ["frac auth status"];

  public async run(): Promise<void> {
    try {
      await createFractalCloudCore().auth_status();
    } catch (error) {
      handleCloudError(this, error);
    }
  }
}
