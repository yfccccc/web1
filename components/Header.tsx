"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export type NavItem = {
  href: string;
  label: string;
  external?: boolean;
  featured?: boolean;
  desc?: string;
  subcategories?: { href: string; label: string }[];
};

type MeState = {
  name: string;
  displayName?: string | null;
  account: string;
  role: string | null;
};

function isActivePath(pathname: string, href: string) {
  if (!href.startsWith("/")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AccountButton({
  me,
  memberHref,
  onLogout,
  closeMobileMenu,
}: {
  me: MeState | null;
  memberHref: string;
  onLogout: () => Promise<void>;
  closeMobileMenu?: () => void;
}) {
  const displayName = (me?.displayName || me?.name || me?.account || "会员").trim();
  const avatarText = displayName.slice(0, 1).toUpperCase();

  if (!me) {
    return (
      <Link
        href="/membership/login"
        onClick={closeMobileMenu}
        className="inline-flex items-center rounded-full border border-[rgba(194,182,154,0.24)] bg-[linear-gradient(180deg,rgba(255,252,246,0.99),rgba(246,240,231,0.95))] px-3.5 py-1.5 text-[13px] font-medium text-primary shadow-[0_10px_24px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.92)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(170,154,122,0.34)] hover:bg-[linear-gradient(180deg,rgba(255,253,248,1),rgba(250,245,237,0.98))]"
      >
        会员登录
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={memberHref}
        onClick={closeMobileMenu}
        className="inline-flex items-center gap-2 rounded-full border border-[rgba(194,182,154,0.28)] bg-[linear-gradient(180deg,rgba(255,252,246,0.99),rgba(246,240,231,0.95))] px-3.5 py-1.5 text-[13px] font-medium text-primary shadow-[0_10px_24px_rgba(15,23,42,0.05),inset_0_1px_0_rgba(255,255,255,0.95)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(170,154,122,0.34)] hover:bg-[linear-gradient(180deg,rgba(255,253,248,1),rgba(250,245,237,0.98))]"
      >
        <span className="inline-flex h-[19px] w-[19px] items-center justify-center rounded-full bg-[rgba(201,189,161,0.24)] text-[10px] font-semibold text-primary/85 ring-1 ring-[rgba(194,182,154,0.22)]">
          {avatarText}
        </span>
        <span>{displayName}</span>
      </Link>
      <button
        type="button"
        onClick={() => void onLogout()}
        className="inline-flex items-center rounded-full border border-border bg-surface-elevated/88 px-3 py-1.5 text-[12px] text-primary/78 transition hover:border-[rgba(170,154,122,0.32)] hover:text-primary"
      >
        退出
      </button>
    </div>
  );
}

export function Header({
  navItems,
  initialMe = null,
}: {
  navItems: NavItem[];
  initialMe?: MeState | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [hovered, setHovered] = useState<string | null>(null);
  const [me, setMe] = useState<MeState | null>(initialMe);
  const [readingProgress, setReadingProgress] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [memberHref, setMemberHref] = useState<string>(
    initialMe && (initialMe.role === "SUPER_ADMIN" || initialMe.role === "ADMIN")
      ? "/membership/admin"
      : "/membership/content/publish?tab=articles",
  );

  const featuredNav = useMemo(() => navItems.find((item) => item.featured), [navItems]);
  const desktopNavItems = useMemo(() => navItems, [navItems]);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
    setMobileExpanded(null);
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setMe(null);
        setMemberHref("/membership");
        return;
      }
      const meData = await res.json();
      const account = (typeof meData.account === "string" && meData.account.trim()) || "会员";
      const name = typeof meData.name === "string" && meData.name.trim() ? meData.name.trim() : account;
      const displayName =
        typeof meData.displayName === "string" && meData.displayName.trim() ? meData.displayName.trim() : name;
      const role = typeof meData.role === "string" ? meData.role : null;
      setMe({ name, displayName, account, role });
      setMemberHref(role === "SUPER_ADMIN" || role === "ADMIN" ? "/membership/admin" : "/membership/content/publish?tab=articles");
    } catch {
      setMe(null);
      setMemberHref("/membership");
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe, pathname]);

  useEffect(() => {
    const onFocus = () => void loadMe();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loadMe]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileExpanded(null);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileMenu();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeMobileMenu, mobileMenuOpen]);

  useEffect(() => {
    const isNewsReadingPage = pathname.startsWith("/news/") && pathname !== "/news/all";
    if (!isNewsReadingPage) {
      setReadingProgress(0);
      return;
    }

    let rafId = 0;

    const updateProgress = () => {
      const articleEl = document.getElementById("news-reading-article");
      if (!articleEl) {
        setReadingProgress(0);
        return;
      }

      const rect = articleEl.getBoundingClientRect();
      const startY = window.scrollY + rect.top;
      const maxScrollable = Math.max(articleEl.scrollHeight - window.innerHeight, 1);
      const raw = (window.scrollY - startY) / maxScrollable;
      const next = Math.max(0, Math.min(1, raw));
      setReadingProgress(next);
    };

    const onScrollOrResize = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateProgress();
      });
    };

    updateProgress();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setMe(null);
    setMemberHref("/membership");
    closeMobileMenu();
    router.push("/membership");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-2.5 z-50 px-2.5 sm:top-3 sm:px-5">
        <div className="glass-card relative mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 overflow-visible px-3 sm:h-16 sm:px-5">
          <Link href="/" className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap transition-opacity hover:opacity-95">
            <span className="site-wordmark font-serif text-[17px] font-semibold tracking-[0.08em] sm:text-[19px]">
              整木网
            </span>
            <span className="hidden max-w-[16rem] truncate text-[11px] leading-none text-muted sm:inline-block md:max-w-none md:text-xs">
              整体木作行业知识共享平台
            </span>
          </Link>

          <nav className="hidden items-center gap-1.5 overflow-x-auto lg:flex lg:overflow-visible" aria-label="主导航">
            {desktopNavItems.map(({ href, label, external, subcategories, featured }) => {
              const active = !external && isActivePath(pathname, href);

              return (
                <div
                  key={href}
                  className="relative"
                  onMouseEnter={() => setHovered(href)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <Link
                    href={href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noreferrer" : undefined}
                    className={`nav-pill inline-flex items-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium sm:text-sm ${
                      featured
                        ? `nav-pill-featured ${active ? "is-active" : ""}`
                        : active
                          ? "nav-pill-standard is-active"
                          : "nav-pill-standard"
                    }`}
                  >
                    {label}
                  </Link>

                  {!external && subcategories?.length ? (
                    <div className={`nav-dropdown absolute left-0 top-full z-50 pt-2 ${hovered === href ? "is-open" : ""}`}>
                      <div className="glass-card min-w-[220px] px-2 py-2">
                        <ul className="space-y-1">
                          {subcategories.map((sub) => (
                            <li key={sub.href}>
                              <Link
                                href={sub.href}
                                className="block rounded-lg px-2.5 py-1.5 text-[13px] text-primary/90 transition-colors hover:bg-[rgba(250,245,237,0.82)] hover:text-[#8a734d]"
                              >
                                {sub.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <AccountButton me={me} memberHref={memberHref} onLogout={handleLogout} />
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            {featuredNav ? (
              <Link
                href={featuredNav.href}
                target={featuredNav.external ? "_blank" : undefined}
                rel={featuredNav.external ? "noreferrer" : undefined}
                className={`youxuan-mobile-entry ${isActivePath(pathname, featuredNav.href) ? "is-active" : ""}`}
              >
                <span className="youxuan-mobile-entry-text youxuan-mobile-entry-text--full">{featuredNav.label}</span>
                <span className="youxuan-mobile-entry-text youxuan-mobile-entry-text--short">商城</span>
                <span className="youxuan-mobile-entry-icon" aria-hidden="true">商</span>
              </Link>
            ) : null}

            <button
              type="button"
              aria-label={mobileMenuOpen ? "关闭导航菜单" : "打开导航菜单"}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="nav-pill inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-elevated/90 text-primary"
            >
              <span className="sr-only">菜单</span>
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                {mobileMenuOpen ? (
                  <path d="M4.2 4.2a1 1 0 0 1 1.4 0L10 8.6l4.4-4.4a1 1 0 1 1 1.4 1.4L11.4 10l4.4 4.4a1 1 0 0 1-1.4 1.4L10 11.4l-4.4 4.4a1 1 0 1 1-1.4-1.4L8.6 10 4.2 5.6a1 1 0 0 1 0-1.4Z" />
                ) : (
                  <path d="M3 5.5A1 1 0 0 1 4 4.5h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm0 4.5A1 1 0 0 1 4 9h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Zm1 4.5a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2H4Z" />
                )}
              </svg>
            </button>
          </div>

          {pathname.startsWith("/news/") && pathname !== "/news/all" ? (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[rgba(201,191,168,0.26)]">
              <div
                className="h-full origin-left rounded-full bg-[linear-gradient(90deg,rgba(150,127,83,0.88),rgba(196,175,138,0.8))] transition-transform duration-100 ease-linear"
                style={{ transform: `scaleX(${readingProgress})` }}
              />
            </div>
          ) : null}
        </div>
      </header>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            aria-label="关闭导航菜单"
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
            onClick={closeMobileMenu}
          />
          <div className="glass-card absolute left-2.5 right-2.5 top-[4.15rem] max-h-[calc(100vh-4.9rem)] overflow-y-auto p-3.5">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted">导航</p>
              <button
                type="button"
                onClick={closeMobileMenu}
                className="rounded-full border border-border px-2.5 py-1 text-[13px] text-primary"
              >
                关闭
              </button>
            </div>

            <nav className="mt-3 space-y-2" aria-label="移动端主导航">
              {navItems.map(({ href, label, external, subcategories, featured }) => {
                const active = !external && isActivePath(pathname, href);
                const expanded = mobileExpanded === href;
                const hasSubcategories = Boolean(subcategories?.length);

                return (
                  <div
                    key={href}
                    className={`rounded-xl border p-2 ${
                      featured
                        ? "border-[rgba(192,152,94,0.24)] bg-[linear-gradient(180deg,rgba(254,250,244,0.98),rgba(247,240,229,0.94))]"
                        : "border-border bg-surface-elevated/65"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={href}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noreferrer" : undefined}
                        onClick={closeMobileMenu}
                        className={`nav-pill flex-1 inline-flex items-center justify-between rounded-full px-3.5 py-2 text-sm font-medium ${
                          featured
                            ? `nav-pill-featured is-mobile ${active ? "is-active" : ""}`
                            : active
                              ? "nav-pill-standard is-active"
                              : "bg-surface/65 text-primary hover:bg-surface"
                        }`}
                      >
                        <span className="truncate">{label}</span>
                        <span className="text-[12px] opacity-70">进入</span>
                      </Link>

                      {hasSubcategories ? (
                        <button
                          type="button"
                          aria-label={expanded ? "收起子菜单" : "展开子菜单"}
                          onClick={() => setMobileExpanded((prev) => (prev === href ? null : href))}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-primary"
                        >
                          <svg
                            viewBox="0 0 20 20"
                            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : "rotate-0"}`}
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M5.5 7.5a1 1 0 0 1 1.4 0L10 10.6l3.1-3.1a1 1 0 1 1 1.4 1.4l-3.8 3.8a1 1 0 0 1-1.4 0L5.5 8.9a1 1 0 0 1 0-1.4Z" />
                          </svg>
                        </button>
                      ) : null}
                    </div>

                    {expanded && subcategories?.length ? (
                      <div className="mt-2.5 border-l border-border pl-3">
                        <ul className="space-y-1.5">
                          {subcategories.map((sub) => (
                            <li key={sub.href}>
                              <Link
                                href={sub.href}
                                onClick={closeMobileMenu}
                                className="block rounded px-2 py-1.5 text-[13px] text-primary/90 hover:bg-surface"
                              >
                                {sub.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>

            <div className="mt-3 rounded-2xl border border-border bg-surface-elevated/80 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted">账户</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <AccountButton me={me} memberHref={memberHref} onLogout={handleLogout} closeMobileMenu={closeMobileMenu} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
