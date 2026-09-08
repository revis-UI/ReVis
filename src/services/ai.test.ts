import { describe, expect, it, vi } from "vitest";

import { createAIClient } from "./ai";

const editRequest = {
  instruction: "Update the chart description",
  dsl: { description: "Before" },
  viewData: {},
  recentInstructions: [],
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[index];
        index += 1;
        if (chunk === undefined) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(chunk));
      },
    }),
    {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    },
  );
}

describe("AI edit response normalization", () => {
  it("keeps a bounded structured semantic summary beside the Patch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      patch: [
        {
          op: "replace",
          path: "/dsl/description",
          value: "After",
        },
      ],
      summary: {
        title: "  Clarified\u0000 chart purpose  ",
        overview: "Explains   the updated chart intent.",
        changes: [
          { area: "dsl", description: "Updated the chart description." },
          { area: "unknown", description: "Ignored invalid area." },
        ],
      },
    }));
    const client = createAIClient({ fetchImpl, basePath: "/api/ai" });

    await expect(client.chat(editRequest)).resolves.toMatchObject({
      semanticSummary: {
        title: "Clarified chart purpose",
        overview: "Explains the updated chart intent.",
        changes: [
          { area: "dsl", description: "Updated the chart description." },
        ],
      },
    });
  });

  it("keeps a valid legacy Patch when the optional summary is malformed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      patch: [
        {
          op: "replace",
          path: "/dsl/description",
          value: "After",
        },
      ],
      summary: {
        title: "Missing the required semantic fields",
      },
    }));
    const client = createAIClient({ fetchImpl, basePath: "/api/ai" });

    const result = await client.chat(editRequest);

    expect(result.patch).toHaveLength(1);
    expect(result).not.toHaveProperty("semanticSummary");
  });
});

describe("AI live-update stream", () => {
  it("parses fragmented SSE events and returns only the final validated result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        "event: status\ndata: {\"phase\":\"connect",
        "ing\",\"message\":\"Connecting to the model…\"}\n\n",
        "event: status\ndata: {\"phase\":\"generating\",\"message\":\"Drafting a safe Patch…\"}\n\n",
        "event: result\ndata: {\"patch\":[{\"op\":\"replace\",\"path\":\"/dsl/description\",\"value\":\"After\"}]}",
        "\n\nevent: done\ndata: {}\n\n",
      ]),
    );
    const client = createAIClient({ fetchImpl, basePath: "/api/ai" });
    const events: string[] = [];

    await expect(
      client.chat(editRequest, {
        onEvent: (event) => events.push(event.type),
      }),
    ).resolves.toMatchObject({
      patch: [
        { op: "replace", path: "/dsl/description", value: "After" },
      ],
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/ai/chat/stream",
      expect.objectContaining({ method: "POST" }),
    );
    expect(events).toEqual(["status", "status", "result", "done"]);
  });

  it("surfaces an SSE error without accepting a missing result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        "event: error\ndata: {\"status\":504,\"error\":{\"code\":\"UPSTREAM_TIMEOUT\",\"message\":\"The request timed out.\"}}\n\n",
        "event: done\ndata: {}\n\n",
      ]),
    );
    const client = createAIClient({ fetchImpl, basePath: "/api/ai" });

    await expect(
      client.chat(editRequest, { onEvent: vi.fn() }),
    ).rejects.toMatchObject({
      code: "UPSTREAM_TIMEOUT",
      message: "The request timed out.",
      status: 504,
    });
  });

  it("rejects a stream that ends after a result but before done", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        "event: result\ndata: {\"patch\":[{\"op\":\"replace\",\"path\":\"/dsl/description\",\"value\":\"After\"}]}\n\n",
      ]),
    );
    const client = createAIClient({ fetchImpl, basePath: "/api/ai" });

    await expect(
      client.chat(editRequest, { onEvent: vi.fn() }),
    ).rejects.toMatchObject({
      code: "INCOMPLETE_STREAM",
      status: 502,
    });
  });
});
