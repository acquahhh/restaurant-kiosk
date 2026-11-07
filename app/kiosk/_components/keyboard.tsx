"use client";

/**
 * On-screen keyboards. A kiosk browser in full-screen mode cannot be trusted
 * to raise the operating system keyboard, so text entry is handled here.
 * Inputs that use these set inputMode="none" to keep the OS keyboard away.
 */

const ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
];

const keyBase =
  "h-[72px] rounded-[12px] bg-canvas text-2xl font-semibold shadow-[0_1px_0_var(--color-sand-deep)] active:bg-sand-deep transition-colors duration-100";

export function LetterKeyboard({
  onKey, onBackspace, onSpace, onDone, doneLabel = "Done", extraKeys = [],
}: {
  onKey: (ch: string) => void;
  onBackspace: () => void;
  onSpace: () => void;
  onDone: () => void;
  doneLabel?: string;
  /** e.g. apostrophe and hyphen for names, comma for instructions */
  extraKeys?: string[];
}) {
  return (
    <div className="space-y-2 rounded-panel bg-sand p-3" role="group" aria-label="Keyboard">
      {ROWS.map((row, i) => (
        <div key={i} className="flex justify-center gap-2">
          {row.map((k) => (
            <button key={k} type="button" className={`${keyBase} w-[76px]`} onClick={() => onKey(k)}>
              {k}
            </button>
          ))}
          {i === 2 && extraKeys.map((k) => (
            <button key={k} type="button" className={`${keyBase} w-[76px]`} onClick={() => onKey(k)}>
              {k}
            </button>
          ))}
        </div>
      ))}
      <div className="flex justify-center gap-2">
        <button type="button" className={`${keyBase} w-[160px] text-xl`} onClick={onBackspace}>
          Delete
        </button>
        <button type="button" className={`${keyBase} w-[420px] text-xl`} onClick={onSpace}>
          Space
        </button>
        <button type="button" className={`${keyBase} w-[160px] bg-palm text-xl text-white active:bg-palm-deep`} onClick={onDone}>
          {doneLabel}
        </button>
      </div>
    </div>
  );
}

export function NumberPad({
  onKey, onBackspace, onDone, doneLabel = "Done",
}: {
  onKey: (d: string) => void;
  onBackspace: () => void;
  onDone?: () => void;
  doneLabel?: string;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div className="grid w-[360px] grid-cols-3 gap-2 rounded-panel bg-sand p-3" role="group" aria-label="Number pad">
      {keys.map((k) => (
        <button key={k} type="button" className={`${keyBase} text-3xl`} onClick={() => onKey(k)}>
          {k}
        </button>
      ))}
      <button type="button" className={`${keyBase} text-xl`} onClick={onBackspace}>
        Delete
      </button>
      <button type="button" className={`${keyBase} text-3xl`} onClick={() => onKey("0")}>
        0
      </button>
      {onDone ? (
        <button type="button" className={`${keyBase} bg-palm text-xl text-white active:bg-palm-deep`} onClick={onDone}>
          {doneLabel}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

/** Title-cases as the customer types: "AMA OWUSU" → "Ama Owusu". */
export function tidyName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
