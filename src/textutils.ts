import he from "he";
import { stripHtml } from "string-strip-html";

// Helper functions for working with HTML.

// Converts HTML for plain-text for use in full-text search, preview text, etc.
export function htmlToPlainText(html: string): string {
  // First, use he to resolve any HTML entities embedded in the text. Second, use string-strip-html to strip any HTML
  // tags so that we keep formatting tags out of the full-text search. Finally, replace newlines `\n` with spaces.
  return stripHtml(he.decode(html)).result.replaceAll("\n", " ");
}
