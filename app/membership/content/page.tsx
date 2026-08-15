"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MAX_UPLOAD_IMAGE_MB, uploadImageToServer } from "@/lib/client-image";
import { generateMemberSiteSeo, normalizeMemberSiteSeo, type MemberSiteSeoSource } from "@/lib/member-site-seo";
import { PUBLIC_CONTACT_PHONE } from "@/lib/public-site-config";
import { resolveUploadedImageUrl } from "@/lib/uploaded-image";

type DashboardData = {
  member: {
    type: string;
    label: string;
    phone?: string | null;
    rankingWeight: number;
    canManageMembers: boolean;
  };
  authorization: {
    year: number;
    publishingCategories: Array<{
      href: string;
      label: string;
      enabled: boolean;
      annualLimit: number | null;
      remainingCount: number | null;
      subcategories: Array<{
        href: string;
        label: string;
        enabled: boolean;
        annualLimit: number | null;
        remainingCount: number | null;
      }>;
    }>;
    news: { enabled: boolean; annualLimit: number | null; usedCount: number; remainingCount: number | null };
    gallery: { enabled: boolean; annualLimit: number | null; usedCount: number; remainingCount: number | null };
    standardFeedback: { enabled: boolean; usedCount: number };
    recommendation: { enabled: boolean; annualLimit: number; usedCount: number; remainingCount: number };
  };
  quotas: {
    newsPublishLimit: number | null;
    galleryUploadLimit: number | null;
    monthlyRecommendationLimit: number;
  };
  features: {
    supportsEnterpriseProfile: boolean;
    supportsEnterpriseSite: boolean;
    supportsDictionaryContribution: boolean;
    supportsStandardCoBuild: boolean;
    supportsSubAccounts: boolean;
    supportsSeoSettings: boolean;
    canRecommendContent: boolean;
    canUploadGallery: boolean;
    canSubmitStandardFeedback: boolean;
  };
  stats: {
    articles: { total: number; pending: number; approved: number; rejected: number };
    gallery: { total: number; pending: number; approved: number; rejected: number };
    standardFeedback: { total: number; pending: number; approved: number; rejected: number };
  };
  latestVerification: {
    status: string;
    companyName: string;
    reviewNote?: string | null;
    updatedAt: string;
  } | null;
  effectiveVerification: {
    status: string;
    label: string;
    source: string;
    isLegacyEnterpriseMember: boolean;
    shouldUpgradeMemberType: boolean;
    companyName?: string | null;
    updatedAt?: string | null;
    reviewNote?: string | null;
  };
  enterprise: {
    id: string;
    companyName?: string | null;
    companyShortName?: string | null;
    verificationStatus?: string | null;
  } | null;
  siteSettingsSummary: {
    heroTitle: string;
    syncEnabled: boolean;
    enabledModules: number;
  } | null;
};

type EnterpriseProfileSummary = {
  intro?: string | null;
  positioning?: string | null;
  logoUrl?: string | null;
} | null;

type SiteSettings = {
  template: "brand_showcase" | "professional_service" | "simple_elegant";
  heroTitle: string;
  heroSubtitle: string;
  contactLabel: string;
  homepageTagline: string;
  homepageTags: string[];
  heroImageUrl: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
  secondaryCtaType: "anchor" | "external";
  secondaryCtaTarget: string;
  capabilityCards: Array<{
    title: string;
    description: string;
    iconKey: string;
  }>;
  contact: {
    contactPerson: string;
    contactPhone: string;
    wechatId: string;
    wechatQrImageUrl: string;
    websiteUrl: string;
    city: string;
    address: string;
    contactFormUrl: string;
    contactIntro: string;
  };
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
    imageUrl: string;
  };
  sync: {
    websiteUrl: string;
    apiEndpoint: string;
    rssUrl: string;
    syncEnabled: boolean;
  };
};

type RecoveryResponse = {
  account?: string;
  recoveryEmail?: string;
  phone?: string;
  error?: string;
};

type SubmissionStatus = "draft" | "pending" | "approved" | "rejected";

type GalleryItem = {
  id: string;
  title: string | null;
  imageUrl: string;
  alt: string | null;
  category: string | null;
  status: "draft" | "pending" | "approved" | "rejected";
  createdAt: string;
};

type GalleryFormState = {
  title: string;
  alt: string;
  category: string;
  tagSlugs: string;
  imageUrl: string;
  syncToMainSite: boolean;
};

const EMPTY_SETTINGS: SiteSettings = {
  template: "brand_showcase",
  heroTitle: "",
  heroSubtitle: "",
  contactLabel: "立即咨询",
  homepageTagline: "",
  homepageTags: [],
  heroImageUrl: "",
  primaryCtaLabel: "立即咨询",
  secondaryCtaLabel: "查看案例",
  secondaryCtaType: "anchor",
  secondaryCtaTarget: "#gallery-section",
  capabilityCards: [],
  contact: {
    contactPerson: "",
    contactPhone: "",
    wechatId: "",
    wechatQrImageUrl: "",
    websiteUrl: "",
    city: "",
    address: "",
    contactFormUrl: "",
    contactIntro: "",
  },
  modules: {
    intro: true,
    advantages: true,
    tags: true,
    news: true,
    gallery: true,
    contact: true,
    standards: false,
    terms: false,
    video: false,
  },
  seo: {
    title: "",
    keywords: "",
    description: "",
    imageUrl: "",
  },
  sync: {
    websiteUrl: "",
    apiEndpoint: "",
    rssUrl: "",
    syncEnabled: false,
  },
};

