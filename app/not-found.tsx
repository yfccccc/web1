import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[55vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-medium tracking-[0.3em] text-accent">404</p>
      <h1 className="mt-4 font-serif text-3xl text-primary">暂时找不到这个页面</h1>
      <p className="mt-4 leading-7 text-muted">页面可能已移动或暂未发布，您可以返回首页继续浏览。</p>
      <Link href="/" className="mt-8 rounded-full bg-primary px-7 py-3 text-sm font-medium text-white transition hover:opacity-80">
        返回首页
      </Link>
    </section>
  );
}
