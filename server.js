const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

// Render-এর临时 /tmp ফোল্ডার ব্যবহার করা (Ephemeral storage safe)
const upload = multer({
  dest: '/tmp/',
  limits: {
    fileSize: 500 * 1024 * 1024 // ৫০০ MB ভিডিও সাইজ লিমিট
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS এনাবল করা (যাতে আপনার ফ্রন্টএন্ড ওয়েবসাইট থেকে এপিআই কল করা যায়)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ফায়ারবেস সার্ভিস অ্যাকাউন্ট কনফিগারেশন (Optional - Environment Variable থেকে)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    console.log('Firebase Admin SDK Initialized Successfully.');
  } catch (err) {
    console.error('Firebase Initialization Error:', err.message);
  }
}

// Google OAuth2 Client সেটআপ
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URL || 'http://localhost:3000/oauth2callback'
);

// রিফ্রেশ টোকেন সেট করা
oauth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN
});

const youtube = google.youtube({
  version: 'v3',
  auth: oauth2Client
});

// হোম রাউট (স্বাস্থ্য পরীক্ষা)
app.get('/', (req, res) => {
  res.send('Class Video Upload Server is Running Live!');
});

// ভিডিও আপলোড এপিআই
app.post('/api/upload-video', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No video file uploaded.' });
  }

  const filePath = req.file.path;

  try {
    const { title, description } = req.body;

    console.log(`Uploading video "${title}" to YouTube...`);

    // ইউটিউবে Unlisted ভিডিও হিসেবে ইন্সার্ট করা
    const youtubeResponse = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: title || 'নতুন ক্লাস ভিডিও',
          description: description || 'Class Platform Uploaded Video',
        },
        status: {
          privacyStatus: 'unlisted', // Unlisted প্রাইভেসি
        },
      },
      media: {
        body: fs.createReadStream(filePath),
      },
    });

    const videoId = youtubeResponse.data.id;
    console.log(`✅ Upload Success! YouTube Video ID: ${videoId}`);

    // ফাইল রিমুভ নিশ্চিত করা
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // ফায়ারবেস ডাটাবেজে রেকর্ড রাখা (যদি চালু থাকে)
    if (admin.apps.length) {
      const db = admin.database();
      const videoRef = db.ref('class_videos').push();
      await videoRef.set({
        title: title || 'নতুন ক্লাস ভিডিও',
        description: description || '',
        videoId: videoId,
        createdAt: Date.now()
      });
    }

    res.json({
      success: true,
      message: 'Video uploaded successfully to YouTube!',
      videoId: videoId
    });

  } catch (error) {
    console.error('YouTube Upload Error:', error);

    // এরর আসলেও টেম্পোরারি ফাইল ডিলিট
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
