import { readFileSync } from "node:fs";
import path from "node:path";
import { intentMiddleware } from "@alpic-ai/insights";
import { McpServer } from "skybridge/server";
import { z } from "zod";

type Flight = {
  id: string;
  origin: string;
  destination: string;
  airline: string;
  route: string;
  depart: string;
  arrive: string;
  duration: string;
  price: string;
  stops: string;
  cabin: string;
};

type Hotel = {
  id: string;
  destination: string;
  name: string;
  location: string;
  nightlyRate: string;
  rating: string;
  vibe: string;
  amenities: string[];
};

type Tour = {
  id: string;
  destination: string;
  name: string;
  location: string;
  duration: string;
  price: string;
  intensity: "easy" | "moderate" | "active";
  highlights: string[];
};

type TravelPlan = {
  id: string;
  destination: string;
  title: string;
  days: number;
  budget: string;
  summary: string;
  items: Array<{
    day: string;
    title: string;
    body: string;
  }>;
};

type TravelData = {
  flights: Flight[];
  hotels: Hotel[];
  tours: Tour[];
  travelPlans: TravelPlan[];
};

const data = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/data/travel.json"), "utf-8"),
) as TravelData;

function includesMatch(value: string, query?: string): boolean {
  if (!query) {
    return true;
  }

  return value.toLowerCase().includes(query.toLowerCase());
}

const locationAliases: Record<string, string[]> = {
  sf: ["sfo", "san francisco"],
  "san francisco": ["sfo", "sf"],
};

function locationMatches(value: string, query?: string): boolean {
  if (includesMatch(value, query)) {
    return true;
  }

  const aliases = query ? locationAliases[query.toLowerCase()] : undefined;
  return aliases?.some((alias) => includesMatch(value, alias)) ?? false;
}

function textResult<T>(label: string, items: T[]) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ [label]: items }, null, 2),
      },
    ],
    structuredContent: {
      [label]: items,
    },
  };
}

