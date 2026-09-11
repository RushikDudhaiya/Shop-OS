import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function getSpeechCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return Boolean(getSpeechCtor());
}

export function useSpeechInput(langs: string[] = ["hi-IN", "en-IN"]) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => speechSupported());
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const resolveRef = useRef<((text: string) => void) | null>(null);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const listen = useCallback((): Promise<string> => {
    const Ctor = getSpeechCtor();
    if (!Ctor) {
      return Promise.reject(new Error("Voice is phone/Chrome pe chalega"));
    }

    return new Promise((resolve, reject) => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }

      const rec = new Ctor();
      recRef.current = rec;
      rec.lang = langs[0] ?? "hi-IN";
      rec.continuous = false;
      rec.interimResults = false;
      setError(null);
      setListening(true);
      resolveRef.current = resolve;

      rec.onresult = (event) => {
        const text = event.results[0]?.[0]?.transcript?.trim() ?? "";
        resolveRef.current?.(text);
        resolveRef.current = null;
        setListening(false);
      };

      rec.onerror = (event) => {
        const msg =
          event.error === "not-allowed"
            ? "Mic permission do — Settings se allow karo"
            : event.error === "no-speech"
              ? "Kuch suna nahi — phir se bolo"
              : "Voice fail — phir try karo";
        setError(msg);
        setListening(false);
        reject(new Error(msg));
      };

      rec.onend = () => {
        setListening(false);
      };

      try {
        rec.start();
      } catch {
        setListening(false);
        reject(new Error("Mic start nahi hua"));
      }
    });
  }, [langs]);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  return { supported, listening, error, listen, stop, setError };
}
