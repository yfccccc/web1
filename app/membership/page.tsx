import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getSiteVisualSettings } from "@/lib/site-visual-settings";
import {
  PUBLIC_BUSINESS_CONTACT_EMAIL,
  PUBLIC_CONTACT_PHONE,
  PUBLIC_MEMBER_CONTACT_EMAIL,
} from "@/lib/public-site-config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MembershipPage() {
  const [session, visualSettings] = await Promise.all([
    getSession(),
    getSiteVisualSettings(),
  ]);
  if (session) {
    if (session.role === "SUPER_ADMIN" || session.role === "ADMIN") {
      redirect("/membership/admin");
    }
    redirect("/membership/content/publish?tab=articles");
  }

  const membershipHero = visualSettings.backgrounds.membershipHero?.trim() || "";
  return (
    <div className="min-h-screen">
      <section className="apple-hero relative overflow-hidden border-b border-border py-16 sm:py-20">
        {membershipHero ? (
          <Image
            src={membershipHero}
            alt=""
            fill
            priority
            className="object-cover opacity-30"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-surface/55 via-surface/70 to-surface/88" />
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-primary">会员系统</h1>
          <p className="mt-3 text-sm sm:text-base text-muted">企业结构参与机制 · 行业共建机制 · 权威分层机制</p>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/membership/login" className="interactive-lift rounded-xl bg-[var(--color-accent)] text-white px-5 py-2.5 text-sm font-medium">会员登录</Link>
            <Link href="/membership/register" className="interactive-lift rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-medium text-primary">会员注册</Link>
            <Link href="/membership/profile" className="interactive-lift rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-medium text-primary">企业资料管理</Link>
            <Link href="/membership/content/verification" className="interactive-lift rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-medium text-primary">企业认证申请</Link>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface-elevated py-14 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-3 gap-4">
          <article className="glass-panel p-5">
            <h2 className="font-serif text-lg font-semibold text-primary">企业基础会员</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>支持企业资料编辑、企业主页配置与前台企业页展示</li>
              <li>仅可发布企业动态，默认 5 篇/年；图库上传默认 5 张/年（默认待审核）</li>
              <li>适合已完成企业认证的入驻企业</li>
            </ul>
          </article>

          <article className="glass-panel p-5">
            <h2 className="font-serif text-lg font-semibold text-primary">个人会员</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>注册后默认成为个人会员，可登录会员后台并提交企业认证</li>
              <li>支持少量资讯发布、词库贡献、标准反馈与标准共建（默认待审核）</li>
              <li>适合作为行业参与者、内容贡献者和潜在企业用户的起点账号</li>
            </ul>
          </article>

          <article className="glass-panel p-5">
            <h2 className="font-serif text-lg font-semibold text-primary">企业VIP会员</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>包含企业基础会员全部能力，并拥有更高资讯与图库额度</li>
              <li>支持 SEO 设置、推荐内容、子账号和更完整的企业展示能力</li>
              <li>适合需要品牌运营、推荐位和商业化扩展能力的企业</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="border-b border-border bg-surface py-14 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-4">
          <article className="glass-panel p-5">
            <h2 className="font-serif text-lg font-semibold text-primary">简要权益</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>新注册用户默认成为个人会员，可继续提交企业认证</li>
              <li>企业认证通过后，个人会员会自动升级为企业基础会员</li>
              <li>企业VIP会员需由管理员手动升级或后续付费升级开通</li>
              <li>不同会员等级可按权限参与资讯发布、词库贡献、标准共建与企业展示</li>
            </ul>
          </article>

          <article className="glass-panel p-5">
            <h2 className="font-serif text-lg font-semibold text-primary">联系方式</h2>
            <p className="mt-3 text-sm text-muted">优先建议电话或邮件联系，沟通后可提供企业微信二维码或进一步对接方式。</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
              <div className="grid gap-3">
                <a
                  href={`tel:${PUBLIC_CONTACT_PHONE}`}
                  className="rounded-2xl border border-border bg-white/85 px-4 py-4 transition hover:border-accent/30 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">联系电话</p>
                  <p className="mt-2 text-base font-semibold text-primary">{PUBLIC_CONTACT_PHONE}</p>
                  <p className="mt-2 text-xs text-muted">工作日 09:00-18:00，可直接拨打</p>
                </a>
                <a
                  href={`mailto:${PUBLIC_MEMBER_CONTACT_EMAIL}`}
                  className="rounded-2xl border border-border bg-white/85 px-4 py-4 transition hover:border-accent/30 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                >
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">会员咨询</p>
                  <p className="mt-2 text-base font-semibold text-primary break-all">{PUBLIC_MEMBER_CONTACT_EMAIL}</p>
                  <p className="mt-2 text-xs text-muted">适合会员注册、认证、升级咨询</p>
                </a>
                <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-4 text-sm text-muted">
                  <p className="font-medium text-primary">商务合作</p>
                  <p className="mt-2 break-all">{PUBLIC_BUSINESS_CONTACT_EMAIL}</p>
                  <p className="mt-1 text-xs text-muted">企业微信无法扫码时，可直接邮件联系获取进一步对接方式。</p>
                </div>
              </div>

              <div className="rounded-[28px] border border-border bg-white/90 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)]">
                <p className="text-xs uppercase tracking-[0.18em] text-muted">企业微信咨询</p>
                <p className="mt-2 text-sm text-primary">扫码添加企业微信，获取会员升级、企业认证与合作咨询支持。</p>
                <div className="mt-4 overflow-hidden rounded-3xl border border-border bg-white">
                  <Image
                    src="/wechat-qr.jpg"
                    alt="企业微信咨询二维码"
                    width={950}
                    height={1327}
                    className="h-auto w-full object-contain"
                  />
                </div>
                <p className="mt-3 text-xs text-muted">若扫码失败，可优先电话联系：{PUBLIC_CONTACT_PHONE}</p>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}



