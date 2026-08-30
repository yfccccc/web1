import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolveIdentityDocumentPath } from "@/lib/identity-documents";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; side: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  const { id, side } = await params;
  if (side !== "front" && side !== "back") return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  const member = await prisma.member.findUnique({ where: { id }, select: { identityDocumentFrontPath: true, identityDocumentBackPath: true } });
  const relativePath = side === "front" ? member?.identityDocumentFrontPath : member?.identityDocumentBackPath;
  const filePath = relativePath ? resolveIdentityDocumentPath(relativePath) : null;
  if (!filePath) return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(await readFile(filePath), { headers: { "Content-Type": contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "文件不存在" }, { status: 404 }); }
}
