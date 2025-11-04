import { describe, test, expect } from "bun:test";
import { __test__ } from "./replicate";

describe("replicate image-input detection", () => {
  test("detects array image_input from schema", () => {
    const modelData = {
      latest_version: {
        openapi_schema: {
          components: {
            schemas: {
              Input: {
                properties: {
                  image_input: {
                    type: "array",
                    items: { type: "string", format: "uri" },
                    description: "Reference image(s) to guide generation",
                  },
                },
              },
            },
          },
        },
      },
    } as unknown as Record<string, unknown>;

    const res = __test__.detectImageInputFromSchema(modelData);
    expect(res).toEqual({ paramName: "image_input", isArray: true });
  });

  test("detects single image field from schema", () => {
    const modelData = {
      latest_version: {
        openapi_schema: {
          components: {
            schemas: {
              Input: {
                properties: {
                  image: { type: "string", format: "uri", description: "image" },
                },
              },
            },
          },
        },
      },
    } as unknown as Record<string, unknown>;

    const res = __test__.detectImageInputFromSchema(modelData);
    expect(res).toEqual({ paramName: "image", isArray: false });
  });

  test("maps Seedream to image_input file[]", () => {
    const res = __test__.getImageInputConfig("someorg/seedream-4");
    expect(res).toEqual({ paramName: "image_input", isArray: true });
  });
});

