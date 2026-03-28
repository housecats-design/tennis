"use client";

import { getCurrentProfile } from "@/lib/auth";
import { updateProfileSettings } from "@/lib/users";
import { ParticipantGender, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<ParticipantGender | "">("");
  const [defaultNtrp, setDefaultNtrp] = useState("3.5");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const nextProfile = await getCurrentProfile();
      if (!nextProfile) {
        router.replace("/");
        return;
      }

      setProfile(nextProfile);
      setNickname(nextProfile.nickname);
      setGender(nextProfile.gender === "unspecified" ? "" : nextProfile.gender);
      setDefaultNtrp(typeof nextProfile.defaultNtrp === "number" ? nextProfile.defaultNtrp.toFixed(1) : "3.5");
      setLoading(false);
    };

    void load();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!profile) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const nextProfile = await updateProfileSettings(profile.id, {
        nickname,
        gender: (gender || "unspecified") as ParticipantGender,
        defaultNtrp: Number(defaultNtrp),
      });
      setProfile(nextProfile);
      setInfo("프로필 설정이 저장되었습니다.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "프로필 저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="poster-page max-w-4xl text-sm text-ink/70">프로필을 불러오는 중...</main>;
  }

  if (!profile) {
    return null;
  }

  const genderLocked = profile.gender !== "unspecified" && Boolean(profile.genderLockedAt);

  return (
    <main className="poster-page max-w-4xl">
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/" className="poster-button-secondary">메인 페이지</Link>
      </div>

      <section className="border-t border-line py-8">
        <p className="poster-label">Profile Settings</p>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.04em]">프로필 설정</h1>
        <p className="mt-4 text-sm text-ink/68">별명은 언제든 수정할 수 있고, 성별은 최초 한 번만 저장할 수 있습니다.</p>
      </section>

      <form onSubmit={handleSubmit} className="grid gap-6 border-t border-line py-8">
        <label className="grid gap-2 text-sm font-semibold">
          이름
          <input value={profile.realName} disabled className="poster-input opacity-70" />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          별명
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="poster-input" />
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          성별
          <select
            value={gender}
            onChange={(event) => setGender(event.target.value as ParticipantGender)}
            disabled={genderLocked}
            className="poster-input disabled:opacity-70"
          >
            <option value="">선택</option>
            <option value="male">남자</option>
            <option value="female">여자</option>
          </select>
          <span className="text-xs text-ink/60">You can only set your gender once. If you want to change it, contact the admin.</span>
          <span className="text-xs text-ink/60">성별은 1회만 설정할 수 있습니다. 변경이 필요하면 관리자에게 문의하세요.</span>
        </label>

        <label className="grid gap-2 text-sm font-semibold">
          기본 NTRP
          <input value={defaultNtrp} onChange={(event) => setDefaultNtrp(event.target.value)} className="poster-input" />
        </label>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {info ? <div className="border-l-2 border-accentStrong pl-4 text-sm text-accentStrong">{info}</div> : null}

        <button type="submit" disabled={submitting} className="poster-button w-fit disabled:opacity-60">
          {submitting ? "저장 중..." : "설정 저장"}
        </button>
      </form>
    </main>
  );
}
