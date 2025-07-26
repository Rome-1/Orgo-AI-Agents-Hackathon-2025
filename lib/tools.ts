/** Groq/OpenAI‑compatible JSON‑Schema for Orgo actions */
export const computerTool = {
  type: "function",
  function: {
    name: "computer_action",
    description:
      "Execute computer actions on the shared Orgo desktop. Use this function to interact with the computer by clicking, typing, scrolling, taking screenshots, or waiting.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "screenshot",
            "left_click",
            "right_click",
            "double_click",
            "type",
            "key",
            "scroll",
            "wait",
          ],
          description: "The type of action to perform on the computer"
        },
        coordinate: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2,
          description: "X,Y pixel coordinates for click actions (e.g., [100, 200])",
        },
        text: { 
          type: "string",
          description: "Text to type or key to press"
        },
        scroll_direction: {
          type: "string",
          enum: ["up", "down", "left", "right"],
          description: "Direction to scroll"
        },
        scroll_amount: { 
          type: "number",
          description: "Amount to scroll (number of pixels or lines)"
        },
        duration: {
          type: "number",
          description: "Duration to wait in seconds (must be a number, not a string)"
        },
      },
      required: ["action"],
    },
  },
} as const;

/** Structured output schema for Groq to generate computer actions */
export const computerActionSchema = {
  name: "computer_actions",
  schema: {
    type: "object",
    properties: {
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: [
                "screenshot",
                "left_click",
                "right_click",
                "double_click",
                "type",
                "key",
                "scroll",
                "wait",
              ],
              description: "The type of action to perform on the computer"
            },
            coordinate: {
              type: "array",
              items: { type: "number" },
              minItems: 2,
              maxItems: 2,
              description: "X,Y pixel coordinates for click actions (e.g., [100, 200])",
            },
            text: { 
              type: "string",
              description: "Text to type or key to press"
            },
            scroll_direction: {
              type: "string",
              enum: ["up", "down", "left", "right"],
              description: "Direction to scroll"
            },
            scroll_amount: { 
              type: "number",
              description: "Amount to scroll (number of pixels or lines)"
            },
            duration: {
              type: "number",
              description: "Duration to wait in seconds (must be a number, not a string)"
            },
          },
          required: ["action"],
          additionalProperties: false
        },
        description: "Array of computer actions to execute"
      },
      reasoning: {
        type: "string",
        description: "Brief explanation of what actions are being taken and why"
      }
    },
    required: ["actions"],
    additionalProperties: false
  }
} as const;

/** Execute a computer action and return the result */
export async function execTool(computer: any, args: any) {
  try {
    // Coerce duration to number if it's a string
    if (args.duration && typeof args.duration === 'string') {
      args.duration = parseFloat(args.duration);
    }

    // Coerce coordinates to numbers if they're strings
    if (args.coordinate && Array.isArray(args.coordinate)) {
      args.coordinate = args.coordinate.map((coord: any) => 
        typeof coord === 'string' ? parseFloat(coord) : coord
      );
    }

    switch (args.action) {
      case "screenshot":
        const screenshot = await computer.screenshotBase64();
        return { 
          type: "tool_result",
          action: "screenshot", 
          result: { type: "image", data: screenshot } 
        };

      case "left_click":
        await computer.leftClick(args.coordinate[0], args.coordinate[1]);
        return { 
          type: "tool_result",
          action: "left_click", 
          coordinate: args.coordinate 
        };

      case "right_click":
        await computer.rightClick(args.coordinate[0], args.coordinate[1]);
        return { 
          type: "tool_result",
          action: "right_click", 
          coordinate: args.coordinate 
        };

      case "double_click":
        await computer.doubleClick(args.coordinate[0], args.coordinate[1]);
        return { 
          type: "tool_result",
          action: "double_click", 
          coordinate: args.coordinate 
        };

      case "type":
        await computer.type(args.text);
        return { 
          type: "tool_result",
          action: "type", 
          text: args.text 
        };

      case "key":
        await computer.key(args.text);
        return { 
          type: "tool_result",
          action: "key", 
          key: args.text 
        };

      case "scroll":
        await computer.scroll(args.scroll_direction, args.scroll_amount);
        return { 
          type: "tool_result",
          action: "scroll", 
          direction: args.scroll_direction,
          amount: args.scroll_amount
        };

      case "wait":
        await computer.wait(args.duration || 1);
        return { 
          type: "tool_result",
          action: "wait", 
          duration: args.duration 
        };

      default:
        throw new Error(`Unknown action: ${args.action}`);
    }
  } catch (error) {
    console.error("Failed to execute tool action:", error);
    return { 
      type: "tool_result",
      action: args.action,
      error: String(error)
    };
  }
} 