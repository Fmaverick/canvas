import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { Badge } from "@/components/ui/badge";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-8 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <section className="max-w-2xl space-y-5">
          <Badge>注册</Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">创建账号并自动获得个人空间</h1>
            <p className="text-base leading-7 text-muted-foreground sm:text-lg">
              注册成功后会自动创建 personal workspace，并立即进入工作台，你可以再扩展 team workspace 和成员协作。
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Link className="font-medium text-foreground underline underline-offset-4" href="/">
              返回首页
            </Link>
            <Link className="font-medium text-foreground underline underline-offset-4" href="/login">
              已有账号？去登录
            </Link>
          </div>
        </section>

        <AuthForm mode="register" />
      </div>
    </main>
  );
}
