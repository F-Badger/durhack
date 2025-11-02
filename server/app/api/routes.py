from flask import jsonify, request, Blueprint
import json
import os
from google import genai

api = Blueprint('api', __name__, url_prefix="/api")

@api.route('/test')
def test():
    return {'message': 'qwerty'}

@api.route("first-message", methods=['POST'])
def first_message():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400

    username = data.get('username')

    # --- Start of Try Block ---
    try:
        # Initialize client (this might fail if the key isn't found/loaded correctly)
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
             # Explicitly handle missing key right away
             return jsonify({'error': 'GEMINI_API_KEY is not set in environment.'}), 500

        client = genai.Client(api_key=api_key)

        system_prompt = f"""You are a vivid, empathetic storytelling AI. The reader has name {username} use this name to address them,
        write an opening story of at least five sentences that begins in a world of ruins produced by human actions.
        Address the reader by inserting the username into the text at least once.
        Include specific, plausible causes and facts about how the world reached this state—mention rising global
        temperatures and extreme weather driven by carbon emissions, sea-level rise, deforestation and soil erosion,
        industrial agriculture and monocultures, plastic pollution and microplastics in oceans and food,
        ocean acidification and collapsing fisheries, species extinctions, air pollution and contaminated rivers,
        and resource depletion—without turning the story into a list Output only the story text.
        Leave the reader a question about how they will act now to prevent this future from occuring?
        Imagine and set the story to be in the year 2100.
        Output no extra metadata, lists, instructions, or explanation, with no leading or trailing whitespace and just the text.
        """

        # API Call - This is the most likely place for an external exception
        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=system_prompt
        )

        ai_response = response.text
       # print(f"AI Response: {ai_response}") # Print for server debugging

        ai_response = ai_response.strip()
        # Successful Return
        return jsonify({
            "story": ai_response
        }), 200

    # --- Exception Handling ---
    except:
        # Catches errors specific to the Gemini API (e.g., key error, bad request)
        return jsonify({'error': 'Gemini API call failed',}), 500

    
@api.route('/submit-action', methods=['POST'])
def submit_action():
    """
    Receive user action and return AI-generated story and score.

    Expected JSON body:
    {
        "username": "player_name",
        "action": "action description"
    }

    Returns:
    {
        "score": <number>,
        "story": "<story text>",
        "username": "player_name",
        "action": "action description"
    }
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400

    username = data.get('username')
    action = data.get('action')
    previous_context = data.get('previouscontext')

    if not username or not action:
        return jsonify({'error': 'Missing username or action'}), 400

    client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))


    system_prompt = """You are the AI judge for "Planet Saver" - a game where player actions determine Earth's fate.
    
    Evaluate the environmental impact:
    
    SCORING GUIDE:
    +40 to +50: Major positive (renewable energy, veganism, reforestation)
    +20 to +40: Good actions (cycling, composting, reducing waste)
    +5 to +20: Small positive (recycling, shorter showers, LED bulbs)
    -5 to +5: Neutral/minimal impact
    -20 to -5: Small negative (occasional meat, short flights)
    -40 to -20: Bad actions (SUV purchase, excessive consumption)
    -50 to -40: Terrible (deforestation, heavy pollution, coal rolling)
    
    STORY RULES:
    - 2-3 sentences maximum
    - Be dramatic and educational
    - Mention specific impacts (CO2, wildlife, air quality, resources)
    - Make consequences feel real
    - Include numbers when relevant (tons of CO2, trees saved, etc.)
    - End it asking what else they can do
    
    OUTPUT FORMAT (JSON only, no markdown, no code blocks):
    {
        "score": <number between -50 and +50>,
        "story": "<compelling 2-3 sentence environmental impact story>"
    }"""

    # Build messages for conversation
    current_prompt = f'Player "{username}" action: "{action}"\n\nEvaluate this action and respond with JSON only.'

    # If there's previous context, include it
    full_prompt = system_prompt + "\n\n"
    if previous_context and isinstance(previous_context, list):
        full_prompt += "Previous conversation:\n"
        for msg in previous_context:
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            full_prompt += f"{role}: {content}\n"
        full_prompt += "\n"

    full_prompt += current_prompt

    response = client.models.generate_content(
        model="gemini-2.0-flash-exp",
        contents=full_prompt
    )

    ai_response = response.text

    try:
        cleaned_response = ai_response.strip()
        if cleaned_response.startswith('```json'):
            cleaned_response = cleaned_response.replace('```json', '').replace('```', '').strip()
        elif cleaned_response.startswith('```'):
            cleaned_response = cleaned_response.replace('```', '').strip()

        parsed = json.loads(cleaned_response)
        score = parsed.get('score', 0)
        story = parsed.get('story', ai_response)
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        print(f"AI Response: {ai_response}")
        score = 0
        story = ai_response

    updated_context = previous_context if previous_context else []
    updated_context.append({"role": "user", "content": action})
    updated_context.append({"role": "assistant", "content": story})

    return jsonify({
        'score': score,
        'story': story,
        'username': username,
        'action': action,
        'previouscontext': updated_context
    })
