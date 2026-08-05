export type SourceImageInput = {
	buffer: Buffer;
	mimeType: string;
	extension: string;
};

export type GenerationRequest = {
	prompt: string;
	category: string;
	sourceImage: SourceImageInput;
};

export type GeneratedImageOutput = {
	buffer: Buffer;
	mimeType: string;
	extension: string;
};

export interface AiProvider {
	/** Human-readable model version used in cache keys (e.g. "openai-gpt-image-2"). */
	readonly modelVersion: string;
	/** Generate a single result image for the request. Throws on provider failure. */
	generate(request: GenerationRequest): Promise<GeneratedImageOutput>;
}
