const { readFileSync, mkdirSync, writeFileSync } = require("node:fs") as typeof import("node:fs");
const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
const { resolve, dirname } = require("node:path") as typeof import("node:path");
const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client");
const bcrypt = require("bcryptjs") as typeof import("bcryptjs");
const { normalizeRichTextField } = require("../lib/brand-content") as typeof import("../lib/brand-content");
const { generateMemberSiteSeo } = require("../lib/member-site-seo") as typeof import("../lib/member-site-seo");
const { buildSafeErrorLog, maskEmail } = require("../lib/log-safety") as typeof import("../lib/log-safety");
const { buildLegacyImportDryRunSummary, generateLegacyTemporaryPassword } = require("../lib/legacy-import-safety") as typeof import("../lib/legacy-import-safety");

type TemplateKey = "brand_showcase" | "professional_service" | "simple_elegant";

type LegacyCompanyRow = {
  id?: number | string | null;
  company_id?: number | string | null;
  name?: string | null;
  short_name?: string | null;
  content?: string | null;
  logo?: string | null;
  banner?: string | null;
  video?: string | null;
  signature?: string | null;
  business_license?: string | null;
  license_code?: string | null;
  legal_person?: string | null;
  register_capital?: number | string | null;
  business_scope?: string | null;
  start_deadline?: string | null;
  end_deadline?: string | null;
  contact?: string | null;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  email?: string | null;
  website?: string | null;
  wechat_qrcode?: string | null;
  province_name?: string | null;
  city_name?: string | null;
  divide?: string | null;
  tag_names?: string | null;
  domain?: string | null;
  theme_color?: string | null;
  status?: number | string | null;
  is_vip?: number | string | null;
  targetMemberId?: string | null;
  user_id?: number | string | null;
  username?: string | null;
  user_email?: string | null;
  user_mobile?: string | null;
  user_password_hash?: string | null;
  user_name?: string | null;
  user_nickname?: string | null;
};

type MemberMap = Record<string, string>;

type MemberSiteSettings = {
  template: TemplateKey;
  heroTitle: string;
  heroSubtitle: string;
  contactLabel: string;
  modules: {
    intro: boolean;
    advantages: boolean;
    tags: boolean;
    news: boolean;
    gallery: boolean;
    contact: boolean;
    standards: boolean;
    terms: boolean;
    video: boolean;
  };
  seo: {
    title: string;
    keywords: string;
    description: string;
  };
  sync: {
    websiteUrl: string;
    apiEndpoint: string;
    rssUrl: string;
    syncEnabled: boolean;
  };
};

type ParsedArgs = {
  inputPath: string;
  memberMapPath?: string;
  apply: boolean;
  siteSettings: boolean;
  syncMemberType: boolean;
  reportPath?: string;
};

type MemberSnapshot = {
  id: string;
  name: string | null;
  memberType: string;
  email: string;
};

type ImportReportRow = {
  legacyId: string;
  memberId: string;
  enterpriseId: string;
  brandId: string;
  account: string;
  usedLegacyPassword: boolean;
  passwordGenerated: boolean;
  passwordResetRequired: boolean;
  companyName: string | null;
  memberType: string;
  isRecommend: boolean;
  sortOrder: number;
  mode: "dry-run" | "apply";
  targetSlug: string;
};

const prisma = new PrismaClient();
const importRequestId = randomUUID();
let importStage = "LEGACY_IMPORT_READ_SOURCE_FAILED";
let currentLegacyId: string | null = null;
let currentMaskedAccount: string | null = null;

function usage() {
  console.log(
    [
      "Usage:",
      "  npx ts-node --transpile-only scripts/import-legacy-companies-v2.ts --input <legacy.json> [--member-map <member-map.json>] [--apply] [--sync-member-type] [--skip-site-settings] [--report <report.json>]",
      "",
      "Notes:",
      "  - Default mode is dry-run. Add --apply to write to the database.",
      "  - Input JSON must be an array of legacy company rows.",
      "  - If no mapped member exists, the script creates a new member from the legacy user account.",
      "  - Legacy bcrypt hashes with $2y$ are normalized to $2a$ on import.",
    ].join("\n")
  );
}

