import { describe, expect, it } from "bun:test";
import {
  detectAspectRatioSupport,
  detectImageInput,
  getGuidanceParameter,
  getMaxOutputs,
  getSeedParameter,
  getStepsParameter,
  getSupportedAspectRatios,
  type ReplicateModelSchema,
  sortPropertiesByOrder,
  supportsMultipleOutputs,
  supportsNegativePrompt,
} from "./replicate-schema";

describe("detectImageInput", () => {
  it("should detect standard image input (string/uri)", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                image: {
                  type: "string",
                  format: "uri",
                  description: "Input image",
                } as any,
              },
            },
          },
        },
      },
    };

    const result = detectImageInput(schema);
    expect(result).toEqual({
      paramName: "image",
      isArray: false,
      isMessage: false,
    });
  });

  it("should detect standard image input (string/binary)", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                input_image: {
                  type: "string",
                  format: "binary",
                  description: "Input image",
                } as any,
              },
            },
          },
        },
      },
    };

    const result = detectImageInput(schema);
    expect(result).toEqual({
      paramName: "input_image",
      isArray: false,
      isMessage: false,
    });
  });

  it("should detect array of images (string/uri)", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                image_inputs: {
                  type: "array",
                  items: {
                    type: "string",
                    format: "uri",
                  } as any,
                  description: "Input images",
                } as any,
              },
            },
          },
        },
      },
    };

    const result = detectImageInput(schema);
    expect(result).toEqual({
      paramName: "image_inputs",
      isArray: true,
      isMessage: false,
    });
  });

  // Reproduction for Nano Banana (suspected schema)
  it("should detect array of images with complex items (Nano Banana)", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                image_input: {
                  type: "array",
                  items: {
                    // Missing explicit type: string, or using a $ref
                    description: "An image file",
                    // Simulating what might be there if it's not a simple string
                    anyOf: [{ type: "string" }, { type: "object" }],
                  } as any,
                  description: "Input images for editing",
                } as any,
              },
            },
          },
        },
      },
    };

    const result = detectImageInput(schema);
    expect(result).toEqual({
      paramName: "image_input",
      isArray: true,
      isMessage: false,
    });
  });

  // Reproduction for Qwen (suspected schema)
  it("should detect image input in messages (Qwen)", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                messages: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      role: { type: "string" },
                      content: {
                        oneOf: [
                          { type: "string" },
                          {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                type: { type: "string" },
                                image: { type: "string", format: "uri" },
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                  description: "Conversation messages",
                } as any,
              },
            },
          },
        },
      },
    };

    const result = detectImageInput(schema);
    expect(result).toEqual({
      paramName: "messages",
      isArray: false,
      isMessage: true,
    });
  });
});

describe("detectAspectRatioSupport", () => {
  it("should detect aspect_ratio parameter", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                aspect_ratio: { type: "string" } as any,
              },
            },
          },
        },
      },
    };
    expect(detectAspectRatioSupport(schema)).toBe("aspect_ratio");
  });

  it("should detect width/height parameters", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                width: { type: "integer" } as any,
                height: { type: "integer" } as any,
              },
            },
          },
        },
      },
    };
    expect(detectAspectRatioSupport(schema)).toBe("dimensions");
  });

  it("should return none if neither present", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                prompt: { type: "string" } as any,
              },
            },
          },
        },
      },
    };
    expect(detectAspectRatioSupport(schema)).toBe("none");
  });
});

describe("getSupportedAspectRatios", () => {
  it("should return enum values if present", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                aspect_ratio: {
                  type: "string",
                  enum: ["1:1", "16:9"],
                } as any,
              },
            },
          },
        },
      },
    };
    expect(getSupportedAspectRatios(schema)).toEqual(["1:1", "16:9"]);
  });

  it("should return default ratios if aspect_ratio exists but no enum", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                aspect_ratio: { type: "string" } as any,
              },
            },
          },
        },
      },
    };
    expect(getSupportedAspectRatios(schema)).toEqual([
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
    ]);
  });

  it("should return null if aspect_ratio parameter missing", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {},
            },
          },
        },
      },
    };
    expect(getSupportedAspectRatios(schema)).toBeNull();
  });
});

