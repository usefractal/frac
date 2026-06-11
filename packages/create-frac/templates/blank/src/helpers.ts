import { generateHelpers } from "frac/web";
import type { AppType } from "./server.js";

export const { useToolInfo, useCallTool } = generateHelpers<AppType>();
