import { describe, expect, it } from "vitest";

import { analyzeAIIntent } from "./intent";

describe("analyzeAIIntent", () => {
  it("recognizes a visual DSL adjustment without sending data anywhere", () => {
    const intent = analyzeAIIntent("Make the chart title blue and center it.");

    expect(intent).toMatchObject({
      kind: "visual",
      needsClarification: false,
      title: "Visual refinement",
      targets: [{ area: "dsl" }],
    });
    expect(intent.steps).toEqual([
      "analyzing",
      "connecting",
      "generating",
      "validating",
      "saving",
    ]);
  });

  it("recognizes a combined Chinese data and structure request", () => {
    const intent = analyzeAIIntent("新增一个系列并调整数据字段映射。");

    expect(intent.kind).toBe("mixed");
    expect(intent.targets.map((item) => item.area)).toEqual([
      "dsl",
      "viewData",
    ]);
  });

  it("asks for a concrete editable outcome when the request is vague", () => {
    const intent = analyzeAIIntent("优化一下");

    expect(intent).toMatchObject({
      kind: "clarification",
      needsClarification: true,
    });
    expect(intent.clarification).toMatch(/Name the chart element/i);
  });
});
