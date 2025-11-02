# Railway Deployment Guide

This guide will help you deploy the Planet Saver Game on Railway with separate frontend and backend services.

## Prerequisites
- Railway account (https://railway.app)
- GitHub repository connected to Railway

## Architecture
- **Backend**: Flask API (Python)
- **Frontend**: React + Vite (Static Site)

---

## Backend Deployment (Flask Server)

### Step 1: Create Backend Service
1. Go to Railway dashboard
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will detect it as a monorepo - choose the `server` directory

### Step 2: Configure Backend Environment Variables
In the Railway backend service settings, add these environment variables:

```
PORT=5000
HOST=0.0.0.0
DEBUG=False
SECRET_KEY=<generate-a-secure-random-key>
GEMINI_API_KEY=<your-gemini-api-key>
DATABASE_URL=<will-be-auto-set-if-using-railway-postgres>
```

**Important**:
- Generate a secure SECRET_KEY (use `python -c "import secrets; print(secrets.token_hex(32))"`)
- Get your Gemini API key from Google AI Studio

### Step 3: Configure Build Settings
Railway should auto-detect the Python project. Verify these settings:

- **Root Directory**: `server`
- **Build Command**: Auto-detected (pip install)
- **Start Command**: `python run.py`

### Step 4: Database Setup (Optional)
If you want to use PostgreSQL instead of SQLite:

1. Add a PostgreSQL database to your project
2. Railway will automatically set the `DATABASE_URL` environment variable
3. The Flask app will use it automatically (see server/app/__init__.py:17)

### Step 5: Deploy
1. Click "Deploy"
2. Wait for deployment to complete
3. Copy the public URL (e.g., `https://your-backend.up.railway.app`)

---

## Frontend Deployment (React/Vite)

### Step 1: Create Frontend Service
1. In the same Railway project, click "New Service"
2. Select "Deploy from GitHub repo"
3. Choose your repository
4. Select the `front-end` directory

### Step 2: Configure Frontend Environment Variables
Add these environment variables:

```
VITE_API_URL=<your-backend-railway-url>
```

Example: `VITE_API_URL=https://your-backend.up.railway.app`

### Step 3: Configure Build Settings
Verify these settings:

- **Root Directory**: `front-end`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run preview`

**Alternative (using static hosting):**
You can also use Railway's static site hosting:
- **Build Command**: `npm install && npm run build`
- **Output Directory**: `dist`

### Step 4: Update Frontend Code to Use Environment Variable
Make sure your frontend API calls use the environment variable:

```javascript
// In your API calls
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

fetch(`${API_URL}/api/endpoint`)
```

### Step 5: Deploy
1. Click "Deploy"
2. Wait for deployment to complete
3. Access your frontend at the public URL

---

## Post-Deployment Checklist

### Backend
- [ ] Verify `/api` endpoints are accessible
- [ ] Check logs for any errors
- [ ] Test database connection
- [ ] Verify CORS is allowing frontend domain

### Frontend
- [ ] Verify app loads correctly
- [ ] Test API connectivity to backend
- [ ] Check console for errors
- [ ] Test all game functionality

---

## Common Issues & Troubleshooting

### CORS Errors
If you see CORS errors, update `server/app/__init__.py`:

```python
from flask_cors import CORS

def create_app():
    app = Flask(__name__)
    # Update CORS to allow your frontend domain
    CORS(app, origins=['https://your-frontend.up.railway.app'])
```

### Database Issues
- For SQLite: Ensure the `instance` directory is writable
- For PostgreSQL: Verify `DATABASE_URL` environment variable is set

### Environment Variables Not Loading
- Ensure all required env vars are set in Railway dashboard
- For frontend, env vars must start with `VITE_`
- Redeploy after changing environment variables

### Build Failures
- **Backend**: Check `requirements.txt` for missing dependencies
- **Frontend**: Ensure `package.json` has all dependencies

---

## File Structure Summary

### Backend Files Added/Modified
- `server/Procfile` - Railway process file
- `server/runtime.txt` - Python version specification
- `server/run.py` - Already configured for Railway (PORT, HOST env vars)

### Frontend Files Modified
- `front-end/vite.config.js` - Build configuration

---

## Cost Optimization
- Railway offers $5 free credit per month
- Both services should fit within free tier for development
- Monitor usage in Railway dashboard

---

## Support
- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway

## Next Steps
1. Set up domain names (optional)
2. Configure CI/CD for automatic deployments
3. Set up monitoring and logging
4. Add database backups (for PostgreSQL)
