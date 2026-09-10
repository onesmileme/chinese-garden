import { describe, it, expect } from "vitest";
import {
  allBlanksFilled,
  characterInBlank,
  dropToBlank,
  initialPoemFillState,
  isCandidateUsed,
  removeFromBlank,
  reset,
  serializePoemFillState,
  undo,
} from "../src/logic/poem-fill";

const candidates = ["月", "光", "霜"];

describe("poem-fill logic", () => {
  it("starts empty", () => {
    const state = initialPoemFillState();
    expect(state.filled).toEqual({});
    expect(state.history).toEqual([]);
    expect(allBlanksFilled(state, [0, 1])).toBe(false);
    expect(allBlanksFilled(state, [])).toBe(false);
  });

  it("drops a candidate into a blank and records history", () => {
    const state = dropToBlank(initialPoemFillState(), 0, 0);
    expect(state.filled).toEqual({ 0: 0 });
    expect(state.history).toEqual([{}]);
    expect(isCandidateUsed(state, 0)).toBe(true);
    expect(isCandidateUsed(state, 1)).toBe(false);
    expect(characterInBlank(state, candidates, 0)).toBe("月");
    expect(characterInBlank(state, candidates, 1)).toBe("");
  });

  it("moves a candidate off its previous blank when reused", () => {
    let state = dropToBlank(initialPoemFillState(), 0, 0);
    state = dropToBlank(state, 0, 1);
    expect(state.filled).toEqual({ 1: 0 });
  });

  it("overwrites a target blank while keeping other blanks", () => {
    let state = dropToBlank(initialPoemFillState(), 0, 0);
    state = dropToBlank(state, 1, 1);
    state = dropToBlank(state, 2, 0);
    expect(state.filled).toEqual({ 0: 2, 1: 1 });
  });

  it("returns unknown character index as empty string", () => {
    const state = dropToBlank(initialPoemFillState(), 9, 0);
    expect(characterInBlank(state, candidates, 0)).toBe("");
  });

  it("removes a filled blank and ignores empty removals", () => {
    let state = dropToBlank(initialPoemFillState(), 0, 0);
    state = dropToBlank(state, 1, 1);
    const removed = removeFromBlank(state, 0);
    expect(removed.filled).toEqual({ 1: 1 });
    const unchanged = removeFromBlank(removed, 0);
    expect(unchanged).toBe(removed);
  });

  it("undoes the last step and no-ops with empty history", () => {
    const empty = initialPoemFillState();
    expect(undo(empty)).toBe(empty);
    let state = dropToBlank(empty, 0, 0);
    state = dropToBlank(state, 1, 1);
    const back = undo(state);
    expect(back.filled).toEqual({ 0: 0 });
    expect(back.history).toEqual([{}]);
  });

  it("resets all blanks and no-ops when already empty", () => {
    const empty = initialPoemFillState();
    expect(reset(empty)).toBe(empty);
    let state = dropToBlank(empty, 0, 0);
    state = dropToBlank(state, 1, 1);
    const cleared = reset(state);
    expect(cleared.filled).toEqual({});
    expect(cleared.history.length).toBe(3);
  });

  it("reports all blanks filled and serializes in blank order", () => {
    let state = dropToBlank(initialPoemFillState(), 2, 1);
    state = dropToBlank(state, 0, 0);
    expect(allBlanksFilled(state, [0, 1])).toBe(true);
    expect(allBlanksFilled(state, [0, 1, 2])).toBe(false);
    expect(serializePoemFillState(state, candidates)).toBe("0=月|1=霜");
  });

  it("serializes an unknown candidate index as empty", () => {
    const state = dropToBlank(initialPoemFillState(), 9, 0);
    expect(serializePoemFillState(state, candidates)).toBe("0=");
  });
});
