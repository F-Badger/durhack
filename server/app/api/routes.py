from flask import jsonify, request, Blueprint
import json
import os
import secrets
from google import genai
from app.db import db
from app.models import GameResult
from datetime import datetime, timezone

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
        write an opening description of at least five sentences that begins in a world of ruins produced by human actions.
        Address the reader by inserting the username into the text at least once.
        Include specific, plausible causes and facts about how the world reached this state—mention rising global
        temperatures and extreme weather driven by carbon emissions, sea-level rise, deforestation and soil erosion,
        industrial agriculture and monocultures, plastic pollution and microplastics in oceans and food,
        ocean acidification and collapsing fisheries, species extinctions, air pollution and contaminated rivers,
        and resource depletion—without turning the story into a list Output only the story text.
        Leave the reader a question about what action they are taking in the present to prevent this future from occuring.
        Imagine and set the story to be in the year 2100.
        Begin with the phrase "The year is 2100". The description should be in present tense and not include characters.
        The description should be 4-6 sentences.
        Output no extra metadata, lists, instructions, or explanation, with no leading or trailing whitespace and just the text.
        """

        # API Call - This is the most likely place for an external exception
        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
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

    
@api.route('/generate-win-description', methods=['POST'])
def generate_win_description():
    """
    Recieves score, previous context. Generates a description of a utopian society based on this.
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400

    username = data.get('username')
    action = data.get('action')
    previous_context = data.get('previous_context')
    no_messages = (len(previous_context)+1)//2
    evaluation = data.get("score")/no_messages

    client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))


    system_prompt = """You are the AI judge for "2100" - a game where player actions determine Earth's fate.
    
    The user describes an action they are taking in the present (2025).
    You determine the effect it will have on the world in the year 2100.
    The user has recieved enough points to win the game. 
    Describe the hypothetical utopian green future they have created as a result of their actions in the present
    STORY RULES:
    - Begin with the phrase "The year is 2100"
    - 3-5 sentences describing a hypothetical utopian future
    - Consider how the most recent action, and all of the actions the user has previously taken, have led to this future
    - Use present tense, as if you are telling a story in the year 2100
    - Do not include characters including the narrator - this is a purely descriptive text
    - Consequences should feel real.
    - Next, tell the user this was a hypothetical scenario, but their actions have had positive impact in the real world
    - Talk about their actions based on the previous conversation
    - Use statistics and figures e.g. how much CO2 the user may have saved.
    - You should encourage the user to reflect specifically on any bad choices they made that would be harmful
    - And tell them how they could have done better
    - This should inspire the user to do good 
    Output no extra metadata, lists, instructions, or explanation, with no leading or trailing whitespace and just the text.
    """
    # Build messages for conversation
    current_prompt = f'Player "{username}" action: "{action}"\n'

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
        model="gemini-2.5-flash",
        contents=full_prompt
    )

    try:
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


