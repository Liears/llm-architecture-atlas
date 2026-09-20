import { describe, expect, it } from "vitest";
import { nodePortAnchors } from "./ports.js";

describe("nodePortAnchors", () => {
  it("distributes declared ports on all four sides", () => {
    const anchors = nodePortAnchors(
      { x: 10, y: 20, w: 120, h: 80 },
      false,
      {
        ports: [
          { name: "west", side: "left" },
          { name: "east", side: "right" },
          { name: "north-1", side: "top" },
          { name: "north-2", side: "top" },
          { name: "south", side: "bottom" },
        ],
      },
    );

    expect(anchors.west).toEqual({ x: 10, y: 60 });
    expect(anchors.east).toEqual({ x: 130, y: 60 });
    expect(anchors["north-1"]).toEqual({ x: 50, y: 20 });
    expect(anchors["north-2"]).toEqual({ x: 90, y: 20 });
    expect(anchors.south).toEqual({ x: 70, y: 100 });
  });
});
