import { Note } from "../models/Note";

export interface INoteRepository {
  getById(id: string): Promise<Note | undefined>;
  getAll(): Promise<Note[]>;
  create(note: Omit<Note, "id" | "createdAt" | "updatedAt">): Promise<Note>;
  update(id: string, note: Partial<Note>): Promise<Note>;
  delete(id: string): Promise<void>;
}
