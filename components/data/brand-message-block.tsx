"use client";

// Bericht-klaarzetten-blok (stap 7): server-side gegenereerde NL-tekst in een readonly
// textarea + kopieerknop. Het event 'brand_message_prepared' loggen we bij het kopiëren
// (expliciete gebruikersactie — geen ruis bij elke page-load), via de meegegeven action.
import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export function BrandMessageBlock({
  brandId,
  message,
  onCopied,
}: {
  brandId: string;
  message: string;
  onCopied: (brandId: string) => Promise<void>;
}) {
  const [gekopieerd, setGekopieerd] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function kopieer() {
    setGekopieerd(true);
    setTimeout(() => setGekopieerd(false), 2000);
    // Niet awaiten: de UI-bevestiging mag niet aan clipboard-permissies hangen.
    // Zonder permissie (bv. onbeveiligde context) selecteren we de tekst zodat
    // Ctrl/Cmd+C alsnog werkt.
    try {
      navigator.clipboard
        .writeText(message)
        .catch(() => textareaRef.current?.select());
    } catch {
      textareaRef.current?.select();
    }
    // Event bij de expliciete actie (K7) — loggen mag het kopiëren nooit blokkeren.
    try {
      void onCopied(brandId).catch(() => {});
    } catch {
      // Bewust stil: het bericht is al gekopieerd.
    }
  }

  return (
    <div>
      <textarea
        ref={textareaRef}
        readOnly
        value={message}
        aria-label="Message to the brand"
        rows={Math.min(18, message.split("\n").length + 1)}
        className="w-full resize-y rounded-md border border-foreground/15 bg-background p-3 font-mono text-sm leading-relaxed text-foreground"
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={kopieer}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {gekopieerd ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {gekopieerd ? "Copied" : "Copy message"}
        </button>
        <span className="text-xs text-muted-foreground">
          Paste the message into your email and attach the Excel template.
        </span>
      </div>
    </div>
  );
}
