/** Groq/OpenAI‑compatible JSON‑Schema for Orgo actions */
export const computerTool = {
  type: "function",
  function: {
    name: "computer_action",
    description:
      "Execute computer actions on the shared Orgo desktop (1024x768 pixels). Use this function to interact with the computer by clicking, typing, scrolling, taking screenshots, or waiting. IMPORTANT: For key actions, press only ONE key at a time (e.g., 'a', 'enter', 'space'). Do NOT use shortcuts like 'ctrl+c', 'command+w', or 'alt+tab'. Coordinate clicks within the 1024x768 display area.",
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
          description: "X,Y pixel coordinates for click actions within 1024x768 display (e.g., [100, 200])",
        },
        text: { 
          type: "string",
          description: "Text to type or single key to press (e.g., 'a', 'enter', 'space'). Do not use shortcuts like 'ctrl+c' or 'command+w' - press only one key at a time."
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

/** Cerebras tool schema for computer actions */
export const cerebrasComputerTool = {
  type: "function",
  function: {
    name: "computer_action",
    strict: true,
    description:
      "Execute computer actions on the shared Orgo desktop (1024x768 pixels). Use this function to interact with the computer by clicking, typing, scrolling, taking screenshots, or waiting. IMPORTANT: For key actions, press only ONE key at a time (e.g., 'a', 'enter', 'space'). Do NOT use shortcuts like 'ctrl+c', 'command+w', or 'alt+tab'. Coordinate clicks within the 1024x768 display area.",
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
          prefixItems: [
            { type: "number", description: "X coordinate (0-1023)" },
            { type: "number", description: "Y coordinate (0-767)" }
          ],
          description: "X,Y pixel coordinates for click actions within 1024x768 display (e.g., [100, 200])",
        },
        text: { 
          type: "string",
          description: "Text to type or single key to press (e.g., 'a', 'enter', 'space'). Do not use shortcuts like 'ctrl+c' or 'command+w' - press only one key at a time."
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
            description: "X,Y pixel coordinates for click actions within 1024x768 display (e.g., [100, 200]). X range: 0-1023, Y range: 0-767.",
          },
          text: { 
            type: "string",
            description: "Text to type or single key to press (e.g., 'a', 'enter', 'space'). Do not use shortcuts like 'ctrl+c' or 'command+w' - press only one key at a time."
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
        // Validate and clean the key value - check both text and key fields
        console.log("🔑 Key action received args:", JSON.stringify(args, null, 2))
        const keyValue = (args.text || args.key)?.toString()?.trim();
        if (!keyValue) {
          console.error("❌ No key value found in args:", args)
          throw new Error("Key value is required");
        }
        console.log("✅ Using key value:", keyValue)
        
        // Map common key names to valid Orgo keys
        const keyMap: { [key: string]: string } = {
          'enter': 'Enter',
          'space': ' ',
          'tab': 'Tab',
          'escape': 'Escape',
          'backspace': 'Backspace',
          'delete': 'Delete',
          'arrowup': 'ArrowUp',
          'arrowdown': 'ArrowDown',
          'arrowleft': 'ArrowLeft',
          'arrowright': 'ArrowRight',
          'home': 'Home',
          'end': 'End',
          'pageup': 'PageUp',
          'pagedown': 'PageDown'
        };
        
        const mappedKey = keyMap[keyValue.toLowerCase()] || keyValue;
        
        try {
          await computer.key(mappedKey);
          return { 
            type: "tool_result",
            action: "key", 
            key: mappedKey 
          };
        } catch (keyError) {
          console.error(`Failed to press key '${mappedKey}':`, keyError);
          // Fallback to type if key fails
          await computer.type(mappedKey);
          return { 
            type: "tool_result",
            action: "key", 
            key: mappedKey,
            fallback: "used type instead"
          };
        }

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