import os
from app import create_app

app = create_app()

if __name__ == '__main__':
    # Use 0.0.0.0 for Railway (allows external connections)
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', '5000'))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    app.run(debug=debug, host=host, port=port)