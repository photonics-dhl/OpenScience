export { WorkspaceError, type WorkspaceErrorCode } from './workspace/errors';
export { now, type WorkspaceDeps } from './workspace/types';
export { createPersonalWorkspace, type PersonalWorkspaceUser } from './workspace/personal';
export {
  createTeamWorkspace,
  getWorkspace,
  listMyWorkspaces,
  updateWorkspace,
  archiveWorkspace,
  type WorkspaceDetail,
  type WorkspaceSummary,
} from './workspace/workspaces';
export {
  changeMemberRole,
  leaveWorkspace,
  listMembers,
  removeMember,
  transferOwnership,
  type MemberInfo,
} from './workspace/members';
export {
  acceptInvitation,
  declineInvitation,
  inviteMember,
  listMyInvitations,
  revokeInvitation,
  INVITATION_TTL_MS,
  type AcceptResult,
  type InvitationInfo,
} from './workspace/invitations';
export { can, requireAction, ROLE_PERMISSIONS, WORKSPACE_ACTIONS, type WorkspaceAction } from './workspace/permissions';