const PRIMARY_ACTIONS = [
  { href: "/membership/content/publish?tab=articles", label: "发布资讯", desc: "按当前会员权限发布内容" },
  { href: "/membership/content/gallery", label: "管理图库", desc: "上传案例图、工艺图和空间图" },
  { href: "/membership/content/submissions", label: "内容记录", desc: "查看草稿、待审核、已通过和已退回内容" },
  { href: "/membership/profile", label: "企业资料", desc: "维护关于品牌、品牌定位和 Logo" },
  { href: "/membership/content/verification", label: "企业认证", desc: "查看认证状态、补充资料并跟进审核进度" },
  { href: "/membership/content/status", label: "审核记录", desc: "查看全部待审核、已通过和退回内容" },
];

const SUBMISSION_STATUS_TEXT: Record<SubmissionStatus, string> = {
  draft: "草稿",
  pending: "待审核",
  approved: "已通过",
  rejected: "已退回",
};

const SUBMISSION_STATUS_TONE: Record<SubmissionStatus, string> = {
  draft: "border-border bg-surface text-muted",
  pending: "border-[rgba(180,154,107,0.28)] bg-[rgba(255,248,236,0.9)] text-accent",
  approved: "border-[rgba(112,164,132,0.28)] bg-[rgba(240,249,243,0.92)] text-[#3f6d52]",
  rejected: "border-[rgba(190,122,101,0.28)] bg-[rgba(255,243,239,0.92)] text-[#9b5a45]",
};

const GALLERY_CATEGORY_LABEL_MAP: Record<string, string> = {
  style: "风格",
  space: "空间",
  craft: "工艺",
  product: "品类",
  enterprise: "企业案例",
};

const EMPTY_GALLERY_FORM: GalleryFormState = {
  title: "",
  alt: "",
  category: "",
  tagSlugs: "",
  imageUrl: "",
  syncToMainSite: false,
};

function normalizeSettings(settings: SiteSettings): SiteSettings {
  const normalizedBase = {
    ...settings,
    template: "brand_showcase" as const,
    contactLabel: settings.primaryCtaLabel || "立即咨询",
    homepageTags: settings.homepageTags.filter(Boolean).slice(0, 1),
    modules: {
      ...settings.modules,
      intro: true,
      advantages: true,
      tags: true,
      news: true,
      gallery: true,
      contact: true,
      standards: false,
      terms: false,
      video: false,
    },
  };

  return {
    ...normalizedBase,
    seo: {
      ...normalizedBase.seo,
      ...normalizeMemberSiteSeo(normalizedBase.seo, buildMemberSiteSeoSource(normalizedBase)),
    },
  };
}

function buildMemberSiteSeoSource(
  settings: SiteSettings,
  enterprise?: DashboardData["enterprise"],
  enterpriseProfileSummary?: EnterpriseProfileSummary,
): MemberSiteSeoSource {
  return {
    companyName: enterprise?.companyName,
    companyShortName: enterprise?.companyShortName,
    heroTitle: settings.heroTitle,
    heroSubtitle: settings.heroSubtitle,
    homepageTagline: settings.homepageTagline || settings.homepageTags[0] || "",
    intro: enterpriseProfileSummary?.intro,
    positioning: enterpriseProfileSummary?.positioning,
    productSystem: settings.homepageTags[0] || "",
    city: settings.contact.city,
    contactIntro: settings.contact.contactIntro,
  };
}

function verificationText(status: string | null | undefined) {
  if (status === "approved") return "已通过";
  if (status === "rejected") return "未通过";
  if (status === "pending") return "待审核";
  return "未提交";
}

