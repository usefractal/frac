import { Command } from "@oclif/core";
import {
  createFractalCloudCore,
  handleCloudError,
} from "../../cli/fractal-cloud.js";

export default class AuthLogout extends Command {
  static override description = "Remove the stored session from Keychain";
  static override examples = ["frac auth logout"];

  public async run(): Promise<void> {
    try {
      await createFractalCloudCore().auth_logout();
    } catch (error) {
      handleCloudError(this, error);
    }
  }
}
