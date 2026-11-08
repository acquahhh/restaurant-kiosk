"use client";

/**
 * Speaks "Order 42, ready for collection" with the device's built-in voice
 * (Web Speech API: Windows and Android ship voices, no internet needed),
 * preceded by a short chime so people look up.
 *
 * Browsers only allow sound after a tap on the page, so call unlock() from a
 * button press once; until then announce() stays silent.
 */

let audio: AudioContext | null = null;
let unlocked = false;
const queue: string[] = [];
let speaking = false;

function chime(ctx: AudioContext) {
  const t = ctx.currentTime;
  [[659.25, 0], [880, 0.22], [1046.5, 0.44]].forEach(([freq, delay]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq!;
    gain.gain.setValueAtTime(0.0001, t + delay!);
    gain.gain.exponentialRampToValueAtTime(0.4, t + delay! + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay! + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + delay!);
    osc.stop(t + delay! + 0.65);
  });
}

/** Prefer an English voice from the region, then any English voice. */
function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const order = ["en-GH", "en-NG", "en-GB", "en-ZA", "en-KE", "en-US"];
  for (const lang of order) {
    const v = voices.find((x) => x.lang?.replace("_", "-") === lang);
    if (v) return v;
  }
  return voices.find((v) => v.lang?.toLowerCase().startsWith("en"));
}

/** "042" → "Order 42" (people hear "forty-two", the screen shows 042). */
export function phraseFor(orderNumber: string): string {
  return `Order ${Number.parseInt(orderNumber, 10)}, ready for collection.`;
}

function speakNext() {
  if (speaking || queue.length === 0) return;
  const text = queue.shift()!;
  speaking = true;
  if (audio) chime(audio);
  const synth = window.speechSynthesis;
  if (!synth) {
    speaking = false;
    return speakNext();
  }
  // Start speaking just after the chime.
  window.setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-GB";
    u.rate = 0.9; // a little slower carries better in a noisy room
    u.volume = 1;
    const done = () => {
      speaking = false;
      window.setTimeout(speakNext, 600);
    };
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
  }, 900);
}

export function isAnnouncerUnlocked() {
  return unlocked;
}

/** Call from a tap. Plays a short test so staff can check the volume. */
export function unlockAnnouncer(test = true) {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    // No Web Audio: speech can still work.
  }
  unlocked = true;
  window.speechSynthesis?.getVoices(); // some browsers load voices lazily
  if (test) announceText("Announcements are on.");
}

function announceText(text: string) {
  queue.push(text);
  speakNext();
}

/** Announce an order twice, 8 seconds apart, so people who missed it hear it. */
export function announceReady(orderNumber: string, repeat = true) {
  if (!unlocked) return;
  announceText(phraseFor(orderNumber));
  if (repeat) window.setTimeout(() => announceText(phraseFor(orderNumber)), 8000);
}