function parseArgs(argv: string[]): ParsedArgs {
  let inputPath = "";
  let memberMapPath: string | undefined;
  let apply = false;
  let siteSettings = true;
  let syncMemberType = false;
  let reportPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      inputPath = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--member-map") {
      memberMapPath = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--report") {
      reportPath = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    if (arg === "--skip-site-settings") {
      siteSettings = false;
      continue;
    }
    if (arg === "--sync-member-type") {
      syncMemberType = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }
  }

  if (!inputPath) {
    usage();
    throw new Error("Missing required --input argument.");
  }

  return { inputPath, memberMapPath, apply, siteSettings, syncMemberType, reportPath };
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(resolve(filePath), "utf8")) as T;
}

function writeJsonFile(filePath: string, value: unknown) {
  const fullPath = resolve(filePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableString(value: unknown) {
  const normalized =
    typeof value === "number" || typeof value === "bigint"
      ? String(value)
      : asString(value);
  return normalized.length > 0 ? normalized : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function resolveLegacyKey(row: LegacyCompanyRow) {
  const companyId = asNumber(row.company_id);
  if (companyId && companyId > 0) {
    return String(companyId);
  }

  const fallbackId = asNumber(row.id);
  if (fallbackId && fallbackId > 0) {
    return String(fallbackId);
  }

  return asNullableString(row.company_id) ?? asNullableString(row.id) ?? "unknown";
}

function joinParts(parts: Array<string | null>) {
  const normalized = parts.map((part) => (part ?? "").trim()).filter(Boolean);
  return normalized.length > 0 ? normalized.join(" | ") : null;
}

function limitText(value: string | null, maxLength: number) {
  if (!value) return "";
  if (value.length <= maxLength) return value;
  const safeLength = Math.max(3, maxLength - 3);
  return `${value.slice(0, safeLength)}...`;
}

function toAbsoluteUrl(pathOrUrl: string | null) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!pathOrUrl.startsWith("/")) return `https://${pathOrUrl}`;
  return `https://jiu.cnzhengmu.com${pathOrUrl}`;
}

function chooseTemplate(row: LegacyCompanyRow): TemplateKey {
  if (asNumber(row.is_vip) === 1) return "brand_showcase";
  return asString(row.video) ? "professional_service" : "simple_elegant";
}

function slugifyBrandName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "legacy-brand";
}

function buildPreferredBrandSlug(preferredName: string, legacyKey: string) {
  const baseFromName = slugifyBrandName(preferredName);
  return baseFromName === "legacy-brand" ? `legacy-brand-${legacyKey}` : baseFromName;
}

async function resolveUniqueBrandSlug(
  tx: import("@prisma/client").Prisma.TransactionClient,
  preferredName: string,
  legacyKey: string,
  existingBrandId?: string
) {
  const base = buildPreferredBrandSlug(preferredName, legacyKey);
  let candidate = base;
  let counter = 2;

  for (;;) {
    const hit = await tx.brand.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!hit || (existingBrandId && hit.id === existingBrandId)) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

function sanitizeAccountPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
}

function chooseAccount(row: LegacyCompanyRow) {
  const candidates = [
    asString(row.username),
    asString(row.user_email),
    asString(row.user_mobile),
    asString(row.short_name),
    asString(row.name),
  ];

  for (const candidate of candidates) {
    const normalized = sanitizeAccountPart(candidate);
    if (normalized.length >= 4) return normalized;
  }

  return `legacy-company-${resolveLegacyKey(row)}`;
}

function normalizeLegacyPasswordHash(value: string | null) {
  if (!value) return null;
  return value.replace(/^\$2y\$/, "$2a$");
}

function buildFallbackPassword(row: LegacyCompanyRow) {
  void row;
  return generateLegacyTemporaryPassword();
}

