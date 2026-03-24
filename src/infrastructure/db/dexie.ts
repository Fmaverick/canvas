import Dexie, { Table } from "dexie";
import { Note } from "../../domain/models/Note";

export class CanvasDatabase extends Dexie {
  notes!: Table<Note, string>; // uuid string as primary key

  constructor() {
    super("CanvasDatabase");
    this.version(1).stores({
      notes: "id, title, createdAt",
    });
  }
}

export const db = new CanvasDatabase();
