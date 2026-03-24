import { z } from "zod";

export const NoteSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, "Title is required"),
  content: z.string(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export type Note = z.infer<typeof NoteSchema>;
