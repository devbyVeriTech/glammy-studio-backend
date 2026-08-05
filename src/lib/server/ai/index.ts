import { env } from '$env/dynamic/private';

import { OpenAIProvider } from './openai';
import { MockAiProvider } from './mock';
import type { AiProvider } from './types';

const globalForProvider = globalThis as unknown as { __glammyAiProvider?: AiProvider };

function createProvider(): AiProvider {
	if (env.AI_PROVIDER === 'openai' && env.OPENAI_API_KEY) {
		return new OpenAIProvider();
	}
	return new MockAiProvider();
}

export const aiProvider: AiProvider = globalForProvider.__glammyAiProvider ?? createProvider();

if (process.env.NODE_ENV !== 'production') {
	globalForProvider.__glammyAiProvider = aiProvider;
}
