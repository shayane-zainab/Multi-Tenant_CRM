export { type Auth, auth, type Session, type SessionUser } from "./auth";
export { AUTH_COOKIE_PREFIX } from "./cookies";
export { isGoogleConfigured } from "./env";
export {
	canChangeRole,
	canManageCurrency,
	canManageWhatsApp,
	canRenameWorkspace,
	DEFAULT_WORKSPACE_NAME,
	isWorkspaceAdmin,
	isWorkspaceRole,
	WORKSPACE_ROLES,
	type WorkspaceRole,
} from "./organization";
export {
	CALENDAR_SCOPE,
	GMAIL_SCOPE,
	GOOGLE_PROVIDER_ID,
	hasSyncScopes,
	IDENTITY_SCOPES,
	needsGoogleGrant,
	parseScopes,
	REQUIRED_SCOPES,
	type SignInAccount,
	SYNC_SCOPES,
	signsInWithGoogle,
} from "./scopes";
export { onSignedIn, type SignedInHandler } from "./signed-in";
export {
	canConfigureSso,
	ssoCallbackBase,
	ssoCallbackURL,
	ssoProviderName,
} from "./sso";
