// =============================================================================
// Gemini AI Proxy — Main Process
// =============================================================================
// Proxies AI requests from the renderer through the main process so the
// API key never touches the renderer (browser context).
// Uses the Vercel AI SDK with structured Object Generation (Zod schema).
// =============================================================================

const { generateObject } = require('ai');
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { z } = require('zod');

// Schema Definition for Editor Commands
const commandSchema = z.object({
  commands: z.array(z.object({
    action: z.enum([
      'trim', 'split', 'delete', 'mute', 'unmute', 'setVolume',
      'applyFilter', 'removeFilter', 'setPlaybackRate', 'reorder',
      'setOpacity', 'addTrack'
    ]).describe('The editing action to perform'),
    clipId: z.string().optional().describe('The ID of the clip to target (if applicable)'),
    inPoint: z.number().optional().describe('New in-point in seconds (for trim)'),
    outPoint: z.number().optional().describe('New out-point in seconds (for trim)'),
    splitTime: z.number().optional().describe('Time in seconds to split the clip (for split)'),
    volume: z.number().optional().describe('Volume level from 0.0 to 1.0 (for setVolume)'),
    filterType: z.string().optional().describe('Filter identifier (for applyFilter)'),
    filterId: z.string().optional().describe('Unique ID of the existing filter (for removeFilter)'),
    params: z.record(z.string(), z.union([z.number(), z.string()])).optional().describe('Filter parameters (for applyFilter)'),
    rate: z.number().optional().describe('Playback speed multiplier (for setPlaybackRate)'),
    newStartTime: z.number().optional().describe('New start time on the timeline (for reorder)'),
    opacity: z.number().optional().describe('Visual opacity from 0.0 to 1.0 (for setOpacity)'),
    trackType: z.enum(['video', 'audio']).optional().describe('Track type (for addTrack)'),
    name: z.string().optional().describe('Name of the new track (for addTrack)'),
  })),
  explanation: z.string().describe('A brief, human-readable explanation of what you did')
});

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

## Rules
1. Use clip IDs from the provided context — never invent IDs.
2. If the user's request is ambiguous, make reasonable assumptions and explain them.
3. If the user asks about something you cannot do, return empty commands and explain why.
4. Time values are always in seconds.
5. When the user says "the first clip", use the clip with the smallest startTime.
6. When the user says "all clips", generate a command for each clip.
7. For "trim the first N seconds", set inPoint to N (removing from the beginning).
8. For "trim the last N seconds", set outPoint to (outPoint - N).`;

class GeminiProxy {
  constructor() {
    this.googleProvider = null;
    this.modelName = null;
  }

  /**
   * Initialize the Google AI provider using the Vercel AI SDK.
   */
  initialize() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      throw new Error('GEMINI_API_KEY is not configured. Please set it in the .env file.');
    }

    this.modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.googleProvider = createGoogleGenerativeAI({ apiKey });
  }

  /**
   * Send a prompt with timeline context and get structured commands back.
   */
  async prompt(userPrompt, timelineContext) {
    if (!this.googleProvider) {
      this.initialize();
    }

    // Build the user message with context
    const contextString = JSON.stringify(timelineContext, null, 2);
    const fullPrompt = `## Current Timeline State
\`\`\`json
${contextString}
\`\`\`

## User Request
${userPrompt}`;

    try {
      // Use the powerful generateObject method which guarantees schema adherence
      const { object } = await generateObject({
        model: this.googleProvider(this.modelName),
        system: SYSTEM_PROMPT,
        prompt: fullPrompt,
        schema: commandSchema,
        temperature: 0.1, // Low temperature for deterministic outputs
      });

      // The returned object strictly matches the Zod schema!
      return {
        commands: object.commands,
        explanation: object.explanation || 'Commands generated successfully.',
      };
    } catch (err) {
      console.error('[GeminiProxy] Error:', err.message || err);

      // Distinguish between types of errors for graceful handling
      const message = err.message || '';
      
      // Handle the HTTP 503 / 429 Overload errors specifically
      if (message.includes('high demand') || message.includes('503') || message.includes('429')) {
        return {
          commands: [],
          explanation: 'Google Gemini is currently experiencing high demand. Please try again in a few moments.',
        };
      }

      if (message.includes('API key') || message.includes('fetch failed') || err.status === 400 || err.status === 403) {
        return {
          commands: [],
          explanation: 'API connection failed. Please check your internet connection and GEMINI_API_KEY in .env',
        };
      }

      return {
        commands: [],
        explanation: `AI error: ${message || 'Unknown error occurred while parsing structured response'}`,
      };
    }
  }
}

module.exports = { GeminiProxy };
