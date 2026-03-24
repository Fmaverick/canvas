import { db } from "../db/dexie";
import { INoteRepository } from "../../domain/repositories/INoteRepository";
import { Note } from "../../domain/models/Note";

export class DexieNoteRepository implements INoteRepository {
  async getById(id: string): Promise<Note | undefined> {
    return await db.notes.get(id);
  }

  async getAll(): Promise<Note[]> {
    return await db.notes.toArray();
  }

  async create(note: Omit<Note, "id" | "createdAt" | "updatedAt">): Promise<Note> {
    const newNote: Note = {
      ...note,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.notes.add(newNote);
    return newNote;
  }

  async update(id: string, updates: Partial<Note>): Promise<Note> {
    const updatedNote = { ...updates, updatedAt: new Date() };
    await db.notes.update(id, updatedNote);
    const result = await this.getById(id);
    if (!result) throw new Error("Note not found after update");
    return result;
  }

  async delete(id: string): Promise<void> {
    await db.notes.delete(id);
  }
}
