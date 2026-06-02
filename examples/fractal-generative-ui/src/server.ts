import { intentMiddleware } from "@alpic-ai/insights";
import { McpServer } from "skybridge/server";
import { z } from "zod";

const server = new McpServer(
  {
    name: "fractal-generative-ui",
    version: "0.0.1",
  },
  { capabilities: {}, fractalsDir: "src/fractals" },
)
  .mcpMiddleware(intentMiddleware())
  .registerFractal({
    name: "HeroPanel",
    component: "HeroPanel",
    description:
      "A prominent summary panel with a title, short supporting copy, and optional tone.",
    propsSchema: {
      title: z.string(),
      eyebrow: z.string().optional(),
      body: z.string(),
      tone: z.enum(["blue", "green", "amber"]).optional(),
    },
  })
  .registerFractal({
    name: "MetricCard",
    component: "MetricCard",
    description: "A compact KPI card with a label, value, and optional change.",
    propsSchema: {
      label: z.string(),
      value: z.string(),
      change: z.string().optional(),
      intent: z.enum(["neutral", "positive", "negative"]).optional(),
    },
  })
  .registerFractal({
    name: "ActionRow",
    component: "ActionRow",
    description: "A horizontal row of suggested next actions.",
    propsSchema: {
      primary: z.string(),
      secondary: z.string().optional(),
    },
  })
  .registerFractal({
    name: "Stack",
    component: "Stack",
    description: "A vertical layout container with configurable spacing.",
    propsSchema: {
      gap: z.enum(["sm", "md", "lg"]).optional(),
    },
  })
  .registerFractal({
    name: "Grid",
    component: "Grid",
    description: "A responsive grid layout container for cards and panels.",
    propsSchema: {
      columns: z.enum(["2", "3"]).optional(),
      gap: z.enum(["sm", "md", "lg"]).optional(),
    },
  })
  .registerFractal({
    name: "SectionTitle",
    component: "SectionTitle",
    description: "A section heading with optional supporting text.",
    propsSchema: {
      title: z.string(),
      subtitle: z.string().optional(),
    },
  })
  .registerFractal({
    name: "Badge",
    component: "Badge",
    description: "A small label for status, priority, or category.",
    propsSchema: {
      children: z.string(),
      tone: z.enum(["slate", "blue", "green", "amber", "red"]).optional(),
    },
  })
  .registerFractal({
    name: "InsightList",
    component: "InsightList",
    description: "A concise list of insights or observations.",
    propsSchema: {
      title: z.string().optional(),
      items: z.array(z.string()),
    },
  })
  .registerFractal({
    name: "ProgressBar",
    component: "ProgressBar",
    description: "A labeled progress bar for percentages and completion.",
    propsSchema: {
      label: z.string(),
      value: z.number(),
      max: z.number().optional(),
      tone: z.enum(["blue", "green", "amber", "red"]).optional(),
    },
  })
  .registerFractal({
    name: "Callout",
    component: "Callout",
    description: "A highlighted note, risk, recommendation, or warning.",
    propsSchema: {
      title: z.string(),
      body: z.string(),
      tone: z.enum(["info", "success", "warning", "danger"]).optional(),
    },
  })
  .registerFractal({
    name: "DataTable",
    component: "DataTable",
    description: "A compact table for structured rows and columns.",
    propsSchema: {
      columns: z.array(z.string()),
      rows: z.array(z.array(z.string())),
      caption: z.string().optional(),
    },
  })
  .registerFractal({
    name: "KeyValueList",
    component: "KeyValueList",
    description: "A list of labeled facts, attributes, or settings.",
    propsSchema: {
      title: z.string().optional(),
      items: z.array(
        z.object({
          label: z.string(),
          value: z.string(),
        }),
      ),
    },
  })
  .registerFractal({
    name: "Timeline",
    component: "Timeline",
    description: "A vertical sequence of dated or ordered events.",
    propsSchema: {
      title: z.string().optional(),
      items: z.array(
        z.object({
          label: z.string(),
          body: z.string(),
          time: z.string().optional(),
        }),
      ),
    },
  })
  .registerFractal({
    name: "Checklist",
    component: "Checklist",
    description: "A list of tasks with completed and pending states.",
    propsSchema: {
      title: z.string().optional(),
      items: z.array(
        z.object({
          label: z.string(),
          done: z.boolean().optional(),
        }),
      ),
    },
  })
  .registerFractal({
    name: "StatComparison",
    component: "StatComparison",
    description: "A before-and-after stat comparison with a delta.",
    propsSchema: {
      label: z.string(),
      before: z.string(),
      after: z.string(),
      delta: z.string(),
      intent: z.enum(["neutral", "positive", "negative"]).optional(),
    },
  });

server.run();

export type AppType = typeof server;
