import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { buildCategoryMetadata } from "@/lib/category-metadata";
import { getBrandDirectoryList } from "@/lib/brand-directory";
import { resolveUploadedImageUrl } from "@/lib/uploaded-image";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BRAND_COLUMN_HREF = "/brands/brand";
const BUYING_COLUMN_HREF = "/brands/buying";
const BUYING_VISUAL_IMAGE = "/images/seedance2/picture_10.jpg";

const buyingFaqs = [
  {
    question: "选整木先看什么？",
    description: "先建立对常见用材、板材体系与适用场景的基础认知，再判断是否适合自己的项目需求。",
  },
  {
    question: "哪些工艺最影响落地效果？",
    description: "重点关注表面处理、结构做法、安装配合与交付细节，避免只看展示效果。",
  },
  {
    question: "预算和风格怎么平衡？",
    description: "结合空间风格、配置深度与预算区间做判断，让选购方向更清晰、沟通更高效。",
  },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  return buildCategoryMetadata(
    "/brands",
    "整木市场",
    "整木市场首页，聚合整木品牌、品牌介绍与整木选购参考内容，帮助用户更清晰地进入品牌了解与选购方向。",
  );
}

function BrandMark({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      <Image
        src={resolveUploadedImageUrl(logoUrl)}
        alt={`${name}品牌标识`}
        width={72}
        height={72}
        className="h-14 w-14 rounded-2xl border border-[rgba(174,149,111,0.16)] bg-white object-contain p-2.5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] sm:h-[72px] sm:w-[72px]"
      />
    );
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-[rgba(174,149,111,0.26)] bg-white text-[11px] tracking-[0.14em] text-[#8d7a5a] sm:h-[72px] sm:w-[72px]">
      品牌
    </div>
  );
}

type DirectoryBrand = Awaited<ReturnType<typeof getBrandDirectoryList>>[number];

function ColumnCard({
  title,
  description,
  href,
  buttonLabel,
}: {
  title: string;
  description: string;
  href: string;
  buttonLabel: string;
}) {
  return (
    <article className="relative overflow-hidden rounded-[28px] px-5 py-6 sm:rounded-[30px] sm:px-8 sm:py-8">
      <div
        aria-hidden
        className={[
          "absolute inset-0 rounded-[28px] sm:rounded-[30px]",
          title === "整木品牌"
            ? "bg-[radial-gradient(circle_at_top_left,rgba(212,187,145,0.16),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,242,234,0.8))]"
            : "bg-[radial-gradient(circle_at_top_left,rgba(190,198,205,0.18),transparent_46%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(240,243,246,0.78))]",
        ].join(" ")}
      />
      <div className="absolute left-5 right-5 top-0 h-px bg-[rgba(27,29,33,0.08)] sm:left-8 sm:right-8" aria-hidden />
      <div className="relative">
        <p className="text-[11px] tracking-[0.18em] text-[#9d7e4d]">子栏目</p>
        <h2 className="mt-3 font-serif text-[1.8rem] leading-[1.06] text-primary sm:mt-4 sm:text-[2.35rem]">{title}</h2>
        <p className="mt-3 max-w-md text-[14px] leading-7 text-muted sm:mt-4 sm:text-base sm:leading-8">{description}</p>
        <Link href={href} className="mt-6 inline-flex items-center text-sm text-primary/78 transition hover:text-accent sm:mt-7">
          {buttonLabel}
        </Link>
      </div>
    </article>
  );
}

function BrandOverviewCard({ item }: { item: DirectoryBrand }) {
  return (
    <Link
      href={item.publicUrl}
      className="group block"
    >
      <article className="flex h-full min-h-[156px] flex-col rounded-[24px] border border-[rgba(196,182,154,0.26)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,239,231,0.9))] p-4 transition hover:border-[rgba(176,150,103,0.34)] sm:min-h-[252px] sm:rounded-[30px] sm:p-7">
        <div className="flex items-start gap-4 sm:block">
          <BrandMark name={item.enterpriseName} logoUrl={item.logoUrl} />
          <div className="min-w-0 flex-1">
            <h3 className="font-serif text-[1.2rem] leading-[1.12] text-primary transition group-hover:text-accent sm:mt-6 sm:text-[1.55rem]">
              {item.enterpriseName}
            </h3>
            <p className="mt-1 text-[12px] leading-5 text-muted sm:mt-2 sm:leading-6">{item.locationLabel}</p>
            <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-muted transition group-hover:text-primary/80 sm:mt-5 sm:text-sm sm:leading-7">
              {item.headline}
            </p>
          </div>
        </div>
        <div className="mt-4 pt-0 text-sm text-primary/70 transition group-hover:text-accent sm:mt-auto sm:pt-6">进入品牌 →</div>
      </article>
    </Link>
  );
}

