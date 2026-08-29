import { describe, expect, it } from "vitest";
import type { KnowledgeSource } from "@/src/domain/models";
import type { ExtractionOutput } from "@/src/domain/schemas";
import {
  extractReadableHtml,
  isPublicNetworkAddress,
  prepareUploadedFile,
} from "@/src/services/operator-intake";
import {
  applyOperatorIntakeSensitivity,
  enforceInsertClassification,
} from "@/src/services/source-service";

describe("operator source intake", () => {
  it("extracts article text while discarding executable and navigational HTML", () => {
    const parsed = extractReadableHtml(`
      <html>
        <head><title>Evidence paths</title><script>stealSecrets()</script></head>
        <body>
          <nav>Unrelated navigation</nav>
          <article><h1>Reviewable systems</h1><p>Show the evidence path.</p></article>
          <footer>Unrelated footer</footer>
        </body>
      </html>
    `);

    expect(parsed.title).toBe("Evidence paths");
    expect(parsed.content).toContain("Reviewable systems");
    expect(parsed.content).toContain("Show the evidence path.");
    expect(parsed.content).not.toContain("stealSecrets");
    expect(parsed.content).not.toContain("Unrelated navigation");
  });

  it("reads supported UTF-8 text files and preserves the file receipt", async () => {
    const file = new File(["First idea.\n\nSecond idea."], "research.md", {
      type: "text/markdown",
    });
    const prepared = await prepareUploadedFile(file);

    expect(prepared.label).toBe("research.md");
    expect(prepared.content).toBe("First idea.\n\nSecond idea.");
    expect(prepared.metadata).toMatchObject({
      file_name: "research.md",
      media_type: "text/markdown",
    });
  });

  it("rejects file formats that cannot be converted to source text", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "archive.zip", {
      type: "application/zip",
    });
    await expect(prepareUploadedFile(file)).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE",
    });
  });

  it("blocks local, private, link-local, and documentation network addresses", () => {
    expect(isPublicNetworkAddress("127.0.0.1")).toBe(false);
    expect(isPublicNetworkAddress("10.20.30.40")).toBe(false);
    expect(isPublicNetworkAddress("169.254.169.254")).toBe(false);
    expect(isPublicNetworkAddress("192.0.2.10")).toBe(false);
    expect(isPublicNetworkAddress("::1")).toBe(false);
    expect(isPublicNetworkAddress("fd00::1")).toBe(false);
    expect(isPublicNetworkAddress("2606:4700:4700::1111")).toBe(true);
    expect(isPublicNetworkAddress("1.1.1.1")).toBe(true);
  });

  it("applies the operator's access ceiling to every extracted proposal", () => {
    const source: KnowledgeSource = {
      id: "00000000-0000-4000-8000-000000000001",
      workspace_id: "axelyn",
      source_system: "operator-console",
      source_type: "operator_evidence",
      external_id: "intake-text-test",
      source_version: 1,
      content: "Reviewable systems expose evidence paths.",
      metadata: { operator_intake: { sensitivity: "CONFIDENTIAL" } },
      content_hash: "a".repeat(64),
      occurred_at: "2026-08-27T00:00:00.000Z",
      verification_assertion: null,
      created_by: "operator@example.com",
      created_at: "2026-08-27T00:00:00.000Z",
    };
    const output: ExtractionOutput = {
      nodes: [
        {
          temp_id: "n1",
          type: "OBSERVATION",
          title: "Reviewable systems",
          canonical_statement: "Reviewable systems expose evidence paths.",
          metadata: {},
          confidence: 0.8,
          importance: 0.5,
          salience: 0.5,
          sensitivity: "PUBLIC",
          source_excerpt: "evidence paths",
          suggested_duplicate_candidates: [],
          potential_contradictions: [],
          rationale: "The source makes this claim.",
        },
      ],
      edges: [],
      audit_summary: "One claim extracted.",
    };

    expect(applyOperatorIntakeSensitivity(source, output).nodes[0].sensitivity).toBe(
      "CONFIDENTIAL",
    );
  });

  it("accepts only INSERT classifications for extracted knowledge", () => {
    const output = {
      nodes: [
        {
          temp_id: "n1",
          type: "FACT" as const,
          title: "Evidence paths",
          canonical_statement: "Reviewable systems expose evidence paths.",
          metadata: {},
          confidence: 0.8,
          importance: 0.5,
          salience: 0.5,
          sensitivity: "INTERNAL" as const,
          source_excerpt: "evidence paths",
          suggested_duplicate_candidates: [],
          potential_contradictions: [],
          rationale: "The source supports this reusable statement.",
        },
      ],
      edges: [],
      audit_summary: "One statement extracted.",
    };

    expect(enforceInsertClassification(output).nodes[0].type).toBe("FACT");
  });
});
