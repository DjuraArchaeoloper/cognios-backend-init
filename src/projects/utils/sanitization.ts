import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

export function sanitizeHtml(input: string) {
  const window = new JSDOM("").window;
  const purify = DOMPurify(window);

  return purify.sanitize(input, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "a",
      "img",
      "blockquote",
      "code",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "src", "alt"],
    ALLOW_DATA_ATTR: false,
  });
}
