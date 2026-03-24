import { create } from "zustand";
import { Note } from "../../domain/models/Note";
import { INoteRepository } from "../../domain/repositories/INoteRepository";
import { DexieNoteRepository } from "../../infrastructure/repositories/DexieNoteRepository";

interface NoteState {
  notes: Note[];
  isLoading: boolean;
  error: string | null;
  loadNotes: () => Promise<void>;
  addNote: (note: Omit<Note, "id" | "createdAt" | "updatedAt">) => Promise<void>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

// In a real application, you might use a DI container here
// For now, we instantiate the default Dexie repository.
// You can easily change this to `new ApiNoteRepository()` in the future.
const noteRepository: INoteRepository = new DexieNoteRepository();

export const useNoteStore = create<NoteState>((set) => ({
  notes: [],
  isLoading: false,
  error: null,

  loadNotes: async () => {
    set({ isLoading: true, error: null });
    try {
      const notes = await noteRepository.getAll();
      set({ notes, isLoading: false });
    } catch (error: unknown) {
      set({ error: getErrorMessage(error), isLoading: false });
    }
  },

  addNote: async (note) => {
    set({ isLoading: true, error: null });
    try {
      const newNote = await noteRepository.create(note);
      set((state) => ({ notes: [...state.notes, newNote], isLoading: false }));
    } catch (error: unknown) {
      set({ error: getErrorMessage(error), isLoading: false });
    }
  },

  updateNote: async (id, updates) => {
    set({ isLoading: true, error: null });
    try {
      const updatedNote = await noteRepository.update(id, updates);
      set((state) => ({
        notes: state.notes.map((n) => (n.id === id ? updatedNote : n)),
        isLoading: false,
      }));
    } catch (error: unknown) {
      set({ error: getErrorMessage(error), isLoading: false });
    }
  },

  deleteNote: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await noteRepository.delete(id);
      set((state) => ({
        notes: state.notes.filter((n) => n.id !== id),
        isLoading: false,
      }));
    } catch (error: unknown) {
      set({ error: getErrorMessage(error), isLoading: false });
    }
  },
}));