@api.route('/generate-lose-description', methods=['POST'])
def generate_lose_description():
    """
    Recieves score, previous context. Generates a description of the end of society based on this.
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400

    username = data.get('username')
    action = data.get('action')
    previous_context = data.get('previous_context')

    client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))


    system_prompt = """You are the AI judge for "2100" - a game where player actions determine Earth's fate.
    
    The user describes an action they are taking in the present (2025).
    You determine the effect it will have on the world in the year 2100.
    The user has recieved -50 points and lost the game. 
    Describe the hypothetical future they have created as a result of their actions in the present
    In this future, all life on Earth has been wiped out due to environmental disasters.
    STORY RULES:
    - Begin with the phrase "The year is 2100"
    - 3-5 sentences describing a hypothetical utopian future
    - Consider how the most recent action, and all of the actions the user has previously taken, have led to this future
    - Use present tense, as if you are telling a story in the year 2100
    - Do not include characters including the narrator - this is a purely descriptive text
    - Consequences should feel real.
    - Next, tell the user this was a hypothetical scenario, but their actions have had a negative impact in the real world
    - Talk about their actions based on the previous conversation
    - Use statistics and figures e.g. how much the user may have contributed to climate change
    - You should encourage the user to reflect specifically on any bad choices they made that would be harmful
    - And tell them how they could have done better
    - This should inspire the user to do good 
    Output no extra metadata, lists, instructions, or explanation, with no leading or trailing whitespace and just the text.
    """
    # Build messages for conversation
    current_prompt = f'Player "{username}" action: "{action}"\n'

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
        model="gemini-2.5-flash",
        contents=full_prompt
    )

    try:
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



@api.route('/player/register', methods=['POST'])
def register_player():
    """
    Register a player and create a session token.

    Request:
    {
        "nickname": x
    }

    Response:
    {
        "session_token": xyz,
        "nickname": x,
        "returning_player": True/False,
        'best_score": x (? if player exists)
    }
    """
    data = request.get_json()
    nickname = data.get('nickname')

    if not nickname:
        return jsonify({'error': 'Nickname is required'}), 400

    existing = GameResult.query.filter_by(nickname=nickname).first()

    if existing and existing.player_id:
        return jsonify({
            'session_token': existing.player_id,
            'nickname': existing.nickname,
            'returning_player': True,
            'best_score': existing.total_score
        })

    player_id = secrets.token_urlsafe(16)

    return jsonify({
        'session_token': player_id,
        'nickname': nickname,
        'returning_player': False
    }), 201


@api.route('/player/verify', methods=['GET'])
def verify_player():
    """
    Verify if a player's session token is valid.

    Headers:
    X-Player-Token: x

    Response:
    {
        "valid": true,
        "nickname": x,
        "best_score": 300
    }
    """
    player_token = request.headers.get('X-Player-Token')

    if not player_token:
        return jsonify({'error': 'No player token provided'}), 401

    # if player exists in database
    result = GameResult.query.filter_by(player_id=player_token).first()

    if result:
        return jsonify({
            'valid': True,
            'nickname': result.nickname,
            'best_score': result.total_score,
            'player_id': result.player_id
        })

    # exists but no game played yet - still valid
    return jsonify({
        'valid': True,
        'new_player': True
    })


@api.route('/submit-action', methods=['POST'])
def submit_action():
    """
    Receive user action and return AI-generated story and Delta.

    Expected JSON body:
    {
        "username": "player_name",
        "action": "action description",
        "score": <number>
    }

    Returns:
    {
        "scoreDelta": <number>,
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


    system_prompt = """You are the AI judge for "2100" - a game where player actions determine Earth's fate.
    
    The user describes an action they are taking in the present (2025).
    You determine the effect it will have on the world in the year 2100.
    The user's total score is given in the response as score.
    A total score of 200 means the user has won, and the Earth is now a green utopia.
    A total score of -50 means the user has lost, and humanity is extinct.
    A total score of 0 means the world is in ruins as a result of climate disaster.
    Be consistent with these values when generating your description.
    Evaluate the environmental impact:

    STORY RULES:
    - Begin with the phrase "The year is 2100"
    - Use the user's total score (score) to determine the state of Earth. Do not use scoreDelta for this. 
    - 3-5 sentences maximum
    - Be dramatic and visual
    - Consider how the specific impacts will lead to a changed scenario in the future
    - Focus more on the end result, with less detail on how we got there
    - Use present tense, as if you are telling a story in the year 2100
    - Do not include characters including the narrator - this is a purely descriptive text
    - End it asking what else the user will do
    

    Generate a score delta based on the impact of the user's action.
    SCORE DELTA GUIDE:
    +40 to +50: Major positive (renewable energy, veganism, reforestation)
    +20 to +40: Good actions (cycling, composting, reducing waste)
    +5 to +20: Small positive (recycling, shorter showers, LED bulbs)
    -5 to +5: Neutral/minimal impact
    -20 to -5: Small negative (occasional meat, short flights)
    -40 to -20: Bad actions (SUV purchase, excessive consumption)
    -50 to -40: Terrible (deforestation, heavy pollution, coal rolling)

    Generate a sentiment based on the user's action
    SENTIMENT GUIDE (emotional tone):
    +0.8 to +1.0: Extremely positive/hopeful
    +0.4 to +0.8: Moderately positive
    0.0 to +0.4: Slightly positive/neutral
    -0.4 to 0.0: Slightly negative/concerning
    -1.0 to -0.4: Very negative/alarming

    OUTPUT FORMAT (JSON only, no markdown, no code blocks):
    {
        "scoreDelta": <number between -50 and +50>,
        "sentiment": <number between -1 and +1>,
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
        model="gemini-2.5-flash-lite",
        contents=full_prompt
    )

    ai_response = response.text

    try:
        cleaned_response = ai_response.strip()

        # Remove markdown code blocks more robustly
        if '```json' in cleaned_response:
            # Extract content between ```json and ```
            start = cleaned_response.find('```json') + 7
            end = cleaned_response.find('```', start)
            cleaned_response = cleaned_response[start:end].strip()
        elif '```' in cleaned_response:
            # Extract content between ``` and ```
            start = cleaned_response.find('```') + 3
            end = cleaned_response.find('```', start)
            cleaned_response = cleaned_response[start:end].strip()

        # Fix invalid JSON (like +45 instead of 45)
        import re
        cleaned_response = re.sub(r':\s*\+(\d+)', r': \1', cleaned_response)

        parsed = json.loads(cleaned_response)
        scoreDelta = parsed.get('scoreDelta', 0)
        sentiment = parsed.get('sentiment', 0.0)
        story = parsed.get('story', '')
    except (json.JSONDecodeError, Exception) as e:
        print(f"JSON decode error: {e}")
        print(f"AI Response: {ai_response}")
        scoreDelta = 0
        sentiment = 0.0
        story = "Error parsing AI response"

    # Build updated context with clean story (not raw AI response)
    if previous_context and isinstance(previous_context, list):
        updated_context = previous_context.copy()
    else:
        updated_context = []

    updated_context.append({"role": "user", "content": action})
    updated_context.append({"role": "assistant", "content": story})

    print(
        {'scoreDelta': scoreDelta,
        'sentiment': sentiment,
        'story': story,
        'username': username,
        'action': action,
        'previouscontext': updated_context
         })

    return jsonify({
        'scoreDelta': scoreDelta,
        'sentiment': sentiment,
        'story': story,
        'username': username,
        'action': action,
        'previouscontext': updated_context
    })


@api.route('/game/end', methods=['POST'])
def end_game():
    """
    Save game results to database when game ends.

    Expected JSON body:
    {
        "nickname": "player_name",
        "initial_years": 50,
        "final_years": 75,
        "total_score": 150,
        "actions_count": 10,
        "status": "won"  // or "lost"
    }

    Returns:
    {
        "message": "Game result saved",
        "id": 123,
        "rank": 5
    }
    """
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No JSON data provided'}), 400

    nickname = data.get('nickname')
    player_id = data.get('player_id')  # Get player_id from request
    initial_years = data.get('initial_years')
    final_years = data.get('final_years')
    total_score = data.get('total_score')
    actions_count = data.get('actions_count', 0)
    status = data.get('status', 'lost')

    # Validate required fields
    if not nickname or initial_years is None or final_years is None or total_score is None:
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        # Check if player already exists
        existing_result = GameResult.query.filter_by(nickname=nickname).first()

        print(f"DEBUG: Looking for nickname '{nickname}'")
        print(f"DEBUG: Found existing? {existing_result is not None}")
        if existing_result:
            print(f"DEBUG: Existing score: {existing_result.total_score}, New score: {total_score}")

        if existing_result:
            # Update only if new score is better
            if total_score > existing_result.total_score:
                existing_result.initial_years = initial_years
                existing_result.final_years = final_years
                existing_result.total_score = total_score
                existing_result.actions_count = actions_count
                existing_result.status = status
                existing_result.played_at = datetime.now(timezone.utc)

                db.session.commit()

                # Calculate rank
                rank = GameResult.query.filter(GameResult.total_score > total_score).count() + 1

                return jsonify({
                    'message': 'Game result updated (new high score!)',
                    'id': existing_result.id,
                    'rank': rank,
                    'years_saved': final_years - initial_years,
                    'improved': True
                }), 200
            else:
                # Don't update, but return current rank
                rank = GameResult.query.filter(GameResult.total_score > existing_result.total_score).count() + 1

                return jsonify({
                    'message': 'Score not improved, kept previous best',
                    'id': existing_result.id,
                    'rank': rank,
                    'years_saved': final_years - initial_years,
                    'improved': False,
                    'best_score': existing_result.total_score
                }), 200
        else:
            # Create new game result for new player
            game_result = GameResult(
                nickname=nickname,
                player_id=player_id,  # Save player_id
                initial_years=initial_years,
                final_years=final_years,
                total_score=total_score,
                actions_count=actions_count,
                status=status,
                played_at=datetime.now(timezone.utc)
            )

            db.session.add(game_result)
            db.session.commit()

            # Calculate rank
            rank = GameResult.query.filter(GameResult.total_score > total_score).count() + 1

            return jsonify({
                'message': 'Game result saved successfully',
                'id': game_result.id,
                'rank': rank,
                'years_saved': final_years - initial_years,
                'improved': True
            }), 201

    except Exception as e:
        db.session.rollback()
        print(f"Error saving game result: {e}")
        return jsonify({'error': 'Failed to save game result'}), 500


@api.route('/leaderboard', methods=['GET'])
def leaderboard():
    """
    Get top players from leaderboard.

    Query params:
    - limit: number of results (default 10, max 100)
    - sort_by: 'score' (default) or 'years_saved'

    Returns:
    {
        "leaderboard": [
            {
                "id": 1,
                "nickname": "EcoWarrior",
                "total_score": 250,
                "years_saved": 30,
                "actions_count": 15,
                "status": "won",
                "played_at": "2025-11-02T00:00:00"
            },
            ...
        ],
        "total_players": 150
    }
    """
    limit = request.args.get('limit', 10, type=int)
    sort_by = request.args.get('sort_by', 'score')

    limit = min(limit, 100)

    try:
        if sort_by == 'years_saved':
            # Sort by (final_years - initial_years) descending
            results = GameResult.query.order_by(
                (GameResult.final_years - GameResult.initial_years).desc()
            ).limit(limit).all()
        else:
            # sort by total_score
            results = GameResult.query.order_by(
                GameResult.total_score.desc()
            ).limit(limit).all()

        total_players = GameResult.query.count()

        leaderboard_data = [result.to_dict() for result in results]

        return jsonify({
            'leaderboard': leaderboard_data,
            'total_players': total_players,
            'limit': limit,
            'sort_by': sort_by
        })

    except Exception as e:
        print(f"Error fetching leaderboard: {e}")
        return jsonify({'error': 'Failed to fetch leaderboard'}), 500
