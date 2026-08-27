import { lookup } from "node:dns/promises";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";
import * as cheerio from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";
import { MAX_SOURCE_BYTES } from "@/src/config";
import { badRequest, payloadTooLarge } from "@/src/domain/errors";
import { MAX_PDF_PAGES, MAX_REMOTE_BYTES, MAX_UPLOAD_BYTES } from "@/src/domain/intake";

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv", "json"]);
const HTML_EXTENSIONS = new Set(["html", "htm"]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const REMOTE_TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

export interface PreparedIntakeSource {
  content: string;
  label: string;
  metadata: Record<string, unknown>;
}

interface DownloadedResource {
  bytes: Uint8Array;
  contentType: string;
  finalUrl: string;
  headers: IncomingHttpHeaders;
}

function normalizeExtractedText(value: string) {
  return value
    .replaceAll("\u0000", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function assertSourceText(content: string) {
  if (!content) {
    throw badRequest(
      "EMPTY_SOURCE",
      "No readable text was found. Try a text-based PDF or paste the content directly.",
    );
  }
  const byteLength = new TextEncoder().encode(content).byteLength;
  if (byteLength > MAX_SOURCE_BYTES) throw payloadTooLarge(MAX_SOURCE_BYTES);
  return content;
}

export function extractReadableHtml(html: string) {
  const $ = cheerio.load(html);
  const title = normalizeExtractedText(
    $("meta[property='og:title']").attr("content") ?? $("title").first().text(),
  ).slice(0, 300);

  $(
    "script, style, noscript, template, svg, canvas, iframe, form, nav, footer, [aria-hidden='true']",
  ).remove();
  const root = $("article").first().length
    ? $("article").first()
    : $("main").first().length
      ? $("main").first()
      : $("body");
  root.find("br").replaceWith("\n");
  root.find("h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, table, section").each((_, node) => {
    $(node).prepend("\n").append("\n");
  });

  return { title, content: assertSourceText(normalizeExtractedText(root.text())) };
}

function extensionOf(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match?.[1]?.toLowerCase() ?? "";
}

async function extractPdf(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes, {
    maxImageSize: 16_777_216,
    stopAtErrors: true,
  });
  try {
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw badRequest(
        "PDF_PAGE_LIMIT",
        `PDF files may contain at most ${MAX_PDF_PAGES} pages. Split this document before importing it.`,
      );
    }
    const result = await extractText(pdf, { mergePages: true });
    return {
      content: assertSourceText(normalizeExtractedText(result.text)),
      pageCount: result.totalPages,
    };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

export async function prepareUploadedFile(file: File): Promise<PreparedIntakeSource> {
  if (!file.name || file.size === 0) {
    throw badRequest("EMPTY_FILE", "Choose a non-empty file to import.");
  }
  if (file.size > MAX_UPLOAD_BYTES) throw payloadTooLarge(MAX_UPLOAD_BYTES);

  const extension = extensionOf(file.name);
  const mediaType = file.type.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const baseMetadata = {
    file_name: file.name,
    media_type: mediaType || "application/octet-stream",
    original_byte_size: file.size,
  };

  if (extension === "pdf" || mediaType === "application/pdf") {
    const result = await extractPdf(bytes);
    return {
      content: result.content,
      label: file.name,
      metadata: { ...baseMetadata, pdf_pages: result.pageCount },
    };
  }

  const decoded = new TextDecoder("utf-8", { fatal: true });
  if (HTML_EXTENSIONS.has(extension) || mediaType === "text/html") {
    try {
      const result = extractReadableHtml(decoded.decode(bytes));
      return {
        content: result.content,
        label: result.title || file.name,
        metadata: baseMetadata,
      };
    } catch (error) {
      if (error instanceof TypeError) {
        throw badRequest("INVALID_TEXT_ENCODING", "HTML files must use UTF-8 text encoding.");
      }
      throw error;
    }
  }

  if (
    TEXT_EXTENSIONS.has(extension) ||
    mediaType.startsWith("text/") ||
    mediaType === "application/json"
  ) {
    try {
      return {
        content: assertSourceText(normalizeExtractedText(decoded.decode(bytes))),
        label: file.name,
        metadata: baseMetadata,
      };
    } catch (error) {
      if (error instanceof TypeError) {
        throw badRequest("INVALID_TEXT_ENCODING", "Text files must use UTF-8 text encoding.");
      }
      throw error;
    }
  }

  throw badRequest(
    "UNSUPPORTED_FILE_TYPE",
    "This file type is not supported. Upload a PDF, TXT, Markdown, CSV, JSON, or HTML file.",
  );
}

function ipv4Number(address: string) {
  return address
    .split(".")
    .map(Number)
    .reduce((value, octet) => (value * 256 + octet) >>> 0, 0);
}

function inIpv4Range(address: string, base: string, prefix: number) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
}

export function isPublicNetworkAddress(address: string) {
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  const family = isIP(normalized);
  if (family === 4) {
    const blockedRanges: Array<[string, number]> = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ];
    return !blockedRanges.some(([base, prefix]) => inIpv4Range(normalized, base, prefix));
  }
  if (family === 6) {
    const embeddedIpv4 = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (embeddedIpv4 && !isPublicNetworkAddress(embeddedIpv4)) return false;
    if (normalized === "::" || normalized === "::1") return false;
    if (normalized.startsWith("::ffff:") || normalized.startsWith("64:ff9b:")) return false;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
    if (/^fe[89ab]/.test(normalized) || normalized.startsWith("ff")) return false;
    if (normalized.startsWith("2001:db8:")) return false;
    return true;
  }
  return false;
}

function validatedUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw badRequest("INVALID_URL", "Enter a complete website URL, including https://.");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw badRequest("INVALID_URL_SCHEME", "Only HTTP and HTTPS website URLs can be imported.");
  }
  if (url.username || url.password) {
    throw badRequest("URL_CREDENTIALS_BLOCKED", "Website URLs cannot contain credentials.");
  }
  const effectivePort = url.port || (url.protocol === "https:" ? "443" : "80");
  if (!new Set(["80", "443"]).has(effectivePort)) {
    throw badRequest("URL_PORT_BLOCKED", "Website imports are limited to standard web ports.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw badRequest("PRIVATE_URL_BLOCKED", "Private and local network URLs cannot be imported.");
  }
  return url;
}

