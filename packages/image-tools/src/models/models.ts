/** A model that `generate` can render with, as mflux names and loads it. */
export interface ImageModel {
  /** The id that `--model` takes. */
  readonly id: string;
  /** The licence under which the model's weights are published. */
  readonly licence: { readonly name: string; readonly url: string };
  /** The Hugging Face repository that mflux loads, which mflux calls the model's `model_name`. */
  readonly modelName: string;
  /** The most reference images that the model's edit variant takes, or 0 when the model lacks one. */
  readonly maxReferences: number;
}

/** The model that `generate` renders with when `--model` is absent. */
export const DEFAULT_MODEL_ID = 'qwen-image-2.1-turbo';

/** The models that `generate` can render with, by `--model` id. */
export const MODELS: readonly ImageModel[] = [
  {
    id: 'qwen-image-2.1-turbo',
    licence: { name: 'Qwen Research License', url: 'https://huggingface.co/Qwen/Qwen-Image-2.1-Turbo' },
    modelName: 'Qwen/Qwen-Image-2.1-Turbo',
    maxReferences: 10,
  },
  {
    id: 'z-image-turbo',
    licence: { name: 'Apache-2.0', url: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo' },
    modelName: 'Tongyi-MAI/Z-Image-Turbo',
    maxReferences: 0,
  },
];

/** The `--model` ids, in the order in which help lists them. */
export const MODEL_IDS = MODELS.map(({ id }) => id);
