"use client";

import { useEffect, useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { serializeNewsJsonLd } from "@/lib/news-keyword-rules";

const SCRIPT_ID = "news-article-jsonld";

/** SSR inserts into head; the effect also handles App Router client navigation. */
export function NewsArticleJsonLd({ data }: { data: object }) {
  const json = serializeNewsJsonLd(data);
  const inserted = useRef(false);
  useServerInsertedHTML(() => {
    if (inserted.current) return null;
    inserted.current = true;
    return <script id={SCRIPT_ID} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
  });
  useEffect(() => {
    const script = document.getElementById(SCRIPT_ID) ?? document.createElement("script");
    script.id = SCRIPT_ID;
    script.setAttribute("type", "application/ld+json");
    script.textContent = json;
    document.head.appendChild(script);
    return () => script.remove();
  }, [json]);
  return null;
}
