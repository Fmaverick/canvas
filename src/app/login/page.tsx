import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { Badge } from "@/components/ui/badge";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <section className="max-w-2xl space-y-5">
          <Badge>登录</Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">进入多空间协作工作台</h1>
            <p className="text-base leading-7 text-muted-foreground sm:text-lg">
              登录后即可查看个人空间、团队空间、当前角色，以及文本、图片、视频任务的最新执行状态。
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link className="font-medium text-foreground underline underline-offset-4" href="/">
              返回首页
            </Link>
            <Link className="font-medium text-foreground underline underline-offset-4" href="/register">
              还没有账号？立即注册
            </Link>
          </div>
        </section>

        <AuthForm mode="login" />
      </div>
    </main>
  );
}
