import { Command } from "@oclif/core";
import {
  createFractalCloudCore,
  handleCloudError,
  withFractalCloudOutput,
} from "../../cli/fractal-cloud.js";

export default class AuthLogin extends Command {
  static override description =
    "Log in to Fractal and store the session in Keychain";
  static override examples = ["frac auth login"];

  public async run(): Promise<void> {
    try {
      const core = createFractalCloudCore();
      await withFractalCloudOutput(() => core.auth_login());
    } catch (error) {
      handleCloudError(this, error);
    }
  }
}
