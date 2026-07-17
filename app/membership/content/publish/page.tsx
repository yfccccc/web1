"use client";

export const dynamic = "force-dynamic";

import nextDynamic from "next/dynamic";
import Link from "next/link";
import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CONTENT_TAB_DEFS,
  MEMBER_PUBLISH_CATEGORY_OPTIONS,
  resolveTabKeyFromHref,
  type CategoryOption,
  type ContentTabKey,
} from "@/lib/content-taxonomy";
import { suggestTagsFromText } from "@/lib/tag-suggest";
import {
  brandStructuredToSearchText,
  buildBrandStructuredHtml,
  createDefaultBrandStructuredData,
  parseBrandStructuredHtml,
  type BrandStructuredData,
} from "@/lib/brand-structured";
import {
  buildStandardStructuredHtml,
  createDefaultStandardStructuredData,
  parseStandardStructuredHtml,
  standardStructuredToSearchText,
  type StandardStructuredData,
} from "@/lib/standard-structured";
import {
  buildDataStructuredHtml,
  createDefaultDataStructuredData,
  dataStructuredToSearchText,
  parseDataStructuredHtml,
  type DataStructuredData,
} from "@/lib/data-structured";
import {
  awardStructuredToSearchText,
  buildAwardStructuredHtml,
  createDefaultAwardStructuredData,
  parseAwardStructuredHtml,
  type AwardStructuredData,
} from "@/lib/award-structured";
import { uploadImageToServer } from "@/lib/client-image";
import { resolveUploadedImageUrl } from "@/lib/uploaded-image";
import { buildGeoExcerpt, previewText } from "@/lib/text";
import { suggestTagsForGeo } from "@/lib/tag-suggest";
import { buildNewsPath } from "@/lib/share-config";
import {
  createEmptyDocumentMetadata,
  parseDocumentMetadata,
  stringifyDocumentMetadata,
  type DocumentMetadata,
} from "@/lib/document-metadata";
import {
  buildAutoSeoDescription,
  buildAutoSeoKeywords,
  buildAutoSeoTitle,
  hasAutoSeoSource,
} from "@/lib/document-seo";
import { slugify } from "@/lib/slug";
import { InlinePageBackLink } from "@/components/InlinePageBackLink";
import { PUBLIC_CONTACT_PHONE } from "@/lib/public-site-config";
import { buildDirtyTextErrorMessage } from "@/lib/article-input-guard";

function LazyEditorPlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4 text-sm text-muted">
      {label}加载中...
    </div>
  );
}

const ImageCropDialog = nextDynamic(
  () => import("@/components/ImageCropDialog").then((mod) => mod.ImageCropDialog),
  {
    ssr: false,
    loading: () => <LazyEditorPlaceholder label="图片裁剪器" />,
  }
);

const RichEditor = nextDynamic(() => import("@/components/RichEditor").then((mod) => mod.RichEditor), {
  ssr: false,
  loading: () => <LazyEditorPlaceholder label="富文本编辑器" />,
});

const BrandStructuredEditor = nextDynamic(
  () => import("@/components/BrandStructuredEditor").then((mod) => mod.BrandStructuredEditor),
  {
    ssr: false,
    loading: () => <LazyEditorPlaceholder label="品牌结构化编辑器" />,
  }
);

const StandardStructuredEditor = nextDynamic(
  () => import("@/components/StandardStructuredEditor").then((mod) => mod.StandardStructuredEditor),
  {
    ssr: false,
    loading: () => <LazyEditorPlaceholder label="标准结构化编辑器" />,
  }
);

const DataStructuredEditor = nextDynamic(
  () => import("@/components/DataStructuredEditor").then((mod) => mod.DataStructuredEditor),
  {
    ssr: false,
    loading: () => <LazyEditorPlaceholder label="数据结构化编辑器" />,
  }
);

const AwardStructuredEditor = nextDynamic(
  () => import("@/components/AwardStructuredEditor").then((mod) => mod.AwardStructuredEditor),
  {
    ssr: false,
    loading: () => <LazyEditorPlaceholder label="奖项结构化编辑器" />,
  }
);

type MemberType = "enterprise_basic" | "enterprise_advanced" | "personal";
type Status = "draft" | "pending" | "approved" | "rejected";
type MembershipRule = {
  label: string;
  siteLabel: string;
  publishCategoryHrefs: string[];
  newsPublishLimit: number | null;
};
type AccessSubcategory = {
  href: string;
  label: string;
  enabled: boolean;
  annualLimit: number | null;
  usedCount: number;
  remainingCount: number | null;
};
type AccessCategory = {
  href: string;
  label: string;
  enabled: boolean;
  annualLimit: number | null;
  usedCount: number;
  remainingCount: number | null;
  subcategories: AccessSubcategory[];
};
type MemberAccess = {
  year: number;
  categories: AccessCategory[];
};
const BRAND_REGION_OPTIONS = ["全国", "华东", "华中", "华南", "西南", "西北", "华北", "东北"] as const;
type SubmitPreview = { title: string; href: string | null; status: Status };
type VerifyStatus = "pending" | "approved" | "rejected";
type VerificationSummary = {
  status: VerifyStatus;
  reviewNote?: string | null;
  approvedEnterpriseId?: string | null;
} | null;
type EffectiveVerificationSummary = {
  status: VerifyStatus | "not_submitted";
  label: string;
  source: string;
  isLegacyEnterpriseMember: boolean;
  shouldUpgradeMemberType: boolean;
  companyName?: string | null;
  updatedAt?: string | null;
  reviewNote?: string | null;
} | null;
type EnterpriseSummary = {
  id: string;
  companyName?: string | null;
  companyShortName?: string | null;
  verificationStatus?: string | null;
} | null;
type DashboardVerificationSummary = {
  effectiveVerification?: EffectiveVerificationSummary;
  enterprise?: EnterpriseSummary;
};

type Row = {
  id: string;
  title: string;
  slug: string;
  source?: string | null;
  sourceUrl?: string | null;
  displayAuthor?: string | null;
  excerpt?: string | null;
  content: string;
  coverImage?: string | null;
  categoryHref: string | null;
  subHref: string | null;
  status: Status;
  conceptSummary?: string | null;
  applicableScenarios?: string | null;
  versionLabel?: string | null;
  relatedTermSlugs?: string | null;
  relatedStandardIds?: string | null;
  relatedBrandIds?: string | null;
  tagSlugs?: string | null;
  isPinned?: boolean;
  faqJson?: string | null;
  createdAt: string;
};

const COVER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const ENTERPRISE_NEWS_SUBHREF = "/news/enterprise";

function getDefaultMemberAccess(): MemberAccess {
  return {
    year: new Date().getFullYear(),
    categories: MEMBER_PUBLISH_CATEGORY_OPTIONS.map((category) => ({
      href: category.href,
      label: category.label,
      enabled: true,
      annualLimit: null,
      usedCount: 0,
      remainingCount: null,
      subcategories: category.subs.map((sub) => ({
        href: sub.href,
        label: sub.label,
        enabled: true,
        annualLimit: null,
        usedCount: 0,
        remainingCount: null,
      })),
    })),
  };
}

function formatQuota(limit: number | null, remainingCount: number | null) {
  if (limit == null) return "不限";
  const remain = remainingCount == null ? limit : remainingCount;
  return `剩余 ${remain}/${limit}`;
}

function tabFromHref(href: string): ContentTabKey {
  const hit = CONTENT_TAB_DEFS.find((x) => x.href === href);
  return hit?.key ?? "articles";
}

function parseTab(raw: string | null): ContentTabKey {
  if (!raw) return "articles";
  const hit = CONTENT_TAB_DEFS.find((x) => x.key === raw);
  return hit?.key ?? "articles";
}

function buildPreviewHref(
  categoryHref: string | null,
  subHref: string | null,
  itemId: string | null,
  slug: string | null,
  fallbackTitle: string | null,
  preferredTab?: ContentTabKey | null
) {
  const segment = (slug || fallbackTitle || "").trim();
  if (!segment && !itemId) return null;
  const encoded = encodeURIComponent(segment);
  const tab = preferredTab ?? resolveTabKeyFromHref(categoryHref, subHref);
  if (tab === "brands") return `/brands/${encoded}`;
  if (tab === "buying") return `/brands/buying/${encoded}`;
  if (tab === "terms") return `/dictionary/${encoded}`;
  if (tab === "standards") return `/standards/${encoded}`;
  if (tab === "awards") return `/awards/${encoded}`;
  return itemId ? buildNewsPath(itemId) : `/news/${encoded}`;
}

function buildAutoExcerpt(text: string) {
  return previewText(text, 120);
}

function PublishCenterPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const editQueryId = searchParams.get("edit")?.trim() ?? "";

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [memberType, setMemberType] = useState<MemberType>("personal");
  const [memberPhone, setMemberPhone] = useState("");
  const [membershipRule, setMembershipRule] = useState<MembershipRule | null>(null);
  const [memberAccess, setMemberAccess] = useState<MemberAccess>(getDefaultMemberAccess());
  const [items, setItems] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const messageRef = useRef<HTMLDivElement | null>(null);
  const editFormRef = useRef<HTMLElement | null>(null);
  const publishCoverPreviewRef = useRef<HTMLDivElement | null>(null);
  const editCoverPreviewRef = useRef<HTMLDivElement | null>(null);
  const publishObjectUrlRef = useRef<string | null>(null);
  const editObjectUrlRef = useRef<string | null>(null);
  const suppressMessageScrollRef = useRef(false);
  const autoOpenedEditIdRef = useRef("");
  const [loading, setLoading] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState<SubmitPreview | null>(null);
  const [pendingPreviewScroll, setPendingPreviewScroll] = useState<"publish" | "edit" | null>(null);
  const [cropTarget, setCropTarget] = useState<"publish" | "edit" | null>(null);
  const [latestVerification, setLatestVerification] = useState<VerificationSummary>(null);
  const [effectiveVerification, setEffectiveVerification] = useState<EffectiveVerificationSummary>(null);
  const [enterprise, setEnterprise] = useState<EnterpriseSummary>(null);

  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [displayAuthor, setDisplayAuthor] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [brandStructured, setBrandStructured] = useState<BrandStructuredData>(createDefaultBrandStructuredData());
  const [standardStructured, setStandardStructured] = useState<StandardStructuredData>(createDefaultStandardStructuredData());
  const [dataStructured, setDataStructured] = useState<DataStructuredData>(createDefaultDataStructuredData());
  const [awardStructured, setAwardStructured] = useState<AwardStructuredData>(createDefaultAwardStructuredData());
  const [subHref, setSubHref] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [coverPreviewSrc, setCoverPreviewSrc] = useState("");
  const [conceptSummary, setConceptSummary] = useState("");
  const [applicableScenarios, setApplicableScenarios] = useState("");
  const [versionLabel, setVersionLabel] = useState("");
  const [relatedTermSlugs, setRelatedTermSlugs] = useState("");
  const [relatedStandardIds, setRelatedStandardIds] = useState("");
  const [relatedBrandIds, setRelatedBrandIds] = useState("");
  const [tagSlugs, setTagSlugs] = useState("");
  const [syncToMainSite, setSyncToMainSite] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [slug, setSlug] = useState("");
  const [documentMeta, setDocumentMeta] = useState<DocumentMetadata>(createEmptyDocumentMetadata());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSlug, setEditSlug] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editExcerpt, setEditExcerpt] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSubHref, setEditSubHref] = useState("");
  const [editBrandStructured, setEditBrandStructured] = useState<BrandStructuredData>(createDefaultBrandStructuredData());
  const [editStandardStructured, setEditStandardStructured] = useState<StandardStructuredData>(createDefaultStandardStructuredData());
  const [editDataStructured, setEditDataStructured] = useState<DataStructuredData>(createDefaultDataStructuredData());
  const [editAwardStructured, setEditAwardStructured] = useState<AwardStructuredData>(createDefaultAwardStructuredData());
  const [editCoverImage, setEditCoverImage] = useState("");
  const [editCoverPreviewSrc, setEditCoverPreviewSrc] = useState("");
  const [editReason, setEditReason] = useState("");
  const [publishEditorStatusVersion, setPublishEditorStatusVersion] = useState(0);
  const [editEditorStatusVersion, setEditEditorStatusVersion] = useState(0);
  const [editDocumentMeta, setEditDocumentMeta] = useState<DocumentMetadata>(createEmptyDocumentMetadata());
  const autoSlugRef = useRef("");
  const autoSeoRef = useRef({ seoTitle: "", seoKeywords: "", seoDescription: "" });
  const autoEditSlugRef = useRef("");
  const autoEditSeoRef = useRef({ seoTitle: "", seoKeywords: "", seoDescription: "" });

  const applyImportedTitle = useCallback(
    (
      nextTitleRaw: string,
      currentTitle: string,
      setTitleValue: (value: string) => void,
      contextLabel: "标题" | "标题草稿"
    ) => {
      const nextTitle = nextTitleRaw.trim();
      if (!nextTitle) return;

      if (!currentTitle.trim()) {
        setTitleValue(nextTitle);
        setMessage(`已识别并填入文档标题：${nextTitle}`);
        return;
      }

      if (currentTitle.trim() === nextTitle) {
        setMessage(`已识别到相同文档标题：${nextTitle}`);
        return;
      }

      const shouldReplace = window.confirm(`检测到文档标题：${nextTitle}，是否替换当前${contextLabel}？`);
      if (shouldReplace) {
        setTitleValue(nextTitle);
        setMessage(`已替换为文档标题：${nextTitle}`);
        return;
      }

      setMessage(`已识别到文档标题：${nextTitle}，已保留当前${contextLabel}。`);
    },
    []
  );

  const handleImportedPublishTitle = useCallback(
    (nextTitle: string) => {
      applyImportedTitle(nextTitle, title, setTitle, "标题");
    },
    [applyImportedTitle, title]
  );

  const handleImportedEditTitle = useCallback(
    (nextTitle: string) => {
      applyImportedTitle(nextTitle, editTitle, setEditTitle, "标题草稿");
    },
    [applyImportedTitle, editTitle]
  );

  const allCategoryAccess = useMemo(
    () => (memberAccess.categories.length > 0 ? memberAccess.categories : getDefaultMemberAccess().categories),
    [memberAccess]
  );
  const enabledCategoryAccess = useMemo(
    () => allCategoryAccess.filter((category) => category.enabled),
    [allCategoryAccess]
  );
  const allowedTabs = useMemo(() => enabledCategoryAccess.map((x) => tabFromHref(x.href)), [enabledCategoryAccess]);
  const safeTab = useMemo(() => (allowedTabs.includes(tab) ? tab : allowedTabs[0] ?? "articles"), [tab, allowedTabs]);
  const selectedTabDef = useMemo(() => CONTENT_TAB_DEFS.find((x) => x.key === safeTab) ?? CONTENT_TAB_DEFS[0], [safeTab]);
  const selectedCategoryAccess = useMemo(
    () => enabledCategoryAccess.find((x) => x.href === selectedTabDef.href) ?? enabledCategoryAccess[0] ?? null,
    [enabledCategoryAccess, selectedTabDef.href]
  );
  const selectedCategory = useMemo(
    () => MEMBER_PUBLISH_CATEGORY_OPTIONS.find((x) => x.href === selectedCategoryAccess?.href) ?? null,
    [selectedCategoryAccess]
  );
  const subOptions = useMemo(() => selectedCategoryAccess?.subcategories ?? [], [selectedCategoryAccess]);
  const activeSubAccess = useMemo(
    () => subOptions.find((item) => item.href === subHref) ?? null,
    [subOptions, subHref]
  );
  const enabledSubcategoryCount = useMemo(() => subOptions.filter((item) => item.enabled).length, [subOptions]);
  const selectedCategoryQuotaLabel = useMemo(
    () => (selectedCategoryAccess ? formatQuota(selectedCategoryAccess.annualLimit, selectedCategoryAccess.remainingCount) : "未开通"),
    [selectedCategoryAccess]
  );
  const selectedSubcategoryQuotaLabel = useMemo(
    () => (activeSubAccess ? formatQuota(activeSubAccess.annualLimit, activeSubAccess.remainingCount) : "未选择"),
    [activeSubAccess]
  );
  const canPasteImages = authed === true;
  const isDocumentTab = safeTab === "terms" || safeTab === "standards";
  const documentKind = safeTab === "standards" ? "standards" : "terms";
  const canLockSyncToEnterpriseNews = safeTab === "articles" && Boolean(enterprise?.id);
  const effectivePublishSubHref =
    canLockSyncToEnterpriseNews && syncToMainSite ? ENTERPRISE_NEWS_SUBHREF : subHref;
  const effectiveActiveSubAccess = useMemo(
    () => subOptions.find((item) => item.href === effectivePublishSubHref) ?? null,
    [effectivePublishSubHref, subOptions],
  );

  const filteredItems = useMemo(
    () => items.filter((item) => resolveTabKeyFromHref(item.categoryHref, item.subHref) === safeTab),
    [items, safeTab]
  );
  const filteredStatusSummary = useMemo(
    () =>
      filteredItems.reduce(
        (acc, item) => {
          acc[item.status] += 1;
          return acc;
        },
        { draft: 0, pending: 0, approved: 0, rejected: 0 } as Record<Status, number>
      ),
    [filteredItems]
  );

  const replaceTab = useCallback((nextTab: ContentTabKey) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", nextTab);
    router.replace(`${pathname}?${sp.toString()}`);
  }, [pathname, router, searchParams]);

  const load = useCallback(async () => {
    const meRes = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
    if (!meRes.ok) {
      setAuthed(false);
      return;
    }
    setAuthed(true);

    const me = await meRes.json();
    setRole(me.role ?? null);
    const t = (me.memberType ?? "personal") as MemberType;
    setMemberType(t);
    setMemberPhone(typeof me.phone === "string" ? me.phone : "");
    setMembershipRule(me.membershipRule ?? null);
    setMemberAccess(me.memberAccess ?? getDefaultMemberAccess());

    const [listRes, verificationRes, dashboardRes] = await Promise.all([
      fetch("/api/member/articles?limit=100", { credentials: "include", cache: "no-store" }),
      fetch("/api/member/enterprise-verification", { credentials: "include", cache: "no-store" }),
      fetch("/api/member/dashboard", { credentials: "include", cache: "no-store" }),
    ]);

    if (listRes.ok) {
      const data = await listRes.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    }

    if (verificationRes.ok) {
      const data = await verificationRes.json();
      setLatestVerification((data.latest ?? null) as VerificationSummary);
      setEnterprise((data.enterprise ?? null) as EnterpriseSummary);
    }

    if (dashboardRes.ok) {
      const data = (await dashboardRes.json()) as DashboardVerificationSummary;
      setEffectiveVerification((data.effectiveVerification ?? null) as EffectiveVerificationSummary);
      if (data.enterprise) {
        setEnterprise(data.enterprise);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (allowedTabs.length === 0) return;
    if (!allowedTabs.includes(tab)) replaceTab(allowedTabs[0]);
  }, [allowedTabs, tab, replaceTab]);

  useEffect(() => {
    const enabledSubOptions = subOptions.filter((item) => item.enabled);
    if (enabledSubOptions.length > 0 && !enabledSubOptions.some((s) => s.href === subHref)) {
      if (safeTab === "articles" && enterprise?.id) {
        const enterpriseOption = enabledSubOptions.find((item) => item.href === "/news/enterprise");
        setSubHref(enterpriseOption?.href ?? enabledSubOptions[0].href);
        return;
      }
      setSubHref(enabledSubOptions[0].href);
    }
  }, [enterprise?.id, safeTab, subOptions, subHref]);

  useEffect(() => {
    if (!isDocumentTab) return;

    const nextSlug = slugify(title);
    if (!slug.trim() || slug === autoSlugRef.current) {
      setSlug(nextSlug);
    }
    autoSlugRef.current = nextSlug;

    const canAutoFillSeo = hasAutoSeoSource(documentMeta.intro, content);
    if (!canAutoFillSeo) {
      autoSeoRef.current = { seoTitle: "", seoKeywords: "", seoDescription: "" };
      return;
    }

    const nextSeoTitle = buildAutoSeoTitle(title);
    const nextSeoKeywords = buildAutoSeoKeywords(title, documentKind);
    const nextSeoDescription = buildAutoSeoDescription(title, documentMeta.intro, content);

    setDocumentMeta((prev) => ({
      ...prev,
      seoTitle: !prev.seoTitle.trim() || prev.seoTitle === autoSeoRef.current.seoTitle ? nextSeoTitle : prev.seoTitle,
      seoKeywords:
        !prev.seoKeywords.trim() || prev.seoKeywords === autoSeoRef.current.seoKeywords ? nextSeoKeywords : prev.seoKeywords,
      seoDescription:
        !prev.seoDescription.trim() || prev.seoDescription === autoSeoRef.current.seoDescription
          ? nextSeoDescription
          : prev.seoDescription,
    }));

    autoSeoRef.current = {
      seoTitle: nextSeoTitle,
      seoKeywords: nextSeoKeywords,
      seoDescription: nextSeoDescription,
    };
  }, [content, documentKind, documentMeta.intro, isDocumentTab, slug, title]);

  useEffect(() => {
    if (!isDocumentTab || !editingId) return;

    const nextSlug = slugify(editTitle);
    if (!editSlug.trim() || editSlug === autoEditSlugRef.current) {
      setEditSlug(nextSlug);
    }
    autoEditSlugRef.current = nextSlug;

    const canAutoFillSeo = hasAutoSeoSource(editDocumentMeta.intro, editContent);
    if (!canAutoFillSeo) {
      autoEditSeoRef.current = { seoTitle: "", seoKeywords: "", seoDescription: "" };
      return;
    }

    const nextSeoTitle = buildAutoSeoTitle(editTitle);
    const nextSeoKeywords = buildAutoSeoKeywords(editTitle, documentKind);
    const nextSeoDescription = buildAutoSeoDescription(editTitle, editDocumentMeta.intro, editContent);

    setEditDocumentMeta((prev) => ({
      ...prev,
      seoTitle:
        !prev.seoTitle.trim() || prev.seoTitle === autoEditSeoRef.current.seoTitle ? nextSeoTitle : prev.seoTitle,
      seoKeywords:
        !prev.seoKeywords.trim() || prev.seoKeywords === autoEditSeoRef.current.seoKeywords
          ? nextSeoKeywords
          : prev.seoKeywords,
      seoDescription:
        !prev.seoDescription.trim() || prev.seoDescription === autoEditSeoRef.current.seoDescription
          ? nextSeoDescription
          : prev.seoDescription,
    }));

    autoEditSeoRef.current = {
      seoTitle: nextSeoTitle,
      seoKeywords: nextSeoKeywords,
      seoDescription: nextSeoDescription,
    };
  }, [documentKind, editContent, editDocumentMeta.intro, editSlug, editTitle, editingId, isDocumentTab]);

  useEffect(() => {
    if (!message) return;
    if (pendingPreviewScroll) return;
    if (suppressMessageScrollRef.current) {
      suppressMessageScrollRef.current = false;
      return;
    }
    messageRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [message, pendingPreviewScroll]);

  useEffect(() => {
    if (!pendingPreviewScroll) return;
    const ref = pendingPreviewScroll === "publish" ? publishCoverPreviewRef : editCoverPreviewRef;
    const hasPreview = pendingPreviewScroll === "publish" ? (coverPreviewSrc || coverImage) : (editCoverPreviewSrc || editCoverImage);
    if (!hasPreview) return;

    let cancelled = false;
    let attempts = 0;

    const run = () => {
      if (cancelled) return;
      attempts += 1;
      const element = ref.current;
      if (element) {
        element.scrollIntoView({ behavior: attempts === 1 ? "auto" : "smooth", block: "center" });
      }
      if (attempts >= 4) {
        setPendingPreviewScroll(null);
        return;
      }
      window.setTimeout(run, 160);
    };

    window.requestAnimationFrame(run);
    return () => {
      cancelled = true;
    };
  }, [coverImage, editCoverImage, coverPreviewSrc, editCoverPreviewSrc, pendingPreviewScroll]);

  useEffect(() => {
    if (!editingId) return;
    window.requestAnimationFrame(() => {
      editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [editingId]);

  function getPublishSourceText() {
    return (
      safeTab === "brands"
          ? brandStructuredToSearchText(brandStructured)
          : safeTab === "terms"
            ? content
          : safeTab === "standards"
            ? content
            : safeTab === "industry-data"
              ? dataStructuredToSearchText(dataStructured)
              : safeTab === "awards"
                ? awardStructuredToSearchText(awardStructured)
                : content
    ).trim();
  }

  function getEditSourceText() {
    return (
      safeTab === "brands"
          ? brandStructuredToSearchText(editBrandStructured)
          : safeTab === "terms"
            ? editContent
          : safeTab === "standards"
            ? editContent
            : safeTab === "industry-data"
              ? dataStructuredToSearchText(editDataStructured)
              : safeTab === "awards"
                ? awardStructuredToSearchText(editAwardStructured)
                : editContent
    ).trim();
  }

  function autoFillExcerpt() {
    const nextExcerpt = buildGeoExcerpt(title, getPublishSourceText(), 120);
    if (!nextExcerpt) {
      suppressMessageScrollRef.current = true;
      setMessage("未提取到可用于生成摘要的正文内容，请先补充内容。");
      return;
    }
    setExcerpt(nextExcerpt);
    suppressMessageScrollRef.current = true;
    setMessage("已根据正文提炼摘要，结果更利于搜索抓取与页面概览。");
  }

  function autoFillEditExcerpt() {
    const nextExcerpt = buildGeoExcerpt(editTitle, getEditSourceText(), 120);
    if (!nextExcerpt) {
      suppressMessageScrollRef.current = true;
      setMessage("未提取到可用于生成摘要的正文内容，请先补充内容。");
      return;
    }
    setEditExcerpt(nextExcerpt);
    suppressMessageScrollRef.current = true;
    setMessage("已根据正文提炼摘要，结果更利于搜索抓取与页面概览。");
  }

  function resetBrandStructured() {
    setBrandStructured(createDefaultBrandStructuredData());
  }

  function resetStandardStructured() {
    setStandardStructured(createDefaultStandardStructuredData());
  }
  function resetDataStructured() {
    setDataStructured(createDefaultDataStructuredData());
  }
  function resetAwardStructured() {
    setAwardStructured(createDefaultAwardStructuredData());
  }

  const replacePreviewUrl = useCallback((kind: "publish" | "edit", nextUrl: string) => {
    const targetRef = kind === "publish" ? publishObjectUrlRef : editObjectUrlRef;
    const setPreview = kind === "publish" ? setCoverPreviewSrc : setEditCoverPreviewSrc;
    if (targetRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(targetRef.current);
    }
    targetRef.current = nextUrl.startsWith("blob:") ? nextUrl : null;
    setPreview(nextUrl);
  }, []);

  const resetPublishFormState = useCallback((nextSubHref?: string) => {
    setTitle("");
    setSource("");
    setSourceUrl("");
    setDisplayAuthor("");
    setExcerpt("");
    setContent("");
    setBrandStructured(createDefaultBrandStructuredData());
    setStandardStructured(createDefaultStandardStructuredData());
    setDataStructured(createDefaultDataStructuredData());
    setAwardStructured(createDefaultAwardStructuredData());
    setSubHref(nextSubHref ?? "");
    setCoverImage("");
    setConceptSummary("");
    setApplicableScenarios("");
    setVersionLabel("");
    setRelatedTermSlugs("");
    setRelatedStandardIds("");
    setRelatedBrandIds("");
    setTagSlugs("");
    setSyncToMainSite(false);
    setIsPinned(false);
    setSlug("");
    setDocumentMeta(createEmptyDocumentMetadata());
    replacePreviewUrl("publish", "");
    autoSlugRef.current = "";
    autoSeoRef.current = { seoTitle: "", seoKeywords: "", seoDescription: "" };
    setPublishEditorStatusVersion((value) => value + 1);
  }, [replacePreviewUrl]);

  const resetEditFormState = useCallback(() => {
    setEditingId(null);
    setEditSlug("");
    setEditTitle("");
    setEditExcerpt("");
    setEditContent("");
    setEditSubHref("");
    setEditBrandStructured(createDefaultBrandStructuredData());
    setEditStandardStructured(createDefaultStandardStructuredData());
    setEditDataStructured(createDefaultDataStructuredData());
    setEditAwardStructured(createDefaultAwardStructuredData());
    setEditCoverImage("");
    setEditReason("");
    setEditDocumentMeta(createEmptyDocumentMetadata());
    replacePreviewUrl("edit", "");
    autoOpenedEditIdRef.current = "";
    autoEditSlugRef.current = "";
    autoEditSeoRef.current = { seoTitle: "", seoKeywords: "", seoDescription: "" };
    setEditEditorStatusVersion((value) => value + 1);
  }, [replacePreviewUrl]);

  function queuePreviewScroll(target: "publish" | "edit") {
    setPendingPreviewScroll(target);
  }

  useEffect(() => {
    resetPublishFormState(subOptions.find((item) => item.enabled)?.href ?? "");
    resetEditFormState();
  }, [resetEditFormState, resetPublishFormState, safeTab, subOptions]);

  useEffect(() => {
    if (safeTab === "brands") resetBrandStructured();
    if (safeTab === "standards") resetStandardStructured();
    if (safeTab === "industry-data") resetDataStructured();
    if (safeTab === "awards") resetAwardStructured();
  }, [safeTab]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading || !selectedCategory || !selectedCategoryAccess?.enabled) return;
    if (subOptions.length > 0 && !effectiveActiveSubAccess?.enabled) {
      setMessage("当前子栏目未开通投稿权限，请联系管理员授权。");
      return;
    }
    setLoading(true);
    setMessage("");
    setLastSubmitted(null);

    const composedContent =
      safeTab === "brands"
          ? buildBrandStructuredHtml(brandStructured)
          : safeTab === "standards"
            ? content.trim()
            : safeTab === "industry-data"
              ? buildDataStructuredHtml(dataStructured)
              : safeTab === "awards"
                ? buildAwardStructuredHtml(awardStructured)
                : content.trim();

    const payload = {
      title: title.trim(),
      slug: slug.trim() || null,
      source: source.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
      displayAuthor: displayAuthor.trim() || null,
      excerpt: excerpt.trim() || null,
      content: composedContent,
      categoryHref: selectedCategory.href,
      subHref: subOptions.length > 0 ? effectivePublishSubHref || null : null,
      coverImage:
        safeTab === "brands"
          ? brandStructured.logoUrl.trim() || null
          : coverImage.trim() || null,
      conceptSummary: conceptSummary.trim() || null,
      applicableScenarios:
        safeTab === "standards"
          ? standardStructured.scope.trim() || null
          : safeTab === "industry-data"
            ? dataStructured.methodology.trim() || null
          : applicableScenarios.trim() || null,
      versionLabel:
        safeTab === "standards"
          ? standardStructured.versionNote.trim() || null
          : safeTab === "awards"
            ? (awardStructured.year ? `${awardStructured.year}版` : null)
          : versionLabel.trim() || null,
      relatedTermSlugs: relatedTermSlugs.trim() || null,
      relatedStandardIds: relatedStandardIds.trim() || null,
      relatedBrandIds: relatedBrandIds.trim() || null,
      tagSlugs: tagSlugs.trim() || null,
      faqJson: safeTab === "terms" || safeTab === "standards" ? stringifyDocumentMetadata(documentMeta) : null,
      syncToMainSite,
      isPinned,
    };

    const dirtyTextError = buildDirtyTextErrorMessage([
      { label: "标题", value: payload.title },
      { label: "摘要", value: payload.excerpt },
      { label: "正文", value: payload.content },
      { label: "作者", value: payload.displayAuthor },
      { label: "来源", value: payload.source },
      { label: "概念总结", value: payload.conceptSummary },
      { label: "适用场景", value: payload.applicableScenarios },
      { label: "版本标签", value: payload.versionLabel },
    ]);
    if (dirtyTextError) {
      setMessage(dirtyTextError);
      setLoading(false);
      return;
    }

    const res = await fetch("/api/member/articles", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "提交失败");
      setLoading(false);
      return;
    }

    const nextStatus = typeof data?.status === "string" ? data.status : "";
    const submittedTitle = typeof data?.title === "string" ? data.title : payload.title;
    const submittedStatus = (nextStatus || "pending") as Status;
    const previewHref = buildPreviewHref(
      typeof data?.categoryHref === "string" ? data.categoryHref : payload.categoryHref,
      typeof data?.subHref === "string" ? data.subHref : payload.subHref,
      typeof data?.id === "string" ? data.id : null,
      typeof data?.slug === "string" ? data.slug : null,
      submittedTitle,
      safeTab
    );
    setLastSubmitted({ title: submittedTitle, href: previewHref, status: submittedStatus });
    setMessage(nextStatus === "approved" ? "提交成功，内容已发布。" : "提交成功，已进入审核流程。");
    setTitle("");
    setSlug("");
    setExcerpt("");
    setContent("");
    resetBrandStructured();
    resetStandardStructured();
    resetDataStructured();
    resetAwardStructured();
    setCoverImage("");
    replacePreviewUrl("publish", "");
    setSource("");
    setSourceUrl("");
    setDisplayAuthor("");
    setConceptSummary("");
    setApplicableScenarios("");
    setVersionLabel("");
    setRelatedTermSlugs("");
    setRelatedStandardIds("");
    setRelatedBrandIds("");
    setTagSlugs("");
    setDocumentMeta(createEmptyDocumentMetadata());
    autoSlugRef.current = "";
    autoSeoRef.current = { seoTitle: "", seoKeywords: "", seoDescription: "" };
    setSyncToMainSite(false);
    setIsPinned(false);
    setPublishEditorStatusVersion((value) => value + 1);
    await load();
    setLoading(false);
  }

  const openEditRequest = useCallback((item: Row) => {
    const nextMeta = parseDocumentMetadata(item.faqJson);
    setEditingId(item.id);
    setEditSlug(item.slug ?? "");
    setEditTitle(item.title ?? "");
    setEditExcerpt(item.excerpt ?? "");
    setEditContent(item.content ?? "");
    setEditSubHref(item.subHref ?? subHref);
    setEditBrandStructured(
      safeTab === "brands"
        ? parseBrandStructuredHtml(item.content ?? "") ?? createDefaultBrandStructuredData()
        : createDefaultBrandStructuredData()
    );
    setEditStandardStructured(
      safeTab === "standards"
        ? parseStandardStructuredHtml(item.content ?? "") ?? createDefaultStandardStructuredData()
        : createDefaultStandardStructuredData()
    );
    setEditDataStructured(
      safeTab === "industry-data"
        ? parseDataStructuredHtml(item.content ?? "") ?? createDefaultDataStructuredData()
        : createDefaultDataStructuredData()
    );
    setEditAwardStructured(
      safeTab === "awards"
        ? parseAwardStructuredHtml(item.content ?? "") ?? createDefaultAwardStructuredData()
        : createDefaultAwardStructuredData()
    );
    setEditCoverImage(item.coverImage ?? "");
    replacePreviewUrl("edit", item.coverImage ?? "");
    setEditReason("");
    setEditDocumentMeta(nextMeta);
    autoEditSlugRef.current = slugify(item.title ?? "");
    const nextAutoEditSeo = hasAutoSeoSource(nextMeta.intro, item.content ?? "")
      ? {
          seoTitle: buildAutoSeoTitle(item.title ?? ""),
          seoKeywords: buildAutoSeoKeywords(item.title ?? "", safeTab === "standards" ? "standards" : "terms"),
          seoDescription: buildAutoSeoDescription(item.title ?? "", nextMeta.intro, item.content ?? ""),
        }
      : { seoTitle: "", seoKeywords: "", seoDescription: "" };
    autoEditSeoRef.current = {
      ...nextAutoEditSeo,
    };
  }, [safeTab, replacePreviewUrl, subHref]);

  useEffect(() => {
    if (!editQueryId) {
      autoOpenedEditIdRef.current = "";
      return;
    }
    if (autoOpenedEditIdRef.current === editQueryId) return;

    const currentItem = items.find((item) => item.id === editQueryId);
    if (currentItem) {
      openEditRequest(currentItem);
      autoOpenedEditIdRef.current = editQueryId;
      return;
    }

    let cancelled = false;

    async function loadEditItem() {
      const response = await fetch(`/api/member/articles/${editQueryId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return;

      const item = (await response.json().catch(() => null)) as Row | null;
      if (!item || cancelled) return;

      setItems((current) => (current.some((entry) => entry.id === item.id) ? current : [item, ...current]));
      openEditRequest(item);
      autoOpenedEditIdRef.current = editQueryId;
    }

    void loadEditItem();
    return () => {
      cancelled = true;
    };
  }, [editQueryId, items, openEditRequest]);

  async function submitEditRequest(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const composedEditContent =
      safeTab === "brands"
          ? buildBrandStructuredHtml(editBrandStructured)
          : safeTab === "standards"
            ? editContent.trim()
            : safeTab === "industry-data"
              ? buildDataStructuredHtml(editDataStructured)
              : safeTab === "awards"
              ? buildAwardStructuredHtml(editAwardStructured)
                : editContent;
    const payload = {
      title: editTitle,
      slug: editSlug,
      excerpt: editExcerpt,
      content: composedEditContent,
      coverImage: safeTab === "brands" ? editBrandStructured.logoUrl.trim() || null : editCoverImage.trim() || null,
      subHref: subOptions.length > 0 ? editSubHref || subHref || null : null,
      reason: editReason,
    };
    const dirtyTextError = buildDirtyTextErrorMessage([
      { label: "标题", value: payload.title },
      { label: "摘要", value: payload.excerpt },
      { label: "正文", value: payload.content },
    ]);
    if (dirtyTextError) {
      setMessage(dirtyTextError);
      return;
    }
    const res = await fetch(`/api/member/articles/${editingId}/changes`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "修改申请提交失败");
      return;
    }
    setMessage("修改申请已提交，待主管理员审核后生效");
    setEditingId(null);
  }

  function autoFillTags() {
    const tags = suggestTagsForGeo({
      title,
      excerpt,
      content: getPublishSourceText(),
      categoryHref: selectedCategory?.href,
      subHref,
    });
    if (tags.length === 0) {
      suppressMessageScrollRef.current = true;
      setMessage("未识别到明显行业关键词，请手动补充。");
      return;
    }
    setTagSlugs(tags.join(","));
    suppressMessageScrollRef.current = true;
    setMessage(`已按标题、摘要、正文和栏目语义提取 ${tags.length} 个行业关键词。`);
  }

  async function handleCoverImageUpload(file: File | null) {
    if (!file) return;
    try {
      replacePreviewUrl("publish", URL.createObjectURL(file));
      queuePreviewScroll("publish");
      const imageUrl = await uploadImageToServer(file, {
        folder: "content/covers",
        maxBytes: COVER_IMAGE_MAX_BYTES,
      });
      setCoverImage(imageUrl);
      suppressMessageScrollRef.current = true;
      setMessage("顶部配图已加载，可先预览，提交后生效。");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "图片上传失败");
    }
  }

  async function handleEditCoverImageUpload(file: File | null) {
    if (!file) return;
    try {
      replacePreviewUrl("edit", URL.createObjectURL(file));
      queuePreviewScroll("edit");
      const imageUrl = await uploadImageToServer(file, {
        folder: "content/covers",
        maxBytes: COVER_IMAGE_MAX_BYTES,
      });
      setEditCoverImage(imageUrl);
      suppressMessageScrollRef.current = true;
      setMessage("顶部配图已加载，可先预览，提交后生效。");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "图片上传失败");
    }
  }

  async function applyCroppedCover(file: File, target: "publish" | "edit") {
    const imageUrl = await uploadImageToServer(file, {
      folder: "content/covers",
      maxBytes: COVER_IMAGE_MAX_BYTES,
    });
    if (target === "publish") {
      replacePreviewUrl("publish", URL.createObjectURL(file));
      setCoverImage(imageUrl);
      queuePreviewScroll("publish");
    } else {
      replacePreviewUrl("edit", URL.createObjectURL(file));
      setEditCoverImage(imageUrl);
      queuePreviewScroll("edit");
    }
    suppressMessageScrollRef.current = true;
    setMessage("顶部配图已裁剪并更新预览。");
    setCropTarget(null);
  }

  function renderCategoryFeatureFields(currentTab: ContentTabKey) {
    return (
      <>
        {currentTab === "terms" && (
          <div className="space-y-2">
            <label className="block text-sm text-muted">词条正文</label>
            <RichEditor
              value={content}
              onChange={setContent}
              onImportedTitle={handleImportedPublishTitle}
              minHeight={360}
              placeholder="支持标题、列表、引用、链接、图片、表格以及 DOCX/TXT 文档导入。"
              allowClipboardImagePaste={canPasteImages}
              toolbarIcons
              statusResetKey={`member-publish-terms:${safeTab}:${publishEditorStatusVersion}`}
            />
          </div>
        )}

        {currentTab === "standards" && (
          <div className="space-y-2">
            <label className="block text-sm text-muted">标准正文</label>
            <RichEditor
              value={content}
              onChange={setContent}
              onImportedTitle={handleImportedPublishTitle}
              minHeight={360}
              placeholder="支持标题分级、表格、图片和条款结构的标准正文编辑。"
              statusResetKey={`member-publish-standards:${safeTab}:${publishEditorStatusVersion}`}
            />
          </div>
        )}

        {currentTab === "industry-data" && (
          <div className="space-y-2">
            <label className="block text-sm text-muted">数据结构化内容</label>
            <DataStructuredEditor value={dataStructured} onChange={setDataStructured} />
          </div>
        )}

        {currentTab === "awards" && (
          <div className="space-y-2">
            <label className="block text-sm text-muted">评选结构化内容</label>
            <AwardStructuredEditor value={awardStructured} onChange={setAwardStructured} />
          </div>
        )}

        {false && currentTab === "standards" && (
          <>
            <label className="block text-sm text-muted">版本标签</label>
            <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} />
            <label className="block text-sm text-muted">关联标准 ID（逗号分隔）</label>
            <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={relatedStandardIds} onChange={(e) => setRelatedStandardIds(e.target.value)} />
          </>
        )}

        {(currentTab === "brands" || currentTab === "awards" || currentTab === "articles") && (
          <>
            <label className="block text-sm text-muted">关联品牌 ID（逗号分隔）</label>
            <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={relatedBrandIds} onChange={(e) => setRelatedBrandIds(e.target.value)} />
          </>
        )}

        <>
          <label className="block text-sm text-muted">关键词（逗号分隔）</label>
          <div className="flex gap-2">
            <input
              className="flex-1 border border-border rounded px-3 py-2 bg-surface"
              value={tagSlugs}
              onChange={(e) => setTagSlugs(e.target.value)}
              placeholder="如：整木定制,门墙柜一体,渠道招商"
            />
            <button type="button" onClick={autoFillTags} className="px-3 py-2 rounded border border-border text-xs hover:bg-surface">
              行业提取
            </button>
          </div>
        </>
      </>
    );
  }

  if (authed === false) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <p className="text-sm text-muted mb-3">请先登录后再使用内容发布中心。</p>
        <Link href="/membership/login" className="apple-inline-link">前往登录</Link>
      </div>
    );
  }

  const isEnterpriseMember = memberType === "enterprise_basic" || memberType === "enterprise_advanced";
  const currentVerificationStatus = effectiveVerification?.status ?? latestVerification?.status ?? "not_submitted";
  const enterpriseHref = enterprise?.id || latestVerification?.approvedEnterpriseId ? `/enterprise/${enterprise?.id ?? latestVerification?.approvedEnterpriseId}` : null;
  const verificationActionHref =
    isEnterpriseMember
      ? "/membership/content/verification"
      : currentVerificationStatus === "pending"
        ? "/membership/content/verification"
        : currentVerificationStatus === "rejected"
          ? "/membership/content/verification"
          : enterpriseHref ?? "/membership/content/verification";
  const verificationActionLabel =
    isEnterpriseMember
      ? "\u4f01\u4e1a\u8d44\u6599"
      : currentVerificationStatus === "pending"
        ? "\u67e5\u770b\u8ba4\u8bc1\u8fdb\u5ea6"
        : currentVerificationStatus === "rejected"
          ? "\u91cd\u65b0\u63d0\u4ea4\u8ba4\u8bc1\u8d44\u6599"
          : enterpriseHref
            ? "\u67e5\u770b\u4f01\u4e1a\u4e3b\u9875"
            : "\u53bb\u4f01\u4e1a\u8ba4\u8bc1";
  const verificationStatusText =
    isEnterpriseMember
      ? "\u4f01\u4e1a\u8d44\u6599\u5df2\u8ba4\u8bc1\uff0c\u53ef\u53d1\u5e03\u4f01\u4e1a\u5185\u5bb9\u5e76\u7ee7\u7eed\u7ef4\u62a4\u4f01\u4e1a\u4e3b\u9875\u5c55\u793a\u3002"
      : currentVerificationStatus === "approved"
        ? "\u4f01\u4e1a\u8ba4\u8bc1\u5df2\u901a\u8fc7\uff0c\u4f01\u4e1a\u8be6\u60c5\u9875\u5df2\u751f\u6210\u3002"
        : currentVerificationStatus === "pending"
          ? "\u4f01\u4e1a\u8ba4\u8bc1\u8d44\u6599\u5df2\u63d0\u4ea4\uff0c\u5f53\u524d\u6b63\u5728\u5ba1\u6838\u4e2d\u3002"
          : currentVerificationStatus === "rejected"
            ? "\u4f01\u4e1a\u8ba4\u8bc1\u66fe\u88ab\u9a73\u56de\uff0c\u53ef\u6309\u5ba1\u6838\u610f\u89c1\u8865\u5145\u540e\u91cd\u65b0\u63d0\u4ea4\u3002"
            : "\u5b8c\u6210\u4f01\u4e1a\u8ba4\u8bc1\u540e\u53ef\u83b7\u5f97\u4f01\u4e1a\u8be6\u60c5\u5c55\u793a\u9875\uff0c\u5e76\u540c\u6b65\u4f01\u4e1a\u8d44\u6599\u3002";


  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <nav className="mb-6 text-sm text-muted" aria-label="面包屑">
        <Link href="/" className="hover:text-accent">首页</Link>
        <span className="mx-2">/</span>
        <Link href="/membership" className="hover:text-accent">会员系统</Link>
        <span className="mx-2">/</span>
        <span className="text-primary">内容发布中心</span>
      </nav>

      <section className="mb-6 overflow-hidden rounded-[30px] border border-border bg-surface-elevated shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
        <div className="border-b border-border/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(244,239,230,0.9))] px-6 py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="font-serif text-3xl font-semibold tracking-tight text-primary">内容发布中心</h1>
              <p className="mt-3 text-sm text-muted">
                当前身份：{role === "SUPER_ADMIN" ? "主管理员" : role === "ADMIN" ? "子管理员" : "会员"} /{" "}
                {memberType === "enterprise_advanced" ? "企业VIP会员" : memberType === "enterprise_basic" ? "企业基础会员" : "个人会员"}
              </p>
              <p className="mt-2 text-sm text-muted">{verificationStatusText}</p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <InlinePageBackLink href="/membership/content" label="返回工作台" />
              <Link href={verificationActionHref} className="apple-inline-link">
                {verificationActionLabel}
              </Link>
            </div>
          </div>
        </div>
        <div className="grid gap-3 px-6 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <article className="rounded-2xl border border-border bg-white/82 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">当前栏目</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="text-lg font-semibold text-primary">{selectedTabDef.label}</p>
              <p className="text-sm text-muted">{selectedCategoryQuotaLabel}</p>
            </div>
          </article>
          <article className="rounded-2xl border border-border bg-white/82 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">当前子栏目</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="text-lg font-semibold text-primary">{activeSubAccess?.label ?? "待选择"}</p>
              <p className="text-sm text-muted">{selectedSubcategoryQuotaLabel}</p>
            </div>
          </article>
          <article className="rounded-2xl border border-border bg-white/82 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted">栏目状态</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="text-lg font-semibold text-primary">{enabledSubcategoryCount} 个已开通子栏目</p>
              <p className="text-sm text-muted">按当前授权执行</p>
            </div>
          </article>
        </div>
      </section>

      <section className="mb-6 rounded-[28px] border border-border bg-surface-elevated p-5 shadow-[0_18px_46px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">
              当前身份：{memberType === "enterprise_advanced" ? "企业VIP会员" : memberType === "enterprise_basic" ? "企业基础会员" : "个人会员"}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              {memberType === "personal"
                ? "你可以发布少量资讯、参与词库贡献和标准共建。完成企业认证后，可升级为企业基础会员，获得企业主页配置、图库上传和更多企业展示能力。"
                : memberType === "enterprise_basic"
                  ? "你可以维护企业资料、配置企业主页、上传图库并发布企业资讯。升级为企业VIP会员后，可获得 SEO 设置、推荐位、子账号和更高内容额度。"
                  : "你已拥有企业主页、内容发布、图库上传、SEO 设置、推荐内容、子账号和高级展示能力。"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {memberType === "personal" ? (
              <Link href="/membership/content/verification" className="apple-inline-link">
                去企业认证
              </Link>
            ) : null}
            {memberType === "enterprise_basic" ? (
              <a href={`tel:${PUBLIC_CONTACT_PHONE}`} className="apple-inline-link">
                联系管理员升级VIP
              </a>
            ) : null}
          </div>
        </div>
        {!memberPhone ? (
          <div className="mt-4 rounded-2xl border border-[rgba(180,154,107,0.18)] bg-[rgba(255,249,238,0.92)] px-4 py-3 text-sm leading-6 text-muted">
            当前账号还没有补充注册手机号。建议先到 <Link href="/membership/content#account-security" className="apple-inline-link">账号安全</Link> 补充手机号，用于账号找回、认证审核和平台联系。
          </div>
        ) : null}
      </section>

      {memberType === "enterprise_basic" ? (
        <section className="mb-6 rounded-[28px] border border-[rgba(180,154,107,0.22)] bg-[linear-gradient(135deg,rgba(255,249,239,0.98),rgba(247,238,222,0.88))] p-5 shadow-[0_18px_46px_rgba(180,154,107,0.12)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">企业基础会员</p>
              <h2 className="mt-2 text-xl font-semibold text-primary">升级到企业VIP，获得更完整的企业展示与运营能力</h2>
              <p className="mt-2 text-sm text-muted">
                VIP 会员可获得更完整的企业站配置、SEO 设置、推荐能力与更高内容运营上限。已认证企业可在现有基础上直接升级，不影响企业详情页展示。
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted">
                <span className="rounded-full border border-[rgba(180,154,107,0.22)] bg-white/80 px-3 py-1">企业站增强</span>
                <span className="rounded-full border border-[rgba(180,154,107,0.22)] bg-white/80 px-3 py-1">SEO 设置</span>
                <span className="rounded-full border border-[rgba(180,154,107,0.22)] bg-white/80 px-3 py-1">推荐位能力</span>
                <span className="rounded-full border border-[rgba(180,154,107,0.22)] bg-white/80 px-3 py-1">更高扩展权限</span>
              </div>
            </div>
            <div className="flex min-w-[240px] flex-col items-start gap-2">
              <Link
                href={`tel:${PUBLIC_CONTACT_PHONE}`}
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-[0_14px_28px_rgba(180,154,107,0.25)] transition hover:brightness-105"
              >
                联系管理员升级VIP
              </Link>
              <p className="text-xs text-muted">升级由平台管理员处理，可直接电话联系：{PUBLIC_CONTACT_PHONE}</p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mb-8 grid gap-4 lg:grid-cols-[208px_1fr] lg:items-start">
        <aside className="rounded-[28px] border border-border bg-surface-elevated p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted">发布栏目</p>
          <ul className="space-y-1">
            {allCategoryAccess.map((cat) => {
              const catTab = tabFromHref(cat.href);
              const active = catTab === safeTab;
              return (
                <li key={cat.href}>
                  {cat.enabled ? (
                    <Link
                      href={`/membership/content/publish?tab=${catTab}`}
                      className={`block rounded-2xl px-3 py-3 text-sm font-medium transition ${
                        active
                          ? "border border-accent/25 bg-[linear-gradient(135deg,rgba(186,158,108,0.18),rgba(255,255,255,0.92))] text-accent shadow-[0_10px_26px_rgba(138,115,77,0.10)]"
                          : "border border-transparent text-primary hover:border-border hover:bg-surface hover:text-accent"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{cat.label}</span>
                        <span className="text-[11px] text-muted">{formatQuota(cat.annualLimit, cat.remainingCount)}</span>
                      </div>
                    </Link>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border px-3 py-3 text-sm text-muted/80">
                      <div className="flex items-center justify-between gap-2">
                        <span>{cat.label}</span>
                        <span className="text-[11px]">未开通</span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
            <div className="mt-3 rounded-2xl border border-border bg-surface px-3 py-3 text-xs text-muted">
              当前栏目：<span className="text-primary">{selectedTabDef.label}</span>
            </div>
            <div className="mt-3 rounded-2xl border border-border bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(248,243,236,0.94))] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">已发内容</p>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="text-2xl font-semibold leading-none text-primary">{filteredItems.length}</span>
                    <span className="pb-0.5 text-xs text-muted">当前栏目内容</span>
                  </div>
                </div>
                <Link
                  href={`/membership/content/submissions?tab=${encodeURIComponent(safeTab)}`}
                  className="inline-flex shrink-0 rounded-full border border-border bg-white/90 px-3 py-2 text-xs font-medium text-primary transition hover:bg-white hover:text-accent"
                >
                  查看记录
                </Link>
              </div>
              <div className="mt-3 h-px bg-border/80" />
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border border-border bg-white/82 px-3 py-2 text-muted">
                  <span className="block">草稿</span>
                  <span className="mt-1 block text-sm font-medium text-primary">{filteredStatusSummary.draft}</span>
                </div>
                <div className="rounded-xl border border-border bg-white/82 px-3 py-2 text-muted">
                  <span className="block">待审核</span>
                  <span className="mt-1 block text-sm font-medium text-primary">{filteredStatusSummary.pending}</span>
                </div>
                <div className="rounded-xl border border-border bg-white/82 px-3 py-2 text-muted">
                  <span className="block">已通过</span>
                  <span className="mt-1 block text-sm font-medium text-primary">{filteredStatusSummary.approved}</span>
                </div>
                <div className="rounded-xl border border-border bg-white/82 px-3 py-2 text-muted">
                  <span className="block">已退回</span>
                  <span className="mt-1 block text-sm font-medium text-primary">{filteredStatusSummary.rejected}</span>
                </div>
              </div>
            </div>
          </aside>

        <div className="space-y-4">
        <form onSubmit={submit} className="space-y-4 rounded-[28px] border border-border bg-surface-elevated p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          {!selectedCategoryAccess && (
            <div className="rounded-xl border border-dashed border-border bg-surface p-4 text-sm text-muted">
              当前账号还没有开通任何发布栏目，请联系管理员分配子栏目和年度数量。
            </div>
          )}
          {message && (
            <div ref={messageRef} className="scroll-mt-24 space-y-1">
              <p className="text-sm text-accent">{message}</p>
              {lastSubmitted && (
                <div className="text-xs text-muted">
                  {lastSubmitted.status === "approved" && lastSubmitted.href ? (
                    <>
                      点击标题预览：
                      <Link href={lastSubmitted.href} target="_blank" rel="noreferrer" className="ml-1 text-accent hover:underline">
                        {lastSubmitted.title}
                      </Link>
                    </>
                  ) : (
                    <>
                      提交内容：<span className="text-primary">{lastSubmitted.title}</span>
                      {lastSubmitted.href && <span className="ml-2">审核通过后可预览</span>}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {subOptions.length > 0 && (
            <>
              <label className="block text-sm text-muted">子栏目</label>
              <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-2">
                {subOptions.map((s) => {
                  const active = effectivePublishSubHref === s.href;
                  const disabled = !s.enabled || (canLockSyncToEnterpriseNews && syncToMainSite && s.href !== ENTERPRISE_NEWS_SUBHREF);
                  return (
                    <button
                      key={s.href}
                      type="button"
                      onClick={() => {
                        if (!disabled) setSubHref(s.href);
                      }}
                      disabled={disabled}
                      className={`px-3 py-1.5 rounded-md text-sm transition ${
                        disabled
                          ? "cursor-not-allowed border border-dashed border-border text-muted/70 bg-surface"
                          : active
                            ? "bg-accent text-white"
                            : "bg-surface-elevated text-primary border border-border hover:bg-surface"
                      }`}
                    >
                      <span>{s.label}</span>
                      <span className={`ml-2 text-[11px] ${disabled || !active ? "opacity-80" : "text-white/80"}`}>
                        {disabled ? "未开通" : formatQuota(s.annualLimit, s.remainingCount)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {safeTab === "brands" && (
            <>
              <label className="block text-sm text-muted">区域选择</label>
              <select
                className="w-full border border-border rounded px-3 py-2 bg-surface"
                value={brandStructured.serviceAreas || "全国"}
                onChange={(e) => setBrandStructured((prev) => ({ ...prev, serviceAreas: e.target.value }))}
              >
                {BRAND_REGION_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </>
          )}

          <label className="block text-sm text-muted">标题</label>
          <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-border/80 bg-surface px-3 py-2 transition focus-within:border-[rgba(180,154,107,0.68)] focus-within:bg-white focus-within:shadow-[0_8px_22px_-18px_rgba(15,23,42,0.30)]">
              <label className="block text-xs font-medium leading-4 text-muted">作者</label>
              <input
                className="mt-1.5 block h-8 w-full rounded-md border border-border bg-white px-2.5 py-1 text-xs leading-5 text-primary outline-none transition placeholder:text-muted/45 hover:border-[rgba(180,154,107,0.48)] focus:border-[rgba(180,154,107,0.78)] focus:ring-2 focus:ring-[rgba(180,154,107,0.16)]"
                value={displayAuthor}
                onChange={(e) => setDisplayAuthor(e.target.value)}
                placeholder="请输入作者，如：编辑部 / 张三"
              />
            </div>
            <div className="rounded-xl border border-border/80 bg-surface px-3 py-2 transition focus-within:border-[rgba(180,154,107,0.68)] focus-within:bg-white focus-within:shadow-[0_8px_22px_-18px_rgba(15,23,42,0.30)]">
              <label className="block text-xs font-medium leading-4 text-muted">来源</label>
              <input
                className="mt-1.5 block h-8 w-full rounded-md border border-border bg-white px-2.5 py-1 text-xs leading-5 text-primary outline-none transition placeholder:text-muted/45 hover:border-[rgba(180,154,107,0.48)] focus:border-[rgba(180,154,107,0.78)] focus:ring-2 focus:ring-[rgba(180,154,107,0.16)]"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="请输入来源，如：整木网 / 品牌官方"
              />
            </div>
            <div className="rounded-xl border border-border/80 bg-surface px-3 py-2 transition focus-within:border-[rgba(180,154,107,0.68)] focus-within:bg-white focus-within:shadow-[0_8px_22px_-18px_rgba(15,23,42,0.30)]">
              <label className="block text-xs font-medium leading-4 text-muted">原文链接</label>
              <input
                className="mt-1.5 block h-8 w-full rounded-md border border-border bg-white px-2.5 py-1 text-xs leading-5 text-primary outline-none transition placeholder:text-muted/45 hover:border-[rgba(180,154,107,0.48)] focus:border-[rgba(180,154,107,0.78)] focus:ring-2 focus:ring-[rgba(180,154,107,0.16)]"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="请输入原文链接，如：https://example.com/article"
                inputMode="url"
              />
            </div>
          </div>
          {safeTab === "articles" && (
            <div className="rounded-xl border border-[rgba(180,154,107,0.18)] bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(248,243,236,0.94))] px-3 py-2.5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
                <button
                  type="button"
                  onClick={() => {
                    if (!canLockSyncToEnterpriseNews) {
                      setMessage("完成企业认证后，才可以将会员稿同步到整木资讯企业动态。");
                      return;
                    }
                    setSyncToMainSite((value) => !value);
                  }}
                  className={`inline-flex min-w-[128px] items-center justify-center rounded-full border px-4 py-2 text-sm font-medium transition shadow-[0_10px_24px_-20px_rgba(15,23,42,0.18)] ${
                    syncToMainSite
                      ? "border-[rgba(180,154,107,0.54)] bg-[#b49a6b] text-white"
                      : "border-[rgba(180,154,107,0.32)] bg-white/92 text-primary hover:border-[rgba(180,154,107,0.5)] hover:bg-white"
                  }`}
                >
                  {syncToMainSite ? "已开启自动同步" : "点击开启同步"}
                </button>
                <p className="text-xs leading-6 text-muted md:text-right">
                  {syncToMainSite
                    ? "已锁定同步到整木资讯的“企业动态”栏目，并同步显示在企业主页。"
                    : "如需同步到整木资讯，请先点击开启；同步稿将统一进入“企业动态”。"}
                </p>
              </div>
            </div>
          )}
          {(safeTab === "terms" || safeTab === "standards") && (
            <>
              <label className="block text-sm text-muted">文档 Slug</label>
              <input
                className="w-full border border-border rounded px-3 py-2 bg-surface"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="留空则按标题自动生成，建议使用拼音或英文短链"
              />
            </>
          )}

          <div className="flex items-center justify-between gap-3">
            <label className="block text-sm text-muted">{safeTab === "standards" ? "标准摘要" : "摘要"}</label>
            <button type="button" onClick={autoFillExcerpt} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface">自动生成摘要</button>
          </div>
          <textarea
            className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[80px] whitespace-pre-wrap resize-y"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
          />
          {(safeTab === "terms" || safeTab === "standards") && (
            <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
              <p className="text-sm font-medium text-primary">文档信息</p>
              <textarea
                className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[88px]"
                value={documentMeta.intro}
                onChange={(e) => setDocumentMeta((prev) => ({ ...prev, intro: e.target.value }))}
                placeholder={safeTab === "terms" ? "词条简介，用一段话说明术语定义与适用语境。" : "标准简介，用一段话说明标准适用范围和核心价值。"}
              />
              {safeTab === "standards" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={documentMeta.standardCode} onChange={(e) => setDocumentMeta((prev) => ({ ...prev, standardCode: e.target.value }))} placeholder="标准编号" />
                  <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="当前版本，如 V1.0" />
                  <textarea className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[84px] md:col-span-2" value={documentMeta.scope} onChange={(e) => setDocumentMeta((prev) => ({ ...prev, scope: e.target.value }))} placeholder="适用范围" />
                  <textarea className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[84px]" value={documentMeta.materialRequirements} onChange={(e) => setDocumentMeta((prev) => ({ ...prev, materialRequirements: e.target.value }))} placeholder="材料要求" />
                  <textarea className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[84px]" value={documentMeta.processRequirements} onChange={(e) => setDocumentMeta((prev) => ({ ...prev, processRequirements: e.target.value }))} placeholder="工艺要求" />
                  <textarea className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[84px]" value={documentMeta.executionFlow} onChange={(e) => setDocumentMeta((prev) => ({ ...prev, executionFlow: e.target.value }))} placeholder="执行流程" />
                  <textarea className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[84px]" value={documentMeta.acceptanceCriteria} onChange={(e) => setDocumentMeta((prev) => ({ ...prev, acceptanceCriteria: e.target.value }))} placeholder="验收标准" />
                </div>
              )}
              <p className="text-xs text-muted">填写简介和正文内容后，系统会自动生成 SEO；手动修改后将不再自动覆盖。</p>
              <div className="grid gap-3 md:grid-cols-3">
                <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={documentMeta.seoTitle} onChange={(e) => setDocumentMeta((prev) => ({ ...prev, seoTitle: e.target.value }))} placeholder="SEO 标题" />
                <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={documentMeta.seoKeywords} onChange={(e) => setDocumentMeta((prev) => ({ ...prev, seoKeywords: e.target.value }))} placeholder="SEO 关键词，逗号分隔" />
                <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={documentMeta.seoDescription} onChange={(e) => setDocumentMeta((prev) => ({ ...prev, seoDescription: e.target.value }))} placeholder="SEO 描述" />
              </div>
              {safeTab === "standards" && (
                <>
                  <label className="block text-sm text-muted">参与单位（每行一个，格式：企业名称|参与时间）</label>
                  <textarea
                    className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[88px]"
                    value={documentMeta.contributors.map((item) => `${item.name}${item.joinedAt ? `|${item.joinedAt}` : ""}`).join("\n")}
                    onChange={(e) =>
                      setDocumentMeta((prev) => ({
                        ...prev,
                        contributors: e.target.value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
                          const [name, joinedAt] = line.split("|").map((part) => part.trim());
                          return { name, joinedAt };
                        }),
                      }))
                    }
                    placeholder="示例：某某整木|2026-03-18"
                  />
                  <label className="block text-sm text-muted">版本记录（每行一个，格式：版本|更新时间|修改说明）</label>
                  <textarea
                    className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[110px]"
                    value={documentMeta.versions.map((item) => [item.version, item.updatedAt, item.note].filter(Boolean).join("|")).join("\n")}
                    onChange={(e) =>
                      setDocumentMeta((prev) => ({
                        ...prev,
                        versions: e.target.value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
                          const [version, updatedAt, note] = line.split("|").map((part) => part.trim());
                          return { version: version || "未命名版本", updatedAt, note };
                        }),
                      }))
                    }
                    placeholder="示例：V1.0|2026-03-18|首版发布"
                  />
                </>
              )}
            </div>
          )}

          {safeTab !== "brands" && (
            <>
              <label className="block text-sm text-muted">顶部配图（可选）</label>
              <input
                className="w-full border border-border rounded px-3 py-2 bg-surface"
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                placeholder="可填写图片 URL，或使用下方上传按钮"
              />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    void handleCoverImageUpload(e.target.files?.[0] ?? null);
                    e.currentTarget.value = "";
                  }}
                  className="block"
                />
                <span>支持本地上传，最大 2MB</span>
                {(coverPreviewSrc || coverImage) && (
                  <button
                    type="button"
                    onClick={() => { setCoverImage(""); replacePreviewUrl("publish", ""); }}
                    className="px-2 py-1 rounded border border-border hover:bg-surface"
                  >
                    清除
                  </button>
                )}
                {(coverPreviewSrc || coverImage) && (
                  <button
                    type="button"
                    onClick={() => setCropTarget("publish")}
                    className="px-2 py-1 rounded border border-border hover:bg-surface"
                  >
                    裁剪
                  </button>
                )}
              </div>
              {safeTab === "terms" && <p className="text-xs text-muted">最佳尺寸：1600 x 900 px，建议使用横版 16:9 图片。</p>}
              {(coverPreviewSrc || coverImage) && (
                <div ref={publishCoverPreviewRef} className="rounded-lg border border-border bg-surface p-3">
                  <p className="text-xs text-muted mb-2">顶部配图预览</p>
                  {/* 这里允许预览任意已上传地址，使用原生 img 可避免远程域名限制阻断后台预览。 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolveUploadedImageUrl(coverPreviewSrc || coverImage)} alt="" className="max-h-80 w-full rounded-lg border border-border bg-surface-elevated object-contain" loading="lazy" />
                </div>
              )}
            </>
          )}


          {safeTab !== "terms" &&
            safeTab !== "brands" &&
            safeTab !== "standards" &&
            safeTab !== "industry-data" &&
            safeTab !== "awards" && (
            <>
              <label className="block text-sm text-muted">正文</label>
              <RichEditor value={content} onChange={setContent} onImportedTitle={handleImportedPublishTitle} minHeight={280} placeholder="" allowClipboardImagePaste={canPasteImages} toolbarIcons statusResetKey={`member-publish:${safeTab}:${publishEditorStatusVersion}`} />
            </>
          )}
          {safeTab === "brands" && (
            <>
              <label className="block text-sm text-muted">品牌结构化内容</label>
              <BrandStructuredEditor value={brandStructured} onChange={setBrandStructured} />
            </>
          )}

          {renderCategoryFeatureFields(safeTab)}

          <button className="px-4 py-2 rounded bg-accent text-white text-sm disabled:opacity-50" disabled={loading}>
            {loading ? "提交中..." : "提交审核"}
          </button>
        </form>

      </div>
      </div>

      {editingId && (
        <section ref={editFormRef} className="mt-6 rounded-xl border border-border bg-surface-elevated p-5">
          <h2 className="text-sm font-medium text-primary mb-3">提交修改申请</h2>
          <form onSubmit={submitEditRequest} className="space-y-3">
            <label className="block text-sm text-muted">新标题</label>
            <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm text-muted">{safeTab === "standards" ? "标准摘要" : "新摘要"}</label>
              <button type="button" onClick={autoFillEditExcerpt} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface">自动生成摘要</button>
            </div>
            <textarea
              className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[80px] whitespace-pre-wrap resize-y"
              value={editExcerpt}
              onChange={(e) => setEditExcerpt(e.target.value)}
            />
            {subOptions.length > 0 && (
              <>
                <label className="block text-sm text-muted">子栏目</label>
                <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-2">
                  {subOptions.map((s) => {
                    const active = editSubHref === s.href;
                    const disabled = !s.enabled;
                    return (
                      <button
                        key={s.href}
                        type="button"
                        onClick={() => {
                          if (!disabled) setEditSubHref(s.href);
                        }}
                        disabled={disabled}
                        className={`px-3 py-1.5 rounded-md text-sm transition ${
                          disabled
                            ? "cursor-not-allowed border border-dashed border-border text-muted/70 bg-surface"
                            : active
                              ? "bg-accent text-white"
                              : "bg-surface-elevated text-primary border border-border hover:bg-surface"
                        }`}
                      >
                        <span>{s.label}</span>
                        <span className={`ml-2 text-[11px] ${disabled || !active ? "opacity-80" : "text-white/80"}`}>
                          {disabled ? "未开通" : formatQuota(s.annualLimit, s.remainingCount)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {safeTab !== "brands" && (
              <>
                <label className="block text-sm text-muted">新顶部配图（可选）</label>
                <input
                  className="w-full border border-border rounded px-3 py-2 bg-surface"
                  value={editCoverImage}
                  onChange={(e) => setEditCoverImage(e.target.value)}
                  placeholder="可填写图片 URL，或使用下方上传按钮"
                />
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      void handleEditCoverImageUpload(e.target.files?.[0] ?? null);
                      e.currentTarget.value = "";
                    }}
                    className="block"
                  />
                  <span>支持本地上传，最大 2MB</span>
                  {(editCoverPreviewSrc || editCoverImage) && (
                    <button
                      type="button"
                      onClick={() => { setEditCoverImage(""); replacePreviewUrl("edit", ""); }}
                      className="px-2 py-1 rounded border border-border hover:bg-surface"
                    >
                      清除
                    </button>
                  )}
                  {(editCoverPreviewSrc || editCoverImage) && (
                    <button
                      type="button"
                      onClick={() => setCropTarget("edit")}
                      className="px-2 py-1 rounded border border-border hover:bg-surface"
                    >
                      裁剪
                    </button>
                  )}
                </div>
                {safeTab === "terms" && <p className="text-xs text-muted">最佳尺寸：1600 x 900 px，建议使用横版 16:9 图片。</p>}
                {(editCoverPreviewSrc || editCoverImage) && (
                  <div ref={editCoverPreviewRef} className="rounded-lg border border-border bg-surface p-3">
                    <p className="text-xs text-muted mb-2">顶部配图预览</p>
                    {/* 这里允许预览任意已上传地址，使用原生 img 可避免远程域名限制阻断后台预览。 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolveUploadedImageUrl(editCoverPreviewSrc || editCoverImage)} alt="" className="max-h-80 w-full rounded-lg border border-border bg-surface-elevated object-contain" loading="lazy" />
                  </div>
                )}
              </>
            )}
            {safeTab === "brands" ? (
              <>
                <label className="block text-sm text-muted">品牌结构化内容</label>
                <BrandStructuredEditor value={editBrandStructured} onChange={setEditBrandStructured} />
              </>
            ) : safeTab === "standards" ? (
              <>
                <label className="block text-sm text-muted">标准结构化内容</label>
                <StandardStructuredEditor value={editStandardStructured} onChange={setEditStandardStructured} />
              </>
            ) : safeTab === "industry-data" ? (
              <>
                <label className="block text-sm text-muted">数据结构化内容</label>
                <DataStructuredEditor value={editDataStructured} onChange={setEditDataStructured} />
              </>
            ) : safeTab === "awards" ? (
              <>
                <label className="block text-sm text-muted">评选结构化内容</label>
                <AwardStructuredEditor value={editAwardStructured} onChange={setEditAwardStructured} />
              </>
            ) : (
              <>
                <label className="block text-sm text-muted">新正文</label>
                <RichEditor value={editContent} onChange={setEditContent} onImportedTitle={handleImportedEditTitle} minHeight={260} placeholder="" allowClipboardImagePaste={canPasteImages} statusResetKey={`member-edit:${safeTab}:${editingId ?? "none"}:${editEditorStatusVersion}`} />
              </>
            )}
            <label className="block text-sm text-muted">修改说明</label>
            <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="例如：修正数据口径和段落结构" />
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-2 rounded bg-accent text-white text-sm">提交申请</button>
              <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2 rounded border border-border text-sm">取消</button>
            </div>
          </form>
        </section>
      )}

      {cropTarget && (
        <ImageCropDialog
          source={resolveUploadedImageUrl(cropTarget === "publish" ? (coverPreviewSrc || coverImage) : (editCoverPreviewSrc || editCoverImage))}
          onCancel={() => setCropTarget(null)}
          onConfirm={async (file) => {
            await applyCroppedCover(file, cropTarget);
          }}
        />
      )}
    </div>
  );
}

export default function PublishCenterPage() {
  return (
    <Suspense fallback={<div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 text-sm text-muted">加载中...</div>}>
      <PublishCenterPageInner />
    </Suspense>
  );
}
