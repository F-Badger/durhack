import os
import requests


class AIService:

    def __init__(self):
        self.api_key = os.getenv('OPENROUTER_API_KEY')
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"

    def evaluate_action(self, username: str, action: str) -> dict:
        prompt = f"""You are an environmental impact evaluator for a planet-saving game.

Player "{username}" took this action: "{action}"

Evaluate this action and provide:
1. A score from -50 to +50 (negative = harmful, positive = helpful for the planet)
2. A short story snippet (2-3 sentences) describing the environmental impact

Respond in JSON format:
{{
    "score": <number>,
    "story": "<story text>"
}}"""

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": "meta-llama/llama-3.1-8b-instruct:free",  # Free model
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        }

        try:
            response = requests.post(
                self.base_url,
                headers=headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()

            result = response.json()
            content = result['choices'][0]['message']['content']

            import json
            try:
                parsed = json.loads(content)
                return {
                    'score': parsed.get('score', 0),
                    'story': parsed.get('story', content)
                }
            except json.JSONDecodeError:
                # If not JSON, return raw content as story
                return {
                    'score': 0,
                    'story': content
                }

        except requests.exceptions.RequestException as e:
            print(f"Error calling OpenRouter API: {e}")
            return {
                'score': 0,
                'story': f"Error evaluating action: {str(e)}"
            }

ai_service = AIService()