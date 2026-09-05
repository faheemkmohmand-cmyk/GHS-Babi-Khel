// src/components/shared/aiInstantAnswers.test.ts
// Unit tests for the instant answer engine (Layer 1 of the AI Assistant fix).
// Run: npx vitest run src/components/shared/aiInstantAnswers.test.ts

import { describe, it, expect } from "vitest";
import {
  getInstantAnswer,
  scoreIntents,
  normalizeText,
} from "./aiInstantAnswers";

describe("normalizeText", () => {
  it("lowercases, strips punctuation and collapses spaces", () => {
    expect(normalizeText("  How do I check my result??  ")).toBe(
      "how do i check my result"
    );
    expect(normalizeText("نتیجہ کب آئے گا؟")).toContain("نتیجہ");
  });
});

describe("getInstantAnswer — real user questions", () => {
  it("answers the EXACT question from the production screenshot instantly", () => {
    const a = getInstantAnswer("How do I check my result by roll number?");
    expect(a).not.toBeNull();
    expect(a!.id).toBe("result-by-roll");
    expect(a!.answer).toContain("/results");
    expect(a!.answer).toContain("roll number");
  });

  it("handles phrasing variants of the roll-number question", () => {
    for (const q of [
      "how to check result",
      "result kaise dekhe",
      "where can I see my result",
      "show my result online",
      "mera natija kaise check karun",
      "search result by roll no",
    ]) {
      const a = getInstantAnswer(q);
      expect(a, `failed for: ${q}`).not.toBeNull();
      expect(a!.id).toBe("result-by-roll");
    }
  });

  it("answers result-announcement questions", () => {
    for (const q of [
      "When will the result be announced?",
      "result kab aayega",
      "what is the result date",
    ]) {
      const a = getInstantAnswer(q);
      expect(a, `failed for: ${q}`).not.toBeNull();
      expect(a!.id).toBe("result-when");
    }
  });

  it("answers admission questions", () => {
    const a1 = getInstantAnswer("How do I apply for admission?");
    expect(a1).not.toBeNull();
    expect(a1!.id).toBe("admission-how");

    const a2 = getInstantAnswer("What documents are required for admission?");
    expect(a2).not.toBeNull();
    expect(a2!.id).toBe("admission-documents");
    expect(a2!.answer).toContain("B-form");

    const a3 = getInstantAnswer("How can I track my application status?");
    expect(a3).not.toBeNull();
    expect(a3!.id).toBe("admission-status");
  });

  it("answers portal questions", () => {
    const a1 = getInstantAnswer("How do I log in to the student portal?");
    expect(a1).not.toBeNull();
    expect(a1!.id).toBe("portal-login");

    const a2 = getInstantAnswer("I forgot my password");
    expect(a2).not.toBeNull();
    expect(a2!.id).toBe("portal-login");

    const a3 = getInstantAnswer("Where can I see my attendance?");
    expect(a3).not.toBeNull();
    expect(a3!.id).toBe("portal-dashboard");
  });

  it("answers fees, timetable and exam questions", () => {
    expect(getInstantAnswer("What are the school fees?")!.id).toBe("fees");
    expect(getInstantAnswer("When is the exam? Check the date sheet")!.id).toBe(
      "exam-schedule"
    );
    const t = getInstantAnswer("Where is my class time table?");
    expect(t).not.toBeNull();
    expect(t!.id).toBe("timetable");
  });

  it("answers contact and location questions", () => {
    const c = getInstantAnswer("What is the school phone number?");
    expect(c).not.toBeNull();
    expect(c!.id).toBe("contact");

    const l = getInstantAnswer("Where is the school located?");
    expect(l).not.toBeNull();
    expect(l!.id).toBe("location");
    expect(l!.answer).toContain("Mohmand");
  });

  it("never lets a roll-number question fall into the contact intent", () => {
    const scored = scoreIntents("How do I check my result by roll number?");
    const contact = scored.find((s) => s.intent.id === "contact");
    const roll = scored.find((s) => s.intent.id === "result-by-roll");
    expect(roll).toBeDefined();
    // "contact" must be blocked entirely by the block-list…
    expect(contact).toBeUndefined();
    // …or at the very least lose by a wide margin.
    if (contact && roll) {
      expect(roll.score - contact.score).toBeGreaterThanOrEqual(2);
    }
  });

  it("answers notices, news, teachers, library, calendar, gallery", () => {
    expect(getInstantAnswer("What's new on the Notices page?")!.id).toBe(
      "notices"
    );
    expect(getInstantAnswer("Any school news about sports?")!.id).toBe("news");
    expect(getInstantAnswer("Who is the headmaster?")!.id).toBe("teachers");
    expect(getInstantAnswer("Can I borrow books from the library?")!.id).toBe(
      "library"
    );
    expect(getInstantAnswer("When are the holidays? Check the academic calendar")!.id).toBe(
      "calendar"
    );
    expect(getInstantAnswer("Show me photos in the gallery")!.id).toBe("gallery");
  });

  it("answers the developer question with the enriched info", () => {
    const a = getInstantAnswer("Who made this website?");
    expect(a).not.toBeNull();
    expect(a!.id).toBe("developer");
    expect(a!.answer).toContain("Muhammad Faheem");
    expect(a!.answer).toContain("Zabih Ullah");
    expect(a!.answer).toContain("Village Sangar");

    const b = getInstantAnswer("Who developed this site?");
    expect(b).not.toBeNull();
    expect(b!.id).toBe("developer");
  });

  it("handles greetings, thanks and capability questions", () => {
    expect(getInstantAnswer("salam")!.id).toBe("greeting");
    expect(getInstantAnswer("hello")!.id).toBe("greeting");
    expect(getInstantAnswer("thank you!")!.id).toBe("thanks");
    expect(getInstantAnswer("shukriya")!.id).toBe("thanks");
    expect(getInstantAnswer("What can you do?")!.id).toBe("capabilities");
    expect(getInstantAnswer("help me")!.id).toBe("capabilities");
  });

  it("answers BISE board questions", () => {
    const a = getInstantAnswer("How do I check my BISE Peshawar board result?");
    expect(a).not.toBeNull();
    expect(["bise-board", "result-by-roll"]).toContain(a!.id);
  });

  it("answers result-card / grading questions", () => {
    const a = getInstantAnswer("What grade is 85 percent? What does the result card show?");
    expect(a).not.toBeNull();
    expect(a!.id).toBe("result-card-details");
    expect(a!.answer).toContain("A+");
  });

  it("answers study/notes questions", () => {
    const a = getInstantAnswer("Where are the notes for physics chapters?");
    expect(a).not.toBeNull();
    expect(a!.id).toBe("notes-study");
  });

  it("routes about-school questions", () => {
    const a = getInstantAnswer("Tell me about the school history and mission");
    expect(a).not.toBeNull();
    expect(a!.id).toBe("about-school");
  });
});

