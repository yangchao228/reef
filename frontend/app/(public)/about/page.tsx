export default function AboutPage() {
  return (
    <section className="px-5 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-4xl rounded-[32px] border border-border bg-bg-card p-6 sm:p-10">
        <p className="text-[11px] uppercase tracking-[0.24em] text-t4">About Reef</p>
        <h1 className="mt-2 text-4xl text-t1">关于这个系统</h1>
        <div className="mt-6 space-y-5 text-base leading-8 text-t2">
          <p>
            Reef 不是平台分发页，而是一个围绕 GitHub 仓库组织内容、同步记录和互动数据的个人数字系统。
          </p>
          <p>
            这次首版先以纯 Next.js 方式实现前台结构，目的是尽快把路由、信息架构和界面气质稳定下来。
          </p>
          <p>
            后续阶段会把 GitHub Webhook、Supabase、Redis、管理员登录和评论审核逐步换成正式实现。
          </p>
        </div>
      </div>
    </section>
  );
}
