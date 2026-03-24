"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AuthFormProps = {
  mode: "login" | "register";
};

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? ""),
    };

    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(mode === "register" ? payload : { email: payload.email, password: payload.password }),
    });
    const result = await response.json();

    if (!response.ok) {
      setErrorMessage(result?.error?.message ?? "请求失败，请稍后重试。");
      setIsSubmitting(false);

      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-2">
        <CardTitle>{mode === "login" ? "登录 Canvas" : "创建 Canvas 账号"}</CardTitle>
        <CardDescription>
          {mode === "login" ? "登录后进入工作台并切换你的 personal / team workspace。" : "注册后会自动创建个人空间，并写入当前登录会话。"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {mode === "register" ? (
            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input id="name" name="name" placeholder="例如：HJR" required />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input id="email" name="email" placeholder="you@canvas.local" required type="email" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input id="password" name="password" minLength={8} placeholder="至少 8 位密码" required type="password" />
          </div>

          {errorMessage ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "提交中..." : mode === "login" ? "登录" : "注册并进入工作台"}
          </Button>
        </form>

        <div className="mt-4 text-sm text-muted-foreground">
          {mode === "login" ? "还没有账号？" : "已经有账号？"}{" "}
          <Link className="font-medium text-foreground underline underline-offset-4" href={mode === "login" ? "/register" : "/login"}>
            {mode === "login" ? "去注册" : "去登录"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
