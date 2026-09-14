import type { APIRoute } from "astro";
import changelog from "../data/changelog.json";

const site = "https://liears.github.io/llm-architecture-atlas";

export const GET: APIRoute = async () => {
  const entries = changelog
    .map(
      (e: { date: string; title: string; body: string }) => `
  <entry>
    <id>${site}/#changes-${e.date}</id>
    <updated>${e.date}T00:00:00Z</updated>
    <title>${e.title}</title>
    <content type="text">${e.body}</content>
    <link href="${site}/"/>
  </entry>`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>LLM Architecture Atlas — changes</title>
  <id>${site}/</id>
  <updated>${changelog[0]!.date}T00:00:00Z</updated>
  <link href="${site}/changes.xml" rel="self"/>
${entries}
</feed>`;
  return new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } });
};
