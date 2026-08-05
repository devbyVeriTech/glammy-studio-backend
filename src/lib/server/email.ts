import { env } from '$env/dynamic/private';

export type ResetEmailPayload = {
	to: string;
	resetLink: string;
};

/**
 * Email delivery interface. For MVP the "mailer" only logs reset links so the
 * flow can be tested without a real SMTP/email provider.
 */
export async function sendPasswordResetEmail(payload: ResetEmailPayload): Promise<void> {
	if (env.NODE_ENV !== 'production') {
		console.log(`[mailer:dev] Password reset for ${payload.to}: ${payload.resetLink}`);
		return;
	}
	throw new Error('No production email provider configured yet.');
}
