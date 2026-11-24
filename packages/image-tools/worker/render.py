"""Renders the jobs of one thor-image worker request with mflux.

Reads one request as JSON on stdin: the thor-image model id, the variant (txt2img or edit), the reference images, and
the jobs. Loads the model once, renders and saves each job, and writes one JSON event per line to stdout: started,
then rendered per job, or failed for the job that raised. Everything else, mflux's own output included, goes to
stderr. thor-image has validated the request, so the worker does not.
"""

import contextlib
import importlib.metadata
import json
import sys
import traceback

EVENTS = sys.stdout


def main() -> int:
    """Renders every job of the request on stdin, returning the process's exit code."""
    request = json.load(sys.stdin)
    emit({"event": "started", "mfluxVersion": importlib.metadata.version("mflux")})
    with contextlib.redirect_stdout(sys.stderr):
        render = load_renderer(request["model"], request["variant"], request["references"])
    for index, job in enumerate(request["jobs"]):
        try:
            with contextlib.redirect_stdout(sys.stderr):
                image = render(job)
                image.save(path=job["output"], overwrite=True)
        except Exception as error:  # noqa: BLE001 -- every failure is reported as the job's event.
            traceback.print_exc(file=sys.stderr)
            emit({"event": "failed", "index": index, "message": str(error) or type(error).__name__})
            return 1
        emit({"event": "rendered", "index": index, "width": image.width, "height": image.height, "steps": image.steps})
    return 0


def emit(event: dict) -> None:
    """Writes one event line to the event stream."""
    EVENTS.write(json.dumps(event) + "\n")
    EVENTS.flush()


def load_renderer(model_id: str, variant: str, references: list):
    """Loads the model variant once and returns a function that renders one job with it."""
    from mflux.models.common.config.model_config import ModelConfig

    if model_id == "z-image-turbo":
        from mflux.models.z_image.variants.z_image import ZImage

        model = ZImage(model_config=ModelConfig.z_image_turbo())
        return lambda job: model.generate_image(
            seed=job["seed"], prompt=job["prompt"], width=job["width"], height=job["height"]
        )
    config = ModelConfig.qwen_image_21_turbo()
    if variant == "edit":
        from mflux.models.qwen21.variants.edit.qwen_image_21_edit import QwenImage21Edit

        model = QwenImage21Edit(model_config=config)
        return lambda job: model.generate_image(
            seed=job["seed"],
            prompt=job["prompt"],
            negative_prompt=job["negativePrompt"],
            width=job["width"],
            height=job["height"],
            image_paths=references,
        )
    from mflux.models.qwen21.variants.txt2img.qwen_image_21 import QwenImage21

    model = QwenImage21(model_config=config)
    return lambda job: model.generate_image(
        seed=job["seed"],
        prompt=job["prompt"],
        negative_prompt=job["negativePrompt"],
        width=job["width"],
        height=job["height"],
    )


if __name__ == "__main__":
    sys.exit(main())
