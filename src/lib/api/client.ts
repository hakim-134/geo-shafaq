// The API client, typed from api-geo-shafaq/api/openapi.yaml (`npm run gen`).
import createClient from 'openapi-fetch';
import type { components, paths } from './schema';
import { apiUrl } from '#lib/config.js';

export type Schemas = components['schemas'];
export type MapSummary = Schemas['MapSummary'];
export type Game = Schemas['Game'];
export type Round = Schemas['Round'];
export type RoundResult = Schemas['RoundResult'];
export type Rules = Schemas['Rules'];
export type Hint = Schemas['Hint'];
export type LatLon = Schemas['LatLon'];
export type Text = Schemas['Text'];
export type Me = Schemas['Me'];
export type PanoView = Schemas['PanoView'];
export type GameListItem = Schemas['GameListItem'];
export type Profile = Schemas['Profile'];
export type PublicUser = Schemas['PublicUser'];
export type AppConfig = Schemas['AppConfig'];
export type AuthResult = Schemas['AuthResult'];
export type MergeOffer = Schemas['MergeOffer'];
export type Identity = Schemas['Identity'];
export type RoomState = Schemas['RoomState'];
export type RoomPlayer = Schemas['RoomPlayer'];
export type RoomResult = Schemas['RoomResult'];

let client: ReturnType<typeof createClient<paths>> | null = null;

/** The client, created on first use (it needs `location` for the API address). */
export function api() {
	client ??= createClient<paths>({ baseUrl: apiUrl(), credentials: 'include' });
	return client;
}

/** An error from the API: `code` is stable (no_session, wrong_phase, …), or "network". */
export class ApiError extends Error {
	constructor(
		public code: string,
		public status: number
	) {
		super(code);
	}
}

/** Unwraps an openapi-fetch answer: the data, or an ApiError. */
export async function call<T>(
	p: Promise<{ data?: T; error?: unknown; response: Response }>
): Promise<T> {
	let res;
	try {
		res = await p;
	} catch {
		throw new ApiError('network', 0);
	}
	if (res.error !== undefined || res.data === undefined) {
		const code = (res.error as { code?: string } | undefined)?.code ?? 'internal';
		throw new ApiError(code, res.response.status);
	}
	return res.data;
}

/** Like call, for answers without a body (204). */
export async function send(p: Promise<{ error?: unknown; response: Response }>): Promise<void> {
	let res;
	try {
		res = await p;
	} catch {
		throw new ApiError('network', 0);
	}
	if (res.error !== undefined || !res.response.ok) {
		const code = (res.error as { code?: string } | undefined)?.code ?? 'internal';
		throw new ApiError(code, res.response.status);
	}
}
