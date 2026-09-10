import { describe, expect, it } from "vitest";
import {
  assembleIdiom,
  pickIdiomChar,
  shouldSubmitIdiom,
  undoIdiomChar,
} from "../src/logic/idiom-chain-selection";

describe("idiom chain selection", () => {
  it("selects each candidate index at most once", () => {
    expect(pickIdiomChar([], 1)).toEqual([1]);
    expect(pickIdiomChar([1], 1)).toEqual([1]);
  });

  it("stops after four selected indexes", () => {
    expect(pickIdiomChar([0, 1, 2, 3], 4)).toEqual([0, 1, 2, 3]);
  });

  it("undoes only the last selected index", () => {
    expect(undoIdiomChar([0, 2])).toEqual([0]);
    expect(undoIdiomChar([])).toEqual([]);
  });

  it("assembles duplicate characters from independent indexes", () => {
    expect(
      assembleIdiom(["人", "人", "平", "等"], [1, 0, 2, 3]),
    ).toBe("人人平等");
  });

  it("ignores a candidate index outside the available options", () => {
    expect(assembleIdiom(["人"], [0, 4])).toBe("人");
  });

  it("submits only a complete selection that is not already locked", () => {
    expect(shouldSubmitIdiom([0, 1, 2], false)).toBe(false);
    expect(shouldSubmitIdiom([0, 1, 2, 3], false)).toBe(true);
    expect(shouldSubmitIdiom([0, 1, 2, 3], true)).toBe(false);
  });
});
