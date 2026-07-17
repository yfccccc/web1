"use client";

import dynamic from "next/dynamic";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ADMIN_PUBLISH_CATEGORY_OPTIONS, CONTENT_TAB_DEFS, resolveTabKeyFromHref, type ContentTabKey } from "@/lib/content-taxonomy";
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
import { buildDirtyTextErrorMessage } from "@/lib/article-input-guard";

function LazyPanelPlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4 text-sm text-muted">
      {label}加载中...
    </div>
  );
}

const ManageContentList = dynamic(
  () => import("@/app/membership/admin/content/components/ManageContentListClean").then((mod) => mod.ManageContentList),
  {
    loading: () => <LazyPanelPlaceholder label="内容列表" />,
  }
);

const ReviewPanels = dynamic(
  () => import("@/app/membership/admin/content/components/ReviewPanels").then((mod) => mod.ReviewPanels),
  {
    loading: () => <LazyPanelPlaceholder label="审核面板" />,
  }
);

const ImageCropDialog = dynamic(
  () => import("@/components/ImageCropDialog").then((mod) => mod.ImageCropDialog),
  {
    ssr: false,
    loading: () => <LazyPanelPlaceholder label="图片裁剪器" />,
  }
);

const RichEditor = dynamic(() => import("@/components/RichEditor").then((mod) => mod.RichEditor), {
  ssr: false,
  loading: () => <LazyPanelPlaceholder label="富文本编辑器" />,
});

const BrandStructuredEditor = dynamic(
  () => import("@/components/BrandStructuredEditor").then((mod) => mod.BrandStructuredEditor),
  {
    ssr: false,
    loading: () => <LazyPanelPlaceholder label="品牌结构化编辑器" />,
  }
);

const StandardStructuredEditor = dynamic(
  () => import("@/components/StandardStructuredEditor").then((mod) => mod.StandardStructuredEditor),
  {
    ssr: false,
    loading: () => <LazyPanelPlaceholder label="标准结构化编辑器" />,
  }
);

const DataStructuredEditor = dynamic(
  () => import("@/components/DataStructuredEditor").then((mod) => mod.DataStructuredEditor),
  {
    ssr: false,
    loading: () => <LazyPanelPlaceholder label="数据结构化编辑器" />,
  }
);

const AwardStructuredEditor = dynamic(
  () => import("@/components/AwardStructuredEditor").then((mod) => mod.AwardStructuredEditor),
  {
    ssr: false,
    loading: () => <LazyPanelPlaceholder label="奖项结构化编辑器" />,
  }
);

type Status = "draft" | "pending" | "approved" | "rejected";
type Mode = "publish" | "manage" | "review";
type SubmitPreview = { title: string; href: string | null; status: Status };

type SessionInfo = {
  role: string | null;
  canDeleteOwnContent: boolean;
  canDeleteMemberContent: boolean;
  canDeleteAllContent: boolean;
  canEditOwnContent: boolean;
  canEditMemberContent: boolean;
  canEditAllContent: boolean;
};

type EnterpriseOption = {
  id: string;
  memberId: string | null;
  label: string;
  brandName: string | null;
};

function enterpriseOptionLabel(option: EnterpriseOption) {
  return `${option.label}${option.brandName ? ` / ${option.brandName}` : ""}`;
}

type ArticleItem = {
  id: string;
  title: string;
  slug: string;
  sourceType?: string | null;
  source?: string | null;
  generationBatchId?: string | null;
  keywordSeed?: string | null;
  keywordIntent?: string | null;
  sourceUrl?: string | null;
  displayAuthor?: string | null;
  excerpt?: string | null;
  content: string;
  coverImage?: string | null;
  subHref?: string | null;
  categoryHref?: string | null;
  tagSlugs?: string | null;
  keywords?: string | null;
  manualKeywords?: string | null;
  recommendIds?: string | null;
  productRecommendations?: string | null;
  faqJson?: string | null;
  isPinned?: boolean;
  publishedAt?: string | null;
  viewCount?: number;
  status: Status;
  previewHref?: string | null;
  ownedEnterpriseId?: string | null;
  ownedEnterprise?: {
    id: string;
    companyName?: string | null;
    companyShortName?: string | null;
  } | null;
  authorMember?: {
    id: string;
    name: string | null;
    email: string;
    role: string | null;
  } | null;
};

type ChangeRequestItem = {
  id: string;
  reason: string | null;
  diffSummary: string | null;
  patchTitle?: string | null;
  patchExcerpt?: string | null;
  patchContent?: string | null;
  patchCoverImage?: string | null;
  patchTagSlugs?: string | null;
  patchSubHref?: string | null;
  article: {
    id: string;
    title: string;
    source?: string | null;
    sourceUrl?: string | null;
    displayAuthor?: string | null;
    excerpt?: string | null;
    content?: string | null;
    coverImage?: string | null;
    tagSlugs?: string | null;
    subHref?: string | null;
    isPinned?: boolean;
  };
  submitter: { name: string | null; email: string; role: string | null };
};

type ManageSourceFilter = "all" | "manual" | "ai_generated" | "imported";

function parseManageSourceFilter(raw: string | null): ManageSourceFilter {
  return raw === "manual" || raw === "ai_generated" || raw === "imported" ? raw : "all";
}

const COVER_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const ADMIN_AUDIT_COUNTS_REFRESH_EVENT = "admin-audit-counts-refresh";

const BRAND_REGION_OPTIONS = ["全国", "华东", "华中", "华南", "西南", "西北", "华北", "东北"] as const;

const STATUS_TEXT: Record<Status, string> = {
  draft: "草稿",
  pending: "待审核",
  approved: "已发布",
  rejected: "已驳回",
};

function parseMode(raw: string | null): Mode {
  return raw === "manage" || raw === "review" || raw === "publish" ? raw : "publish";
}

function parseTab(raw: string | null): ContentTabKey {
  const hit = CONTENT_TAB_DEFS.find((x) => x.key === raw);
  return hit?.key ?? "articles";
}

function submitterLabel(user?: { name: string | null; email: string; role: string | null } | null) {
  if (!user) return "未知账号";
  const roleLabel =
    user.role === "SUPER_ADMIN" ? "主管理员" : user.role === "ADMIN" ? "子管理员" : "会员";
  return `${user.name?.trim() || user.email}（${roleLabel}）`;
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

function isRichTextArticleTab(tab: ContentTabKey) {
  return tab === "articles" || tab === "buying" || tab === "terms";
}

function getPublishTabHint(tab: ContentTabKey) {
  if (tab === "articles" || tab === "buying") {
    return "支持标题、作者、来源、原文链接、摘要、顶部配图、富文本正文和导入文档。";
  }

  if (tab === "standards") {
    return "支持标准正文编辑、文档导入、表格图片保留与结构化标准信息维护。";
  }

  if (tab === "terms") {
    return "支持富文本正文、图片和表格、Word 文档导入及文档信息维护。";
  }

  return null;
}

function normalizeEnterpriseOptions(input: unknown): EnterpriseOption[] {
  if (!Array.isArray(input)) return [];

  const mapped = new Map<string, EnterpriseOption>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as {
      id?: string;
      enterprise?: { id?: string; companyName?: string | null; companyShortName?: string | null; brand?: { name?: string | null } | null } | null;
      enterpriseId?: string | null;
      enterpriseName?: string | null;
      brandName?: string | null;
    };
    const enterpriseId = candidate.enterprise?.id ?? candidate.enterpriseId ?? null;
    const enterpriseName =
      candidate.enterprise?.companyShortName?.trim() ||
      candidate.enterprise?.companyName?.trim() ||
      candidate.enterpriseName?.trim() ||
      null;
    if (!enterpriseId || !enterpriseName) continue;
    if (mapped.has(enterpriseId)) continue;
    mapped.set(enterpriseId, {
      id: enterpriseId,
      memberId: typeof candidate.id === "string" ? candidate.id : null,
      label: enterpriseName,
      brandName: candidate.enterprise?.brand?.name?.trim() || candidate.brandName?.trim() || null,
    });
  }

  return Array.from(mapped.values()).sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
}

function timeValue(value?: string | null) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function scrollToManagedItem(itemId: string, behavior: ScrollBehavior = "smooth") {
  const element = document.getElementById(`manage-article-${itemId}`);
  if (!element) return false;
  const top = window.scrollY + element.getBoundingClientRect().top - 170;
  window.scrollTo({ top: Math.max(0, top), behavior });
  return true;
}

function notifyAdminAuditCountsRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ADMIN_AUDIT_COUNTS_REFRESH_EVENT));
}

