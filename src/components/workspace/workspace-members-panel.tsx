"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  status: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  userStatus: string;
  invitedBy: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type WorkspaceMembersPanelProps = {
  workspaceId: string;
  canManage: boolean;
  members: WorkspaceMember[];
};

const roleOptions = [
  { label: "Admin", value: "admin" },
  { label: "Editor", value: "editor" },
  { label: "Viewer", value: "viewer" },
] as const;

export function WorkspaceMembersPanel({ workspaceId, canManage, members }: WorkspaceMembersPanelProps) {
  const router = useRouter();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof roleOptions)[number]["value"]>("viewer");
  const [isInviting, setIsInviting] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  async function inviteMember() {
    if (!inviteEmail.trim()) {
      toast.error("请输入要邀请的成员邮箱。");

      return;
    }

    setIsInviting(true);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "邀请成员失败。");
      }

      setInviteEmail("");
      setInviteRole("viewer");
      toast.success("成员邀请成功。");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "邀请成员失败。");
    } finally {
      setIsInviting(false);
    }
  }

  async function updateRole(memberId: string, role: string) {
    setUpdatingMemberId(memberId);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ role }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "修改角色失败。");
      }

      toast.success("成员角色已更新。");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "修改角色失败。");
    } finally {
      setUpdatingMemberId(null);
    }
  }

  async function removeMember(memberId: string) {
    setRemovingMemberId(memberId);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
        method: "DELETE",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "移除成员失败。");
      }

      toast.success("成员已移除。");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除成员失败。");
    } finally {
      setRemovingMemberId(null);
    }
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        <div className="rounded-2xl border bg-background p-4">
          <div className="mb-4 space-y-1">
            <p className="font-medium">邀请成员</p>
            <p className="text-sm text-muted-foreground">目前邀请对象必须已在平台注册账号。</p>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.6fr_0.8fr_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="member-email">成员邮箱</Label>
              <Input
                id="member-email"
                placeholder="member@canvas.local"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-role">角色</Label>
              <select
                className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
                id="member-role"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as typeof inviteRole)}
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <Button disabled={isInviting} type="button" onClick={inviteMember}>
              {isInviting ? "邀请中..." : "邀请成员"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          你当前只有查看权限，可浏览成员列表，但不能邀请成员或修改角色。
        </div>
      )}

      <div className="space-y-3">
        {members.map((member) => {
          const isOwner = member.role === "owner";
          const isRemoved = member.status === "removed";

          return (
            <div key={member.id} className="rounded-2xl border bg-muted/20 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{member.name ?? member.email}</Badge>
                    <Badge variant="outline">{member.role}</Badge>
                    <Badge variant={isRemoved ? "destructive" : "ghost"}>{member.status}</Badge>
                    <Badge variant="outline">{member.userStatus}</Badge>
                  </div>
                  <div>
                    <p className="font-medium">{member.email}</p>
                    <p className="text-sm text-muted-foreground">用户 ID：{member.userId}</p>
                  </div>
                </div>

                {canManage && !isOwner ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="flex h-8 min-w-28 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring"
                      defaultValue={member.role}
                      disabled={isRemoved || updatingMemberId === member.id}
                      onChange={(event) => updateRole(member.id, event.target.value)}
                    >
                      {roleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      disabled={isRemoved || removingMemberId === member.id}
                      size="sm"
                      type="button"
                      variant="destructive"
                      onClick={() => removeMember(member.id)}
                    >
                      {removingMemberId === member.id ? "移除中..." : "移除"}
                    </Button>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {isOwner ? "Owner 角色固定，不可修改或移除。" : "当前角色无成员管理权限。"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
