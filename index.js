// Install dependencies: npm install express mongoose cors dotenv axios node-cron
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(helmet()); // Security headers

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error('MongoDB connection error:', err));

// Schema and Models
const WordSchema = new mongoose.Schema({
    word: { type: String, required: true, unique: true },
    votes: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    voters: { type: [String], default: [] },
    submitter: { type: String, default: null },
    verified: { type: Boolean, default: false },
});

const SocialTrendSchema = new mongoose.Schema({
    word: { type: String, required: true, unique: true },
    platform: { type: String, required: true },
    mentions: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now },
});

const TokenSchema = new mongoose.Schema({
    word: { type: String, required: true, unique: true },
    tokenName: { type: String, required: true },
    tokenAddress: { type: String, required: true },
    imageUrl: { type: String, default: '' },
    description: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    referralReward: { type: Number, default: 0 },
    siteFee: { type: Number, default: 0 },
});

const Word = mongoose.model('Word', WordSchema);
const SocialTrend = mongoose.model('SocialTrend', SocialTrendSchema);
const Token = mongoose.model('Token', TokenSchema);

// Utility: Validate User Input
const validateUser = (req, res, next) => {
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
    }
    req.userId = userId;
    next();
};

// Middleware to Check Verified Status
const checkVerified = (req, res, next) => {
    const { isVerified } = req.headers;
    req.isVerified = isVerified === 'true';
    next();
};

// Fetch Twitter Trends
const fetchTwitterTrends = async () => {
    try {
        const response = await axios.get('https://api.twitter.com/1.1/trends/place.json', {
            headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
            params: { id: 1 },
        });
        const trends = response.data[0].trends;
        for (const trend of trends) {
            await SocialTrend.updateOne(
                { word: trend.name, platform: 'Twitter' },
                { $set: { mentions: trend.tweet_volume || 0, lastUpdated: new Date() } },
                { upsert: true }
            );
        }
    } catch (err) {
        console.error('Error fetching Twitter trends:', err.message);
    }
};

// Schedule Fetching Social Trends
cron.schedule('0 * * * *', async () => {
    console.log('Fetching social media trends...');
    await fetchTwitterTrends();
});

// Routes

// Submit a new word
app.post('/api/submit', validateUser, checkVerified, async (req, res) => {
    const { word } = req.body;
    const { userId, isVerified } = req;
    try {
        const existingWord = await Word.findOne({ word });
        if (existingWord) {
            return res.status(400).json({ error: 'Word already exists!' });
        }
        const newWord = new Word({ word, submitter: userId, verified: isVerified });
        await newWord.save();
        res.status(201).json({ message: 'Word submitted successfully!', word: newWord });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create Tokens for Top Words
app.post('/api/create-tokens', async (req, res) => {
    try {
        const words = await Word.find().sort({ votes: -1 }).limit(5);
        const tokens = [];

        for (const word of words) {
            const customization = {
                style: 'edgy and fun',
                colors: 'vibrant and bold',
            };
            const investment = 1;
            const tokenData = await createMemeCoin(word.word, investment, customization);
            if (tokenData) {
                const newToken = new Token({
                    word: word.word,
                    tokenName: tokenData.tokenName,
                    tokenAddress: tokenData.tokenAddress,
                    imageUrl: tokenData.imageUrl,
                    description: tokenData.description,
                    referralReward: tokenData.referralReward,
                    siteFee: tokenData.siteFee,
                });
                await newToken.save();
                tokens.push(newToken);
            }
        }

        res.status(201).json({ message: 'Tokens created successfully!', tokens });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get trending words
app.get('/api/trending', async (req, res) => {
    try {
        const words = await Word.find().sort({ votes: -1 }).limit(10);
        res.status(200).json(words);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get social media trends
app.get('/api/social-trends', async (req, res) => {
    try {
        const trends = await SocialTrend.find().sort({ mentions: -1 }).limit(10);
        res.status(200).json(trends);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
