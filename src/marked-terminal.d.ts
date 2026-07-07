declare module "marked-terminal" {
  import type { MarkedExtension } from "marked";

  export interface MarkedTerminalOptions {
    code?: (source: string, lang: string) => string;
    blockquote?: (body: string) => string;
    html?: (body: string) => string;
    heading?: (body: string, level: number) => string;
    firstHeading?: (body: string, level: number) => string;
    hr?: () => string;
    listitem?: (text: string) => string;
    list?: (body: string, ordered: boolean) => string;
    table?: (body: string) => string;
    paragraph?: (body: string) => string;
    strong?: (body: string) => string;
    em?: (body: string) => string;
    codespan?: (body: string) => string;
    del?: (body: string) => string;
    link?: (href: string, title: string, text: string) => string;
    href?: (href: string) => string;
    showSectionPrefix?: boolean;
    reflowText?: boolean;
    width?: number;
    tab?: number | string;
    emoji?: boolean;
    unescape?: boolean;
    tableOptions?: Record<string, unknown>;
    image?: (href: string, title: string, text: string) => string;
  }

  export function markedTerminal(
    options?: MarkedTerminalOptions,
    highlightOptions?: Record<string, unknown>,
  ): MarkedExtension;
}
