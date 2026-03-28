"use client";

import {
  Club,
  ClubApplication,
  ClubApplicationStatus,
  ClubJoinRequest,
  ClubMember,
  ClubMembershipStatus,
  ClubRole,
} from "@/lib/types";
import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";

const CLUBS_STORAGE_KEY = "tennis-clubs";
const CLUB_MEMBERS_STORAGE_KEY = "tennis-club-members";
const CLUB_APPLICATIONS_STORAGE_KEY = "tennis-club-applications";
const CLUB_JOIN_REQUESTS_STORAGE_KEY = "tennis-club-join-requests";

export const MAX_USER_CLUBS = 5;
export const MAX_CLUB_OPERATORS = 6;

type ClubRow = {
  id: string;
  club_name: string;
  region?: string | null;
  description?: string | null;
  created_by_user_id: string;
  status?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ClubMemberRow = {
  id: string;
  club_id: string;
  user_id: string;
  role: string;
  membership_status?: string | null;
  joined_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  left_at?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
};

type ClubApplicationRow = {
  id: string;
  applicant_user_id: string;
  club_name: string;
  region: string;
  description?: string | null;
  status?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
};

type ClubJoinRequestRow = {
  id: string;
  club_id: string;
  user_id: string;
  status?: string | null;
  message?: string | null;
  requested_at?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

function shouldFallbackToLocal(error: { message?: string | null } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("relation") ||
    message.includes("column")
  );
}

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function readJson<T>(key: string): T[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, value: T[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function normalizeClubName(clubName: string): string {
  return clubName.trim().slice(0, 20);
}

export function normalizeClubRegion(region?: string | null): string | null {
  const normalized = region?.trim() ?? "";
  return normalized ? normalized.slice(0, 10) : null;
}

function normalizeClubStatus(status?: string | null): Club["status"] {
  return status === "pending" || status === "approved" || status === "rejected" || status === "inactive" || status === "archived"
    ? status
    : "active";
}

function normalizeMembershipStatus(status?: string | null): ClubMembershipStatus {
  return status === "pending" || status === "approved" || status === "rejected" || status === "left" || status === "banned"
    ? status
    : "approved";
}

function normalizeApplicationStatus(status?: string | null): ClubApplicationStatus {
  return status === "approved" || status === "rejected" ? status : "pending";
}

function normalizeJoinRequestStatus(status?: string | null): ClubJoinRequest["status"] {
  return status === "approved" || status === "rejected" || status === "cancelled" ? status : "pending";
}

function normalizeClubRole(role?: string | null): ClubRole {
  return role === "leader" || role === "vice_leader" ? role : "member";
}

export function normalizeClub(club: Partial<Club> & Pick<Club, "id" | "clubName" | "createdByUserId">): Club {
  return {
    id: club.id,
    clubName: normalizeClubName(club.clubName),
    region: normalizeClubRegion(club.region),
    description: club.description ?? null,
    createdByUserId: club.createdByUserId,
    status: normalizeClubStatus(club.status),
    approvedBy: club.approvedBy ?? null,
    approvedAt: club.approvedAt ?? null,
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
    role: normalizeClubRole(member.role),
    membershipStatus: normalizeMembershipStatus(member.membershipStatus),
    joinedAt: member.joinedAt ?? new Date().toISOString(),
    approvedBy: member.approvedBy ?? null,
    approvedAt: member.approvedAt ?? null,
    leftAt: member.leftAt ?? null,
    isActive: member.isActive ?? true,
    deletedAt: member.deletedAt ?? null,
  };
}

export function normalizeClubApplication(
  application: Partial<ClubApplication> & Pick<ClubApplication, "id" | "applicantUserId" | "clubName" | "region">,
): ClubApplication {
  return {
    id: application.id,
    applicantUserId: application.applicantUserId,
    clubName: normalizeClubName(application.clubName),
    region: normalizeClubRegion(application.region) ?? "",
    description: application.description?.trim().slice(0, 300) ?? null,
    status: normalizeApplicationStatus(application.status),
    reviewedBy: application.reviewedBy ?? null,
    reviewedAt: application.reviewedAt ?? null,
    rejectionReason: application.rejectionReason ?? null,
    createdAt: application.createdAt ?? new Date().toISOString(),
  };
}

export function normalizeClubJoinRequest(
  request: Partial<ClubJoinRequest> & Pick<ClubJoinRequest, "id" | "clubId" | "userId">,
): ClubJoinRequest {
  return {
    id: request.id,
    clubId: request.clubId,
    userId: request.userId,
    status: request.status === "approved" || request.status === "rejected" || request.status === "cancelled" ? request.status : "pending",
    message: request.message?.trim() ?? null,
    requestedAt: request.requestedAt ?? new Date().toISOString(),
    reviewedBy: request.reviewedBy ?? null,
    reviewedAt: request.reviewedAt ?? null,
  };
}

function cacheClubs(clubs: Club[]): void {
  writeJson(CLUBS_STORAGE_KEY, clubs);
}

function cacheMembers(members: ClubMember[]): void {
  writeJson(CLUB_MEMBERS_STORAGE_KEY, members);
}

function cacheApplications(applications: ClubApplication[]): void {
  writeJson(CLUB_APPLICATIONS_STORAGE_KEY, applications);
}

function cacheJoinRequests(requests: ClubJoinRequest[]): void {
  writeJson(CLUB_JOIN_REQUESTS_STORAGE_KEY, requests);
}

function loadCachedClubs(): Club[] {
  return readJson<Club>(CLUBS_STORAGE_KEY).map((club) => normalizeClub(club));
}

function loadCachedMembers(): ClubMember[] {
  return readJson<ClubMember>(CLUB_MEMBERS_STORAGE_KEY).map((member) => normalizeClubMember(member));
}

function loadCachedApplications(): ClubApplication[] {
  return readJson<ClubApplication>(CLUB_APPLICATIONS_STORAGE_KEY).map((application) => normalizeClubApplication(application));
}

function loadCachedJoinRequests(): ClubJoinRequest[] {
  return readJson<ClubJoinRequest>(CLUB_JOIN_REQUESTS_STORAGE_KEY).map((request) => normalizeClubJoinRequest(request));
}

export function isClubOperatorRole(role: ClubRole): boolean {
  return role === "leader" || role === "vice_leader";
}

export function canApproveClubJoinRequests(role: ClubRole): boolean {
  return role === "leader";
}

export function canCreateClubEvent(role: ClubRole): boolean {
  return role === "leader" || role === "vice_leader";
}

export async function listClubMembers(clubId: string): Promise<ClubMember[]> {
  if (!clubId) {
    return [];
  }

  if (!isSupabaseEnabled()) {
    return loadCachedMembers().filter((member) => member.clubId === clubId && member.deletedAt == null);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("club_members")
    .select("id, club_id, user_id, role, membership_status, joined_at, approved_by, approved_at, left_at, is_active, deleted_at")
    .eq("club_id", clubId)
    .is("deleted_at", null)
    .order("joined_at", { ascending: true });

  if (error || !Array.isArray(data)) {
    if (shouldFallbackToLocal(error)) {
      return loadCachedMembers().filter((member) => member.clubId === clubId && member.deletedAt == null);
    }
    return loadCachedMembers().filter((member) => member.clubId === clubId && member.deletedAt == null);
  }

  const members = data.map((row) =>
    normalizeClubMember({
      id: (row as ClubMemberRow).id,
      clubId: (row as ClubMemberRow).club_id,
      userId: (row as ClubMemberRow).user_id,
      role: normalizeClubRole((row as ClubMemberRow).role),
      membershipStatus: normalizeMembershipStatus((row as ClubMemberRow).membership_status),
      joinedAt: (row as ClubMemberRow).joined_at ?? new Date().toISOString(),
      approvedBy: (row as ClubMemberRow).approved_by ?? null,
      approvedAt: (row as ClubMemberRow).approved_at ?? null,
      leftAt: (row as ClubMemberRow).left_at ?? null,
      isActive: (row as ClubMemberRow).is_active ?? true,
      deletedAt: (row as ClubMemberRow).deleted_at ?? null,
    }),
  );

  const currentCached = loadCachedMembers().filter((member) => member.clubId !== clubId);
  cacheMembers([...currentCached, ...members]);
  return members;
}

export async function getClubMembership(clubId: string, userId: string): Promise<ClubMember | null> {
  const members = await listClubMembers(clubId);
  return members.find((member) => member.userId === userId && member.deletedAt == null) ?? null;
}

export async function listPendingClubJoinRequests(clubId: string): Promise<ClubJoinRequest[]> {
  if (!clubId) {
    return [];
  }

  if (!isSupabaseEnabled()) {
    return loadCachedJoinRequests().filter((request) => request.clubId === clubId && request.status === "pending");
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("club_join_requests")
    .select("id, club_id, user_id, status, message, requested_at, reviewed_by, reviewed_at")
    .eq("club_id", clubId)
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  if (error || !Array.isArray(data)) {
    if (shouldFallbackToLocal(error)) {
      return loadCachedJoinRequests().filter((request) => request.clubId === clubId && request.status === "pending");
    }
    return loadCachedJoinRequests().filter((request) => request.clubId === clubId && request.status === "pending");
  }

  const requests = data.map((row) =>
    normalizeClubJoinRequest({
      id: (row as ClubJoinRequestRow).id,
      clubId: (row as ClubJoinRequestRow).club_id,
      userId: (row as ClubJoinRequestRow).user_id,
      status: normalizeJoinRequestStatus((row as ClubJoinRequestRow).status),
      message: (row as ClubJoinRequestRow).message ?? null,
      requestedAt: (row as ClubJoinRequestRow).requested_at ?? new Date().toISOString(),
      reviewedBy: (row as ClubJoinRequestRow).reviewed_by ?? null,
      reviewedAt: (row as ClubJoinRequestRow).reviewed_at ?? null,
    }),
  );

  const currentCached = loadCachedJoinRequests().filter((request) => request.clubId !== clubId || request.status !== "pending");
  cacheJoinRequests([...currentCached, ...requests]);
  return requests;
}

export async function updateClubJoinRequestStatus(input: {
  clubId: string;
  requestId: string;
  reviewerUserId: string;
  status: "approved" | "rejected";
  rejectionReason?: string | null;
}): Promise<{ request: ClubJoinRequest; membership: ClubMember | null }> {
  const reviewerMembership = await getClubMembership(input.clubId, input.reviewerUserId);
  if (!reviewerMembership || reviewerMembership.membershipStatus !== "approved" || !canApproveClubJoinRequests(reviewerMembership.role)) {
    throw new Error("클럽 가입 요청을 승인할 권한이 없습니다.");
  }

  const pendingRequests = await listPendingClubJoinRequests(input.clubId);
  const targetRequest = pendingRequests.find((request) => request.id === input.requestId);
  if (!targetRequest) {
    throw new Error("가입 요청을 찾을 수 없습니다.");
  }

  const reviewedAt = new Date().toISOString();
  const nextRequest = normalizeClubJoinRequest({
    ...targetRequest,
    status: input.status,
    reviewedBy: input.reviewerUserId,
    reviewedAt,
  });

  let nextMembership: ClubMember | null = null;

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient();
    const { error: requestError } = await supabase!
      .from("club_join_requests")
      .update({
        status: nextRequest.status,
        reviewed_by: nextRequest.reviewedBy ?? null,
        reviewed_at: nextRequest.reviewedAt ?? null,
      })
      .eq("id", input.requestId);

    if (requestError) {
      if (shouldFallbackToLocal(requestError)) {
        cacheJoinRequests(
          loadCachedJoinRequests().map((request) => (request.id === input.requestId ? nextRequest : request)),
        );
      } else {
        throw new Error(requestError.message);
      }
    }

    if (input.status === "approved") {
      nextMembership = normalizeClubMember({
        id: makeId("club_member"),
        clubId: input.clubId,
        userId: targetRequest.userId,
        role: "member",
        membershipStatus: "approved",
        approvedBy: input.reviewerUserId,
        approvedAt: reviewedAt,
      });

      const { error: membershipError } = await supabase!.from("club_members").upsert(
        {
          id: nextMembership.id,
          club_id: nextMembership.clubId,
          user_id: nextMembership.userId,
          role: nextMembership.role,
          membership_status: nextMembership.membershipStatus,
          joined_at: nextMembership.joinedAt,
          approved_by: nextMembership.approvedBy ?? null,
          approved_at: nextMembership.approvedAt ?? null,
          left_at: null,
          is_active: true,
          deleted_at: null,
          created_at: new Date().toISOString(),
        },
        { onConflict: "club_id,user_id" },
      );

      if (membershipError) {
        if (shouldFallbackToLocal(membershipError)) {
          const existingMemberships = loadCachedMembers().filter((member) => !(member.clubId === input.clubId && member.userId === targetRequest.userId));
          cacheMembers([...existingMemberships, nextMembership]);
        } else {
          throw new Error(membershipError.message);
        }
      }
    }
  } else {
    cacheJoinRequests(
      loadCachedJoinRequests().map((request) => (request.id === input.requestId ? nextRequest : request)),
    );
    if (input.status === "approved") {
      const existingMemberships = loadCachedMembers().filter((member) => !(member.clubId === input.clubId && member.userId === targetRequest.userId));
      nextMembership = normalizeClubMember({
        id: makeId("club_member"),
        clubId: input.clubId,
        userId: targetRequest.userId,
        role: "member",
        membershipStatus: "approved",
        approvedBy: input.reviewerUserId,
        approvedAt: reviewedAt,
      });
      cacheMembers([...existingMemberships, nextMembership]);
    }
  }

  return { request: nextRequest, membership: nextMembership };
}

export async function updateClubMemberRole(input: {
  clubId: string;
  actorUserId: string;
  targetUserId: string;
  role: "vice_leader" | "member";
}): Promise<ClubMember> {
  const actorMembership = await getClubMembership(input.clubId, input.actorUserId);
  if (!actorMembership || actorMembership.membershipStatus !== "approved" || actorMembership.role !== "leader") {
    throw new Error("운영진 역할을 변경할 권한이 없습니다.");
  }

  const targetMembership = await getClubMembership(input.clubId, input.targetUserId);
  if (!targetMembership || targetMembership.membershipStatus !== "approved") {
    throw new Error("승인된 클럽 회원만 역할을 변경할 수 있습니다.");
  }

  const nextMembership = normalizeClubMember({
    ...targetMembership,
    role: input.role,
  });

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase!
      .from("club_members")
      .update({
        role: nextMembership.role,
      })
      .eq("club_id", input.clubId)
      .eq("user_id", input.targetUserId);

    if (error) {
      if (shouldFallbackToLocal(error)) {
        cacheMembers(
          loadCachedMembers().map((member) =>
            member.clubId === input.clubId && member.userId === input.targetUserId
              ? nextMembership
              : member,
          ),
        );
      } else {
        throw new Error(error.message);
      }
    }
  } else {
    cacheMembers(
      loadCachedMembers().map((member) =>
        member.clubId === input.clubId && member.userId === input.targetUserId
          ? nextMembership
          : member,
      ),
    );
  }

  return nextMembership;
}

export async function listActiveClubs(): Promise<Club[]> {
  if (!isSupabaseEnabled()) {
    return loadCachedClubs().filter((club) => club.deletedAt == null && club.status !== "rejected" && club.status !== "pending");
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("clubs")
    .select("id, club_name, region, description, created_by_user_id, status, approved_by, approved_at, is_active, deleted_at, created_at, updated_at")
    .is("deleted_at", null)
    .in("status", ["active", "approved"])
    .order("created_at", { ascending: false });

  if (error || !Array.isArray(data)) {
    if (shouldFallbackToLocal(error)) {
      return loadCachedClubs().filter((club) => club.deletedAt == null && club.status !== "rejected" && club.status !== "pending");
    }
    return loadCachedClubs().filter((club) => club.deletedAt == null && club.status !== "rejected" && club.status !== "pending");
  }

  const clubs = data.map((row) =>
    normalizeClub({
      id: (row as ClubRow).id,
      clubName: (row as ClubRow).club_name,
      region: (row as ClubRow).region ?? null,
      description: (row as ClubRow).description ?? null,
      createdByUserId: (row as ClubRow).created_by_user_id,
      status: normalizeClubStatus((row as ClubRow).status),
      approvedBy: (row as ClubRow).approved_by ?? null,
      approvedAt: (row as ClubRow).approved_at ?? null,
      isActive: (row as ClubRow).is_active ?? true,
      deletedAt: (row as ClubRow).deleted_at ?? null,
      createdAt: (row as ClubRow).created_at ?? new Date().toISOString(),
      updatedAt: (row as ClubRow).updated_at ?? new Date().toISOString(),
    }),
  );
  cacheClubs(clubs);
  return clubs;
}

export async function getClubById(clubId: string): Promise<Club | null> {
  if (!clubId) {
    return null;
  }

  const activeClubs = await listActiveClubs();
  return activeClubs.find((club) => club.id === clubId) ?? loadCachedClubs().find((club) => club.id === clubId) ?? null;
}

export async function listMyClubMemberships(userId: string): Promise<ClubMember[]> {
  if (!userId) {
    return [];
  }

  if (!isSupabaseEnabled()) {
    return loadCachedMembers().filter((member) => member.userId === userId && member.deletedAt == null);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("club_members")
    .select("id, club_id, user_id, role, membership_status, joined_at, approved_by, approved_at, left_at, is_active, deleted_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("joined_at", { ascending: false });

  if (error || !Array.isArray(data)) {
    if (shouldFallbackToLocal(error)) {
      return loadCachedMembers().filter((member) => member.userId === userId && member.deletedAt == null);
    }
    return loadCachedMembers().filter((member) => member.userId === userId && member.deletedAt == null);
  }

  const members = data.map((row) =>
    normalizeClubMember({
      id: (row as ClubMemberRow).id,
      clubId: (row as ClubMemberRow).club_id,
      userId: (row as ClubMemberRow).user_id,
      role: normalizeClubRole((row as ClubMemberRow).role),
      membershipStatus: normalizeMembershipStatus((row as ClubMemberRow).membership_status),
      joinedAt: (row as ClubMemberRow).joined_at ?? new Date().toISOString(),
      approvedBy: (row as ClubMemberRow).approved_by ?? null,
      approvedAt: (row as ClubMemberRow).approved_at ?? null,
      leftAt: (row as ClubMemberRow).left_at ?? null,
      isActive: (row as ClubMemberRow).is_active ?? true,
      deletedAt: (row as ClubMemberRow).deleted_at ?? null,
    }),
  );
  cacheMembers(members);
  return members;
}

export async function listMyClubApplications(userId: string): Promise<ClubApplication[]> {
  if (!userId) {
    return [];
  }

  if (!isSupabaseEnabled()) {
    return loadCachedApplications().filter((application) => application.applicantUserId === userId);
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("club_applications")
    .select("id, applicant_user_id, club_name, region, description, status, reviewed_by, reviewed_at, rejection_reason, created_at")
    .eq("applicant_user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !Array.isArray(data)) {
    if (shouldFallbackToLocal(error)) {
      return loadCachedApplications().filter((application) => application.applicantUserId === userId);
    }
    return loadCachedApplications().filter((application) => application.applicantUserId === userId);
  }

  const applications = data.map((row) =>
    normalizeClubApplication({
      id: (row as ClubApplicationRow).id,
      applicantUserId: (row as ClubApplicationRow).applicant_user_id,
      clubName: (row as ClubApplicationRow).club_name,
      region: (row as ClubApplicationRow).region,
      description: (row as ClubApplicationRow).description ?? null,
      status: normalizeApplicationStatus((row as ClubApplicationRow).status),
      reviewedBy: (row as ClubApplicationRow).reviewed_by ?? null,
      reviewedAt: (row as ClubApplicationRow).reviewed_at ?? null,
      rejectionReason: (row as ClubApplicationRow).rejection_reason ?? null,
      createdAt: (row as ClubApplicationRow).created_at ?? new Date().toISOString(),
    }),
  );
  cacheApplications(applications);
  return applications;
}

export async function listAllClubApplications(): Promise<ClubApplication[]> {
  if (!isSupabaseEnabled()) {
    return loadCachedApplications().sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("club_applications")
    .select("id, applicant_user_id, club_name, region, description, status, reviewed_by, reviewed_at, rejection_reason, created_at")
    .order("created_at", { ascending: false });

  if (error || !Array.isArray(data)) {
    if (shouldFallbackToLocal(error)) {
      return loadCachedApplications().sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    }
    return loadCachedApplications().sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }

  const applications = data.map((row) =>
    normalizeClubApplication({
      id: (row as ClubApplicationRow).id,
      applicantUserId: (row as ClubApplicationRow).applicant_user_id,
      clubName: (row as ClubApplicationRow).club_name,
      region: (row as ClubApplicationRow).region,
      description: (row as ClubApplicationRow).description ?? null,
      status: normalizeApplicationStatus((row as ClubApplicationRow).status),
      reviewedBy: (row as ClubApplicationRow).reviewed_by ?? null,
      reviewedAt: (row as ClubApplicationRow).reviewed_at ?? null,
      rejectionReason: (row as ClubApplicationRow).rejection_reason ?? null,
      createdAt: (row as ClubApplicationRow).created_at ?? new Date().toISOString(),
    }),
  );
  cacheApplications(applications);
  return applications;
}

export async function reviewClubApplication(input: {
  applicationId: string;
  reviewerUserId: string;
  status: "approved" | "rejected";
  rejectionReason?: string | null;
}): Promise<{ application: ClubApplication; createdClub: Club | null }> {
  const applications = await listAllClubApplications();
  const target = applications.find((application) => application.id === input.applicationId);
  if (!target) {
    throw new Error("클럽 신청을 찾을 수 없습니다.");
  }

  const reviewedAt = new Date().toISOString();
  const nextApplication = normalizeClubApplication({
    ...target,
    status: input.status,
    reviewedBy: input.reviewerUserId,
    reviewedAt,
    rejectionReason: input.status === "rejected" ? input.rejectionReason ?? null : null,
  });

  let createdClub: Club | null = null;

  if (input.status === "approved") {
    createdClub = normalizeClub({
      id: `club_${crypto.randomUUID().slice(0, 8)}`,
      clubName: target.clubName,
      region: target.region,
      description: target.description ?? null,
      createdByUserId: target.applicantUserId,
      status: "approved",
      approvedBy: input.reviewerUserId,
      approvedAt: reviewedAt,
      isActive: true,
    });
  }

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase!
      .from("club_applications")
      .update({
        status: nextApplication.status,
        reviewed_by: nextApplication.reviewedBy ?? null,
        reviewed_at: nextApplication.reviewedAt ?? null,
        rejection_reason: nextApplication.rejectionReason ?? null,
      })
      .eq("id", input.applicationId);

    if (updateError) {
      if (!shouldFallbackToLocal(updateError)) {
        throw new Error(updateError.message);
      }
    }

    if (createdClub) {
      const { error: insertClubError } = await supabase!.from("clubs").insert({
        id: createdClub.id,
        club_name: createdClub.clubName,
        region: createdClub.region ?? null,
        description: createdClub.description ?? null,
        created_by_user_id: createdClub.createdByUserId,
        status: createdClub.status ?? "approved",
        approved_by: createdClub.approvedBy ?? null,
        approved_at: createdClub.approvedAt ?? null,
        is_active: true,
        deleted_at: null,
        created_at: createdClub.createdAt,
        updated_at: createdClub.updatedAt,
      });

      if (insertClubError) {
        if (!shouldFallbackToLocal(insertClubError)) {
          throw new Error(insertClubError.message);
        }
      } else {
        const leaderMembership = normalizeClubMember({
          id: makeId("club_member"),
          clubId: createdClub.id,
          userId: target.applicantUserId,
          role: "leader",
          membershipStatus: "approved",
          approvedBy: input.reviewerUserId,
          approvedAt: reviewedAt,
        });
        await supabase!.from("club_members").upsert(
          {
            id: leaderMembership.id,
            club_id: leaderMembership.clubId,
            user_id: leaderMembership.userId,
            role: leaderMembership.role,
            membership_status: leaderMembership.membershipStatus,
            joined_at: leaderMembership.joinedAt,
            approved_by: leaderMembership.approvedBy ?? null,
            approved_at: leaderMembership.approvedAt ?? null,
            left_at: null,
            is_active: true,
            deleted_at: null,
            created_at: new Date().toISOString(),
          },
          { onConflict: "club_id,user_id" },
        );
      }
    }
  }

  const cachedApplications = loadCachedApplications().map((application) =>
    application.id === input.applicationId ? nextApplication : application,
  );
  cacheApplications(cachedApplications);

  if (createdClub) {
    const currentClubs = loadCachedClubs().filter((club) => club.id !== createdClub.id);
    cacheClubs([createdClub, ...currentClubs]);
    const leaderMembership = normalizeClubMember({
      id: makeId("club_member"),
      clubId: createdClub.id,
      userId: target.applicantUserId,
      role: "leader",
      membershipStatus: "approved",
      approvedBy: input.reviewerUserId,
      approvedAt: reviewedAt,
    });
    const currentMembers = loadCachedMembers().filter(
      (member) => !(member.clubId === createdClub.id && member.userId === target.applicantUserId),
    );
    cacheMembers([leaderMembership, ...currentMembers]);
  }

  return { application: nextApplication, createdClub };
}

export async function getPendingJoinRequest(clubId: string, userId: string): Promise<ClubJoinRequest | null> {
  if (!clubId || !userId) {
    return null;
  }

  if (!isSupabaseEnabled()) {
    return loadCachedJoinRequests().find((request) => request.clubId === clubId && request.userId === userId && request.status === "pending") ?? null;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase!
    .from("club_join_requests")
    .select("id, club_id, user_id, status, message, requested_at, reviewed_by, reviewed_at")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .in("status", ["pending", "approved"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (shouldFallbackToLocal(error)) {
      return loadCachedJoinRequests().find((request) => request.clubId === clubId && request.userId === userId && (request.status === "pending" || request.status === "approved")) ?? null;
    }
    return loadCachedJoinRequests().find((request) => request.clubId === clubId && request.userId === userId && (request.status === "pending" || request.status === "approved")) ?? null;
  }

  return normalizeClubJoinRequest({
    id: (data as ClubJoinRequestRow).id,
    clubId: (data as ClubJoinRequestRow).club_id,
    userId: (data as ClubJoinRequestRow).user_id,
    status: normalizeJoinRequestStatus((data as ClubJoinRequestRow).status),
    message: (data as ClubJoinRequestRow).message ?? null,
    requestedAt: (data as ClubJoinRequestRow).requested_at ?? new Date().toISOString(),
    reviewedBy: (data as ClubJoinRequestRow).reviewed_by ?? null,
    reviewedAt: (data as ClubJoinRequestRow).reviewed_at ?? null,
  });
}

export async function submitClubApplication(input: {
  applicantUserId: string;
  clubName: string;
  region: string;
  description?: string | null;
}): Promise<ClubApplication> {
  const normalized = normalizeClubApplication({
    id: makeId("club_app"),
    applicantUserId: input.applicantUserId,
    clubName: input.clubName,
    region: input.region,
    description: input.description ?? null,
    status: "pending",
  });

  if (!normalized.clubName) {
    throw new Error("클럽 이름을 입력해 주세요.");
  }
  if (!normalized.region) {
    throw new Error("지역을 입력해 주세요.");
  }

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase!.from("club_applications").insert({
      id: normalized.id,
      applicant_user_id: normalized.applicantUserId,
      club_name: normalized.clubName,
      region: normalized.region,
      description: normalized.description ?? null,
      status: normalized.status,
      created_at: normalized.createdAt,
    });
    if (error) {
      if (shouldFallbackToLocal(error)) {
        cacheApplications([normalized, ...loadCachedApplications()]);
      } else {
        throw new Error(error.message);
      }
    }
  } else {
    cacheApplications([normalized, ...loadCachedApplications()]);
  }

  return normalized;
}

export async function submitClubJoinRequest(input: {
  clubId: string;
  userId: string;
  message?: string | null;
}): Promise<ClubJoinRequest> {
  const memberships = await listMyClubMemberships(input.userId);
  const approvedMembershipCount = memberships.filter(
    (membership) => membership.membershipStatus === "approved" && membership.deletedAt == null && membership.leftAt == null,
  ).length;

  if (approvedMembershipCount >= MAX_USER_CLUBS) {
    throw new Error("한 사용자는 최대 5개의 클럽에만 가입할 수 있습니다.");
  }

  const existingMembership = memberships.find((membership) => membership.clubId === input.clubId && membership.membershipStatus === "approved");
  if (existingMembership) {
    throw new Error("이미 가입한 클럽입니다.");
  }

  const existingRequest = await getPendingJoinRequest(input.clubId, input.userId);
  if (existingRequest && existingRequest.status === "pending") {
    throw new Error("이미 가입 신청을 보낸 클럽입니다.");
  }

  const nextRequest = normalizeClubJoinRequest({
    id: makeId("club_join"),
    clubId: input.clubId,
    userId: input.userId,
    status: "pending",
    message: input.message ?? null,
  });

  if (isSupabaseEnabled()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase!.from("club_join_requests").insert({
      id: nextRequest.id,
      club_id: nextRequest.clubId,
      user_id: nextRequest.userId,
      status: nextRequest.status,
      message: nextRequest.message ?? null,
      requested_at: nextRequest.requestedAt,
    });
    if (error) {
      if (shouldFallbackToLocal(error)) {
        cacheJoinRequests([nextRequest, ...loadCachedJoinRequests()]);
      } else {
        throw new Error(error.message);
      }
    }
  } else {
    cacheJoinRequests([nextRequest, ...loadCachedJoinRequests()]);
  }

  return nextRequest;
}
