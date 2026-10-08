import type { AdminPoemItem, ValidationResponse } from "./poem-review";

export class PoemReviewAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PoemReviewAdminError";
  }
}

export interface PoemReviewAdminPort {
  listPoems(): Promise<AdminPoemItem[]>;
  validate(id: string): Promise<ValidationResponse>;
  activate(id: string, expectedRevision: number): Promise<AdminPoemItem>;
  archive(id: string, expectedRevision: number): Promise<AdminPoemItem>;
}
