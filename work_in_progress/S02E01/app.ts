import express from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import multer from 'multer';
import dotenv from 'dotenv';
import { ReportService } from "../services/ReportService.ts";

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const reportService = new ReportService('https://c3ntrala.ag3nts.org/report', process.env.AIDEVS_API_KEY);

// Initialize Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
const PORT = process.env.PORT || 3000;

// Define paths
const AUDIO_FOLDER = path.join(__dirname, 'audios');
const TRANSCRIPT_FOLDER = path.join(__dirname, 'transcripts');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AUDIO_FOLDER),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// Ensure directories exist
async function ensureDirectories() {
  try {
    await fs.mkdir(AUDIO_FOLDER, { recursive: true });
    await fs.mkdir(TRANSCRIPT_FOLDER, { recursive: true });
    console.log('Directories created or already exist');
  } catch (error) {
    console.error('Error creating directories:', error);
  }
}

// Root endpoint - serve the welcome page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint to list audio files
app.get('/audio-files', async (req, res) => {
  try {
    const files = await fs.readdir(AUDIO_FOLDER);
    const audioFiles = files.filter(file =>
      ['.mp3', '.wav', '.m4a', '.mp4', '.mpeg', '.mpga', '.webm'].some(ext =>
        file.toLowerCase().endsWith(ext)
      )
    );
    res.json({ files: audioFiles });
  } catch (error) {
    console.error('Error listing audio files:', error);
    res.status(500).json({ error: 'Failed to list audio files' });
  }
});

// Endpoint to transcribe a single file
app.post('/transcribe/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const audioPath = path.join(AUDIO_FOLDER, filename);
    const transcriptPath = path.join(TRANSCRIPT_FOLDER, `${path.parse(filename).name}.json`);

    // Check if file exists
    try {
      await fs.access(audioPath);
    } catch (error) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

    // Check if transcript already exists
    try {
      await fs.access(transcriptPath);
      return res.status(200).json({ message: 'Transcript already exists', transcriptPath });
    } catch (error) {
      // Transcript doesn't exist, continue
    }

    // Read the audio file
    const audioFile = await fs.readFile(audioPath);

    // Create a transcription using OpenAI's Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioFile], filename, { type: 'audio/mpeg' }),
      model: "whisper-1"
    });

    // Save the transcription
    await fs.writeFile(
      transcriptPath,
      JSON.stringify({
        filename,
        transcription: transcription.text,
        timestamp: new Date().toISOString()
      }, null, 2)
    );

    res.status(200).json({
      message: 'Transcription completed',
      filename,
      transcriptPath
    });
  } catch (error) {
    console.error('Error during transcription:', error);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

// Endpoint to transcribe all files in the audios folder
app.post('/transcribe-all', async (req, res) => {
  try {
    const files = await fs.readdir(AUDIO_FOLDER);
    const audioFiles = files.filter(file =>
      ['.mp3', '.wav', '.m4a', '.mp4', '.mpeg', '.mpga', '.webm'].some(ext =>
        file.toLowerCase().endsWith(ext)
      )
    );

    if (audioFiles.length === 0) {
      return res.status(404).json({ message: 'No audio files found' });
    }

    const results = [];

    // Process each file sequentially
    for (const file of audioFiles) {
      try {
        const audioPath = path.join(AUDIO_FOLDER, file);
        const transcriptPath = path.join(TRANSCRIPT_FOLDER, `${path.parse(file).name}.json`);

        // Check if transcript already exists
        try {
          await fs.access(transcriptPath);
          results.push({ file, status: 'skipped', message: 'Transcript already exists' });
          continue;
        } catch (error) {
          // Transcript doesn't exist, continue
        }

        // Read the audio file
        const audioFile = await fs.readFile(audioPath);

        // Create a transcription
        const transcription = await openai.audio.transcriptions.create({
          file: new File([audioFile], file, { type: 'audio/mpeg' }),
          model: "whisper-1"
        });

        // Save the transcription
        await fs.writeFile(
          transcriptPath,
          JSON.stringify({
            filename: file,
            transcription: transcription.text,
            timestamp: new Date().toISOString()
          }, null, 2)
        );

        results.push({ file, status: 'success', transcriptPath });
      } catch (error) {
        results.push({ file, status: 'error', message: error.message });
      }
    }

    res.status(200).json({
      message: 'Transcription process completed',
      results
    });
  } catch (error) {
    console.error('Error during bulk transcription:', error);
    res.status(500).json({ error: 'Failed to process audio files' });
  }
});

// Endpoint to upload audio files
app.post('/upload', upload.array('audio'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const fileNames = Array.isArray(req.files)
    ? req.files.map(file => file.filename)
    : [req.files.filename];

  res.status(200).json({
    message: 'Files uploaded successfully',
    files: fileNames
  });
});

// Endpoint to analyze all transcriptions
app.get('/analyze', async (req, res) => {
  try {
    // Read all transcription files
    const files = await fs.readdir(TRANSCRIPT_FOLDER);
    const transcriptionFiles = files.filter(file => file.endsWith('.json'));

    if (transcriptionFiles.length === 0) {
      return res.status(404).json({ message: 'No transcriptions found' });
    }

    // Collect all transcriptions
    const transcriptions = [];
    for (const file of transcriptionFiles) {
      const content = await fs.readFile(path.join(TRANSCRIPT_FOLDER, file), 'utf-8');
      const data = JSON.parse(content);
      transcriptions.push({
        filename: data.filename,
        text: data.transcription
      });
    }

    // Create a combined context for analysis
    const context = transcriptions.map(t =>
      `File: ${t.filename}\nTranscription: ${t.text}\n---`
    ).join('\n');

    // Send to OpenAI for analysis
    const analysis = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert assistant that analyzes transcriptions from audio recordings. Your task is to extract specific information from the transcriptions. Some record could be chaotic or disinformational. You have to determine such cases on your own. You should use knowledge about Polish universities to assist in your analysis."
        },
        {
          role: "user",
          content: `I need you to analyze these transcriptions step by step and extract the street name where Professor Andrzej Maj's institute is located. This is NOT about the main university building, but specifically about the institute where Professor Maj works. Please be methodical in your analysis and explain your reasoning.\n\nTranscriptions:\n${context}`
        }
      ],
      temperature: 0.2
    });

    res.status(200).json({
      message: 'Analysis completed',
      result: analysis.choices[0].message.content,
      transcriptCount: transcriptionFiles.length
    });
  } catch (error) {
    console.error('Error during analysis:', error);
    res.status(500).json({ error: 'Failed to analyze transcriptions' });
  }
});