function formatRecordDate(value: string | null | undefined) {
  const text = (value || "").trim();
  if (!text) return "-";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function hasMeaningfulContent(value: string | null | undefined) {
  const normalized = (value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, "")
    .trim();
  return normalized.length > 0;
}

function getGalleryCategoryLabel(value: string | null | undefined) {
  if (!value) return "未分类";
  return GALLERY_CATEGORY_LABEL_MAP[value] ?? "未分类";
}

export default function MemberContentPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryForm, setGalleryForm] = useState<GalleryFormState>(EMPTY_GALLERY_FORM);
  const [galleryMessage, setGalleryMessage] = useState("");
  const [savingGallery, setSavingGallery] = useState(false);
  const [uploadingGalleryImage, setUploadingGalleryImage] = useState(false);
  const [enterpriseProfileSummary, setEnterpriseProfileSummary] = useState<EnterpriseProfileSummary>(null);

  const [siteSettings, setSiteSettings] = useState<SiteSettings>(EMPTY_SETTINGS);
  const [siteSavedSnapshot, setSiteSavedSnapshot] = useState("");
  const [siteMessage, setSiteMessage] = useState("");
  const [savingSite, setSavingSite] = useState(false);
  const [uploadingHeroImage, setUploadingHeroImage] = useState(false);
  const autoSiteSeoRef = useRef({ title: "", description: "" });

  const [account, setAccount] = useState("");
  const [phone, setPhone] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityMessage, setSecurityMessage] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [loadingRecovery, setLoadingRecovery] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const dashboardRes = await fetch("/api/member/dashboard", {
          credentials: "include",
          cache: "no-store",
        });
        const dashboardBody = await dashboardRes.json().catch(() => ({}));
        if (!dashboardRes.ok) {
          if (dashboardRes.status === 401) setAuthed(false);
          setMessage(dashboardBody.error ?? "加载失败");
          return;
        }

        setAuthed(true);
        setData(dashboardBody);

        const [siteRes, recoveryRes, galleryRes, profileRes] = await Promise.all([
          fetch("/api/member/site-settings", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/auth/recovery-email", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/member/gallery?limit=12", {
            credentials: "include",
            cache: "no-store",
          }),
          fetch("/api/member/profile", {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const siteBody = await siteRes.json().catch(() => ({}));
        if (siteRes.ok) {
          const nextSettings = normalizeSettings(siteBody.settings ?? EMPTY_SETTINGS);
          autoSiteSeoRef.current = {
            title: nextSettings.seo.title,
            description: nextSettings.seo.description,
          };
          setSiteSettings(nextSettings);
          setSiteSavedSnapshot(JSON.stringify(nextSettings));
        }

        const recoveryBody = (await recoveryRes.json().catch(() => ({}))) as RecoveryResponse;
        if (recoveryRes.ok) {
          setAccount(typeof recoveryBody.account === "string" ? recoveryBody.account : "");
          setPhone(typeof recoveryBody.phone === "string" ? recoveryBody.phone : "");
          setRecoveryEmail(typeof recoveryBody.recoveryEmail === "string" ? recoveryBody.recoveryEmail : "");
        }

        const galleryBody = await galleryRes.json().catch(() => ({}));
        if (galleryRes.ok) {
          setGalleryItems(Array.isArray(galleryBody.items) ? galleryBody.items : []);
        }

        const profileBody = await profileRes.json().catch(() => ({}));
        if (profileRes.ok) {
          setEnterpriseProfileSummary(profileBody.enterprise ?? null);
        }

      } catch {
        setMessage("网络异常，请稍后重试");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isEnterpriseMember = data?.member.type === "enterprise_basic" || data?.member.type === "enterprise_advanced";
  const verification = useMemo(
    () => data?.effectiveVerification?.label ?? verificationText(data?.effectiveVerification?.status),
    [data?.effectiveVerification?.label, data?.effectiveVerification?.status]
  );
  const verificationActionHref = "/membership/content/verification";
  const verificationActionLabel = useMemo(() => {
    if (isEnterpriseMember) return "\u5df2\u8ba4\u8bc1\uff0c\u67e5\u770b\u6216\u4fee\u6539";
    if (data?.effectiveVerification?.status === "approved") return "\u5df2\u8ba4\u8bc1\uff0c\u67e5\u770b\u6216\u4fee\u6539";
    if (data?.effectiveVerification?.status === "pending") return "\u67e5\u770b\u8ba4\u8bc1\u8fdb\u5ea6";
    if (data?.effectiveVerification?.status === "rejected") return "\u91cd\u65b0\u63d0\u4ea4\u8ba4\u8bc1\u8d44\u6599";
    return "\u53bb\u4f01\u4e1a\u8ba4\u8bc1";
  }, [data?.effectiveVerification?.status, isEnterpriseMember]);
  const verificationEntryLabel = isEnterpriseMember ? "\u4f01\u4e1a\u8d44\u6599" : "\u4f01\u4e1a\u8ba4\u8bc1";
  const siteSnapshot = useMemo(() => JSON.stringify(siteSettings), [siteSettings]);
  const hasUnsavedSiteChanges = siteSnapshot !== siteSavedSnapshot;
  const missingMemberPhone = !phone.trim();
  const siteSeoSource = useMemo(
    () => buildMemberSiteSeoSource(siteSettings, data?.enterprise, enterpriseProfileSummary),
    [
      data?.enterprise,
      enterpriseProfileSummary,
      siteSettings,
    ]
  );
  const generatedSiteSeo = useMemo(() => generateMemberSiteSeo(siteSeoSource), [siteSeoSource]);
  const aboutBrandFilled = useMemo(() => hasMeaningfulContent(enterpriseProfileSummary?.intro), [enterpriseProfileSummary?.intro]);
  const enterpriseProfileStatusText = useMemo(() => {
    if (aboutBrandFilled) return "关于品牌已填写，可前往更新正文内容。";
    return "关于品牌还没有填写，请先补充一段品牌介绍文字。";
  }, [aboutBrandFilled]);
  const enterpriseProfileActionLabel = useMemo(
    () => (aboutBrandFilled ? "去更新关于品牌" : "去填写关于品牌"),
    [aboutBrandFilled]
  );

  useEffect(() => {
    setSiteSettings((prev) => {
      const nextTitle =
        !prev.seo.title.trim() || prev.seo.title === autoSiteSeoRef.current.title
          ? generatedSiteSeo.title
          : prev.seo.title;
      const nextDescription =
        !prev.seo.description.trim() || prev.seo.description === autoSiteSeoRef.current.description
          ? generatedSiteSeo.description
          : prev.seo.description;

      autoSiteSeoRef.current = generatedSiteSeo;
      if (nextTitle === prev.seo.title && nextDescription === prev.seo.description) {
        return prev;
      }

      return {
        ...prev,
        seo: {
          ...prev.seo,
          title: nextTitle,
          description: nextDescription,
        },
      };
    });
  }, [generatedSiteSeo]);
  const gallerySummary = useMemo(
    () =>
      galleryItems.reduce(
        (acc, item) => {
          acc[item.status] += 1;
          acc.total += 1;
          return acc;
        },
        { total: 0, draft: 0, pending: 0, approved: 0, rejected: 0 } as Record<SubmissionStatus | "total", number>
      ),
    [galleryItems]
  );

  async function reloadGallery() {
    const response = await fetch("/api/member/gallery?limit=12", {
      credentials: "include",
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      setGalleryItems(Array.isArray(body.items) ? body.items : []);
    }
  }

  function handleRegenerateSiteSeo() {
    autoSiteSeoRef.current = generatedSiteSeo;
    setSiteSettings((prev) => ({
      ...prev,
      seo: {
        ...prev.seo,
        title: generatedSiteSeo.title,
        description: generatedSiteSeo.description,
      },
    }));
    setSiteMessage("已根据当前企业资料重新生成 SEO，点击保存后生效。");
  }

  async function handleHeroImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingHeroImage(true);
    setSiteMessage("");
    try {
      const imageUrl = await uploadImageToServer(file, { folder: "content/enterprise-hero" });
      setSiteSettings((prev) => ({ ...prev, heroImageUrl: imageUrl }));
      setSiteMessage("主视觉图已上传，保存后前台生效。");
    } catch (error) {
      setSiteMessage(error instanceof Error ? error.message : "主视觉图上传失败");
    } finally {
      setUploadingHeroImage(false);
      event.target.value = "";
    }
  }

  async function handleSaveSite() {
    setSavingSite(true);
    setSiteMessage("正在保存...");
    try {
      const payload = normalizeSettings({
        ...siteSettings,
        seo: {
          ...siteSettings.seo,
          ...normalizeMemberSiteSeo(siteSettings.seo, siteSeoSource),
        },
      });
      const res = await fetch("/api/member/site-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSiteMessage(body.error ?? "保存失败");
        return;
      }
      const nextSettings = normalizeSettings(body.settings ?? payload);
      autoSiteSeoRef.current = {
        title: nextSettings.seo.title,
        description: nextSettings.seo.description,
      };
      setSiteSettings(nextSettings);
      setSiteSavedSnapshot(JSON.stringify(nextSettings));
      setSiteMessage("企业主页配置已保存");
    } catch {
      setSiteMessage("网络异常，请稍后重试");
    } finally {
      setSavingSite(false);
    }
  }

  async function handleRecoveryEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadingRecovery) return;

    setLoadingRecovery(true);
    setSecurityMessage("");
    setSecurityError("");
    try {
      const response = await fetch("/api/auth/recovery-email", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recoveryEmail, phone }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSecurityError(body.error ?? "保存找回邮箱失败");
        return;
      }
      setRecoveryEmail(typeof body.recoveryEmail === "string" ? body.recoveryEmail : "");
      setPhone(typeof body.phone === "string" ? body.phone : "");
      setSecurityMessage("找回邮箱和注册手机号已保存");
    } catch {
      setSecurityError("网络异常，请稍后重试");
    } finally {
      setLoadingRecovery(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadingPassword) return;

    setSecurityMessage("");
    setSecurityError("");

    if (newPassword !== confirmPassword) {
      setSecurityError("两次输入的新密码不一致");
      return;
    }

    setLoadingPassword(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSecurityError(body.error ?? "修改密码失败");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSecurityMessage("密码已更新");
    } catch {
      setSecurityError("网络异常，请稍后重试");
    } finally {
      setLoadingPassword(false);
    }
  }

  async function handleGalleryImageUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingGalleryImage(true);
    setGalleryMessage("");
    try {
      const imageUrl = await uploadImageToServer(file, { folder: "content/gallery" });
      setGalleryForm((prev) => ({ ...prev, imageUrl }));
      setGalleryMessage("图片已上传，补充信息后即可加入图库。");
    } catch (error) {
      setGalleryMessage(error instanceof Error ? error.message : "图库图片上传失败");
    } finally {
      setUploadingGalleryImage(false);
      event.target.value = "";
    }
  }

  async function handleGallerySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!galleryForm.imageUrl.trim()) {
      setGalleryMessage("请先上传图片");
      return;
    }

    setSavingGallery(true);
    setGalleryMessage("");
    try {
      const response = await fetch("/api/member/gallery", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: galleryForm.title,
          alt: galleryForm.alt,
          category: galleryForm.category || null,
          tagSlugs: galleryForm.tagSlugs,
          imageUrl: galleryForm.imageUrl,
          syncToMainSite: galleryForm.syncToMainSite,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setGalleryMessage(body.error ?? "保存图库图片失败");
        return;
      }

      setGalleryForm(EMPTY_GALLERY_FORM);
      setGalleryMessage("图片已加入图库，等待审核或同步。");
      await reloadGallery();
    } catch {
      setGalleryMessage("网络异常，请稍后重试");
    } finally {
      setSavingGallery(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-6xl px-4 py-12 text-muted">加载中...</div>;
  }

  if (authed === false) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <p className="mb-3 text-sm text-muted">请先登录后进入会员后台。</p>
        <Link href="/membership/login" className="apple-inline-link">
          前往登录
        </Link>
      </div>
    );
  }

  if (!data) {
    return <div className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted">{message || "加载失败"}</div>;
  }

  const displayName = data.enterprise?.companyShortName || data.enterprise?.companyName || "当前会员";
  const newsQuota = data.authorization.news.enabled
    ? data.authorization.news.annualLimit == null
      ? "不限"
      : `${data.authorization.news.remainingCount ?? 0}/${data.authorization.news.annualLimit}`
    : "未开通";
  const galleryQuota = data.authorization.gallery.enabled
    ? data.authorization.gallery.annualLimit == null
      ? "不限"
      : `${data.authorization.gallery.remainingCount ?? 0}/${data.authorization.gallery.annualLimit}`
    : "未开通";
  const effectivePublishingLabels = data.authorization.publishingCategories.flatMap((category) => {
    if (!category.enabled) return [];
    if (category.subcategories.length === 0) return [category.label];
    return category.subcategories.filter((sub) => sub.enabled).map((sub) => `${category.label} / ${sub.label}`);
  });
  const enterpriseBasicRightsCopy =
    effectivePublishingLabels.length === 1 &&
    effectivePublishingLabels[0] === "整木资讯 / 企业动态" &&
    data.authorization.news.annualLimit === 5
      ? "你可以维护企业资料、配置企业主页，每年发布 5 篇企业动态并上传 5 张图库图片。升级为企业VIP会员后，可获得 SEO 设置、推荐位、子账号和更高内容额度。"
      : `你可以维护企业资料、配置企业主页并上传图库。当前已开通${effectivePublishingLabels.join("、") || "专项"}发布权限，资讯总额度为${data.authorization.news.annualLimit == null ? "不限" : `${data.authorization.news.annualLimit} 篇/年`}，具体子栏目额度以发布中心为准；图库仍为 5 张/年。`;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-3 py-6 sm:space-y-6 sm:px-4 sm:py-12">
      <section className="sticky top-16 z-20 rounded-[22px] border border-border/80 bg-white/88 px-3 py-3 shadow-[0_14px_28px_rgba(15,23,42,0.08)] backdrop-blur sm:top-20 sm:rounded-[26px] sm:px-4">
        <div className="flex flex-wrap gap-2">
          <AnchorLink href="#publish-center" label="发布中心" />
          <Link href="/membership/content/verification" className="rounded-full border border-border bg-surface px-3 py-2 text-xs text-primary transition hover:bg-white">
            企业认证
          </Link>
          <Link href="/membership/content/submissions" className="rounded-full border border-border bg-surface px-3 py-2 text-xs text-primary transition hover:bg-white">
            内容记录
          </Link>
          <AnchorLink href="#gallery-overview" label="图库概览" />
          <AnchorLink href="#site-settings" label="主页配置" />
          <AnchorLink href="#account-security" label="账号安全" />
        </div>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-border bg-surface-elevated shadow-[0_18px_40px_rgba(15,23,42,0.08)] sm:rounded-[32px] sm:shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
        <div className="bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,239,230,0.92))] px-4 py-5 sm:px-6 sm:py-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Member Workbench</p>
              <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-primary sm:mt-3 sm:text-3xl">会员后台工作台</h1>
              <p className="mt-2 text-sm text-muted">{displayName} · {data.member.label}</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">内容发布、企业主页配置、账号安全都收在这里，减少来回切页。</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
              <HeroMiniCard label="资讯额度" value={newsQuota} />
              <HeroMiniCard label="图库额度" value={galleryQuota} />
              <HeroMiniCard label="认证状态" value={verification} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-border bg-surface-elevated p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] sm:rounded-[28px] sm:p-6 sm:shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-primary">
              当前身份：{data.member.label}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {data.member.type === "personal"
                ? "你可以发布少量资讯、参与词库贡献和标准共建。完成企业认证后，可升级为企业基础会员，获得企业主页配置、图库上传和更多企业展示能力。"
                : data.member.type === "enterprise_basic"
                  ? enterpriseBasicRightsCopy
                  : "你已拥有企业主页、内容发布、图库上传、SEO 设置、推荐内容、子账号和高级展示能力。"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={verificationActionHref} className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-105">
              {verificationActionLabel}
            </Link>
            {data.member.type === "enterprise_basic" ? (
              <a
                href={`tel:${PUBLIC_CONTACT_PHONE}`}
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:brightness-105"
              >
                联系管理员升级VIP
              </a>
            ) : null}
          </div>
        </div>
        {missingMemberPhone ? (
          <div className="mt-4 rounded-[20px] border border-[rgba(180,154,107,0.22)] bg-[rgba(255,249,238,0.92)] px-4 py-4 text-sm leading-6 text-muted">
            当前账号还没有补充注册手机号。建议在下方“账号安全”里补充手机号，用于账号找回、认证审核和平台联系。
          </div>
        ) : null}
      </section>

      <section id="publish-center" className="rounded-[24px] border border-border bg-surface-elevated p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] sm:rounded-[28px] sm:p-6 sm:shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-primary">内容发布中心</h2>
            <p className="mt-1 text-sm text-muted">发布、图库、审核和企业资料入口都放在这里。</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <Link href="/membership/content/verification" className="rounded-full border border-border bg-surface px-3 py-2 text-xs text-primary transition hover:bg-white">
              企业认证
            </Link>
            <Link href="/membership/content/submissions" className="rounded-full border border-border bg-surface px-3 py-2 text-xs text-primary transition hover:bg-white">
              内容记录
            </Link>
            <AnchorLink href="#site-settings" label="主页配置" />
            <AnchorLink href="#account-security" label="账号安全" />
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:mt-5 md:grid-cols-2 xl:grid-cols-3">
          {PRIMARY_ACTIONS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[20px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,239,230,0.86))] px-4 py-4 transition hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)] sm:rounded-[24px] sm:px-5 sm:py-5"
            >
              <p className="text-[15px] font-medium text-primary sm:text-base">{item.label}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{item.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <StatCard label="资讯内容" value={data.stats.articles.total} sub={`待审核 ${data.stats.articles.pending} · 已通过 ${data.stats.articles.approved}`} />
        <StatCard label="图库内容" value={data.stats.gallery.total} sub={`待审核 ${data.stats.gallery.pending} · 已通过 ${data.stats.gallery.approved}`} />
        <StatCard label="标准反馈" value={data.stats.standardFeedback.total} sub={`待审核 ${data.stats.standardFeedback.pending} · 已通过 ${data.stats.standardFeedback.approved}`} />
        <StatCard label="推荐额度" value={data.authorization.recommendation.remainingCount} sub={`全年 ${data.authorization.recommendation.annualLimit} 次`} />
      </section>

      <section id="gallery-overview" className="rounded-[24px] border border-border bg-surface-elevated p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] sm:rounded-[28px] sm:p-6 sm:shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-primary">图库概览</h2>
            <p className="mt-1 text-sm text-muted">现在可以直接在这里上传图库图片；需要批量处理时再进入图库页。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/membership/content/gallery" className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-primary transition hover:bg-white">
              打开图库管理
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatusSummaryCard label="全部图片" value={gallerySummary.total} />
          <StatusSummaryCard label="草稿" value={gallerySummary.draft} />
          <StatusSummaryCard label="待审核" value={gallerySummary.pending} />
          <StatusSummaryCard label="已通过" value={gallerySummary.approved} />
          <StatusSummaryCard label="已退回" value={gallerySummary.rejected} />
        </div>

        {data.features.canUploadGallery ? (
          <form onSubmit={handleGallerySubmit} className="mt-5 rounded-[20px] border border-border bg-white/92 p-4 sm:rounded-[24px] sm:p-5">
            <div className="mb-4">
              <h3 className="text-base font-medium text-primary">快速上传图库</h3>
              <p className="mt-1 text-sm text-muted">适合快速补案例图、工艺图、空间图，上传后会进入审核流程。</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="rounded-[18px] border border-border bg-surface p-4">
                <p className="text-sm font-medium text-primary">图库图片</p>
                <label className="mt-3 inline-flex cursor-pointer items-center rounded-full border border-border bg-white px-4 py-2 text-sm text-primary transition hover:bg-surface">
                  <input type="file" accept="image/*" className="hidden" onChange={handleGalleryImageUpload} />
                  {uploadingGalleryImage ? "上传中..." : `上传图片（最大 ${MAX_UPLOAD_IMAGE_MB}MB）`}
                </label>
                {galleryForm.imageUrl ? (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-white">
                    <Image src={resolveUploadedImageUrl(galleryForm.imageUrl)} alt="图库预览" width={320} height={240} className="h-auto w-full object-cover" />
                  </div>
                ) : (
                  <p className="mt-4 text-xs leading-6 text-muted">建议上传横图，方便前台列表和详情页展示。</p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="标题" value={galleryForm.title} onChange={(value) => setGalleryForm((prev) => ({ ...prev, title: value }))} />
                <Field label="替代文本" value={galleryForm.alt} onChange={(value) => setGalleryForm((prev) => ({ ...prev, alt: value }))} />
                <label className="block">
                  <span className="text-sm text-primary">图片分类</span>
                  <select
                    className="mt-1 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-primary"
                    value={galleryForm.category}
                    onChange={(event) => setGalleryForm((prev) => ({ ...prev, category: event.target.value }))}
                  >
                    <option value="">请选择分类</option>
                    {Object.entries(GALLERY_CATEGORY_LABEL_MAP).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <Field label="标签" value={galleryForm.tagSlugs} helper="多个标签可用逗号分隔。" onChange={(value) => setGalleryForm((prev) => ({ ...prev, tagSlugs: value }))} />
                <label className="md:col-span-2 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-primary">
                  <input
                    type="checkbox"
                    checked={galleryForm.syncToMainSite}
                    onChange={(event) => setGalleryForm((prev) => ({ ...prev, syncToMainSite: event.target.checked }))}
                  />
                  上传后同步到前台主站
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-muted">{galleryMessage || "上传后可在下方图库概览查看最新状态。"}</p>
              <button
                type="submit"
                disabled={savingGallery || uploadingGalleryImage}
                className="w-full rounded-full bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_16px_36px_rgba(180,154,107,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:py-2.5"
              >
                {savingGallery ? "保存中..." : "加入图库"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-5 rounded-[20px] border border-[rgba(180,154,107,0.18)] bg-[linear-gradient(180deg,rgba(255,252,247,0.98),rgba(248,242,233,0.9))] p-4 text-sm leading-6 text-muted sm:rounded-[24px] sm:p-5">
            当前身份暂未开通企业图库上传。完成企业认证并升级为企业基础会员后，可获得图库上传与企业主页展示能力。
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {galleryItems.length > 0 ? (
            galleryItems.slice(0, 8).map((item) => (
              <article key={item.id} className="overflow-hidden rounded-[20px] border border-border bg-white/92 sm:rounded-[24px]">
                <div className="relative aspect-[4/3]">
                  <Image src={resolveUploadedImageUrl(item.imageUrl)} alt={item.alt || item.title || "图库图片"} fill className="object-cover" />
                </div>
                <div className="space-y-2 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-xs ${SUBMISSION_STATUS_TONE[item.status]}`}>
                      {SUBMISSION_STATUS_TEXT[item.status]}
                    </span>
                    <span className="text-xs text-muted">{getGalleryCategoryLabel(item.category)}</span>
                  </div>
                  <p className="line-clamp-2 text-sm font-medium text-primary">{item.title?.trim() || "未命名图片"}</p>
                  <p className="text-xs text-muted">上传时间 {formatRecordDate(item.createdAt)}</p>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[20px] border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted sm:col-span-2 sm:rounded-[24px] xl:col-span-4">
              还没有上传图库内容。可以从图库管理页上传案例图、工艺图和空间图。
            </div>
          )}
        </div>
      </section>

      {data.features.supportsEnterpriseSite ? (
        <section id="site-settings" className="rounded-[24px] border border-border bg-surface-elevated p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] sm:rounded-[28px] sm:p-6 sm:shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-primary">企业主页配置</h2>
              <p className="mt-1 text-sm text-muted">这里集中维护首屏、联系信息和搜索分享设置。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/membership/profile" className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-primary transition hover:bg-white">
                企业资料
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:mt-5 lg:grid-cols-[minmax(0,1.15fr)_340px]">
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
                <div className="rounded-[20px] border border-border bg-white/92 p-4 sm:rounded-[24px] sm:p-5">
                  <Field label="企业名称" value={siteSettings.heroTitle} onChange={(value) => setSiteSettings((prev) => ({ ...prev, heroTitle: value }))} />
                  <div className="mt-4">
                    <Field
                      label="品牌标签"
                      helper="只填写 1 条，展示在企业页首图主标题下方。建议 4-12 个字。"
                      value={siteSettings.homepageTags[0] || ""}
                      onChange={(value) =>
                        setSiteSettings((prev) => ({
                          ...prev,
                          homepageTags: value.trim() ? [value.trim()] : [],
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="rounded-[20px] border border-[rgba(180,154,107,0.18)] bg-[linear-gradient(180deg,rgba(255,252,247,0.98),rgba(248,242,233,0.9))] p-4 sm:rounded-[24px] sm:p-5">
                  <p className="text-sm font-medium text-primary">品牌资料</p>
                  <p className="mt-2 text-sm leading-6 text-muted">{enterpriseProfileStatusText}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
                    <span
                      className={`rounded-full border px-3 py-1 ${
                        aboutBrandFilled
                          ? "border-[rgba(112,164,132,0.28)] bg-[rgba(240,249,243,0.92)] text-[#3f6d52]"
                          : "border-[rgba(180,154,107,0.22)] bg-white/80 text-muted"
                      }`}
                    >
                      关于品牌 · {aboutBrandFilled ? "已填写" : "待补充"}
                    </span>
                  </div>
                  <div className="mt-4">
                    <Link href="/membership/profile" className="apple-inline-link">
                      {enterpriseProfileActionLabel}
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-border bg-white/90 p-4 sm:rounded-[24px] sm:p-5">
              <p className="text-sm font-medium text-primary">首屏主视觉图</p>
              <input
                className="mt-3 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-primary"
                value={siteSettings.heroImageUrl}
                onChange={(e) => setSiteSettings((prev) => ({ ...prev, heroImageUrl: e.target.value }))}
              />
              <div className="mt-3 flex flex-wrap gap-3">
                <label className="inline-flex cursor-pointer items-center rounded-full border border-border bg-white px-4 py-2 text-sm text-primary transition hover:bg-surface">
                  <input type="file" accept="image/*" className="hidden" onChange={handleHeroImageUpload} />
                  {uploadingHeroImage ? "上传中..." : `上传图片（最大 ${MAX_UPLOAD_IMAGE_MB}MB）`}
                </label>
                {siteSettings.heroImageUrl ? (
                  <button
                    type="button"
                    onClick={() => setSiteSettings((prev) => ({ ...prev, heroImageUrl: "" }))}
                    className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-primary transition hover:bg-white"
                  >
                    清除图片
                  </button>
                ) : null}
              </div>
              <p className="mt-3 text-xs leading-6 text-muted">建议使用 1600 × 900 px 横图，画面简洁，避免大段文字。</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="主按钮文案"
              value={siteSettings.primaryCtaLabel}
              onChange={(value) => setSiteSettings((prev) => ({ ...prev, primaryCtaLabel: value, contactLabel: value }))}
            />
            <Field
              label="次按钮文案"
              value={siteSettings.secondaryCtaLabel}
              onChange={(value) => setSiteSettings((prev) => ({ ...prev, secondaryCtaLabel: value }))}
            />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="联系人"
              value={siteSettings.contact.contactPerson}
              onChange={(value) => setSiteSettings((prev) => ({ ...prev, contact: { ...prev.contact, contactPerson: value } }))}
            />
            <Field
              label="电话"
              value={siteSettings.contact.contactPhone}
              onChange={(value) => setSiteSettings((prev) => ({ ...prev, contact: { ...prev.contact, contactPhone: value } }))}
            />
            <Field
              label="官网"
              value={siteSettings.contact.websiteUrl}
              onChange={(value) => setSiteSettings((prev) => ({ ...prev, contact: { ...prev.contact, websiteUrl: value } }))}
            />
            <Field
              label="城市"
              value={siteSettings.contact.city}
              onChange={(value) => setSiteSettings((prev) => ({ ...prev, contact: { ...prev.contact, city: value } }))}
            />
            <Field
              label="地址"
              value={siteSettings.contact.address}
              onChange={(value) => setSiteSettings((prev) => ({ ...prev, contact: { ...prev.contact, address: value } }))}
            />
            <Field
              label="表单链接"
              value={siteSettings.contact.contactFormUrl}
              onChange={(value) => setSiteSettings((prev) => ({ ...prev, contact: { ...prev.contact, contactFormUrl: value } }))}
            />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <TextAreaField
              label="联系引导文案"
              value={siteSettings.contact.contactIntro}
              onChange={(value) => setSiteSettings((prev) => ({ ...prev, contact: { ...prev.contact, contactIntro: value } }))}
            />
            <TextAreaField
              label="SEO 描述"
              helper="系统会自动生成适合搜索展示的纯文本摘要，不建议填写 HTML。"
              value={siteSettings.seo.description}
              onChange={(value) => setSiteSettings((prev) => ({ ...prev, seo: { ...prev.seo, description: value } }))}
            />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="SEO 标题"
              helper="系统会根据企业名称、定位和简介自动生成，可手动调整。"
              value={siteSettings.seo.title}
              onChange={(value) => setSiteSettings((prev) => ({ ...prev, seo: { ...prev.seo, title: value } }))}
            />
            <Field
              label="分享封面图"
              value={siteSettings.seo.imageUrl}
              onChange={(value) => setSiteSettings((prev) => ({ ...prev, seo: { ...prev.seo, imageUrl: value } }))}
            />
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted">{siteMessage || "保存后企业主页会使用最新配置。"}</p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={handleRegenerateSiteSeo}
                disabled={savingSite || uploadingHeroImage}
                className="w-full rounded-full border border-border bg-white px-5 py-3 text-sm font-medium text-primary transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:py-2.5"
              >
                重新自动生成 SEO
              </button>
              <button
                type="button"
                onClick={() => void handleSaveSite()}
                disabled={savingSite || uploadingHeroImage || !hasUnsavedSiteChanges}
                className="w-full rounded-full bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_16px_36px_rgba(180,154,107,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:py-2.5"
              >
                {savingSite ? "保存中..." : uploadingHeroImage ? "上传中..." : hasUnsavedSiteChanges ? "保存主页配置" : "已保存"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section id="account-security" className="rounded-[24px] border border-border bg-surface-elevated p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] sm:rounded-[28px] sm:p-6 sm:shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-primary">账号安全</h2>
            <p className="mt-1 text-sm text-muted">管理找回邮箱和登录密码。</p>
          </div>
          {account ? <p className="text-sm text-muted">当前账号：{account}</p> : null}
        </div>
        {securityError ? <p className="mt-4 text-sm text-red-600">{securityError}</p> : null}
        {securityMessage ? <p className="mt-4 text-sm text-emerald-700">{securityMessage}</p> : null}

        <div className="mt-5 grid gap-4 sm:gap-6 xl:grid-cols-[1fr_1.1fr]">
          <form onSubmit={handleRecoveryEmailSubmit} className="rounded-[20px] border border-border bg-white/90 p-4 sm:rounded-[24px] sm:p-5">
            <h3 className="text-base font-medium text-primary">账号联系信息</h3>
            <p className="mt-2 text-sm text-muted">注册手机号用于账号找回、认证审核和平台联系，不会在前台公开展示。</p>
            <label className="mt-4 block">
              <span className="text-sm text-primary">注册手机号</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="请输入 11 位中国大陆手机号"
                className="mt-1 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-primary"
              />
            </label>
            <label className="mt-4 block">
              <span className="text-sm text-primary">找回邮箱</span>
              <input
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                placeholder="name@example.com"
                className="mt-1 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-primary"
              />
            </label>
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={loadingRecovery}
                className="w-full rounded-full bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_16px_36px_rgba(180,154,107,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:py-2.5"
              >
                {loadingRecovery ? "保存中..." : "保存联系信息"}
              </button>
            </div>
          </form>

          <form onSubmit={handlePasswordSubmit} className="rounded-[20px] border border-border bg-white/90 p-4 sm:rounded-[24px] sm:p-5">
            <h3 className="text-base font-medium text-primary">修改密码</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Field label="当前密码" type="password" value={currentPassword} onChange={setCurrentPassword} />
              <Field label="新密码" type="password" value={newPassword} onChange={setNewPassword} />
              <Field label="确认新密码" type="password" value={confirmPassword} onChange={setConfirmPassword} />
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={loadingPassword}
                className="w-full rounded-full bg-accent px-5 py-3 text-sm font-medium text-white shadow-[0_16px_36px_rgba(180,154,107,0.28)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto sm:py-2.5"
              >
                {loadingPassword ? "提交中..." : "更新密码"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

function HeroMiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-border bg-white/88 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)] sm:rounded-[24px] sm:px-4 sm:py-4 sm:shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <p className="text-[11px] uppercase tracking-[0.2em] text-muted">{label}</p>
      <p className="mt-2 text-base font-semibold text-primary sm:mt-3 sm:text-lg">{value}</p>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <article className="rounded-[20px] border border-border bg-surface-elevated p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] sm:rounded-[26px] sm:p-5 sm:shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{value}</p>
      <p className="mt-2 text-[11px] leading-5 text-muted sm:text-xs">{sub}</p>
    </article>
  );
}

function StatusSummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-[20px] border border-border bg-white/90 px-4 py-4 sm:rounded-[24px]">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-primary">{value}</p>
    </article>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-primary">{label}</span>
      {helper ? <p className="mt-1 text-xs leading-5 text-muted">{helper}</p> : null}
      <input
        type={type}
        className="mt-1 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-primary"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-primary">{label}</span>
      {helper ? <p className="mt-1 text-xs leading-5 text-muted">{helper}</p> : null}
      <textarea
        className="mt-1 min-h-24 w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-primary"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function InfoCard({
  title,
  text,
  actionHref,
  actionLabel,
}: {
  title: string;
  text: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="rounded-[20px] border border-[rgba(180,154,107,0.18)] bg-[linear-gradient(180deg,rgba(255,252,247,0.98),rgba(248,242,233,0.9))] p-4 text-sm leading-6 text-muted sm:rounded-[24px] sm:p-5 sm:leading-7">
      <p className="font-medium text-primary">{title}</p>
      {text ? <p className="mt-2">{text}</p> : null}
      <div className="mt-3">
        <Link href={actionHref} className="apple-inline-link">
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}

function AnchorLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="rounded-full border border-border bg-surface px-3 py-2 text-xs text-primary transition hover:bg-white">
      {label}
    </a>
  );
}
