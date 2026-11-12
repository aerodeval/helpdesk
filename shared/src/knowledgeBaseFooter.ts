import type { KnowledgeBaseLink } from "./knowledgeBasePreview";
import { __ } from "./translation";

export type FooterColumn = { title: string; links: KnowledgeBaseLink[] };

// Stored as JSON in HD Settings kb_footer.
export type KnowledgeBaseFooter = {
  enabled: boolean;
  tagline: string;
  copyright: string;
  columns: FooterColumn[];
  // network -> URL; an empty URL hides the icon
  socials: Record<string, string>;
};

// The footer grid fits this many; keep in sync with MAX_FOOTER_COLUMNS in hd_settings.py
export const MAX_FOOTER_COLUMNS = 4;

// Each value is a ServiceIcon name; a function, so labels follow a translation load.
export const footerNetworks = () => [
  { value: "linkedin", label: __("LinkedIn") },
  { value: "youtube", label: __("YouTube") },
  { value: "x", label: __("X") },
  { value: "github", label: __("GitHub") },
  { value: "instagram", label: __("Instagram") },
];

// Fills what an older or hand-edited value lacks, so callers never check shapes.
export function parseFooter(value: unknown): KnowledgeBaseFooter {
  let footer: Partial<KnowledgeBaseFooter> = {};
  try {
    footer = (typeof value === "string" ? JSON.parse(value) : value) || {};
  } catch {}
  return {
    enabled: Boolean(footer.enabled),
    tagline: footer.tagline || "",
    copyright: footer.copyright || "",
    columns: Array.isArray(footer.columns) ? footer.columns : [],
    socials: footer.socials || {},
  };
}
