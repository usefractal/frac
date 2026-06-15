import { generateHelpers } from "@usefractal/frac/web";
import type { AppType } from "./server.js";

export const { useToolInfo, useCallTool } = generateHelpers<AppType>();
