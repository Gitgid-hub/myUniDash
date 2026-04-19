import { TextStyle } from "@tiptap/extension-text-style";

/**
 * Inline `font-size` on the shared `textStyle` mark (same pattern as TipTap Color).
 */
export const ClassNoteTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      ...(this.parent?.() ?? {}),
      fontSize: {
        default: null,
        parseHTML: (element) => {
          const fs = (element as HTMLElement).style.fontSize?.replace(/['"]+/g, "").trim();
          return fs || null;
        },
        renderHTML: (attributes) => {
          if (!attributes.fontSize) {
            return {};
          }
          return { style: `font-size: ${attributes.fontSize}` };
        }
      }
    };
  }
}).configure({ mergeNestedSpanStyles: true });
