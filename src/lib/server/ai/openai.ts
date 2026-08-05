import OpenAI from 'openai';
import { env } from '$env/dynamic/private';

import type { AiProvider, GeneratedImageOutput, GenerationRequest } from './types';

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 75; // ~2.5 min ceiling
const OUTPUT_SIZE = '1024x1024';

const MIME_TO_EXTENSION: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp'
};

/**
 * OpenAI image generation via the Responses API `image_generation` tool.
 * The create call returns a response id; the result image is delivered
 * through an `image_generation_call` output item, so we poll until it
 * completes.
 */
export class OpenAIProvider implements AiProvider {
	readonly modelVersion: string;
	private readonly client: OpenAI;
	private readonly model: string;

	constructor() {
		const key = env.OPENAI_API_KEY;
		if (!key) throw new Error('OPENAI_API_KEY is not set.');
		this.model = env.OPENAI_MODEL ?? 'gpt-image-2';
		this.modelVersion = `openai-${this.model}`;
		this.client = new OpenAI({ apiKey: key });
	}

	async generate(request: GenerationRequest): Promise<GeneratedImageOutput> {
		const dataUrl = `data:${request.sourceImage.mimeType};base64,${request.sourceImage.buffer.toString(
			'base64'
		)}`;

		const response = await this.client.responses.create({
			model: this.model,
			input: [
				{
					type: 'message',
					role: 'user',
					content: [
						{ type: 'input_image', image_url: dataUrl, detail: 'high' },
						{ type: 'input_text', text: request.prompt }
					]
				}
			],
			tools: [
				{
					type: 'image_generation',
					action: 'edit',
					size: OUTPUT_SIZE,
					output_format: 'png',
					quality: 'high'
				}
			]
		});

		const result = await this.pollForResult(response.id);
		return {
			buffer: Buffer.from(result.result, 'base64'),
			mimeType: 'image/png',
			extension: MIME_TO_EXTENSION['image/png']
		};
	}

	private async pollForResult(responseId: string): Promise<{ result: string }> {
		let current = await this.client.responses.retrieve(responseId);

		for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
			const call = this.findImageCall(current);
			if (call && call.status === 'completed' && call.result) {
				return { result: call.result };
			}
			if (call && call.status === 'failed') {
				throw new Error('The AI provider reported that image generation failed.');
			}
			await sleep(POLL_INTERVAL_MS);
			current = await this.client.responses.retrieve(responseId);
		}

		throw new Error('The AI provider timed out while generating the image.');
	}

	private findImageCall(
		response: OpenAI.Responses.Response
	): { status: string; result: string | null } | null {
		for (const item of response.output) {
			if (item.type === 'image_generation_call') {
				return { status: item.status, result: item.result };
			}
		}
		return null;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