export default function AdminContentPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = parseMode(searchParams.get("mode"));
  const tab = parseTab(searchParams.get("tab"));
  const searchQuery = searchParams.get("q")?.trim() ?? "";
  const sourceTypeFilter = parseManageSourceFilter(searchParams.get("sourceType"));

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const messageRef = useRef<HTMLDivElement | null>(null);
  const editFormRef = useRef<HTMLElement | null>(null);
  const manageReturnScrollRef = useRef<number | null>(null);
  const manageReturnItemIdRef = useRef<string | null>(null);
  const publishCoverPreviewRef = useRef<HTMLDivElement | null>(null);
  const editCoverPreviewRef = useRef<HTMLDivElement | null>(null);
  const publishObjectUrlRef = useRef<string | null>(null);
  const editObjectUrlRef = useRef<string | null>(null);
  const suppressMessageScrollRef = useRef(false);
  const [lastSubmitted, setLastSubmitted] = useState<SubmitPreview | null>(null);
  const [pendingPreviewScroll, setPendingPreviewScroll] = useState<"publish" | "edit" | null>(null);
  const [cropTarget, setCropTarget] = useState<"publish" | "edit" | null>(null);

  const [items, setItems] = useState<ArticleItem[]>([]);
  const [pendingItems, setPendingItems] = useState<ArticleItem[]>([]);
  const [pendingChanges, setPendingChanges] = useState<ChangeRequestItem[]>([]);
  const [enterpriseOptions, setEnterpriseOptions] = useState<EnterpriseOption[]>([]);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [displayAuthor, setDisplayAuthor] = useState("");
  const [ownedEnterpriseId, setOwnedEnterpriseId] = useState("");
  const [ownedEnterpriseSearch, setOwnedEnterpriseSearch] = useState("");
  const [ownedEnterpriseOpen, setOwnedEnterpriseOpen] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [brandStructured, setBrandStructured] = useState<BrandStructuredData>(createDefaultBrandStructuredData());
  const [standardStructured, setStandardStructured] = useState<StandardStructuredData>(createDefaultStandardStructuredData());
  const [dataStructured, setDataStructured] = useState<DataStructuredData>(createDefaultDataStructuredData());
  const [awardStructured, setAwardStructured] = useState<AwardStructuredData>(createDefaultAwardStructuredData());
  const [subHref, setSubHref] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [coverPreviewSrc, setCoverPreviewSrc] = useState("");
  const [tagSlugs, setTagSlugs] = useState("");
  const [manualKeywords, setManualKeywords] = useState("");
  const [recommendIds, setRecommendIds] = useState("");
  const [productRecommendations, setProductRecommendations] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [documentMeta, setDocumentMeta] = useState<DocumentMetadata>(createEmptyDocumentMetadata());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingChangeId, setEditingChangeId] = useState<string | null>(null);
  const [editSlug, setEditSlug] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editSource, setEditSource] = useState("");
  const [editSourceUrl, setEditSourceUrl] = useState("");
  const [editDisplayAuthor, setEditDisplayAuthor] = useState("");
  const [editOwnedEnterpriseId, setEditOwnedEnterpriseId] = useState("");
  const [editOwnedEnterpriseSearch, setEditOwnedEnterpriseSearch] = useState("");
  const [editOwnedEnterpriseOpen, setEditOwnedEnterpriseOpen] = useState(false);
  const [publishEditorStatusVersion, setPublishEditorStatusVersion] = useState(0);
  const [editEditorStatusVersion, setEditEditorStatusVersion] = useState(0);
  const [editExcerpt, setEditExcerpt] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editBrandStructured, setEditBrandStructured] = useState<BrandStructuredData>(createDefaultBrandStructuredData());
  const [editStandardStructured, setEditStandardStructured] = useState<StandardStructuredData>(createDefaultStandardStructuredData());
  const [editDataStructured, setEditDataStructured] = useState<DataStructuredData>(createDefaultDataStructuredData());
  const [editAwardStructured, setEditAwardStructured] = useState<AwardStructuredData>(createDefaultAwardStructuredData());
  const [editCoverImage, setEditCoverImage] = useState("");
  const [editCoverPreviewSrc, setEditCoverPreviewSrc] = useState("");
  const [editTagSlugs, setEditTagSlugs] = useState("");
  const [editManualKeywords, setEditManualKeywords] = useState("");
  const [editRecommendIds, setEditRecommendIds] = useState("");
  const [editProductRecommendations, setEditProductRecommendations] = useState("");
  const [editSubHref, setEditSubHref] = useState("");
  const [editIsPinned, setEditIsPinned] = useState(false);
  const [editDocumentMeta, setEditDocumentMeta] = useState<DocumentMetadata>(createEmptyDocumentMetadata());
  const autoSlugRef = useRef("");
  const autoSeoRef = useRef({ seoTitle: "", seoKeywords: "", seoDescription: "" });
  const autoEditSlugRef = useRef("");
  const autoEditSeoRef = useRef({ seoTitle: "", seoKeywords: "", seoDescription: "" });
  const [reviewAction, setReviewAction] = useState<Status | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const [manageSearchDraft, setManageSearchDraft] = useState(searchQuery);
  const [manageSourceTypeDraft, setManageSourceTypeDraft] = useState<ManageSourceFilter>(sourceTypeFilter);

  const applyImportedTitle = useCallback(
    (
      nextTitleRaw: string,
      currentTitle: string,
      setTitleValue: (value: string) => void,
      contextLabel: "标题" | "编辑标题"
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
      applyImportedTitle(nextTitle, editTitle, setEditTitle, "编辑标题");
    },
    [applyImportedTitle, editTitle]
  );


  const selectedTabDef = useMemo(() => CONTENT_TAB_DEFS.find((x) => x.key === tab) ?? CONTENT_TAB_DEFS[0], [tab]);
  const selectedCategory = useMemo(() => ADMIN_PUBLISH_CATEGORY_OPTIONS.find((x) => x.href === selectedTabDef.href) ?? ADMIN_PUBLISH_CATEGORY_OPTIONS[0], [selectedTabDef.href]);
  const subOptions = selectedCategory.subs;
  const publishTabHint = useMemo(() => getPublishTabHint(tab), [tab]);
  const supportsOwnedEnterprise = tab === "articles";
  const isDocumentTab = tab === "terms" || tab === "standards";
  const documentKind = tab === "standards" ? "standards" : "terms";
  const isSuperAdmin = session?.role === "SUPER_ADMIN";
  const canReview = !!(
    session &&
    (session.role === "SUPER_ADMIN" || session.canEditAllContent || session.canEditMemberContent)
  );

  const canEdit = !!(session && (isSuperAdmin || session.canEditAllContent || session.canEditMemberContent || session.canEditOwnContent));
  const canDelete = !!(session && (isSuperAdmin || session.canDeleteAllContent || session.canDeleteMemberContent || session.canDeleteOwnContent));
  const filteredEnterpriseOptions = useMemo(() => {
    const keyword = ownedEnterpriseSearch.trim().toLowerCase();
    if (!keyword) return enterpriseOptions;
    return enterpriseOptions.filter((option) =>
      `${option.label} ${option.brandName || ""}`.toLowerCase().includes(keyword),
    );
  }, [enterpriseOptions, ownedEnterpriseSearch]);
  const filteredEditEnterpriseOptions = useMemo(() => {
    const keyword = editOwnedEnterpriseSearch.trim().toLowerCase();
    if (!keyword) return enterpriseOptions;
    return enterpriseOptions.filter((option) =>
      `${option.label} ${option.brandName || ""}`.toLowerCase().includes(keyword),
    );
  }, [enterpriseOptions, editOwnedEnterpriseSearch]);
  const selectedOwnedEnterprise = useMemo(
    () => enterpriseOptions.find((option) => option.id === ownedEnterpriseId) ?? null,
    [enterpriseOptions, ownedEnterpriseId],
  );
  const selectedEditOwnedEnterprise = useMemo(
    () => enterpriseOptions.find((option) => option.id === editOwnedEnterpriseId) ?? null,
    [enterpriseOptions, editOwnedEnterpriseId],
  );

  useEffect(() => {
    if (!subHref && subOptions[0]) setSubHref(subOptions[0].href);
  }, [tab, subHref, subOptions]);

  useEffect(() => {
    setTitle("");
    setSlug("");
    setSource("");
    setSourceUrl("");
    setDisplayAuthor("");
    setOwnedEnterpriseId("");
    setOwnedEnterpriseSearch("");
    setOwnedEnterpriseOpen(false);
    setExcerpt("");
    setContent("");
    setBrandStructured(createDefaultBrandStructuredData());
    setStandardStructured(createDefaultStandardStructuredData());
    setDataStructured(createDefaultDataStructuredData());
    setAwardStructured(createDefaultAwardStructuredData());
    setSubHref(subOptions[0]?.href ?? "");
    setCoverImage("");
    setTagSlugs("");
    setManualKeywords("");
    setRecommendIds("");
    setProductRecommendations("");
    setIsPinned(false);
    setDocumentMeta(createEmptyDocumentMetadata());
    setMessage("");
    setLastSubmitted(null);
    replacePreviewUrl("publish", "");
    autoSlugRef.current = "";
    autoSeoRef.current = { seoTitle: "", seoKeywords: "", seoDescription: "" };

    setEditingId(null);
    setEditingChangeId(null);
    setEditSlug("");
    setEditTitle("");
    setEditSource("");
    setEditSourceUrl("");
    setEditDisplayAuthor("");
    setEditOwnedEnterpriseId("");
    setEditOwnedEnterpriseSearch("");
    setEditOwnedEnterpriseOpen(false);
    setEditExcerpt("");
    setEditContent("");
    setEditBrandStructured(createDefaultBrandStructuredData());
    setEditStandardStructured(createDefaultStandardStructuredData());
    setEditDataStructured(createDefaultDataStructuredData());
    setEditAwardStructured(createDefaultAwardStructuredData());
    setEditCoverImage("");
    setEditTagSlugs("");
    setEditManualKeywords("");
    setEditRecommendIds("");
    setEditProductRecommendations("");
    setEditSubHref("");
    setEditIsPinned(false);
    setEditDocumentMeta(createEmptyDocumentMetadata());
    setReviewAction(null);
    replacePreviewUrl("edit", "");
    autoEditSlugRef.current = "";
    autoEditSeoRef.current = { seoTitle: "", seoKeywords: "", seoDescription: "" };
    setPublishEditorStatusVersion((value) => value + 1);
    setEditEditorStatusVersion((value) => value + 1);
  }, [tab, subOptions]);

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
  }, [documentKind, editContent, editDocumentMeta.intro, editingId, editSlug, editTitle, isDocumentTab]);

  function replacePreviewUrl(kind: "publish" | "edit", nextUrl: string) {
    const targetRef = kind === "publish" ? publishObjectUrlRef : editObjectUrlRef;
    const setPreview = kind === "publish" ? setCoverPreviewSrc : setEditCoverPreviewSrc;
    if (targetRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(targetRef.current);
    }
    targetRef.current = nextUrl.startsWith("blob:") ? nextUrl : null;
    setPreview(nextUrl);
  }

  function queuePreviewScroll(target: "publish" | "edit") {
    setPendingPreviewScroll(target);
  }

  async function uploadPublishCover(file: File | null) {
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

  async function uploadEditCover(file: File | null) {
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
      setMessage("顶部配图已加载，可先预览，保存后生效。");
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

  const loadSession = useCallback(async () => {
    const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
    if (!res.ok) { setLoading(false); return; }
    const me = await res.json();
    setSession({
      role: me.role ?? null,
      canDeleteOwnContent: me.canDeleteOwnContent === true,
      canDeleteMemberContent: me.canDeleteMemberContent === true,
      canDeleteAllContent: me.canDeleteAllContent === true,
      canEditOwnContent: me.canEditOwnContent === true,
      canEditMemberContent: me.canEditMemberContent === true,
      canEditAllContent: me.canEditAllContent === true,
    });
    setLoading(false);
  }, []);

  const loadEnterpriseOptions = useCallback(async () => {
    const res = await fetch("/api/admin/members", { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => []);
    setEnterpriseOptions(normalizeEnterpriseOptions(data));
  }, []);

  const loadList = useCallback(async () => {
    const sp = new URLSearchParams({ limit: "100", tab });
    if (searchQuery) sp.set("q", searchQuery);
    if (sourceTypeFilter !== "all") sp.set("sourceType", sourceTypeFilter);
    const res = await fetch(`/api/admin/articles?${sp.toString()}`, { credentials: "include", cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    setItems(Array.isArray(data.items) ? data.items : []);
  }, [searchQuery, sourceTypeFilter, tab]);

  const loadReview = useCallback(async () => {
    const sp = new URLSearchParams({ status: "pending", limit: "200", tab });
    const [a, c] = await Promise.all([
      fetch(`/api/admin/articles?${sp.toString()}`, { credentials: "include", cache: "no-store" }),
      fetch(`/api/admin/article-change-requests?${sp.toString()}`, { credentials: "include", cache: "no-store" }),
    ]);
    const ad = await a.json().catch(() => ({}));
    const cd = await c.json().catch(() => ({}));
    setPendingItems(Array.isArray(ad.items) ? ad.items : []);
    setPendingChanges(Array.isArray(cd.items) ? cd.items : []);
  }, [tab]);

  useEffect(() => { void loadSession(); }, [loadSession]);
  useEffect(() => {
    if (!session) return;
    void loadEnterpriseOptions();
  }, [session, loadEnterpriseOptions]);
  useEffect(() => {
    if (!session) return;
    if (mode === "manage") void loadList();
    if (mode === "review" && canReview) void loadReview();
  }, [session, mode, canReview, loadList, loadReview]);

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

  useEffect(() => {
    setManageSearchDraft(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    setManageSourceTypeDraft(sourceTypeFilter);
  }, [sourceTypeFilter]);

  useEffect(() => {
    if (!highlightedItemId || mode !== "manage") return;

    let cancelled = false;
    let timeoutId: number | null = null;
    let attempts = 0;

    const run = () => {
      if (cancelled) return;
      attempts += 1;
      const found = scrollToManagedItem(highlightedItemId, attempts === 1 ? "auto" : "smooth");
      if (found) {
        timeoutId = window.setTimeout(() => setHighlightedItemId(null), 2200);
        return;
      }
      if (attempts >= 12) {
        setHighlightedItemId(null);
        return;
      }
      timeoutId = window.setTimeout(run, 140);
    };

    timeoutId = window.setTimeout(() => window.requestAnimationFrame(run), 180);

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [highlightedItemId, items, mode]);

  const manageItems = useMemo(
    () =>
      [...items]
        .sort((a, b) => {
          if ((a.isPinned === true) !== (b.isPinned === true)) return a.isPinned === true ? -1 : 1;

          const aPublished = a.status === "approved";
          const bPublished = b.status === "approved";
          if (aPublished && bPublished) {
            return timeValue(b.publishedAt) - timeValue(a.publishedAt);
          }
          if (aPublished !== bPublished) return aPublished ? -1 : 1;

          return timeValue(b.publishedAt) - timeValue(a.publishedAt);
        })
        .map((item) => ({
          ...item,
          previewHref: buildPreviewHref(item.categoryHref ?? null, item.subHref ?? null, item.id, item.slug ?? null, item.title),
        })),
    [items]
  );

  function getPublishSourceText() {
    return (
      tab === "brands"
          ? brandStructuredToSearchText(brandStructured)
          : tab === "terms"
            ? content
          : tab === "standards"
            ? content
            : tab === "industry-data"
              ? dataStructuredToSearchText(dataStructured)
              : tab === "awards"
                ? awardStructuredToSearchText(awardStructured)
                : content
    ).trim();
  }

  function getEditSourceText() {
    return (
      tab === "brands"
          ? brandStructuredToSearchText(editBrandStructured)
          : tab === "terms"
            ? editContent
          : tab === "standards"
            ? editContent
            : tab === "industry-data"
              ? dataStructuredToSearchText(editDataStructured)
              : tab === "awards"
                ? awardStructuredToSearchText(editAwardStructured)
                : editContent
    ).trim();
  }

  function autoFillPublishExcerpt() {
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

  async function submitPublish(e: FormEvent) {
    e.preventDefault();
    setLastSubmitted(null);
    const composedContent =
      tab === "brands"
          ? buildBrandStructuredHtml(brandStructured)
          : tab === "standards"
            ? content
            : tab === "industry-data"
              ? buildDataStructuredHtml(dataStructured)
              : tab === "awards"
              ? buildAwardStructuredHtml(awardStructured)
                : content;
    const payload = {
      title: title.trim(),
      slug: slug.trim() || null,
      source: source.trim() || null,
      sourceUrl: sourceUrl.trim() || null,
      displayAuthor: displayAuthor.trim() || null,
      ownedEnterpriseId: supportsOwnedEnterprise ? ownedEnterpriseId || null : null,
      excerpt: excerpt || null,
      content: composedContent,
      coverImage:
        tab === "brands"
          ? brandStructured.logoUrl.trim() || null
          : coverImage.trim() || null,
      applicableScenarios:
        tab === "standards"
          ? standardStructured.scope.trim() || null
          : tab === "industry-data"
            ? dataStructured.methodology.trim() || null
            : null,
      versionLabel:
        tab === "standards"
          ? standardStructured.versionNote.trim() || null
          : tab === "awards"
            ? (awardStructured.year ? `${awardStructured.year}版` : null)
            : null,
      categoryHref: selectedCategory.href,
      subHref: subOptions.length > 0 ? subHref || null : null,
      tagSlugs: tagSlugs || null,
      manualKeywords: manualKeywords || null,
      recommendIds: recommendIds || null,
      productRecommendations: productRecommendations || null,
      faqJson: tab === "terms" || tab === "standards" ? stringifyDocumentMetadata(documentMeta) : null,
      syncToMainSite: true,
      isPinned,
    };
    const dirtyTextError = buildDirtyTextErrorMessage([
      { label: "标题", value: payload.title },
      { label: "摘要", value: payload.excerpt },
      { label: "正文", value: payload.content },
      { label: "作者", value: payload.displayAuthor },
      { label: "来源", value: payload.source },
      { label: "适用场景", value: payload.applicableScenarios },
      { label: "版本标签", value: payload.versionLabel },
      { label: "手工关键词", value: payload.manualKeywords },
    ]);
    if (dirtyTextError) {
      setMessage(dirtyTextError);
      return;
    }
    const res = await fetch("/api/admin/articles", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error ?? "发布失败"); return; }
    const submittedTitle = typeof data?.title === "string" ? data.title : title.trim();
    const submittedStatus = (typeof data?.status === "string" ? data.status : "approved") as Status;
    const previewHref = buildPreviewHref(
      typeof data?.categoryHref === "string" ? data.categoryHref : selectedCategory.href,
      typeof data?.subHref === "string" ? data.subHref : subHref,
      typeof data?.id === "string" ? data.id : null,
      typeof data?.slug === "string" ? data.slug : null,
      submittedTitle,
      tab
    );
    setLastSubmitted({ title: submittedTitle, href: previewHref, status: submittedStatus });
    setMessage("提交成功。");
    setTitle("");
    setSlug("");
    setSource("");
    setSourceUrl("");
    setDisplayAuthor("");
    setOwnedEnterpriseId("");
    setExcerpt("");
    setContent("");
    setCoverImage("");
    setTagSlugs("");
    setManualKeywords("");
    setRecommendIds("");
    setProductRecommendations("");
    setIsPinned(false);
    autoSlugRef.current = "";
    autoSeoRef.current = { seoTitle: "", seoKeywords: "", seoDescription: "" };
    setDocumentMeta(createEmptyDocumentMetadata());
    setBrandStructured(createDefaultBrandStructuredData());
    setStandardStructured(createDefaultStandardStructuredData());
    setDataStructured(createDefaultDataStructuredData());
    setAwardStructured(createDefaultAwardStructuredData());
    setPublishEditorStatusVersion((value) => value + 1);
  }

  function openEdit(item: ArticleItem) {
    const nextMeta = parseDocumentMetadata(item.faqJson);
    if (mode === "manage") {
      manageReturnScrollRef.current = window.scrollY;
      manageReturnItemIdRef.current = item.id;
    }
    setEditingId(item.id);
    setEditingChangeId(null);
    setEditSlug(item.slug ?? "");
    setEditTitle(item.title);
    setEditSource(item.source ?? "");
    setEditSourceUrl(item.sourceUrl ?? "");
    setEditDisplayAuthor(item.displayAuthor ?? "");
    setEditOwnedEnterpriseId(item.ownedEnterpriseId ?? "");
    setEditOwnedEnterpriseSearch("");
    setEditOwnedEnterpriseOpen(false);
    setEditExcerpt(item.excerpt ?? "");
    setEditContent(item.content);
    setEditBrandStructured(
      tab === "brands"
        ? parseBrandStructuredHtml(item.content) ?? createDefaultBrandStructuredData()
        : createDefaultBrandStructuredData()
    );
    setEditStandardStructured(
      tab === "standards"
        ? parseStandardStructuredHtml(item.content) ?? createDefaultStandardStructuredData()
        : createDefaultStandardStructuredData()
    );
    setEditDataStructured(
      tab === "industry-data"
        ? parseDataStructuredHtml(item.content) ?? createDefaultDataStructuredData()
        : createDefaultDataStructuredData()
    );
    setEditAwardStructured(
      tab === "awards"
        ? parseAwardStructuredHtml(item.content) ?? createDefaultAwardStructuredData()
        : createDefaultAwardStructuredData()
    );
    setEditCoverImage(item.coverImage ?? "");
    replacePreviewUrl("edit", item.coverImage ?? "");
    setEditTagSlugs(item.tagSlugs ?? "");
    setEditManualKeywords(item.manualKeywords ?? "");
    setEditRecommendIds(item.recommendIds ?? "");
    setEditProductRecommendations(item.productRecommendations ?? "");
    setEditSubHref(item.subHref ?? subHref);
    setEditIsPinned(item.isPinned === true);
    setEditDocumentMeta(nextMeta);
    autoEditSlugRef.current = slugify(item.title ?? "");
    const nextAutoEditSeo = hasAutoSeoSource(nextMeta.intro, item.content ?? "")
      ? {
          seoTitle: buildAutoSeoTitle(item.title ?? ""),
          seoKeywords: buildAutoSeoKeywords(item.title ?? "", tab === "standards" ? "standards" : "terms"),
          seoDescription: buildAutoSeoDescription(item.title ?? "", nextMeta.intro, item.content ?? ""),
        }
      : { seoTitle: "", seoKeywords: "", seoDescription: "" };
    autoEditSeoRef.current = {
      ...nextAutoEditSeo,
    };
  }

  function openEditFromChange(item: ChangeRequestItem) {
    const nextContent = item.patchContent ?? item.article.content ?? "";
    setEditingId(item.article.id);
    setEditingChangeId(item.id);
    setEditSlug("");
    setEditTitle(item.patchTitle ?? item.article.title);
    setEditSource(item.article.source ?? "");
    setEditSourceUrl(item.article.sourceUrl ?? "");
    setEditDisplayAuthor(item.article.displayAuthor ?? "");
    setEditOwnedEnterpriseId(
      items.find((entry) => entry.id === item.article.id)?.ownedEnterpriseId ??
        pendingItems.find((entry) => entry.id === item.article.id)?.ownedEnterpriseId ??
        ""
    );
    setEditExcerpt(item.patchExcerpt ?? item.article.excerpt ?? "");
    setEditContent(nextContent);
    setEditBrandStructured(
      tab === "brands"
        ? parseBrandStructuredHtml(nextContent) ?? createDefaultBrandStructuredData()
        : createDefaultBrandStructuredData()
    );
    setEditStandardStructured(
      tab === "standards"
        ? parseStandardStructuredHtml(nextContent) ?? createDefaultStandardStructuredData()
        : createDefaultStandardStructuredData()
    );
    setEditDataStructured(
      tab === "industry-data"
        ? parseDataStructuredHtml(nextContent) ?? createDefaultDataStructuredData()
        : createDefaultDataStructuredData()
    );
    setEditAwardStructured(
      tab === "awards"
        ? parseAwardStructuredHtml(nextContent) ?? createDefaultAwardStructuredData()
        : createDefaultAwardStructuredData()
    );
    setEditCoverImage(item.patchCoverImage ?? item.article.coverImage ?? "");
    replacePreviewUrl("edit", item.patchCoverImage ?? item.article.coverImage ?? "");
    setEditTagSlugs(item.patchTagSlugs ?? item.article.tagSlugs ?? "");
    setEditManualKeywords(items.find((entry) => entry.id === item.article.id)?.manualKeywords ?? pendingItems.find((entry) => entry.id === item.article.id)?.manualKeywords ?? "");
    setEditRecommendIds(items.find((entry) => entry.id === item.article.id)?.recommendIds ?? pendingItems.find((entry) => entry.id === item.article.id)?.recommendIds ?? "");
    setEditProductRecommendations(items.find((entry) => entry.id === item.article.id)?.productRecommendations ?? pendingItems.find((entry) => entry.id === item.article.id)?.productRecommendations ?? "");
    setEditSubHref(item.patchSubHref ?? item.article.subHref ?? subHref);
    setEditIsPinned(item.article.isPinned === true);
    autoEditSlugRef.current = slugify(item.patchTitle ?? item.article.title ?? "");
    autoEditSeoRef.current = { seoTitle: "", seoKeywords: "", seoDescription: "" };
    setEditDocumentMeta(createEmptyDocumentMetadata());
  }

  async function saveEdit(nextStatus?: Status) {
    if (!editingId) return;
    const savedEditingId = editingId;
    setReviewAction(nextStatus ?? null);
    const composedEditContent =
      tab === "brands"
          ? buildBrandStructuredHtml(editBrandStructured)
          : tab === "standards"
            ? editContent
            : tab === "industry-data"
              ? buildDataStructuredHtml(editDataStructured)
              : tab === "awards"
              ? buildAwardStructuredHtml(editAwardStructured)
                : editContent;
    const payload = {
      title: editTitle,
      slug: editSlug || undefined,
      source: editSource || null,
      sourceUrl: editSourceUrl || null,
      displayAuthor: editDisplayAuthor || null,
      ownedEnterpriseId: supportsOwnedEnterprise ? editOwnedEnterpriseId || null : null,
      excerpt: editExcerpt || null,
      content: composedEditContent,
      coverImage:
        tab === "brands"
          ? editBrandStructured.logoUrl.trim() || null
          : editCoverImage.trim() || null,
      applicableScenarios:
        tab === "standards"
          ? editStandardStructured.scope.trim() || null
          : tab === "industry-data"
            ? editDataStructured.methodology.trim() || null
            : undefined,
      versionLabel:
        tab === "standards"
          ? editStandardStructured.versionNote.trim() || null
          : tab === "awards"
            ? (editAwardStructured.year ? `${editAwardStructured.year}版` : null)
            : undefined,
      subHref: subOptions.length > 0 ? editSubHref || subHref || null : null,
      tagSlugs: editTagSlugs || null,
      manualKeywords: editManualKeywords || null,
      recommendIds: editRecommendIds || null,
      productRecommendations: editProductRecommendations || null,
      faqJson: tab === "terms" || tab === "standards" ? stringifyDocumentMetadata(editDocumentMeta) : null,
      isPinned: editIsPinned,
      status: nextStatus,
    };
    const dirtyTextError = buildDirtyTextErrorMessage([
      { label: "标题", value: payload.title },
      { label: "摘要", value: payload.excerpt },
      { label: "正文", value: payload.content },
      { label: "作者", value: payload.displayAuthor },
      { label: "来源", value: payload.source },
      { label: "适用场景", value: payload.applicableScenarios ?? null },
      { label: "版本标签", value: payload.versionLabel ?? null },
      { label: "手工关键词", value: payload.manualKeywords ?? null },
    ]);
    if (dirtyTextError) {
      setMessage(dirtyTextError);
      setReviewAction(null);
      return;
    }
    const res = await fetch(`/api/admin/articles/${editingId}`, {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMessage(data.error ?? "保存失败"); setReviewAction(null); return; }
    setItems((prev) => prev.map((item) => (item.id === savedEditingId ? { ...item, ...data } : item)));
    setPendingItems((prev) => prev.map((item) => (item.id === savedEditingId ? { ...item, ...data } : item)));
    setMessage(nextStatus ? "已修改并审核。" : "已保存修改。");
    setEditingId(null); setEditingChangeId(null); setEditOwnedEnterpriseId(""); setReviewAction(null);
    if (mode === "review") {
      await loadReview();
      notifyAdminAuditCountsRefresh();
    } else {
      await loadList();
      const returnItemId = manageReturnItemIdRef.current ?? savedEditingId;
      const returnScrollTop = manageReturnScrollRef.current;
      setHighlightedItemId(returnItemId);
      if (typeof returnScrollTop === "number") {
        window.setTimeout(() => {
          window.scrollTo({ top: Math.max(0, returnScrollTop), behavior: "auto" });
        }, 80);
      }
      window.setTimeout(() => {
        scrollToManagedItem(returnItemId);
      }, 320);
      manageReturnItemIdRef.current = null;
      manageReturnScrollRef.current = null;
    }
  }

  async function removeItem(id: string) {
    if (!confirm("确认删除该内容？")) return;
    const res = await fetch(`/api/admin/articles/${id}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) { setMessage("删除失败"); return; }
    setMessage("已删除。");
    await loadList();
  }

  async function reviewArticle(id: string, status: Status) {
    const res = await fetch(`/api/admin/articles/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setMessage("审核失败");
      return;
    }
    setMessage(`已${status === "approved" ? "通过" : "驳回"}。`);
    await loadReview();
    notifyAdminAuditCountsRefresh();
  }

  async function reviewChange(id: string, status: "approved" | "rejected") {
    const res = await fetch(`/api/admin/article-change-requests/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) { setMessage("修改申请审核失败"); return; }
    await loadReview();
    notifyAdminAuditCountsRefresh();
  }

  async function saveEditAndApproveChange() {
    if (!editingChangeId) return;
    const targetChangeId = editingChangeId;
    await saveEdit("approved");
    await reviewChange(targetChangeId, "approved");
    setEditingChangeId(null);
    setMessage("已调整内容并通过该修改申请。");
  }

  function autoFillPublishTags() {
    const tags = suggestTagsForGeo({
      title,
      excerpt,
      content: getPublishSourceText(),
      categoryHref: selectedCategory.href,
      subHref,
    });
    setTagSlugs(tags.join(","));
    suppressMessageScrollRef.current = true;
    setMessage(tags.length > 0 ? `已按标题、摘要、正文和栏目语义提取 ${tags.length} 个栏目标签。` : "未识别到明显栏目标签，请手动补充。");
  }

  function autoFillEditTags() {
    const tags = suggestTagsForGeo({
      title: editTitle,
      excerpt: editExcerpt,
      content: getEditSourceText(),
      categoryHref: selectedCategory.href,
      subHref,
    });
    setEditTagSlugs(tags.join(","));
    suppressMessageScrollRef.current = true;
    setMessage(tags.length > 0 ? `已按标题、摘要、正文和栏目语义提取 ${tags.length} 个栏目标签。` : "未识别到明显栏目标签，请手动补充。");
  }

  async function generatePublishManualKeywords() {
    const res = await fetch("/api/admin/articles/keyword-preview", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content: getPublishSourceText(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      suppressMessageScrollRef.current = true;
      setMessage(data.error ?? "关键词生成失败");
      return;
    }

    setManualKeywords(typeof data.keywordCsv === "string" ? data.keywordCsv : "");
    suppressMessageScrollRef.current = true;
    setMessage("已按新规则生成关键词，可直接用于前台展示、聚合与推荐。");
  }

  async function generateEditManualKeywords() {
    const res = await fetch("/api/admin/articles/keyword-preview", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        content: getEditSourceText(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      suppressMessageScrollRef.current = true;
      setMessage(data.error ?? "关键词生成失败");
      return;
    }

    setEditManualKeywords(typeof data.keywordCsv === "string" ? data.keywordCsv : "");
    suppressMessageScrollRef.current = true;
    setMessage("已按新规则生成关键词，可直接用于前台展示、聚合与推荐。");
  }

  function applyManageSearch(event?: FormEvent) {
    event?.preventDefault();
    const next = manageSearchDraft.trim();
    const nextParams = new URLSearchParams(searchParams.toString());
    if (next) nextParams.set("q", next);
    else nextParams.delete("q");
    if (manageSourceTypeDraft !== "all") nextParams.set("sourceType", manageSourceTypeDraft);
    else nextParams.delete("sourceType");
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }

  function clearManageSearch() {
    setManageSearchDraft("");
    setManageSourceTypeDraft("all");
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("q");
    nextParams.delete("sourceType");
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }

  if (loading) return <p className="text-muted">加载中...</p>;
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) return <p className="text-muted">需要管理员权限。</p>;

  return (
    <div className="max-w-6xl space-y-6">
      <InlinePageBackLink href="/membership/admin" label="返回后台首页" />
      <header className="rounded-xl border border-border bg-surface-elevated p-5">
        <h1 className="font-serif text-2xl font-bold text-primary">{mode === "publish" ? "内容发布" : mode === "manage" ? "内容管理" : "审核中心"} · {selectedTabDef.label}</h1>
        {mode === "publish" && publishTabHint ? <p className="mt-2 text-sm text-muted">{publishTabHint}</p> : null}
        {message && (
          <div ref={messageRef} className="mt-2 scroll-mt-24 space-y-1">
            <p className="text-sm text-accent">{message}</p>
            {lastSubmitted && (
              <div className="text-xs text-muted">
                {lastSubmitted.status === "approved" && lastSubmitted.href ? (
                  <>
                    点击标题预览：
                    <a href={lastSubmitted.href} target="_blank" rel="noreferrer" className="ml-1 text-accent hover:underline">
                      {lastSubmitted.title}
                    </a>
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
      </header>

      {mode === "publish" && (
        <section className="rounded-xl border border-border bg-surface-elevated p-5">
          <form onSubmit={submitPublish} className="space-y-3">
            {subOptions.length > 0 && (
              <>
                <label className="block text-sm text-muted">子栏目</label>
                <div className="flex flex-wrap gap-2">{subOptions.map((s) => <button key={s.href} type="button" onClick={() => setSubHref(s.href)} className={`px-3 py-1 rounded border ${subHref === s.href ? "bg-accent text-white border-accent" : "border-border"}`}>{s.label}</button>)}</div>
              </>
            )}
            {tab === "brands" && (
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
            <label className="block text-sm text-muted">标题</label><input className="w-full border border-border rounded px-3 py-2 bg-surface" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                <label className="mb-2 block text-sm font-medium text-primary">作者</label>
                <input
                  className="w-full border-0 bg-transparent px-0 py-0 text-[15px] text-primary placeholder:text-muted focus:outline-none"
                  value={displayAuthor}
                  onChange={(e) => setDisplayAuthor(e.target.value)}
                  placeholder="如：编辑部 / 张三"
                />
              </div>
              <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                <label className="mb-2 block text-sm font-medium text-primary">来源</label>
                <input
                  className="w-full border-0 bg-transparent px-0 py-0 text-[15px] text-primary placeholder:text-muted focus:outline-none"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="如：整木网 / 品牌官方"
                />
              </div>
              <div className="rounded-2xl border border-border bg-surface px-4 py-3 md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-primary">原文链接</label>
                <input
                  className="w-full border-0 bg-transparent px-0 py-0 text-[15px] text-primary placeholder:text-muted focus:outline-none"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="如：https://example.com/article"
                  inputMode="url"
                />
              </div>
              <div className={`rounded-2xl border px-4 py-3 transition md:min-w-[168px] ${isPinned ? "border-[rgba(180,154,107,0.54)] bg-[linear-gradient(180deg,rgba(202,174,121,0.2),rgba(180,154,107,0.14))] shadow-[0_18px_34px_-24px_rgba(180,154,107,0.6)]" : "border-border bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(248,243,236,0.94))] shadow-[0_14px_28px_-24px_rgba(15,23,42,0.16)]"}`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-primary">置顶</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPinned((value) => !value)}
                    className={`inline-flex min-w-[86px] items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      isPinned
                        ? "border-[rgba(180,154,107,0.6)] bg-[#b49a6b] text-white shadow-[0_10px_24px_-18px_rgba(180,154,107,0.8)]"
                        : "border-border bg-white/90 text-primary hover:border-[rgba(180,154,107,0.45)] hover:bg-white"
                    }`}
                  >
                    {isPinned ? "已置顶" : "设为置顶"}
                  </button>
                </div>
              </div>
            </div>
            {supportsOwnedEnterprise && (
              <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-primary">归属企业</label>
                    <p className="text-xs text-muted">管理员代发时可指定企业，发布后会自动汇总到对应企业页的企业动态。</p>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-border bg-white/90">
                  <input
                    className="w-full rounded-xl border-0 bg-transparent px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[rgba(180,154,107,0.18)]"
                    value={ownedEnterpriseSearch}
                    onChange={(e) => {
                      setOwnedEnterpriseSearch(e.target.value);
                      setOwnedEnterpriseOpen(true);
                    }}
                    onFocus={() => setOwnedEnterpriseOpen(true)}
                    placeholder={selectedOwnedEnterprise ? enterpriseOptionLabel(selectedOwnedEnterprise) : `搜索企业名称，共 ${enterpriseOptions.length} 家`}
                  />
                  {ownedEnterpriseOpen ? (
                    <div className="border-t border-border px-2 py-2">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setOwnedEnterpriseId("");
                          setOwnedEnterpriseSearch("");
                          setOwnedEnterpriseOpen(false);
                        }}
                        className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm text-primary transition hover:bg-surface"
                      >
                        不指定归属企业
                      </button>
                      <div className="mt-1 max-h-56 overflow-y-auto">
                        {filteredEnterpriseOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setOwnedEnterpriseId(option.id);
                              setOwnedEnterpriseSearch(enterpriseOptionLabel(option));
                              setOwnedEnterpriseOpen(false);
                            }}
                            className={`flex w-full items-center rounded-lg px-2 py-2 text-left text-sm transition hover:bg-surface ${
                              ownedEnterpriseId === option.id ? "bg-[rgba(180,154,107,0.12)] text-primary" : "text-primary"
                            }`}
                          >
                            {enterpriseOptionLabel(option)}
                          </button>
                        ))}
                        {ownedEnterpriseSearch.trim() && filteredEnterpriseOptions.length === 0 ? (
                          <p className="px-2 py-2 text-xs text-muted">没有找到匹配企业，请换个关键词试试。</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
            {(tab === "terms" || tab === "standards") && (
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
              <label className="block text-sm text-muted">{tab === "standards" ? "标准摘要" : "摘要"}</label>
              <button type="button" onClick={autoFillPublishExcerpt} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface">自动生成摘要</button>
            </div>
            <textarea className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[80px] whitespace-pre-wrap resize-y" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
            {(tab === "terms" || tab === "standards") && (
              <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
                <p className="text-sm font-medium text-primary">文档信息</p>
                <textarea
                  className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[88px]"
                  value={documentMeta.intro}
                  onChange={(e) => setDocumentMeta((prev) => ({ ...prev, intro: e.target.value }))}
                  placeholder={tab === "terms" ? "词条简介，用一段话说明术语定义与适用语境。" : "标准简介，用一段话说明标准适用范围和核心价值。"}
                />
                {tab === "standards" && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={documentMeta.standardCode} onChange={(e) => setDocumentMeta((prev) => ({ ...prev, standardCode: e.target.value }))} placeholder="标准编号" />
                    <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={documentMeta.versions[0]?.version ?? ""} onChange={(e) => setDocumentMeta((prev) => ({ ...prev, versions: [{ version: e.target.value, updatedAt: prev.versions[0]?.updatedAt, note: prev.versions[0]?.note }, ...prev.versions.slice(1)] }))} placeholder="当前版本，如 V1.0" />
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
                {tab === "standards" && (
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
            {tab !== "brands" && (
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
                      void uploadPublishCover(e.target.files?.[0] ?? null);
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
                {tab === "terms" && <p className="text-xs text-muted">最佳尺寸：1600 x 900 px，建议使用横版 16:9 图片。</p>}
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
            {tab === "standards" && (
              <>
                <label className="block text-sm text-muted">标准正文</label>
                <RichEditor
                  value={content}
                  onChange={setContent}
                  onImportedTitle={handleImportedPublishTitle}
                  minHeight={360}
                  placeholder="支持标题分级、表格、图片和条款结构的标准正文编辑。"
                  allowClipboardImagePaste
                  statusResetKey={`admin-publish-standards:${tab}:${publishEditorStatusVersion}`}
                />
              </>
            )}
            {tab === "articles" && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm text-muted">前台关键词（可手填，也可自动生成，最多 5 个）</label>
                  <button type="button" onClick={() => void generatePublishManualKeywords()} className="px-3 py-1.5 rounded border border-border text-xs hover:bg-surface">自动生成</button>
                </div>
                <input
                  className="w-full rounded border border-border bg-surface px-3 py-2"
                  value={manualKeywords}
                  onChange={(e) => setManualKeywords(e.target.value)}
                  placeholder="如：图森,整木定制,乌镇国际设计周"
                />
                <p className="text-xs text-muted">可直接手动填写；如果不想手填，点击右侧“自动生成”。保存后这里的关键词会优先用于前台展示、关键词页和相关阅读。</p>
                <label className="block text-sm text-muted">相关产品推荐 JSON（可选，最多 3 个）</label>
                <textarea
                  className="w-full rounded border border-border bg-surface px-3 py-2 min-h-[110px] font-mono text-xs"
                  value={productRecommendations}
                  onChange={(e) => setProductRecommendations(e.target.value)}
                  placeholder={'[{"title":"WOCA 木作清洁养护产品","url":"/product/981746066","sellingPoint":"进口护理方向"},{"title":"整木优选护理频道","url":"https://csj.cnzhengmu.com/h5/index.html?id=1#/category/care"}]'}
                />
              </>
            )}
            {isRichTextArticleTab(tab) && (
              <>
                <label className="block text-sm text-muted">正文</label>
                <RichEditor value={content} onChange={setContent} onImportedTitle={handleImportedPublishTitle} minHeight={300} placeholder="" allowClipboardImagePaste toolbarIcons statusResetKey={`admin-publish:${tab}:${publishEditorStatusVersion}`} />
              </>
            )}
            {tab === "brands" && (
              <>
                <label className="block text-sm text-muted">品牌结构化内容</label>
                <BrandStructuredEditor value={brandStructured} onChange={setBrandStructured} />
              </>
            )}
            {tab === "industry-data" && (
              <>
                <label className="block text-sm text-muted">数据结构化内容</label>
                <DataStructuredEditor value={dataStructured} onChange={setDataStructured} />
              </>
            )}
            {tab === "awards" && (
              <>
                <label className="block text-sm text-muted">评选结构化内容</label>
                <AwardStructuredEditor value={awardStructured} onChange={setAwardStructured} />
              </>
            )}
            <button className="px-4 py-2 rounded bg-accent text-white text-sm">提交</button>
          </form>
        </section>
      )}

      {mode === "manage" && (
        <section className="space-y-4">
          <form
            onSubmit={applyManageSearch}
            className="flex flex-col gap-3 rounded-[22px] border border-border bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(248,243,236,0.94))] p-4 shadow-[0_12px_28px_-22px_rgba(15,23,42,0.18)] md:flex-row md:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary">搜索内容</p>
              <p className="mt-1 text-xs text-muted">可按标题、摘要、正文、来源、作者、标签、前台关键词、提交账号、归属企业或品牌名快速查找内容。</p>
            </div>
            <div className="flex min-w-0 flex-1 gap-2">
              <select
                className="h-11 rounded-2xl border border-[rgba(194,182,154,0.28)] bg-white/90 px-4 text-sm text-primary focus:border-[rgba(180,154,107,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(180,154,107,0.18)]"
                value={manageSourceTypeDraft}
                onChange={(e) => setManageSourceTypeDraft(parseManageSourceFilter(e.target.value))}
              >
                <option value="all">全部来源</option>
                <option value="manual">人工发布</option>
                <option value="ai_generated">AI生成</option>
                <option value="imported">采集导入</option>
              </select>
              <input
                className="h-11 min-w-0 flex-1 rounded-2xl border border-[rgba(194,182,154,0.28)] bg-white/90 px-4 text-sm text-primary placeholder:text-muted focus:border-[rgba(180,154,107,0.45)] focus:outline-none focus:ring-2 focus:ring-[rgba(180,154,107,0.18)]"
                value={manageSearchDraft}
                onChange={(e) => setManageSearchDraft(e.target.value)}
                placeholder="输入标题、来源、作者、标签、关键词、账号、企业或品牌"
              />
              <button type="submit" className="rounded-2xl bg-accent px-4 py-2 text-sm font-medium text-white">
                搜索
              </button>
              {(searchQuery || manageSearchDraft || sourceTypeFilter !== "all" || manageSourceTypeDraft !== "all") && (
                <button type="button" onClick={clearManageSearch} className="rounded-2xl border border-border px-4 py-2 text-sm text-primary hover:bg-surface">
                  清除
                </button>
              )}
            </div>
          </form>

          <ManageContentList
            items={manageItems}
            canEdit={canEdit}
            canDelete={canDelete}
            onEdit={openEdit}
            onDelete={(id) => void removeItem(id)}
            highlightedItemId={highlightedItemId}
          />
        </section>
      )}

      {mode === "review" && (
        <ReviewPanels
          tab={tab}
          pendingItems={pendingItems}
          pendingChanges={pendingChanges}
          parseStandardStructuredHtml={parseStandardStructuredHtml}
          onEditArticle={openEdit}
          onReviewArticle={(id, status) => void reviewArticle(id, status)}
          onEditChange={openEditFromChange}
          onReviewChange={(id, status) => void reviewChange(id, status)}
        />
      )}

      {editingId && (
        <section ref={editFormRef} className="rounded-xl border border-border bg-surface-elevated p-5">
          <h2 className="text-sm font-semibold mb-3">编辑内容</h2>
          <form onSubmit={(e) => { e.preventDefault(); void saveEdit(); }} className="space-y-3">
            <label className="block text-sm text-muted">标题</label><input className="w-full border border-border rounded px-3 py-2 bg-surface" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                <label className="mb-2 block text-sm font-medium text-primary">作者</label>
                <input
                  className="w-full border-0 bg-transparent px-0 py-0 text-[15px] text-primary placeholder:text-muted focus:outline-none"
                  value={editDisplayAuthor}
                  onChange={(e) => setEditDisplayAuthor(e.target.value)}
                  placeholder="如：编辑部 / 张三"
                />
              </div>
              <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                <label className="mb-2 block text-sm font-medium text-primary">来源</label>
                <input
                  className="w-full border-0 bg-transparent px-0 py-0 text-[15px] text-primary placeholder:text-muted focus:outline-none"
                  value={editSource}
                  onChange={(e) => setEditSource(e.target.value)}
                  placeholder="如：整木网 / 品牌官方"
                />
              </div>
              <div className="rounded-2xl border border-border bg-surface px-4 py-3 md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-primary">原文链接</label>
                <input
                  className="w-full border-0 bg-transparent px-0 py-0 text-[15px] text-primary placeholder:text-muted focus:outline-none"
                  value={editSourceUrl}
                  onChange={(e) => setEditSourceUrl(e.target.value)}
                  placeholder="如：https://example.com/article"
                  inputMode="url"
                />
              </div>
              <div className={`rounded-2xl border px-4 py-3 transition md:min-w-[168px] ${editIsPinned ? "border-[rgba(180,154,107,0.54)] bg-[linear-gradient(180deg,rgba(202,174,121,0.2),rgba(180,154,107,0.14))] shadow-[0_18px_34px_-24px_rgba(180,154,107,0.6)]" : "border-border bg-[linear-gradient(180deg,rgba(255,253,249,0.98),rgba(248,243,236,0.94))] shadow-[0_14px_28px_-24px_rgba(15,23,42,0.16)]"}`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-primary">置顶</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditIsPinned((value) => !value)}
                    className={`inline-flex min-w-[86px] items-center justify-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      editIsPinned
                        ? "border-[rgba(180,154,107,0.6)] bg-[#b49a6b] text-white shadow-[0_10px_24px_-18px_rgba(180,154,107,0.8)]"
                        : "border-border bg-white/90 text-primary hover:border-[rgba(180,154,107,0.45)] hover:bg-white"
                    }`}
                  >
                    {editIsPinned ? "已置顶" : "设为置顶"}
                  </button>
                </div>
              </div>
            </div>
            {supportsOwnedEnterprise && (
              <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-primary">归属企业</label>
                    <p className="text-xs text-muted">变更后，企业页会按这里的归属关系自动汇总这篇文章。</p>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-border bg-white/90">
                  <input
                    className="w-full rounded-xl border-0 bg-transparent px-3 py-2 text-sm text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[rgba(180,154,107,0.18)]"
                    value={editOwnedEnterpriseSearch}
                    onChange={(e) => {
                      setEditOwnedEnterpriseSearch(e.target.value);
                      setEditOwnedEnterpriseOpen(true);
                    }}
                    onFocus={() => setEditOwnedEnterpriseOpen(true)}
                    placeholder={selectedEditOwnedEnterprise ? enterpriseOptionLabel(selectedEditOwnedEnterprise) : `搜索企业名称，共 ${enterpriseOptions.length} 家`}
                  />
                  {editOwnedEnterpriseOpen ? (
                    <div className="border-t border-border px-2 py-2">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setEditOwnedEnterpriseId("");
                          setEditOwnedEnterpriseSearch("");
                          setEditOwnedEnterpriseOpen(false);
                        }}
                        className="flex w-full items-center rounded-lg px-2 py-2 text-left text-sm text-primary transition hover:bg-surface"
                      >
                        不指定归属企业
                      </button>
                      <div className="mt-1 max-h-56 overflow-y-auto">
                        {filteredEditEnterpriseOptions.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setEditOwnedEnterpriseId(option.id);
                              setEditOwnedEnterpriseSearch(enterpriseOptionLabel(option));
                              setEditOwnedEnterpriseOpen(false);
                            }}
                            className={`flex w-full items-center rounded-lg px-2 py-2 text-left text-sm transition hover:bg-surface ${
                              editOwnedEnterpriseId === option.id ? "bg-[rgba(180,154,107,0.12)] text-primary" : "text-primary"
                            }`}
                          >
                            {enterpriseOptionLabel(option)}
                          </button>
                        ))}
                        {editOwnedEnterpriseSearch.trim() && filteredEditEnterpriseOptions.length === 0 ? (
                          <p className="px-2 py-2 text-xs text-muted">没有找到匹配企业，请换个关键词试试。</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
            {(tab === "terms" || tab === "standards") && (
              <>
                <label className="block text-sm text-muted">文档 Slug</label>
                <input
                  className="w-full border border-border rounded px-3 py-2 bg-surface"
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value)}
                  placeholder="留空则保持当前 slug"
                />
              </>
            )}
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm text-muted">{tab === "standards" ? "标准摘要" : "摘要"}</label>
              <button type="button" onClick={autoFillEditExcerpt} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-surface">自动生成摘要</button>
            </div>
            <textarea className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[80px] whitespace-pre-wrap resize-y" value={editExcerpt} onChange={(e) => setEditExcerpt(e.target.value)} />
            {(tab === "terms" || tab === "standards") && (
              <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
                <p className="text-sm font-medium text-primary">文档信息</p>
                <textarea
                  className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[88px]"
                  value={editDocumentMeta.intro}
                  onChange={(e) => setEditDocumentMeta((prev) => ({ ...prev, intro: e.target.value }))}
                  placeholder={tab === "terms" ? "词条简介，用一段话说明术语定义与适用语境。" : "标准简介，用一段话说明标准适用范围和核心价值。"}
                />
                {tab === "standards" && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={editDocumentMeta.standardCode} onChange={(e) => setEditDocumentMeta((prev) => ({ ...prev, standardCode: e.target.value }))} placeholder="标准编号" />
                    <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={editDocumentMeta.scope} onChange={(e) => setEditDocumentMeta((prev) => ({ ...prev, scope: e.target.value }))} placeholder="适用范围" />
                    <textarea className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[84px]" value={editDocumentMeta.materialRequirements} onChange={(e) => setEditDocumentMeta((prev) => ({ ...prev, materialRequirements: e.target.value }))} placeholder="材料要求" />
                    <textarea className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[84px]" value={editDocumentMeta.processRequirements} onChange={(e) => setEditDocumentMeta((prev) => ({ ...prev, processRequirements: e.target.value }))} placeholder="工艺要求" />
                    <textarea className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[84px]" value={editDocumentMeta.executionFlow} onChange={(e) => setEditDocumentMeta((prev) => ({ ...prev, executionFlow: e.target.value }))} placeholder="执行流程" />
                    <textarea className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[84px]" value={editDocumentMeta.acceptanceCriteria} onChange={(e) => setEditDocumentMeta((prev) => ({ ...prev, acceptanceCriteria: e.target.value }))} placeholder="验收标准" />
                  </div>
                )}
                <p className="text-xs text-muted">填写简介和正文内容后，系统会自动生成 SEO；手动修改后将不再自动覆盖。</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={editDocumentMeta.seoTitle} onChange={(e) => setEditDocumentMeta((prev) => ({ ...prev, seoTitle: e.target.value }))} placeholder="SEO 标题" />
                  <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={editDocumentMeta.seoKeywords} onChange={(e) => setEditDocumentMeta((prev) => ({ ...prev, seoKeywords: e.target.value }))} placeholder="SEO 关键词，逗号分隔" />
                  <input className="w-full border border-border rounded px-3 py-2 bg-surface" value={editDocumentMeta.seoDescription} onChange={(e) => setEditDocumentMeta((prev) => ({ ...prev, seoDescription: e.target.value }))} placeholder="SEO 描述" />
                </div>
                {tab === "standards" && (
                  <>
                    <label className="block text-sm text-muted">参与单位（每行一个，格式：企业名称|参与时间）</label>
                    <textarea
                      className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[88px]"
                      value={editDocumentMeta.contributors.map((item) => `${item.name}${item.joinedAt ? `|${item.joinedAt}` : ""}`).join("\n")}
                      onChange={(e) =>
                        setEditDocumentMeta((prev) => ({
                          ...prev,
                          contributors: e.target.value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
                            const [name, joinedAt] = line.split("|").map((part) => part.trim());
                            return { name, joinedAt };
                          }),
                        }))
                      }
                    />
                    <label className="block text-sm text-muted">版本记录（每行一个，格式：版本|更新时间|修改说明）</label>
                    <textarea
                      className="w-full border border-border rounded px-3 py-2 bg-surface min-h-[110px]"
                      value={editDocumentMeta.versions.map((item) => [item.version, item.updatedAt, item.note].filter(Boolean).join("|")).join("\n")}
                      onChange={(e) =>
                        setEditDocumentMeta((prev) => ({
                          ...prev,
                          versions: e.target.value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
                            const [version, updatedAt, note] = line.split("|").map((part) => part.trim());
                            return { version: version || "未命名版本", updatedAt, note };
                          }),
                        }))
                      }
                    />
                  </>
                )}
              </div>
            )}
            {tab === "articles" && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm text-muted">前台关键词（可手填，也可自动生成）</label>
                  <button type="button" onClick={() => void generateEditManualKeywords()} className="px-3 py-1.5 rounded border border-border text-xs hover:bg-surface">自动生成</button>
                </div>
                <input
                  className="w-full rounded border border-border bg-surface px-3 py-2"
                  value={editManualKeywords}
                  onChange={(e) => setEditManualKeywords(e.target.value)}
                  placeholder="如：图森,整木定制,乌镇国际设计周"
                />
                <p className="text-xs text-muted">可直接手动调整；如果想重算，点击右侧“自动生成”。保存后这里的关键词会优先覆盖系统抽取结果，并用于前台展示与相关推荐。</p>
                <label className="block text-sm text-muted">相关产品推荐 JSON（可选，最多 3 个）</label>
                <textarea
                  className="w-full rounded border border-border bg-surface px-3 py-2 min-h-[110px] font-mono text-xs"
                  value={editProductRecommendations}
                  onChange={(e) => setEditProductRecommendations(e.target.value)}
                  placeholder={'[{"title":"WOCA 木作清洁养护产品","url":"/product/981746066","sellingPoint":"进口护理方向"}]'}
                />
                <p className="text-xs text-muted">保存后会在资讯详情页底部展示“相关产品推荐”；留空则不展示。</p>
              </>
            )}
            {tab !== "brands" && (
              <>
                <label className="block text-sm text-muted">顶部配图（可选）</label>
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
                      void uploadEditCover(e.target.files?.[0] ?? null);
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
                {tab === "terms" && <p className="text-xs text-muted">最佳尺寸：1600 x 900 px，建议使用横版 16:9 图片。</p>}
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
            {subOptions.length > 0 && (
              <>
                <label className="block text-sm text-muted">子栏目</label>
                <div className="flex flex-wrap gap-2">
                  {subOptions.map((s) => (
                    <button
                      key={s.href}
                      type="button"
                      onClick={() => setEditSubHref(s.href)}
                      className={`px-3 py-1 rounded border ${editSubHref === s.href ? "bg-accent text-white border-accent" : "border-border"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {tab === "standards" ? (
              <>
                <label className="block text-sm text-muted">标准正文</label>
                <RichEditor
                  value={editContent}
                  onChange={setEditContent}
                  onImportedTitle={handleImportedEditTitle}
                  minHeight={360}
                  placeholder="支持标题分级、表格、图片和条款结构的标准正文编辑。"
                  allowClipboardImagePaste
                  toolbarIcons
                  statusResetKey={`admin-edit-standards:${tab}:${editingId ?? "none"}:${editEditorStatusVersion}`}
                />
              </>
            ) : tab === "brands" ? (
              <>
                <label className="block text-sm text-muted">区域选择</label>
                <select
                  className="w-full border border-border rounded px-3 py-2 bg-surface"
                  value={editBrandStructured.serviceAreas || "全国"}
                  onChange={(e) => setEditBrandStructured((prev) => ({ ...prev, serviceAreas: e.target.value }))}
                >
                  {BRAND_REGION_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <label className="block text-sm text-muted">品牌结构化内容</label>
                <BrandStructuredEditor value={editBrandStructured} onChange={setEditBrandStructured} />
              </>
            ) : tab === "industry-data" ? (
              <>
                <label className="block text-sm text-muted">数据结构化内容</label>
                <DataStructuredEditor value={editDataStructured} onChange={setEditDataStructured} />
              </>
            ) : tab === "awards" ? (
              <>
                <label className="block text-sm text-muted">评选结构化内容</label>
                <AwardStructuredEditor value={editAwardStructured} onChange={setEditAwardStructured} />
              </>
            ) : (
              <>
                <label className="block text-sm text-muted">正文</label>
                <RichEditor value={editContent} onChange={setEditContent} onImportedTitle={handleImportedEditTitle} minHeight={320} placeholder="" allowClipboardImagePaste toolbarIcons statusResetKey={`admin-edit:${tab}:${editingId ?? "none"}:${editEditorStatusVersion}`} />
              </>
            )}
            <div className="flex gap-2 flex-wrap">
              <button type="submit" className="px-4 py-2 rounded bg-accent text-white text-sm">仅保存修改</button>
              <button type="button" onClick={() => void saveEdit("approved")} className="px-4 py-2 rounded bg-green-600 text-white text-sm">保存并通过</button>
              {editingChangeId && (
                <button type="button" onClick={() => void saveEditAndApproveChange()} className="px-4 py-2 rounded bg-emerald-700 text-white text-sm">
                  保存并通过该修改申请
                </button>
              )}
              <button type="button" onClick={() => void saveEdit("rejected")} className="px-4 py-2 rounded bg-red-600 text-white text-sm">保存并驳回</button>
              <button type="button" onClick={() => { setEditingId(null); setEditingChangeId(null); setEditOwnedEnterpriseId(""); setReviewAction(null); }} className="px-4 py-2 rounded border border-border text-sm">取消</button>
            </div>
            {reviewAction && <p className="text-xs text-muted">处理中：{STATUS_TEXT[reviewAction]}</p>}
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
