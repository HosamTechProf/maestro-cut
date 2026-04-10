// =============================================================================
// Gemini AI Proxy — Main Process
// =============================================================================
// Proxies AI requests from the renderer through the main process so the
// API key never touches the renderer (browser context).
// Uses the @google/genai unified SDK with structured JSON output.
// =============================================================================

const SYSTEM_PROMPT = `You are an expert NLE (Non-Linear Video Editor) AI assistant embedded in a desktop video editing application. Your job is to translate natural language editing instructions into structured JSON commands that the editor can execute.

## Your Capabilities
You can perform these editing actions on clips in the timeline:
- **trim**: Change a clip's in-point and out-point (values in seconds relative to source)
- **split**: Split a clip at a specific time (seconds relative to source)
- **delete**: Remove a clip entirely
- **mute**: Mute a clip's audio
- **unmute**: Unmute a clip's audio
- **setVolume**: Set a clip's volume (0.0 to 1.0)
- **applyFilter**: Apply a visual filter with params:
  - brightness (value: -1.0 to 1.0)
  - contrast (value: 0.0 to 3.0)
  - saturation (value: 0.0 to 3.0)
  - hue-rotate (value: 0 to 360, in degrees)
  - blur (radius: 0 to 20, in pixels)
  - grayscale (amount: 0.0 to 1.0)
  - sepia (amount: 0.0 to 1.0)
  - invert (amount: 0.0 to 1.0)
- **removeFilter**: Remove an existing filter by ID
- **setPlaybackRate**: Change playback speed (0.25 to 4.0)
- **reorder**: Move a clip to a different start time on the timeline
- **setOpacity**: Set a clip's visual opacity (0.0 to 1.0)
- **addTrack**: Add a new video or audio track

## Context
You will receive the current timeline state as context, including all clips with their properties. Use clip IDs from the context when referencing specific clips.

## Rules
1. ALWAYS return valid JSON matching the schema below
2. Use clip IDs from the provided context — never invent IDs
3. If the user's request is ambiguous, make reasonable assumptions and explain them
4. If the user asks about something you cannot do, return empty commands and explain why
5. Time values are always in seconds
6. When the user says "the first clip", use the clip with the smallest startTime
7. When the user says "all clips", generate a command for each clip
8. For "trim the first N seconds", set inPoint to N (removing from the beginning)
9. For "trim the last N seconds", set outPoint to (outPoint - N)

## Response Schema
Return a JSON object with exactly these fields:
{
  "commands": [
    {
      "action": "trim|split|delete|mute|unmute|setVolume|applyFilter|removeFilter|setPlaybackRate|reorder|setOpacity|addTrack",
      ...action-specific fields
    }
  ],
  "explanation": "Brief human-readable explanation of what you did"
}

### Action-specific fields:
- trim: { clipId, inPoint, outPoint }
- split: { clipId, splitTime }
- delete: { clipId }
- mute: { clipId }
- unmute: { clipId }
- setVolume: { clipId, volume }
- applyFilter: { clipId, filterType, params: { key: value } }
- removeFilter: { clipId, filterId }
- setPlaybackRate: { clipId, rate }
- reorder: { clipId, newStartTime }
- setOpacity: { clipId, opacity }
- addTrack: { trackType: "video"|"audio", name }`;

class GeminiProxy {
  constructor() {
    this.client = null;
    this.model = null;
  }

  /**
   * Initialize the Gemini client.
   */
  async initialize() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      throw new Error(
        'GEMINI_API_KEY is not configured. Please set it in the .env file.'
      );
    }

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    // Dynamic import of the @google/genai SDK
    const { GoogleGenAI } = await import('@google/genai');
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
  }

  /**
   * Send a prompt with timeline context and get structured commands back.
   */
  async prompt(userPrompt, timelineContext) {
    if (!this.client) {
      await this.initialize();
    }

    // Build the user message with context
    const contextString = JSON.stringify(timelineContext, null, 2);
    const fullPrompt = `## Current Timeline State
\`\`\`json
${contextString}
\`\`\`

## User Request
${userPrompt}

Respond with a JSON object containing "commands" array and "explanation" string.`;

    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: fullPrompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: 'application/json',
          temperature: 0.1,     // Low temperature for predictable commands
          maxOutputTokens: 2048,
        },
      });

      const text = response.text;
      if (!text) {
        return {
          commands: [],
          explanation: 'No response from AI model.',
        };
      }

      // Parse and validate the JSON response
      const parsed = JSON.parse(text);

      // Validate structure
      if (!parsed.commands || !Array.isArray(parsed.commands)) {
        return {
          commands: [],
          explanation: parsed.explanation || 'AI returned an invalid response format.',
        };
      }

      // Validate each command has required fields
      const validCommands = parsed.commands.filter((cmd) => {
        if (!cmd.action) return false;
        const validActions = [
          'trim', 'split', 'delete', 'mute', 'unmute', 'setVolume',
          'applyFilter', 'removeFilter', 'setPlaybackRate', 'reorder',
          'setOpacity', 'addTrack',
        ];
        return validActions.includes(cmd.action);
      });

      return {
        commands: validCommands,
        explanation: parsed.explanation || 'Commands generated successfully.',
      };
    } catch (err) {
      console.error('[GeminiProxy] Error:', err);

      // Handle specific error types
      if (err.message?.includes('API key')) {
        return {
          commands: [],
          explanation: 'Invalid API key. Please check your GEMINI_API_KEY in .env',
        };
      }

      if (err instanceof SyntaxError) {
        return {
          commands: [],
          explanation: 'AI returned malformed JSON. Please try rephrasing your request.',
        };
      }

      return {
        commands: [],
        explanation: `AI error: ${err.message}`,
      };
    }
  }
}

module.exports = { GeminiProxy };
