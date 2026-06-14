import { useCallback, useEffect, useRef, useState } from "react";

type SR = any;

export function useSpeechRecognition(lang = "it-IT") {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<SR | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      setTranscript(txt);
    };
    rec.onerror = (e: any) => {
      setError(e.error || "speech_error");
      setListening(false);
    };
    rec.onend = () => setListening(false);
    ref.current = rec;
    return () => {
      try { rec.abort(); } catch {}
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!ref.current) return;
    setTranscript("");
    setError(null);
    try {
      ref.current.start();
      setListening(true);
    } catch {}
  }, []);

  const stop = useCallback(() => {
    if (!ref.current) return;
    try { ref.current.stop(); } catch {}
    setListening(false);
  }, []);

  return { supported, listening, transcript, error, start, stop, setTranscript };
}