function buildIntro(row: LegacyCompanyRow) {
  return normalizeRichTextField(joinParts([asNullableString(row.content), asNullableString(row.business_scope)]));
}

function buildContactInfo(row: LegacyCompanyRow) {
  return joinParts([
    asNullableString(row.contact),
    asNullableString(row.email) ? `email: ${asString(row.email)}` : null,
    asNullableString(row.fax) ? `fax: ${asString(row.fax)}` : null,
    asNullableString(row.wechat_qrcode)
      ? `wechat_qrcode: ${toAbsoluteUrl(asNullableString(row.wechat_qrcode))}`
      : null,
  ]);
}

function buildRegion(row: LegacyCompanyRow) {
  return asNullableString(row.province_name) ?? asNullableString(row.divide);
}

function buildArea(row: LegacyCompanyRow) {
  const province = asNullableString(row.province_name);
  const city = asNullableString(row.city_name);
  if (province && city) return `${province} ${city}`;
  return city ?? asNullableString(row.divide);
}

function buildTags(row: LegacyCompanyRow) {
  const tagNames = asString(row.tag_names);
  if (!tagNames) return [];
  return tagNames
    .split(/[,，|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSiteSettings(row: LegacyCompanyRow): MemberSiteSettings {
  const companyName = asString(row.short_name) || asString(row.name) || "Enterprise";
  const intro = buildIntro(row);
  const contactLabel = asString(row.contact) ? "Contact Person" : "Contact Us";
  const tags = buildTags(row);
  const generatedSeo = generateMemberSiteSeo({
    companyName: asNullableString(row.name),
    companyShortName: asNullableString(row.short_name),
    heroTitle: companyName,
    heroSubtitle: asNullableString(row.signature) ?? asNullableString(row.business_scope),
    intro,
    positioning: asNullableString(row.signature),
    productSystem: asNullableString(row.business_scope),
    city: buildArea(row),
    region: buildRegion(row),
  });

  return {
    template: chooseTemplate(row),
    heroTitle: companyName,
    heroSubtitle: limitText(
      asNullableString(row.signature) ??
        asNullableString(row.business_scope) ??
        intro ??
        "Structured enterprise profile with company strength, service capability, and industry participation.",
      120
    ),
    contactLabel,
    modules: {
      intro: Boolean(intro || asNullableString(row.address)),
      advantages: Boolean(tags.length > 0 || asNullableString(row.business_scope)),
      tags: tags.length > 0,
      news: true,
      gallery: Boolean(asNullableString(row.banner) || asNullableString(row.logo)),
      contact: Boolean(buildContactInfo(row) || asNullableString(row.phone) || asNullableString(row.website)),
      standards: false,
      terms: false,
      video: Boolean(asNullableString(row.video)),
    },
    seo: {
      title: generatedSeo.title,
      keywords: tags.join(","),
      description: generatedSeo.description,
    },
    sync: {
      websiteUrl: toAbsoluteUrl(asNullableString(row.website)) ?? "",
      apiEndpoint: "",
      rssUrl: "",
      syncEnabled: false,
    },
  };
}

function resolveMemberId(row: LegacyCompanyRow, memberMap: MemberMap) {
  const inline = asNullableString(row.targetMemberId);
  if (inline) return inline;

  const keys = [
    resolveLegacyKey(row),
    asNullableString(row.company_id),
    asNullableString(row.id),
    asNullableString(row.domain),
    asNullableString(row.short_name),
    asNullableString(row.name),
  ].filter(Boolean) as string[];

  for (const key of keys) {
    if (memberMap[key]) return memberMap[key];
  }

  return null;
}

function buildEnterprisePatch(row: LegacyCompanyRow) {
  const companyName = asNullableString(row.name);
  const companyShortName = asNullableString(row.short_name) ?? companyName;
  const intro = buildIntro(row);
  const contactInfo = buildContactInfo(row);

  return {
    companyName,
    companyShortName,
    contactPerson: asNullableString(row.contact),
    website: toAbsoluteUrl(asNullableString(row.website)),
    address: asNullableString(row.address),
    licenseCode: asNullableString(row.license_code),
    foundedAt: asNullableString(row.start_deadline),
    registeredCapital:
      row.register_capital == null || row.register_capital === "" ? null : String(row.register_capital),
    verificationStatus: asNumber(row.status) === 1 ? "approved" : "pending",
    verifiedAt: asNumber(row.status) === 1 ? new Date() : null,
    intro,
    logoUrl: toAbsoluteUrl(asNullableString(row.logo)),
    positioning: asNullableString(row.signature),
    productSystem: asNullableString(row.business_scope),
    craftLevel: null,
    region: buildRegion(row),
    area: buildArea(row),
    certifications: joinParts([
      asNullableString(row.legal_person) ? `legal_person: ${asString(row.legal_person)}` : null,
      asNullableString(row.business_license)
        ? `business_license: ${toAbsoluteUrl(asNullableString(row.business_license))}`
        : null,
    ]),
    awards: null,
    contactInfo,
    contactPhone: asNullableString(row.phone),
    relatedStandards: null,
    relatedTerms: null,
    relatedBrands: null,
    videoUrl: toAbsoluteUrl(asNullableString(row.video)),
  };
}

function buildBrandPatch(row: LegacyCompanyRow, enterpriseId: string, nextMemberType: string) {
  const brandName =
    asNullableString(row.short_name) ??
    asNullableString(row.name) ??
    `legacy-brand-${asNullableString(row.company_id) ?? asNullableString(row.id) ?? "unknown"}`;
  const isVip = asNumber(row.is_vip) === 1;
  const rankingWeight = isVip ? 20 : 0;
  const sortOrder = isVip ? 100 : 10;

  return {
    name: brandName,
    enterpriseId,
    logoUrl: toAbsoluteUrl(asNullableString(row.logo)),
    tagline:
      asNullableString(row.signature) ??
      limitText(buildIntro(row), 90) ??
      null,
    region: buildRegion(row),
    area: buildArea(row),
    positioning: asNullableString(row.signature),
    materialSystem: null,
    productStructure: asNullableString(row.business_scope),
    priceRange: null,
    targetAudience: null,
    businessModel: null,
    contactUrl: toAbsoluteUrl(asNullableString(row.website)),
    certUrl: toAbsoluteUrl(asNullableString(row.business_license)),
    isRecommend: isVip,
    isBrandVisible: true,
    sortOrder,
    rankingWeight,
    displayTemplate: chooseTemplate(row),
    memberTypeSnapshot: nextMemberType,
  };
}

async function findExistingMember(mappedMemberId: string | null, account: string): Promise<MemberSnapshot | null> {
  if (mappedMemberId) {
    return prisma.member.findUnique({
      where: { id: mappedMemberId },
      select: { id: true, name: true, memberType: true, email: true },
    });
  }

  return prisma.member.findUnique({
    where: { email: account },
    select: { id: true, name: true, memberType: true, email: true },
  });
}

async function findExistingMemberByEnterpriseIdentity(row: LegacyCompanyRow): Promise<MemberSnapshot | null> {
  const companyName = asNullableString(row.name);
  const companyShortName = asNullableString(row.short_name);

  if (!companyName && !companyShortName) {
    return null;
  }

  const enterprise = await prisma.enterprise.findFirst({
    where: {
      OR: [
        companyName ? { companyName } : undefined,
        companyShortName ? { companyShortName } : undefined,
      ].filter(Boolean) as Array<{ companyName?: string; companyShortName?: string }>,
    },
    select: {
      member: {
        select: { id: true, name: true, memberType: true, email: true },
      },
    },
  });

  return enterprise?.member ?? null;
}

async function main() {
  importStage = "LEGACY_IMPORT_READ_SOURCE_FAILED";
  const args = parseArgs(process.argv.slice(2));
  const rows = readJsonFile<LegacyCompanyRow[]>(args.inputPath);
  const memberMap = args.memberMapPath ? readJsonFile<MemberMap>(args.memberMapPath) : {};

  let imported = 0;
  let skipped = 0;
  let siteSettingsCount = 0;
  const warnings: string[] = [];
  const report: ImportReportRow[] = [];

  for (const row of rows) {
    const legacyId = resolveLegacyKey(row);
    const mappedMemberId = resolveMemberId(row, memberMap);
    const account = chooseAccount(row);
    currentLegacyId = legacyId;
    currentMaskedAccount = maskEmail(account);
    importStage = "LEGACY_IMPORT_VALIDATE_FAILED";
    const normalizedLegacyPasswordHash = normalizeLegacyPasswordHash(asNullableString(row.user_password_hash));
    const generatedPassword = normalizedLegacyPasswordHash ? null : buildFallbackPassword(row);
    const nextMemberType = asNumber(row.is_vip) === 1 ? "enterprise_advanced" : "enterprise_basic";
    const enterprisePatch = buildEnterprisePatch(row);
    const dryRunBrandPatch = buildBrandPatch(row, "__dry_run_enterprise__", nextMemberType);
    const siteSettings = buildSiteSettings(row);

    let member = await findExistingMember(mappedMemberId, account);

    if (!member) {
      member = await findExistingMemberByEnterpriseIdentity(row);
    }

    if (mappedMemberId && !member) {
      skipped += 1;
      warnings.push(`skip legacy=${legacyId}: mapped member ${mappedMemberId} not found`);
      continue;
    }

    if (!args.apply) {
      report.push({
        legacyId,
        memberId: member?.id ?? "",
        enterpriseId: "",
        brandId: "",
        account: maskEmail(member?.email ?? account),
        usedLegacyPassword: Boolean(normalizedLegacyPasswordHash),
        passwordGenerated: Boolean(generatedPassword),
        passwordResetRequired: Boolean(generatedPassword),
        companyName: enterprisePatch.companyShortName ?? enterprisePatch.companyName,
        memberType: args.syncMemberType ? nextMemberType : member?.memberType ?? nextMemberType,
        isRecommend: nextMemberType === "enterprise_advanced",
        sortOrder: nextMemberType === "enterprise_advanced" ? 100 : 10,
        mode: "dry-run",
        targetSlug: buildPreferredBrandSlug(dryRunBrandPatch.name, legacyId),
      });
      imported += 1;
      if (args.siteSettings) siteSettingsCount += 1;
      console.log(
        JSON.stringify(
          buildLegacyImportDryRunSummary({
            legacyId,
            memberId: member?.id ?? null,
            account: member?.email ?? account,
            usedLegacyPassword: Boolean(normalizedLegacyPasswordHash),
            passwordGenerated: Boolean(generatedPassword),
            memberTypeBefore: member?.memberType ?? null,
            memberTypeAfter: args.syncMemberType ? nextMemberType : member?.memberType ?? nextMemberType,
            enterprisePatch,
            brandPatch: dryRunBrandPatch,
            siteModules: args.siteSettings ? siteSettings.modules : null,
          }),
          null,
          2
        )
      );
      continue;
    }

    let createdMember = false;

    importStage = "LEGACY_IMPORT_MEMBER_WRITE_FAILED";
    await prisma.$transaction(async (tx) => {
      if (!member) {
        const passwordHash = normalizedLegacyPasswordHash ?? (await bcrypt.hash(generatedPassword!, 10));
        member = await tx.member.create({
          data: {
            email: account,
            name:
              asNullableString(row.user_nickname) ??
              asNullableString(row.user_name) ??
              enterprisePatch.companyShortName ??
              enterprisePatch.companyName,
            role: "MEMBER",
            membershipLevel: "member",
            memberType: nextMemberType,
            rankingWeight: asNumber(row.is_vip) === 1 ? 20 : 0,
            passwordHash,
            passwordPlaintext: generatedPassword,
          },
          select: { id: true, name: true, memberType: true, email: true },
        });
        createdMember = true;
      }

      await tx.enterprise.upsert({
        where: { memberId: member.id },
        create: {
          memberId: member.id,
          ...enterprisePatch,
        },
        update: enterprisePatch,
      });

      const enterprise = await tx.enterprise.findUnique({
        where: { memberId: member.id },
        select: { id: true, brand: { select: { id: true, slug: true } } },
      });

      if (!enterprise) {
        throw new Error(`Enterprise upsert failed for legacy ${legacyId}`);
      }

      const brandPatch = buildBrandPatch(row, enterprise.id, nextMemberType);
      const resolvedSlug = await resolveUniqueBrandSlug(
        tx,
        brandPatch.name,
        legacyId,
        enterprise.brand?.id
      );

      await tx.brand.upsert({
        where: enterprise.brand?.id ? { id: enterprise.brand.id } : { slug: resolvedSlug },
        create: {
          ...brandPatch,
          slug: resolvedSlug,
        },
        update: {
          ...brandPatch,
          slug: resolvedSlug,
        },
      });

      if (args.siteSettings) {
        await tx.appSetting.upsert({
          where: { key: `member_site_settings:${member.id}` },
          create: {
            key: `member_site_settings:${member.id}`,
            value: JSON.stringify(siteSettings),
          },
          update: {
            value: JSON.stringify(siteSettings),
          },
        });
      }

      if (args.syncMemberType || createdMember) {
        member = await tx.member.update({
          where: { id: member.id },
          data: {
            memberType: nextMemberType,
            rankingWeight: asNumber(row.is_vip) === 1 ? 20 : 0,
            name: member.name?.trim() ? member.name : enterprisePatch.companyShortName ?? enterprisePatch.companyName,
          },
          select: { id: true, name: true, memberType: true, email: true },
        });
      }
    });

    imported += 1;
    if (args.siteSettings) siteSettingsCount += 1;
    report.push({
      legacyId,
      memberId: member.id,
      enterpriseId:
        (
          await prisma.enterprise.findUnique({
            where: { memberId: member.id },
            select: { id: true, brand: { select: { id: true } } },
          })
        )?.id ?? "",
      brandId:
        (
          await prisma.enterprise.findUnique({
            where: { memberId: member.id },
            select: { brand: { select: { id: true } } },
          })
        )?.brand?.id ?? "",
      account: maskEmail(member.email),
      usedLegacyPassword: Boolean(normalizedLegacyPasswordHash),
      passwordGenerated: Boolean(generatedPassword),
      passwordResetRequired: Boolean(generatedPassword),
      companyName: enterprisePatch.companyShortName ?? enterprisePatch.companyName,
      memberType: member.memberType,
      isRecommend: nextMemberType === "enterprise_advanced",
      sortOrder: nextMemberType === "enterprise_advanced" ? 100 : 10,
      mode: "apply",
      targetSlug:
        (
          await prisma.enterprise.findUnique({
            where: { memberId: member.id },
            select: { brand: { select: { slug: true } } },
          })
        )?.brand?.slug ?? "",
    });
    console.log(`imported legacy=${legacyId} -> member=${member.id} (${maskEmail(member.email)})`);
  }

  console.log("");
  console.log(`Rows processed: ${rows.length}`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Site settings written: ${siteSettingsCount}`);

  if (warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    warnings.forEach((warning) => console.log(`- ${warning}`));
  }

  if (args.reportPath) {
    importStage = "LEGACY_IMPORT_REPORT_WRITE_FAILED";
    writeJsonFile(args.reportPath, report);
    console.log("");
    console.log(`Report written: ${args.reportPath}`);
  }
}

main()
  .catch((error) => {
    console.error("legacy company import failed", {
      ...buildSafeErrorLog({
        eventCode: importStage,
        requestId: importRequestId,
        stage: importStage,
        targetId: currentLegacyId,
      }, error),
      account: currentMaskedAccount,
    });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
