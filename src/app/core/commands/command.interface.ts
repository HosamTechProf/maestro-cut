// =============================================================================
// Edit Command Interface — Command Pattern for Undo/Redo
// =============================================================================
// Every state mutation in the editor (whether from UI interaction or AI)
// is encapsulated as an EditCommand. This enables:
//   1. Full undo/redo support
//   2. Batch operations (AI commands grouped as one undoable action)
//   3. Operation logging and debugging
//   4. Pure function state transitions (no side effects)
// =============================================================================

import { ProjectState } from '../models/project-state.model';

/**
 * Base interface for all editor commands.
 * Commands are immutable — they capture all necessary data at creation time.
 */
export interface EditCommand {
  /** Unique type identifier for the command (e.g., 'TRIM_CLIP'). */
  readonly type: string;

  /** Human-readable description for the undo history UI. */
  readonly description: string;

  /** Apply the mutation to the state. Returns a new state object. */
  execute(state: ProjectState): ProjectState;

  /** Reverse the mutation. Returns the state as it was before execution. */
  undo(state: ProjectState): ProjectState;
}

/**
 * A composite command that groups multiple commands into one undoable unit.
 * Used for AI batch operations where a single prompt produces multiple edits.
 */
export class BatchCommand implements EditCommand {
  readonly type = 'BATCH';
  readonly description: string;

  constructor(
    private readonly commands: readonly EditCommand[],
    description?: string,
  ) {
    this.description = description ?? `Batch: ${commands.length} operations`;
  }

  execute(state: ProjectState): ProjectState {
    return this.commands.reduce(
      (currentState, cmd) => cmd.execute(currentState),
      state,
    );
  }

  undo(state: ProjectState): ProjectState {
    // Undo in reverse order
    return [...this.commands].reverse().reduce(
      (currentState, cmd) => cmd.undo(currentState),
      state,
    );
  }

  /** Get the individual commands in this batch. */
  getCommands(): readonly EditCommand[] {
    return this.commands;
  }
}
