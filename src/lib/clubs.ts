"use client";

import { Club, ClubMember } from "@/lib/types";

export function normalizeClubName(clubName: string): string {
  return clubName.trim();
}

export function normalizeClub(club: Partial<Club> & Pick<Club, "id" | "clubName" | "createdByUserId">): Club {
  return {
    id: club.id,
    clubName: normalizeClubName(club.clubName),
    description: club.description ?? null,
    createdByUserId: club.createdByUserId,
    createdAt: club.createdAt ?? new Date().toISOString(),
    updatedAt: club.updatedAt ?? new Date().toISOString(),
    isActive: club.isActive ?? true,
    deletedAt: club.deletedAt ?? null,
  };
}

export function normalizeClubMember(
  member: Partial<ClubMember> & Pick<ClubMember, "id" | "clubId" | "userId" | "role">,
): ClubMember {
  return {
    id: member.id,
    clubId: member.clubId,
    userId: member.userId,
    role: member.role,
    joinedAt: member.joinedAt ?? new Date().toISOString(),
    isActive: member.isActive ?? true,
    deletedAt: member.deletedAt ?? null,
  };
}
