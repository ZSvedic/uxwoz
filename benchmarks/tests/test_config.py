"""Configuration and prompt sanity, offline."""
from bench import config, providers


def test_prompts_exist():
    assert config.count_tokens(config.system_prompt()) > 50
    assert "Pico" in config.system_prompt()
    for task in config.TASKS:
        assert config.task_prompt(task).strip(), task


def test_models():
    assert set(config.MODELS) == {"claude-haiku-5.5", "gpt-6-luna-fast", "gpt-6.1-sol-ultrafast"}
    assert config.DEFAULT_MODEL in config.MODELS
    for key, m in config.MODELS.items():
        assert m["reasoning_request"] and m["reasoning_note"] and m["cost_source"], key
    assert config.MODELS["gpt-6.1-sol-ultrafast"]["service_tier"] == "ultrafast"
    assert config.MODELS["gpt-6-luna-fast"]["service_tier"] == "fast"


def test_openai_cost_estimate():
    f = {"input_tokens": 1_000_000, "cached_input_tokens": 0, "output_tokens": 1_000_000}
    assert providers.openai_cost("gpt-6.1-sol-ultrafast", f) == 72.0
