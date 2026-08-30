import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const MAX_IDENTITY_DOCUMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function validateIdentityDocument(file: unknown): file is File {
  return file instanceof File && Boolean(ALLOWED_TYPES[file.type.toLowerCase()]) && file.size > 0 && file.size <= MAX_IDENTITY_DOCUMENT_BYTES;
}

export async function storeIdentityDocument(memberId: string, side: "front" | "back", file: File) {
  if (!validateIdentityDocument(file)) throw new Error("INVALID_IDENTITY_DOCUMENT");
  const ext = ALLOWED_TYPES[file.type.toLowerCase()];
  const relativePath = path.posix.join(memberId, `${side}-${randomUUID()}${ext}`);
  const root = path.resolve(process.cwd(), "storage", "identity-documents");
  const outputPath = path.resolve(root, relativePath);
  if (!outputPath.startsWith(`${root}${path.sep}`)) throw new Error("INVALID_IDENTITY_DOCUMENT_PATH");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(await file.arrayBuffer()), { mode: 0o600 });
  return relativePath;
}

export function resolveIdentityDocumentPath(relativePath: string) {
  const root = path.resolve(process.cwd(), "storage", "identity-documents");
  const outputPath = path.resolve(root, relativePath);
  return outputPath.startsWith(`${root}${path.sep}`) ? outputPath : null;
}
