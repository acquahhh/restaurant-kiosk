"use client";

/**
 * Spoken announcements ("Order 42, ready for collection.") with the device's
 * built-in voice, preceded by a chime. Works offline.
 *
 * Browsers allow sound only after a touch on the page, unless the browser was
 * started with --autoplay-policy=no-user-gesture-required (see the start-up
 * scripts). autoUnlock() tries the no-touch route first; otherwise the first
 * touch anywhere unlocks sound.
 *
 * Chrome/Edge quirk handled here: an utterance that is garbage-collected never
 * fires "end", which would block every later announcement. We keep a reference
 * to each utterance and use a watchdog so the queue can never get stuck.
 */

let audio: AudioContext | null = null;
let unlocked = false;
const queue: string[] = [];
let speaking = false;
const live = new Set<SpeechSynthesisUtterance>(); // keeps utterances from being garbage-collected
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function onUnlockChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getAudio(): AudioContext | null {
  try {
    audio ??= new AudioContext();
  } catch {
    audio = null;
  }
  return audio;
}

export function chime(kind: "ready" | "new" = "ready") {
  const ctx = getAudio();
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime;
  const notes = kind === "ready" ? [[659.25, 0], [880, 0.22], [1046.5, 0.44]] : [[880, 0], [1320, 0.18]];
  notes.forEach(([freq, delay]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq!;
    gain.gain.setValueAtTime(0.0001, t + delay!);
    gain.gain.exponentialRampToValueAtTime(0.4, t + delay! + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay! + 0.55);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + delay!);
    osc.stop(t + delay! + 0.6);
  });
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  for (const lang of ["en-GH", "en-NG", "en-GB", "en-ZA", "en-KE", "en-US"]) {
    const v = voices.find((x) => x.lang?.replace("_", "-") === lang);
    if (v) return v;
  }
  return voices.find((v) => v.lang?.toLowerCase().startsWith("en"));
}

/** "042" → "Order 42, ready for collection." */
export function phraseFor(orderNumber: string): string {
  return `Order ${Number.parseInt(orderNumber, 10)}, ready for collection.`;
}

function speakNext() {
  if (speaking || queue.length === 0) return;
  const text = queue.shift()!;
  speaking = true;
  chime("ready");
  const synth = window.speechSynthesis;
  if (!synth) {
    speaking = false;
    return;
  }
  window.setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    live.add(u);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-GB";
    u.rate = 0.9;
    u.volume = 1;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      live.delete(u);
      window.clearTimeout(watchdog);
      speaking = false;
      window.setTimeout(speakNext, 600);
    };
    // A sentence like this takes 3-4 s; if "end" never arrives, move on anyway.
    const watchdog = window.setTimeout(done, 12_000);
    u.onend = done;
    u.onerror = done;
    synth.resume(); // Chrome can leave the engine paused after a while
    synth.speak(u);
  }, 900);
}

export function isAnnouncerUnlocked() {
  return unlocked;
}

function markUnlocked() {
  if (unlocked) return;
  unlocked = true;
  window.speechSynthesis?.getVoices();
  notify();
}

/**
 * Try to enable sound without a touch (works when the browser was started with
 * --autoplay-policy=no-user-gesture-required). Otherwise the first touch
 * anywhere on the page enables it. Returns a cleanup function.
 */
export function autoUnlock(): () => void {
  const ctx = getAudio();
  if (ctx) {
    void ctx.resume().then(() => {
      if (ctx.state === "running") markUnlocked();
    });
  }
  const onTouch = () => {
    const c = getAudio();
    void c?.resume().finally(markUnlocked);
    if (!c) markUnlocked();
  };
  window.addEventListener("pointerdown", onTouch, { capture: true });
  window.addEventListener("keydown", onTouch, { capture: true });
  return () => {
    window.removeEventListener("pointerdown", onTouch, { capture: true });
    window.removeEventListener("keydown", onTouch, { capture: true });
  };
}

/** For an explicit button: unlock and confirm with a short spoken test. */
export function unlockAnnouncer(test = true) {
  void getAudio()?.resume();
  markUnlocked();
  if (test) announceText("Announcements are on.");
}

function announceText(text: string) {
  queue.push(text);
  speakNext();
}

/** Announce an order twice, 8 seconds apart. Silent until sound is unlocked. */
export function announceReady(orderNumber: string, repeat = true) {
  if (!unlocked) return;
  announceText(phraseFor(orderNumber));
  if (repeat) window.setTimeout(() => announceText(phraseFor(orderNumber)), 8000);
}
