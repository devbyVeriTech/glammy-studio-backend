import type { AiProvider, GeneratedImageOutput, GenerationRequest } from './types';

const MOCK_DELAY_MS = 1200;

/** Stand-in provider used when no API key is configured. Returns the source image. */
export class MockAiProvider implements AiProvider {
	readonly modelVersion = 'mock-identity-v1';

	async generate(request: GenerationRequest): Promise<GeneratedImageOutput> {
		await sleep(MOCK_DELAY_MS);
		return {
			buffer: request.sourceImage.buffer,
			mimeType: request.sourceImage.mimeType,
			extension: request.sourceImage.extension
		};
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
