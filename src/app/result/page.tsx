"use client";

import { loadLastEvent } from "@/lib/storage";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ResultPage() {
  const router = useRouter();

  useEffect(() => {
    const lastEvent = loadLastEvent();
    if (lastEvent) {
      router.replace(`/host/event/${lastEvent}`);
      return;
    }

    router.replace("/host");
  }, [router]);

  return null;
}
