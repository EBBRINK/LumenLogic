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

  async function kopieer() {
    // Event bij de expliciete actie (K7) — loggen mag het kopiëren nooit blokkeren.
    void onCopied(brandId).catch(() => {});
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      // Geen clipboard-permissie (bv. onbeveiligde context): selecteer de tekst
      // zodat Ctrl/Cmd+C alsnog werkt.
      textareaRef.current?.select();
    }
    setGekopieerd(true);
    setTimeout(() => setGekopieerd(false), 2000);
  }

  return (
    <div>
      <textarea
        ref={textareaRef}
        readOnly
        value={message}
        aria-label="Bericht aan het merk"
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
          {gekopieerd ? "Gekopieerd" : "Bericht kopiëren"}
        </button>
        <span className="text-xs text-muted-foreground">
          Plak het bericht in uw mail en voeg het Excel-template als bijlage toe.
        </span>
      </div>
    </div>
  );
}
