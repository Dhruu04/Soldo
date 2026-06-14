import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Send, Volume2, Bot, User, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore, formatEUR, type ChatMessage } from "@/lib/store";
import { useT, useCurrentLang } from "@/lib/i18n";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { generateResponse } from "@/lib/nlpEngine";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, BarChart as ReChartsBar, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "Assistente AI — Soldo" },
      { name: "description", content: "Analisi data-driven in linguaggio naturale sulle vendite, il magazzino e la contabilità." },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  const t = useT();
  const lang = useCurrentLang();
  const store = useStore();
  const chatMessages = useStore((s) => s.chatMessages);
  const addChatMessage = useStore((s) => s.addChatMessage);
  const clearChat = useStore((s) => s.clearChat);
  const [inputValue, setInputValue] = useState("");
  const [speaking, setSpeaking] = useState<string | null>(null);

  const { supported, listening, transcript, start, stop, setTranscript, error } =
    useSpeechRecognition(lang === "it" ? "it-IT" : "en-US");

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Add welcome message on first load (only if chat is empty)
  useEffect(() => {
    if (chatMessages.length === 0) {
      const welcomeText = lang === "it"
        ? "Ciao! Sono l'assistente Soldo. Puoi chiedermi qualsiasi cosa sulle vendite, scorte, spese, profitto, turni e personale — in italiano o inglese, anche in modo informale.\n\nProva: «Quanto ho incassato oggi?» o «Aiuto» per vedere tutto ciò che posso fare."
        : "Hello! I'm your Soldo assistant. Ask me anything about sales, stock, expenses, profit, shifts and staff — in Italian or English, even informally.\n\nTry: 'How much did I earn today?' or 'Help' to see everything I can do.";
      addChatMessage({
        sender: "bot",
        text: welcomeText,
        timestamp: new Date().toISOString(),
      });
    }
  }, []); // Only on mount

  // Handle voice transcript updates
  useEffect(() => {
    if (transcript) {
      setInputValue(transcript);
    }
  }, [transcript]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Voice recognition stop callback to auto-submit
  useEffect(() => {
    if (!listening && transcript.trim()) {
      handleSend(transcript);
      setTranscript("");
    }
  }, [listening]);

  const handleSend = (textToSend?: string) => {
    const text = (textToSend || inputValue).trim();
    if (!text) return;

    // Add user message
    addChatMessage({
      sender: "user",
      text,
      timestamp: new Date().toISOString(),
    });

    setInputValue("");
    setTranscript("");

    // Generate response using the semantic NLP engine
    setTimeout(() => {
      const response = generateResponse(text, store, lang);
      addChatMessage({
        sender: "bot",
        text: response.text,
        timestamp: new Date().toISOString(),
        data: response.data,
        chartType: response.chartType,
      });

      // Auto-speak answer
      speak(response.text);
    }, 300);
  };

  const speak = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    // Strip markdown-like formatting for speech
    const cleanText = text.replace(/[*#•]/g, "").replace(/\n+/g, ". ");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang === "it" ? "it-IT" : "en-US";
    utterance.onstart = () => setSpeaking(text);
    utterance.onend = () => setSpeaking(null);
    utterance.onerror = () => setSpeaking(null);
    window.speechSynthesis.speak(utterance);
  };

  const handleClearChat = () => {
    clearChat();
    // Re-add welcome
    const welcomeText = lang === "it"
      ? "Chat cancellata. Chiedimi qualsiasi cosa!"
      : "Chat cleared. Ask me anything!";
    addChatMessage({
      sender: "bot",
      text: welcomeText,
      timestamp: new Date().toISOString(),
    });
    toast.success(lang === "it" ? "Chat cancellata" : "Chat cleared");
  };

  return (
    <>
      <PageHeader
        title={t("assistant.title")}
        subtitle={t("assistant.subtitle")}
        actions={
          chatMessages.length > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearChat}
              className="h-8 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {lang === "it" ? "Cancella chat" : "Clear chat"}
            </Button>
          ) : null
        }
      />
      
      <div className="flex-1 p-4 md:p-8 max-w-4xl w-full mx-auto flex flex-col overflow-hidden">
        {/* Chat message logs */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-4 pb-4 scrollbar-thin">
          {chatMessages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex gap-3 max-w-[85%]",
                m.sender === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              <div
                className={cn(
                  "h-8 w-8 rounded-full grid place-items-center shrink-0",
                  m.sender === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground border"
                )}
              >
                {m.sender === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>

              <div className="space-y-2">
                <div
                  className={cn(
                    "rounded-2xl px-4 py-3 text-sm shadow-sm relative",
                    m.sender === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-none"
                      : "bg-card border rounded-tl-none text-foreground"
                  )}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{m.text}</p>
                  
                  {m.sender === "bot" && (
                    <button
                      onClick={() => speak(m.text)}
                      className={cn(
                        "absolute -bottom-6 right-2 text-muted-foreground hover:text-foreground p-1 transition",
                        speaking === m.text && "text-primary animate-pulse"
                      )}
                      title={t("assistant.speak.answer")}
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Render Custom dynamic charts/KPI components inside chat */}
                {m.sender === "bot" && m.chartType && m.data && (
                  <div className="rounded-xl border bg-card p-3 shadow-sm max-w-full overflow-hidden">
                    {m.chartType === "card" && (
                      <div className="p-3 text-center">
                        <div className="text-[10px] text-muted-foreground uppercase font-semibold">{m.data.label}</div>
                        <div className="text-2xl font-bold font-display text-primary mt-1">{m.data.value}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{m.data.subtext}</div>
                      </div>
                    )}

                    {m.chartType === "bar" && (
                      <div className="h-48 w-72 md:w-96 text-xs">
                        <ResponsiveContainer width="100%" height="100%">
                          <ReChartsBar data={m.data} margin={{ left: -25, top: 10 }}>
                            <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                            <YAxis tick={{ fontSize: 9 }} />
                            <Tooltip contentStyle={{ fontSize: 10 }} />
                            <Bar dataKey="value" fill="oklch(0.55 0.18 145)" radius={[3, 3, 0, 0]} />
                          </ReChartsBar>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {m.chartType === "pie" && (
                      <div className="h-48 w-72 md:w-96 text-[10px] flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={m.data}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={65}
                              paddingAngle={1}
                            >
                              {m.data.map((_: any, idx: number) => (
                                <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 9 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="mt-4 border-t pt-4 bg-background">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2 items-center"
          >
            {supported && (
              <Button
                type="button"
                variant={listening ? "destructive" : "outline"}
                size="icon"
                onClick={listening ? stop : start}
                className={cn("h-11 w-11 shrink-0 rounded-xl", listening && "animate-pulse")}
                title={t("scan.btn")}
              >
                {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </Button>
            )}

            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={listening ? t("assistant.listening") : t("assistant.placeholder")}
              className="h-11 rounded-xl bg-card"
              disabled={listening}
            />

            <Button type="submit" size="icon" className="h-11 w-11 shrink-0 rounded-xl" disabled={!inputValue.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </>
  );
}

const CHART_COLORS = [
  "oklch(0.55 0.18 145)",
  "oklch(0.65 0.18 45)",
  "oklch(0.6 0.18 250)",
  "oklch(0.62 0.22 27)",
  "oklch(0.7 0.15 300)",
];
