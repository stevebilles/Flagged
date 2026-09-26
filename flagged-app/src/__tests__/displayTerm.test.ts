import { displayTerm } from "../domain/displayTerm";
import ingredients from "../../assets/data/ingredients.json";

describe("displayTerm (how a red-flag term is shown on a result)", () => {
  it("capitalizes an ordinary term's first letter only", () => {
    expect(displayTerm("maltodextrin")).toBe("Maltodextrin");
    expect(displayTerm("yeast extract")).toBe("Yeast extract");
    expect(displayTerm("red 40")).toBe("Red 40");
  });

  it("shows abbreviations in capitals, not 'Tbhq'", () => {
    expect(displayTerm("tbhq")).toBe("TBHQ");
    expect(displayTerm("bha")).toBe("BHA");
    expect(displayTerm("bht")).toBe("BHT");
    expect(displayTerm("edta")).toBe("EDTA");
    expect(displayTerm("msg")).toBe("MSG");
    expect(displayTerm("hfcs")).toBe("HFCS");
    expect(displayTerm("fd&c")).toBe("FD&C");
  });

  it("shows E-numbers in capitals, and Ace-K as usual", () => {
    expect(displayTerm("e320")).toBe("E320");
    expect(displayTerm("e150d")).toBe("E150D");
    expect(displayTerm("ace-k")).toBe("Ace-K");
  });

  it("never changes the term's letters, only their case", () => {
    const terms = (ingredients as { ingredients: { term: string }[] }).ingredients.map((i) => i.term);
    for (const term of terms) expect(displayTerm(term).toLowerCase()).toBe(term.toLowerCase());
  });
});