async function resolvePublicTarget(hostname: string) {
  const literal = hostname.replace(/^\[|\]$/g, "");
  const records = isIP(literal)
    ? [{ address: literal, family: isIP(literal) as 4 | 6 }]
    : await lookup(literal, { all: true, verbatim: true });
  if (!records.length || records.some((record) => !isPublicNetworkAddress(record.address))) {
    throw badRequest("PRIVATE_URL_BLOCKED", "Private and local network URLs cannot be imported.");
  }
  return records.find((record) => record.family === 4) ?? records[0];
}

async function downloadOnce(url: URL): Promise<{
  bytes: Uint8Array;
  headers: IncomingHttpHeaders;
  statusCode: number;
}> {
  const target = await resolvePublicTarget(url.hostname);
  const originalHostname = url.hostname.replace(/^\[|\]$/g, "");
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? requestHttps : requestHttp;
    const request = transport(
      {
        protocol: url.protocol,
        hostname: target.address,
        family: target.family,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: isIP(originalHostname) ? undefined : originalHostname,
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9",
          "Accept-Encoding": "identity",
          Host: url.host,
          "User-Agent": "Axelyn-Knowledge-Importer/1.0",
        },
      },
      (response) => {
        const declaredLength = Number(response.headers["content-length"] ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_BYTES) {
          response.destroy();
          reject(payloadTooLarge(MAX_REMOTE_BYTES));
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        response.on("data", (chunk: Buffer) => {
          received += chunk.byteLength;
          if (received > MAX_REMOTE_BYTES) {
            response.destroy(payloadTooLarge(MAX_REMOTE_BYTES));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            bytes: new Uint8Array(Buffer.concat(chunks)),
            headers: response.headers,
            statusCode: response.statusCode ?? 0,
          });
        });
        response.on("error", reject);
      },
    );
    request.setTimeout(REMOTE_TIMEOUT_MS, () => {
      request.destroy(new Error("The website took too long to respond."));
    });
    request.on("error", reject);
    request.end();
  });
}

