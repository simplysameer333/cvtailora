# Provider-specific prompt modules:
#   anthropic.py  — Generator (full + section) and Anthropic evaluator prompts
#   openai.py     — OpenAI evaluator prompts
#   google.py     — Google evaluator prompts
#
# Rule: every LLM call has its prompt in the file matching its provider.
# To tune a provider's output format without affecting others, edit only that file.