// Endpoint to list all available transcriptions
app.get('/transcripts', async (req, res) => {
  try {
    const files = await fs.readdir(TRANSCRIPT_FOLDER);
    const transcripts = files.filter(file => file.endsWith('.json'));

    const details = await Promise.all(transcripts.map(async (file) => {
      const content = await fs.readFile(path.join(TRANSCRIPT_FOLDER, file), 'utf-8');
      const data = JSON.parse(content);
      return {
        filename: file,
        originalFile: data.filename,
        timestamp: data.timestamp,
        excerpt: data.transcription.substring(0, 100) + (data.transcription.length > 100 ? '...' : '')
      };
    }));

    res.status(200).json(details);
  } catch (error) {
    console.error('Error listing transcripts:', error);
    res.status(500).json({ error: 'Failed to list transcripts' });
  }
});

// Endpoint to send manual street name answer
app.post('/report-street', async (req, res) => {
  const { answer } = req.body;
  if (!answer || typeof answer !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid answer' });
  }
  try {
    const result = await reportService.sendReport('mp3', answer);
    res.status(200).json({
      message: 'Report sent successfully',
      answer: answer,
      apiResponse: result
    });
  } catch (error) {
    console.error('Error sending report:', error);
    res.status(500).json({
      error: 'Failed to send report',
      message: error.message,
      details: error.response?.data || {}
    });
  }
});

// Start the server
async function startServer() {
  await ensureDirectories();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`- Audio folder: ${AUDIO_FOLDER}`);
    console.log(`- Transcript folder: ${TRANSCRIPT_FOLDER}`);
    console.log(`- Open http://localhost:${PORT} in your browser to use the web interface`);
  });
}

startServer().catch(console.error);
