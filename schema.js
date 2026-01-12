export const causeDescriptionSchema = {
  name: "CauseDescription",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      short_description: { type: "string" },
      long_description: { type: "string" },
      tags: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 6
      },
      location: {
        anyOf: [{ type: "string" }, { type: "null" }]
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      evidence: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            claim: { type: "string" },
            source_url: { type: "string" }
          },
          required: ["claim", "source_url"]
        },
        minItems: 2,
        maxItems: 8
      }
    },
    required: [
      "short_description",
      "long_description",
      "tags",
      "location",
      "confidence",
      "evidence"
    ]
  }
};
