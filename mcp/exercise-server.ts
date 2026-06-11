#!/usr/bin/env -S npx tsx
/**
 * TutorRoom exercise-catalog MCP server (stdio).
 *
 * Exposes one tool, `get_exercise_catalog`, returning the homework exercise-type
 * catalog enriched with pedagogical metadata (didactic stage, control level,
 * CEFR range, skills, cognitive budget) plus the embeddable pedagogy rubric.
 *
 * The agent wires this in over stdio via @google/adk's MCPToolset
 * (see lib/agent/run.ts, behind env MCP_ENABLED!=='0'). Run standalone with:
 *   npx tsx mcp/exercise-server.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getExerciseCatalogPayload } from "@/lib/agent/exercise-catalog";

const server = new McpServer({
  name: "tutorroom-exercises",
  version: "1.0.0",
});

server.registerTool(
  "get_exercise_catalog",
  {
    title: "Get exercise catalog",
    description:
      "Returns the catalog of interactive exercise types TutorRoom can generate (with their didactic stage, control level, CEFR range, skills, and cognitive budget) plus the pedagogy rubric for sequencing a homework set. Call this to answer what exercises you can create and how to order them by level.",
    inputSchema: {},
  },
  async () => {
    const payload = getExerciseCatalogPayload();
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep the process alive; stdio transport runs until the client disconnects.
  process.stderr.write("tutorroom-exercises MCP server ready (stdio)\n");
}

main().catch((err) => {
  process.stderr.write(`tutorroom-exercises MCP server failed: ${err}\n`);
  process.exit(1);
});