describe("supportsMultipleOutputs", () => {
  it("should detect num_outputs support", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                num_outputs: { type: "integer", maximum: 4 } as any,
              },
            },
          },
        },
      },
    };
    expect(supportsMultipleOutputs(schema)).toBe(true);
  });

  it("should detect batch_size support", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                batch_size: { type: "integer", maximum: 4 } as any,
              },
            },
          },
        },
      },
    };
    expect(supportsMultipleOutputs(schema)).toBe(true);
  });

  it("should return false if max is 1", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                num_outputs: { type: "integer", maximum: 1 } as any,
              },
            },
          },
        },
      },
    };
    expect(supportsMultipleOutputs(schema)).toBe(false);
  });
});

describe("getMaxOutputs", () => {
  it("should return maximum from num_outputs", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                num_outputs: { type: "integer", maximum: 8 } as any,
              },
            },
          },
        },
      },
    };
    expect(getMaxOutputs(schema)).toBe(8);
  });

  it("should return default 4 if parameter exists but no max", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                num_outputs: { type: "integer" } as any,
              },
            },
          },
        },
      },
    };
    expect(getMaxOutputs(schema)).toBe(4);
  });

  it("should return 1 if no parameter", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {},
            },
          },
        },
      },
    };
    expect(getMaxOutputs(schema)).toBe(1);
  });
});

describe("supportsNegativePrompt", () => {
  it("should return true if negative_prompt exists", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                negative_prompt: { type: "string" } as any,
              },
            },
          },
        },
      },
    };
    expect(supportsNegativePrompt(schema)).toBe(true);
  });

  it("should return false if missing", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {},
            },
          },
        },
      },
    };
    expect(supportsNegativePrompt(schema)).toBe(false);
  });
});

describe("getStepsParameter", () => {
  it("should find num_inference_steps", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                num_inference_steps: {
                  type: "integer",
                  minimum: 1,
                  maximum: 100,
                  default: 50,
                } as any,
              },
            },
          },
        },
      },
    };
    const param = getStepsParameter(schema);
    expect(param?.name).toBe("num_inference_steps");
    expect(param?.max).toBe(100);
    expect(param?.default).toBe(50);
  });

  it("should find steps alias", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                steps: { type: "integer" } as any,
              },
            },
          },
        },
      },
    };
    expect(getStepsParameter(schema)?.name).toBe("steps");
  });
});

describe("getGuidanceParameter", () => {
  it("should find guidance_scale", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                guidance_scale: {
                  type: "number",
                  minimum: 1,
                  maximum: 20,
                  default: 7.5,
                } as any,
              },
            },
          },
        },
      },
    };
    const param = getGuidanceParameter(schema);
    expect(param?.name).toBe("guidance_scale");
    expect(param?.max).toBe(20);
    expect(param?.default).toBe(7.5);
  });
});

describe("getSeedParameter", () => {
  it("should find seed parameter", () => {
    const schema: ReplicateModelSchema = {
      openapi_schema: {
        components: {
          schemas: {
            Input: {
              properties: {
                seed: { type: "integer" } as any,
              },
            },
          },
        },
      },
    };
    expect(getSeedParameter(schema)?.name).toBe("seed");
  });
});

describe("sortPropertiesByOrder", () => {
  it("should sort properties by x-order", () => {
    const properties = {
      second: { type: "string", "x-order": 2 } as any,
      first: { type: "string", "x-order": 1 } as any,
      last: { type: "string", "x-order": 10 } as any,
      unknown: { type: "string" } as any, // Should be last
    };

    const sorted = sortPropertiesByOrder(properties);
    expect(sorted[0][0]).toBe("first");
    expect(sorted[1][0]).toBe("second");
    expect(sorted[2][0]).toBe("last");
    expect(sorted[3][0]).toBe("unknown");
  });
});
