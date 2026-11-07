"use client";

import { useMemo, useRef, useState } from "react";
import type { CustomizationGroup, MenuItem } from "@/lib/db/menu";
import {
  defaultSelections, MAX_INSTRUCTIONS_LENGTH, MAX_QUANTITY_PER_LINE, toggleOption,
  unitPriceFor, validateSelections, type Selections,
} from "@/lib/kiosk/cart";
import { formatGhs } from "@/lib/money";
import { FoodImage } from "./food-image";
import { LetterKeyboard } from "./keyboard";
import { Button, CheckIcon, CloseIcon, Dialog, Stepper } from "./ui";

export interface CustomizeResult {
  selections: Selections;
  quantity: number;
  instructions: string;
}

function requirementText(g: CustomizationGroup) {
  const min = Math.max(g.min_select, g.is_required ? 1 : 0);
  if (g.selection_type === "single") return min > 0 ? "Required" : "Optional";
  if (min > 0 && g.max_select) return `Choose ${min} to ${g.max_select}`;
  if (g.max_select) return `Optional, up to ${g.max_select}`;
  return "Optional";
}

export function CustomizeSheet({
  item, initial, mode, onConfirm, onClose,
}: {
  item: MenuItem;
  initial?: CustomizeResult;
  mode: "add" | "edit";
  onConfirm: (r: CustomizeResult) => void;
  onClose: () => void;
}) {
  const [selections, setSelections] = useState<Selections>(() => initial?.selections ?? defaultSelections(item));
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");
  const [noteOpen, setNoteOpen] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const groupRefs = useRef<Record<string, HTMLElement | null>>({});

  const unitPrice = useMemo(() => unitPriceFor(item, selections), [item, selections]);
  const problems = useMemo(() => validateSelections(item, selections), [item, selections]);
  const problemByGroup = new Map(problems.map((p) => [p.groupId, p.message]));

  function confirm() {
    if (problems.length > 0) {
      setShowProblems(true);
      groupRefs.current[problems[0]!.groupId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onConfirm({ selections, quantity, instructions: instructions.trim() });
  }

  return (
    <Dialog open onClose={onClose} labelledBy="customize-title" className="h-[940px] w-[1400px]">
      <div className="flex min-h-0 flex-1">
        {/* Meal summary */}
        <aside className="flex w-[440px] shrink-0 flex-col bg-sand">
          {item.image_url ? (
            <FoodImage src={item.image_url} alt={item.name} sizes="440px" className="aspect-[4/3] w-full" />
          ) : null}
          <div className="flex flex-1 flex-col p-10">
            <h2 id="customize-title" className="text-4xl font-bold leading-tight tracking-tight">
              {item.name}
            </h2>
            <p className="mt-4 text-xl leading-relaxed text-ink-muted">{item.description}</p>
            <p className="price mt-6">{formatGhs(item.base_price)}</p>
            {item.prep_minutes ? (
              <p className="mt-2 text-lg text-ink-muted">Ready in about {item.prep_minutes} minutes</p>
            ) : null}
          </div>
        </aside>

        {/* Options */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex justify-end p-4">
            <Button variant="ghost" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-10 overflow-y-auto px-10 pb-8">
            {item.customization_groups.length === 0 ? (
              <p className="text-xl text-ink-muted">Choose how many and add a note for the kitchen if you need to.</p>
            ) : null}

            {item.customization_groups.map((group) => {
              const selected = selections[group.id] ?? [];
              const problem = showProblems ? problemByGroup.get(group.id) : undefined;
              const atMax = group.selection_type === "multiple" && group.max_select !== null && selected.length >= group.max_select;
              return (
                <section key={group.id} ref={(el) => { groupRefs.current[group.id] = el; }} aria-labelledby={`g-${group.id}`}>
                  <div className="flex items-baseline justify-between gap-4">
                    <h3 id={`g-${group.id}`} className="text-2xl font-bold">{group.name}</h3>
                    <span className={`text-lg font-semibold ${problem ? "text-pepper" : "text-ink-muted"}`}>
                      {problem ?? requirementText(group)}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {group.options.map((option) => {
                      const isOn = selected.includes(option.id);
                      const disabled = !option.is_available || (!isOn && atMax);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          role={group.selection_type === "single" ? "radio" : "checkbox"}
                          aria-checked={isOn}
                          disabled={disabled}
                          onClick={() => setSelections((s) => toggleOption(group, s, option.id))}
                          className={`flex min-h-[96px] items-center gap-4 rounded-button border-[3px] px-5 text-left transition-colors duration-100 disabled:opacity-40 ${
                            isOn ? "border-palm bg-palm-soft" : "border-sand-deep active:bg-sand"
                          }`}
                        >
                          <span
                            className={`grid h-8 w-8 shrink-0 place-items-center border-[3px] ${
                              group.selection_type === "single" ? "rounded-full" : "rounded-[8px]"
                            } ${isOn ? "border-palm bg-palm text-white" : "border-sand-deep bg-canvas"}`}
                          >
                            {isOn ? <CheckIcon className="h-5 w-5" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-xl font-semibold leading-tight">{option.name}</span>
                            <span className="mt-1 block text-lg text-ink-muted tabular-nums">
                              {!option.is_available
                                ? "Sold out"
                                : option.price_delta > 0
                                  ? `+ ${formatGhs(option.price_delta)}`
                                  : option.price_delta < 0
                                    ? `− ${formatGhs(-option.price_delta)}`
                                    : "No extra cost"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <section aria-labelledby="note-heading">
              <h3 id="note-heading" className="text-2xl font-bold">Note for the kitchen</h3>
              <button
                type="button"
                onClick={() => setNoteOpen((o) => !o)}
                className={`mt-4 flex min-h-touch-lg w-full items-center rounded-button border-[3px] px-5 text-left text-xl ${
                  noteOpen ? "border-palm" : "border-sand-deep"
                }`}
              >
                {instructions ? (
                  <span className="font-semibold">{instructions}</span>
                ) : (
                  <span className="text-ink-muted">For example: no pepper, sauce on the side</span>
                )}
              </button>
              {noteOpen ? (
                <div className="mt-4">
                  <LetterKeyboard
                    extraKeys={[","]}
                    onKey={(k) =>
                      setInstructions((t) => {
                        if (t.length >= MAX_INSTRUCTIONS_LENGTH) return t;
                        const ch = t.length === 0 || /[.,]\s$/.test(t) ? k : k.toLowerCase();
                        return t + ch;
                      })
                    }
                    onSpace={() => setInstructions((t) => (t && !t.endsWith(" ") ? t + " " : t))}
                    onBackspace={() => setInstructions((t) => t.slice(0, -1))}
                    onDone={() => setNoteOpen(false)}
                  />
                </div>
              ) : null}
            </section>
          </div>

          <footer className="flex items-center gap-6 border-t border-sand-deep px-10 py-6">
            <Stepper value={quantity} onChange={setQuantity} max={MAX_QUANTITY_PER_LINE} label="quantity" />
            <Button variant="hero" size="lg" className="flex-1 justify-between" onClick={confirm}>
              <span>{mode === "add" ? "Add to order" : "Update order"}</span>
              <span className="tabular-nums">{formatGhs(unitPrice * quantity)}</span>
            </Button>
          </footer>
        </div>
      </div>
    </Dialog>
  );
}