export default async function BrandsPage() {
  const brands = await getBrandDirectoryList(3);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
        <nav className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-muted" aria-label="面包屑">
          <Link href="/" className="transition-colors hover:text-accent">
            首页
          </Link>
          <span>/</span>
          <span className="font-medium text-primary">整木市场</span>
        </nav>

        <section className="relative py-9 sm:py-16">
          <div
            aria-hidden
            className="absolute left-0 top-2 h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(212,187,145,0.2),transparent_72%)] blur-2xl"
          />
          <div className="relative max-w-4xl">
            <p className="text-[11px] tracking-[0.22em] text-[#9d7e4d]">栏目首页</p>
            <h1 className="mt-3 text-[1.8rem] font-semibold tracking-tight text-primary sm:mt-4 sm:text-[2.5rem]">整木市场</h1>
            <p className="mt-4 max-w-[34rem] text-[14px] leading-7 text-muted sm:mt-5 sm:text-[1rem] sm:leading-8">
              聚合整木品牌与整木选购内容，方便用户从品牌了解、产品方向和选购参考等角度进入整木市场核心内容。
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5 sm:mt-8 sm:gap-4">
              <Link
                href={BRAND_COLUMN_HREF}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[linear-gradient(180deg,rgba(176,150,103,0.96),rgba(142,118,77,0.98))] px-5 py-2.5 text-sm font-medium text-white shadow-[0_12px_30px_rgba(176,150,103,0.2)] transition hover:brightness-[1.03] sm:min-h-12 sm:px-6 sm:py-3"
              >
                进入整木品牌
              </Link>
              <Link
                href={BUYING_COLUMN_HREF}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[rgba(27,29,33,0.08)] bg-white/92 px-5 py-2.5 text-sm font-medium text-primary transition hover:border-[rgba(138,115,77,0.24)] hover:text-accent sm:min-h-12 sm:px-6 sm:py-3"
              >
                进入整木选购
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-10 hidden gap-8 sm:grid lg:grid-cols-2 lg:gap-12">
          <ColumnCard
            title="整木品牌"
            description="查看整木行业品牌展示、品牌介绍与基础资料，快速了解不同品牌的定位与方向。"
            href={BRAND_COLUMN_HREF}
            buttonLabel="了解整木品牌 →"
          />
          <ColumnCard
            title="整木选购"
            description="查看整木选购相关内容，从材料、工艺、预算、风格与落地需求等角度获取参考。"
            href={BUYING_COLUMN_HREF}
            buttonLabel="了解整木选购 →"
          />
        </section>

        {brands.length > 0 ? (
          <section className="mt-14 sm:mt-20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-serif text-[1.7rem] text-primary sm:text-[2.1rem]">品牌速览</h2>
              <Link
                href={BRAND_COLUMN_HREF}
                className="inline-flex w-fit items-center whitespace-nowrap text-sm text-primary transition hover:text-accent"
              >
                查看全部整木品牌 →
              </Link>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:mt-8 sm:gap-5 lg:grid-cols-3">
              {brands.map((item) => (
                <BrandOverviewCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-14 sm:mt-20">
          <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-[minmax(0,1fr),340px] lg:items-start lg:gap-12">
            <div>
              <div className="max-w-3xl">
                <h2 className="font-serif text-[1.7rem] text-primary sm:text-[2.1rem]">选购参考</h2>
                <p className="mt-2 hidden text-sm leading-7 text-muted sm:block sm:text-[15px]">
                  用常见问题快速建立选购判断，再进入整木选购栏目查看更具体的内容。
                </p>
              </div>

              <div className="mt-6 space-y-4 sm:mt-10 sm:space-y-5">
                {buyingFaqs.map((item) => (
                  <Link
                    key={item.question}
                    href={BUYING_COLUMN_HREF}
                    className="group block max-w-3xl border-t border-[rgba(27,29,33,0.06)] pt-5 transition sm:pt-7"
                  >
                    <article>
                      <h3 className="font-serif text-[1.2rem] leading-tight text-primary transition group-hover:text-accent sm:text-[1.3rem]">
                        {item.question}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-muted transition group-hover:text-primary/80 sm:mt-4">
                        {item.description}
                      </p>
                    </article>
                  </Link>
                ))}
              </div>

              <Link href={BUYING_COLUMN_HREF} className="mt-8 inline-block text-sm text-primary transition hover:text-accent sm:mt-10">
                查看更多整木选购问题 →
              </Link>
            </div>

            <aside className="mt-1 hidden lg:block lg:mt-0">
              <div className="overflow-hidden rounded-[28px]">
                <Image
                  src={BUYING_VISUAL_IMAGE}
                  alt="整木空间效果参考"
                  width={900}
                  height={560}
                  className="aspect-[16/10] h-auto w-full object-cover"
                />
              </div>
              <div className="mt-6 max-w-[18rem]">
                <p className="text-base leading-7 text-primary sm:text-[1.05rem]">看看真实整木空间效果</p>
                <Link
                  href={BRAND_COLUMN_HREF}
                  className="mt-4 inline-flex items-center text-sm text-primary/82 transition hover:text-accent"
                >
                  查看整木品牌 →
                </Link>
              </div>
            </aside>
          </div>
        </section>

        <section className="mt-14 border-t border-[rgba(27,29,33,0.08)] pt-8 sm:mt-20 sm:pt-10">
          <div className="max-w-3xl">
            <p className="text-sm leading-7 text-muted">
              如果你已经明确想先看品牌定位、空间表达与基础资料，可以直接进入整木品牌栏目继续浏览。
            </p>
            <Link href={BRAND_COLUMN_HREF} className="mt-5 inline-flex items-center text-base text-primary transition hover:text-accent">
              查看整木品牌 →
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
