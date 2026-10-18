const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const app = express();

// ১. সরাসরি কোডের ভেতরে সমস্ত ক্রেডেনশিয়াল এবং টোকেন সেট করা হলো
const CLIENT_ID = '630943791166-4f16qqggn0jp5vocd5071kibctmb8j9a.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URL = 'http://localhost:3000/oauth2callback';
const REFRESH_TOKEN = '1//0gaivZAzGs-P4CgYIARAAGBASNwF-L9Ir7RwiR7a6wHMFlmiVrsKNRC0yxZty1DQfoG9t_RMAYEEj_2_ttzeaZBY5_cG4x6FwrZ0';

// Render বা লোকাল সার্ভারের জন্য টেম্পোরারি আপলোড ফোল্ডার
const upload = multer({
  dest: '/tmp/',
  limits: {
    fileSize: 500 * 1024 * 1024 // সর্বোচ্চ ৫০০ MB ভিডিও ফাইল
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS এনাবল করা (যাতে যেকোনো ফ্রন্টএন্ড বা ড্যাশবোর্ড থেকে রিকোয়েস্ট গ্রহণ করতে পারে)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Google OAuth2 Client সেটআপ
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URL
);

// রিফ্রেশ টোকেন সেট করা
oauth2Client.setCredentials({
  refresh_token: REFRESH_TOKEN
});

const youtube = google.youtube({
  version: 'v3',
  auth: oauth2Client
});

// হোম রাউট (টেস্ট করার জন্য)
app.get('/', (req, res) => {
  res.send('Class Video Upload Server is Running Live & Ready!');
});

// ভিডিও আপলোড এপিআই (সরাসরি ইউটিউবে Unlisted হিসেবে যাবে)
app.post('/api/upload-video', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'কোনো ভিডিও ফাইল আপলোড করা হয়নি।' });
  }

  const filePath = req.file.path;

  try {
    const { title, description } = req.body;

    console.log(`Uploading video "${title || 'Untitled'}" to YouTube...`);

    // ইউটিউবে ভিডিও আপলোড রিকোয়েস্ট
    const youtubeResponse = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: title || 'নতুন ক্লাস ভিডিও',
          description: description || 'Class Platform Uploaded Video',
        },
        status: {
          privacyStatus: 'unlisted', // ভিডিওটি Unlisted থাকবে
        },
      },
      media: {
        body: fs.createReadStream(filePath),
      },
    });

    const videoId = youtubeResponse.data.id;
    console.log(`✅ Upload Success! YouTube Video ID: ${videoId}`);

    // টেম্পোরারি ফাইল রিমুভ করা
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({
      success: true,
      message: 'Video uploaded successfully to YouTube!',
      videoId: videoId
    });

  } catch (error) {
    console.error('YouTube Upload Error:', error);

    // এরর আসলেও টেম্পোরারি ফাইল ডিলিট নিশ্চিত করা
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
