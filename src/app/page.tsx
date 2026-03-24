"use client";

import { useEffect, useState } from "react";
import { useNoteStore } from "@/application/store/useNoteStore";
import { NoteSchema } from "@/domain/models/Note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function Home() {
  const { notes, isLoading, loadNotes, addNote, deleteNote } = useNoteStore();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Zod Validation
    const result = NoteSchema.safeParse({ title, content });
    if (!result.success) {
      toast.error(result.error.issues[0].message);
      return;
    }

    await addNote({ title, content });
    setTitle("");
    setContent("");
    toast.success("Note added!");
  };

  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-4xl font-bold mb-8">Canvas Notes</h1>
      
      <form onSubmit={handleSubmit} className="mb-8 space-y-4">
        <Input 
          placeholder="Note Title" 
          value={title} 
          onChange={(e) => setTitle(e.target.value)} 
        />
        <Textarea 
          placeholder="Note Content" 
          value={content} 
          onChange={(e) => setContent(e.target.value)} 
          rows={4}
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : "Add Note"}
        </Button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {notes.map((note) => (
          <Card key={note.id}>
            <CardHeader>
              <CardTitle>{note.title}</CardTitle>
              <CardDescription>{new Date(note.createdAt!).toLocaleDateString()}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{note.content}</p>
            </CardContent>
            <CardFooter>
              <Button variant="destructive" onClick={() => deleteNote(note.id!)}>Delete</Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {notes.length === 0 && !isLoading && (
        <p className="text-gray-500">No notes found. Create one above!</p>
      )}
    </div>
  );
}
