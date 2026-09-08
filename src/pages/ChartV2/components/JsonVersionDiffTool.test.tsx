import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { commitDocument, migrateDocument } from "../model/document";
import { JsonVersionDiffTool } from "./JsonVersionDiffTool";

const createCommittedDocument = () => {
  const initial = migrateDocument(
    {
      components: null,
      container_id: "0",
      coordinate: "cartesian",
      coordinate_system: { x1: "0", x2: "100", y1: "0", y2: "100" },
      data_specification: null,
      description: "original",
      if_leaf: true,
      mark_type: "rectangle",
      template_data_specification: null,
    },
    {
      now: "2026-01-01T00:00:00.000Z",
      viewData: {
        cache: {
          anchor_point: {},
          link_nodes: {},
          non_property: {},
          size_range: {},
        },
        containers: {
          "0": { container_id: "0", if_leaf: true },
        },
        marks: {
          "0": [{ id: "0__0" }],
        },
      },
    },
  );

  return commitDocument(
    initial,
    { ...initial, description: "updated" },
    {
      id: "entry-1",
      now: "2026-01-02T00:00:00.000Z",
      source: "form",
    },
  ).document;
};

describe("JsonVersionDiffTool", () => {
  it("opens from the toolbar and shows previous and current JSON values", async () => {
    const user = userEvent.setup();
    const chartDocument = createCommittedDocument();
    render(<JsonVersionDiffTool chartDocument={chartDocument} />);

    const trigger = screen.getByRole("button", {
      name: "Open JSON version diff",
    });
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("dialog", { name: "JSON version diff" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Previous · position 0")).toBeInTheDocument();
    expect(screen.getByText("Current · position 1")).toBeInTheDocument();

    const change = screen.getByRole("article", {
      name: "Changed: /description",
    });
    expect(within(change).getByText('"original"')).toBeInTheDocument();
    expect(within(change).getByText('"updated"')).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });

  it("is disabled when the current history position has no previous version", () => {
    const chartDocument = createCommittedDocument();
    chartDocument.history.cursor = 0;

    render(<JsonVersionDiffTool chartDocument={chartDocument} />);

    expect(
      screen.getByRole("button", { name: "Open JSON version diff" }),
    ).toBeDisabled();
  });

  it("shows a reconstruction error instead of comparing against empty JSON", async () => {
    const user = userEvent.setup();
    const chartDocument = createCommittedDocument();
    chartDocument.history.entries[0].inverse_patch = [
      { op: "replace", path: "/missing", value: "unavailable" },
    ];

    render(<JsonVersionDiffTool chartDocument={chartDocument} />);
    await user.click(
      screen.getByRole("button", { name: "Open JSON version diff" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /unable to reconstruct the previous version/i,
    );
  });
});
