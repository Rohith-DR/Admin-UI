# 🚀 BAT Admin Panel Deployment Guide

This guide will help you deploy your BAT Admin Panel to production.

## 📋 Prerequisites

Before deploying, make sure you have:
- Git repository (GitHub/GitLab)
- Google Drive API credentials
- Vercel account (for frontend)
- Railway account (for backend)

## 🔧 Backend Deployment (Railway)

### Step 1: Prepare Your Google Drive Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Drive API
4. Create credentials (OAuth 2.0 Client ID)
5. Download the credentials as `client_secrets.json`

### Step 2: Deploy to Railway

1. **Sign up/Login to Railway**: https://railway.app/
2. **Connect GitHub**: Link your GitHub repository
3. **Create New Project**: 
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Select the `backend` folder

4. **Set Environment Variables** in Railway:
   ```
   FLASK_ENV=production
   PORT=5000
   ```

5. **Upload Google Drive Credentials**:
   - In Railway dashboard, go to Variables tab
   - Upload your `client_secrets.json` content as environment variable
   - OR use Railway's file upload feature

6. **Deploy**: Railway will automatically deploy your backend

### Step 3: Get Your Backend URL
- After deployment, Railway will provide a URL like: `https://your-app-name.railway.app`
- Copy this URL for frontend configuration

## 🌐 Frontend Deployment (Vercel)

### Step 1: Update Environment Variables

1. Update `.env.production` with your Railway backend URL:
   ```
   VITE_API_URL=https://your-backend-url.railway.app/api
   ```

### Step 2: Deploy to Vercel

1. **Sign up/Login to Vercel**: https://vercel.com/
2. **Import Project**:
   - Click "New Project"
   - Import from GitHub
   - Select your repository
   - Vercel will auto-detect it's a Vite project

3. **Configure Build Settings**:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

4. **Set Environment Variables** in Vercel:
   ```
   VITE_API_URL=https://your-backend-url.railway.app/api
   ```

5. **Deploy**: Click "Deploy"

## ✅ Verification

### Test Your Deployment

1. **Frontend**: Visit your Vercel URL
2. **Backend**: Check `https://your-backend-url.railway.app/api/health`
3. **Google Drive**: Test the Google Drive integration

### Troubleshooting

1. **CORS Issues**: Make sure your Flask app has proper CORS settings
2. **Google Drive Auth**: Ensure credentials are properly uploaded
3. **Environment Variables**: Double-check all URLs and variables

## 🔄 Continuous Deployment

Both Vercel and Railway support automatic deployments:
- **Frontend**: Auto-deploys on push to main branch
- **Backend**: Auto-deploys on push to main branch

## 📱 Custom Domain (Optional)

### Vercel (Frontend):
1. Go to your project settings
2. Add custom domain
3. Update DNS records

### Railway (Backend):
1. Go to your project settings
2. Add custom domain
3. Update DNS records

## 🔒 Security Considerations

1. **Environment Variables**: Never commit credentials to Git
2. **CORS**: Configure proper CORS origins in production
3. **Rate Limiting**: Consider adding rate limiting to your API
4. **HTTPS**: Both platforms provide HTTPS by default

## 💡 Alternative Deployment Options

### Option 2: Netlify + Heroku
- **Frontend**: Netlify (similar to Vercel)
- **Backend**: Heroku (has free tier with limitations)

### Option 3: AWS/Google Cloud
- More complex but offers more control
- Use AWS Amplify/Google Cloud Run

## 📞 Support

If you encounter issues:
1. Check deployment logs in Railway/Vercel dashboards
2. Verify environment variables
3. Test API endpoints manually
4. Check browser console for frontend errors

---

**Your app will be live at:**
- Frontend: `https://your-project.vercel.app`
- Backend: `https://your-project.railway.app`