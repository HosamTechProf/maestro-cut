// =============================================================================
// Command Manager Service — Undo/Redo Engine
// =============================================================================
// Manages the undo and redo stacks. All state mutations must go through
// this service so they are tracked in the history.
// Exposes signals for canUndo/canRedo and descriptive labels.
// =============================================================================

import { Injectable, signal, computed } from '@angular/core';
import { EditCommand } from '../commands/command.interface';
import { ProjectState } from '../models/project-state.model';

/** Maximum number of undo steps to keep in memory. */
const MAX_UNDO_STACK_SIZE = 100;

@Injectable({ providedIn: 'root' })
export class CommandManagerService {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  private readonly _undoStack = signal<EditCommand[]>([]);
  private readonly _redoStack = signal<EditCommand[]>([]);

  // ---------------------------------------------------------------------------
  // Public Readonly Signals
  // ---------------------------------------------------------------------------

  /** Whether an undo operation is available. */
  readonly canUndo = computed(() => this._undoStack().length > 0);

  /** Whether a redo operation is available. */
  readonly canRedo = computed(() => this._redoStack().length > 0);

  /** Number of operations in the undo history. */
  readonly undoCount = computed(() => this._undoStack().length);

  /** Number of operations in the redo history. */
  readonly redoCount = computed(() => this._redoStack().length);

  /** Description of the next undo operation (for tooltip). */
  readonly undoDescription = computed(() => {
    const stack = this._undoStack();
    return stack.length > 0 ? stack[stack.length - 1].description : '';
  });

  /** Description of the next redo operation (for tooltip). */
  readonly redoDescription = computed(() => {
    const stack = this._redoStack();
    return stack.length > 0 ? stack[stack.length - 1].description : '';
  });

  /** The full undo history (most recent first) for UI display. */
  readonly undoHistory = computed(() => [...this._undoStack()].reverse());

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  /**
   * Execute a command and push it to the undo stack.
   * Clears the redo stack (new action invalidates redo history).
   * Returns the new state after execution.
   */
  execute(command: EditCommand, state: ProjectState): ProjectState {
    const newState = command.execute(state);

    this._undoStack.update((stack) => {
      const newStack = [...stack, command];
      // Trim the stack if it exceeds max size
      if (newStack.length > MAX_UNDO_STACK_SIZE) {
        return newStack.slice(newStack.length - MAX_UNDO_STACK_SIZE);
      }
      return newStack;
    });

    // Clear redo stack — new action invalidates future history
    this._redoStack.set([]);

    return newState;
  }

  /**
   * Undo the most recent command.
   * Returns the state after undoing, or null if nothing to undo.
   */
  undo(state: ProjectState): ProjectState | null {
    const stack = this._undoStack();
    if (stack.length === 0) return null;

    const command = stack[stack.length - 1];
    const newState = command.undo(state);

    // Move command from undo to redo stack
    this._undoStack.update((s) => s.slice(0, -1));
    this._redoStack.update((s) => [...s, command]);

    return newState;
  }

  /**
   * Redo the most recently undone command.
   * Returns the state after redoing, or null if nothing to redo.
   */
  redo(state: ProjectState): ProjectState | null {
    const stack = this._redoStack();
    if (stack.length === 0) return null;

    const command = stack[stack.length - 1];
    const newState = command.execute(state);

    // Move command from redo back to undo stack
    this._redoStack.update((s) => s.slice(0, -1));
    this._undoStack.update((s) => [...s, command]);

    return newState;
  }

  /**
   * Clear entire history (used when loading a new project).
   */
  clear(): void {
    this._undoStack.set([]);
    this._redoStack.set([]);
  }
}
