import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createChat } from "@/lib/chats.functions";
import { Sparkles, Code2, PenLine, Search, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: ChatHome,
});

const suggestions = [
  { icon: Lightbulb, title: "Brainstorm ideas", prompt: "Help me brainstorm 10 unique startup ideas in AI education for students in emerging markets." },
  { icon: Code2, title: "Debug code", prompt: "Explain why this TypeScript async function returns undefined and how to fix it." },
  { icon: PenLine, title: "Write copy", prompt: "Write a friendly, confident launch email for a new SaaS product under 120 words." },
  { icon: Search, title: "Research", prompt: "Summarize the current state of open-source LLMs vs proprietary ones, with tradeoffs." },
];

function ChatHome() {
  const qc = useQueryClient();
  const createFn = useServerFn(createChat);
  const navigate = useNavigate();
  const createMut = useMutation({
    mutationFn: (title?: string) => createFn({ data: title ? { title } : {} }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["chats"] }); navigate({ to: "/chat/$chatId", params: { chatId: c.id }, search: { prompt: initialPrompt } as any }); },
  });
  let initialPrompt = "";

  return (
    <div className="flex-1 grid place-items-center px-6">
      <div className="max-w-2xl w-full text-center">
        <div className="inline-block h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 grid place-items-center shadow-glow mb-6">
          <Sparkles className="h-6 w-6 text-background" />
        </div>
        <h1 className="font-display text-5xl">What can I help with?</h1>
        <p className="mt-3 text-muted-foreground">Ask anything — coding, research, writing, marketing, or just to think out loud.</p>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
          {suggestions.map(({ icon: Icon, title, prompt }) => (
            <Card key={title} onClick={() => { initialPrompt = prompt; createMut.mutate(title); }}
              className="p-4 cursor-pointer hover:border-primary/40 transition group">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-accent grid place-items-center group-hover:bg-primary/20">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{title}</div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">{prompt}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