async function downloadPublicResource(input: string): Promise<DownloadedResource> {
  let url = validatedUrl(input);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await downloadOnce(url);
    if (REDIRECT_STATUSES.has(response.statusCode)) {
      const location = response.headers.location;
      if (!location)
        throw badRequest("INVALID_REDIRECT", "The website returned an empty redirect.");
      url = validatedUrl(new URL(location, url).toString());
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw badRequest(
        "WEBSITE_FETCH_FAILED",
        `The website returned HTTP ${response.statusCode}. Check that the page is public and try again.`,
      );
    }
    const contentEncoding = String(response.headers["content-encoding"] ?? "identity");
    if (contentEncoding !== "identity") {
      throw badRequest(
        "WEBSITE_ENCODING_UNSUPPORTED",
        "The website returned an unsupported compressed response.",
      );
    }
    return {
      bytes: response.bytes,
      headers: response.headers,
      contentType: String(response.headers["content-type"] ?? "").toLowerCase(),
      finalUrl: url.toString(),
    };
  }
  throw badRequest(
    "TOO_MANY_REDIRECTS",
    `Website imports may follow at most ${MAX_REDIRECTS} redirects.`,
  );
}

function decodeRemoteText(bytes: Uint8Array, contentType: string) {
  const charset = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(contentType)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    throw badRequest(
      "WEBSITE_CHARSET_UNSUPPORTED",
      `The website uses an unsupported ${charset} encoding.`,
    );
  }
}

export async function prepareWebsite(urlInput: string): Promise<PreparedIntakeSource> {
  let resource: DownloadedResource;
  try {
    resource = await downloadPublicResource(urlInput);
  } catch (error) {
    if (error instanceof Error && error.message === "The website took too long to respond.") {
      throw badRequest("WEBSITE_TIMEOUT", error.message);
    }
    throw error;
  }

  const isPdf =
    resource.contentType.includes("application/pdf") ||
    new URL(resource.finalUrl).pathname.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const result = await extractPdf(resource.bytes);
    return {
      content: result.content,
      label:
        new URL(resource.finalUrl).pathname.split("/").filter(Boolean).at(-1) ?? resource.finalUrl,
      metadata: {
        source_url: urlInput,
        fetched_url: resource.finalUrl,
        content_type: resource.contentType || "application/pdf",
        pdf_pages: result.pageCount,
      },
    };
  }

  const supported =
    resource.contentType.includes("text/html") ||
    resource.contentType.includes("application/xhtml+xml") ||
    resource.contentType.startsWith("text/plain");
  if (!supported) {
    throw badRequest(
      "UNSUPPORTED_WEBSITE_TYPE",
      "This URL does not return a readable web page, plain text, or PDF.",
    );
  }

  const decoded = decodeRemoteText(resource.bytes, resource.contentType);
  const parsed = resource.contentType.startsWith("text/plain")
    ? { title: "", content: assertSourceText(normalizeExtractedText(decoded)) }
    : extractReadableHtml(decoded);
  return {
    content: parsed.content,
    label: parsed.title || new URL(resource.finalUrl).hostname,
    metadata: {
      source_url: urlInput,
      fetched_url: resource.finalUrl,
      page_title: parsed.title || undefined,
      content_type: resource.contentType,
    },
  };
}