describe("getInstantAnswer — safety", () => {
  it("returns null for off-topic questions so the real model handles them", () => {
    // No confident local match → must fall through to /api/ai-chat.
    for (const q of [
      "Write a poem about the moon",
      "What is the capital of France?",
      "Tell me a joke",
      "how do I bake a cake",
    ]) {
      expect(getInstantAnswer(q), `should be null: ${q}`).toBeNull();
    }
  });

  it("returns null for empty/whitespace input", () => {
    expect(getInstantAnswer("")).toBeNull();
    expect(getInstantAnswer("   ")).toBeNull();
    expect(getInstantAnswer("???")).toBeNull();
  });

  it("does not hijack a greeting that mentions a real topic", () => {
    const a = getInstantAnswer("hi I want to check my result by roll number");
    expect(a).not.toBeNull();
    // "hi … result … roll number" must NOT answer with the greeting card.
    expect(a!.id).not.toBe("greeting");
    expect(a!.id).toBe("result-by-roll");
  });

  it("keeps ambiguous fee/admission questions out of the wrong intent", () => {
    // "admission fee" touches two intents — either the margin rule rejects it
    // (→ null → LLM) or one intent wins clearly; it must never answer with a
    // card that ignores the fee half.
    const a = getInstantAnswer("what is the admission fee");
    if (a !== null) {
      expect(["admission-how", "fees"]).toContain(a.id);
    }
  });
});

describe("performance", () => {
  it("matches a question in well under a millisecond (nano-second class)", () => {
    const q = "How do I check my result by roll number?";
    // Warm-up
    getInstantAnswer(q);
    const start = performance.now();
    const runs = 2000;
    for (let i = 0; i < runs; i++) getInstantAnswer(q);
    const perCallMs = (performance.now() - start) / runs;
    expect(perCallMs).toBeLessThan(0.5); // microseconds-scale per call
  });
});