const server = new McpServer(
  {
    name: "fractal-travel",
    version: "0.0.1",
  },
  {
    capabilities: {},
    fractalsDir: "src/fractals",
    fractalsRenderToolName: "show_result",
    fractalsRenderToolDescription: [
      "Use this tool to render the final Fractal travel answer after using other travel tools.",
      "Use `show_result` exactly once for a user request, after all needed finder tools have completed. Do not use it after each individual finder result.",
      "Use only registered Fractals and their prop contracts. The JSX is TypeScript-checked before rendering.",
      "Use the `props` object for dynamic arrays, objects, or larger data values that should be referenced from JSX expressions.",
      "",
      "Examples:",
      "For a request like \"Find me flights from SF to London\", first call `find_flight`, then call `show_result` to render one or more `Flight` from the returned flights.",
      "For a request like \"Create a trip for me\" or \"help me plan my travel to London\", first call `find_flight`, `find_hotel`, and `find_tour` for the destination, then call `show_result` exactly once.",
      "For a full trip plan, the final JSX should be one combined tree containing a `TravelPlan` followed by the selected `Flight`, `Hotel`, and `Tour` Fractals. Do not split these into separate `show_result` calls.",
    ].join("\n"),
  },
)
  .mcpMiddleware(intentMiddleware())
  .registerTool(
    {
      name: "find_flight",
      description:
        "Find matching flights from the hard-coded travel catalog. For flight search requests, call this first, then call `show_result` with `Flight` Fractals to display the results.",
      inputSchema: {
        destination: z
          .string()
          .optional()
          .describe("Destination city, such as Tokyo, Paris, London, or Lisbon."),
        origin: z
          .string()
          .optional()
          .describe("Origin city or airport code, such as SF, SFO, SEA, or EWR."),
        airline: z.string().optional().describe("Preferred airline name."),
      },
    },
    async ({ destination, origin, airline }) => {
      const flights = data.flights.filter((flight) => {
        return (
          includesMatch(flight.destination, destination) &&
          locationMatches(flight.origin, origin) &&
          includesMatch(flight.airline, airline)
        );
      });

      return textResult("flights", flights);
    },
  )
  .registerTool(
    {
      name: "find_hotel",
      description:
        "Find matching hotels from the hard-coded travel catalog. For hotel or trip-planning requests, call this before `show_result` so the final UI can include `Hotel` Fractals.",
      inputSchema: {
        destination: z
          .string()
          .optional()
          .describe("Destination city, such as Tokyo, Paris, London, or Lisbon."),
        location: z
          .string()
          .optional()
          .describe("Neighborhood or area preference."),
        amenity: z
          .string()
          .optional()
          .describe("Amenity to look for, such as breakfast or rooftop."),
      },
    },
    async ({ destination, location, amenity }) => {
      const hotels = data.hotels.filter((hotel) => {
        return (
          includesMatch(hotel.destination, destination) &&
          includesMatch(hotel.location, location) &&
          (!amenity ||
            hotel.amenities.some((item) => includesMatch(item, amenity)))
        );
      });

      return textResult("hotels", hotels);
    },
  )
  .registerTool(
    {
      name: "find_tour",
      description:
        "Find matching tours from the hard-coded travel catalog. For tour or trip-planning requests, call this before `show_result` so the final UI can include `Tour` Fractals.",
      inputSchema: {
        destination: z
          .string()
          .optional()
          .describe("Destination city, such as Tokyo, Paris, London, or Lisbon."),
        intensity: z
          .enum(["easy", "moderate", "active"])
          .optional()
          .describe("Desired activity level."),
        keyword: z
          .string()
          .optional()
          .describe("Keyword to match in tour names or highlights."),
      },
    },
    async ({ destination, intensity, keyword }) => {
      const tours = data.tours.filter((tour) => {
        return (
          includesMatch(tour.destination, destination) &&
          (!intensity || tour.intensity === intensity) &&
          (!keyword ||
            includesMatch(tour.name, keyword) ||
            tour.highlights.some((item) => includesMatch(item, keyword)))
        );
      });

      return textResult("tours", tours);
    },
  )
  .registerFractal({
    name: "Flight",
    component: "Flight",
    description:
      "A flight result card with airline, route, departure, arrival, duration, stops, cabin, price, and a book flight button.",
    propsSchema: {
      airline: z.string(),
      route: z.string(),
      depart: z.string(),
      arrive: z.string(),
      duration: z.string(),
      price: z.string(),
      stops: z.string().optional(),
      cabin: z.string().optional(),
    },
  })
  .registerFractal({
    name: "Hotel",
    component: "Hotel",
    description:
      "A hotel result card with location, nightly rate, rating, vibe, amenities, and a book hotel button.",
    propsSchema: {
      name: z.string(),
      location: z.string(),
      nightlyRate: z.string(),
      rating: z.string(),
      vibe: z.string(),
      amenities: z.array(z.string()).optional(),
    },
  })
  .registerFractal({
    name: "Tour",
    component: "Tour",
    description:
      "A tour result card with location, duration, price, intensity, highlights, and a book tour button.",
    propsSchema: {
      name: z.string(),
      location: z.string(),
      duration: z.string(),
      price: z.string(),
      intensity: z.enum(["easy", "moderate", "active"]).optional(),
      highlights: z.array(z.string()).optional(),
    },
  })
  .registerFractal({
    name: "TravelPlan",
    component: "TravelPlan",
    description:
      "A trip plan summary with destination, trip length, budget, overview, and day-by-day items.",
    propsSchema: {
      title: z.string(),
      destination: z.string(),
      days: z.number(),
      budget: z.string(),
      summary: z.string(),
      items: z
        .array(
          z.object({
            day: z.string(),
            title: z.string(),
            body: z.string(),
          }),
        )
        .optional(),
    },
  });

server.run();

export type AppType = typeof server;
