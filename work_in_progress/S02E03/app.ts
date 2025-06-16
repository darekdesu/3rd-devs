import express from 'express';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import axios from 'axios';
import path from 'path';
import { ReportService } from '../services/ReportService';

dotenv.config();

const app = express();
const port = 3000;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Home page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>DALLE-3 Image Generator</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        button {
          padding: 10px 20px;
          background-color: #4CAF50;
          color: white;
          border: none;
          cursor: pointer;
          font-size: 16px;
        }
        button:hover {
          background-color: #45a049;
        }
        .result {
          margin-top: 20px;
        }
        img {
          max-width: 100%;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <h1>DALLE-3 Image Generator</h1>
      <p>Click the button below to generate an image based on the robot description:</p>
      <a href="/process"><button>Generate Image</button></a>
      <div id="result" class="result"></div>
    </body>
    </html>
  `);
});

// Process endpoint
app.get('/process', async (req, res) => {
  try {
    // Get API key from .env
    const apiKey = process.env.AIDEVS_API_KEY;
    if (!apiKey) {
      return res.status(500).send('AIDEVS_API_KEY not found in environment variables');
    }

    // Fetch robot description from the provided URL
    const response = await axios.get(`https://centrala.ag3nts.org/data/${apiKey}/robotid.json`);
    const robotDescription = response.data.description;

    if (!robotDescription) {
      return res.status(500).send('Failed to get robot description from the API');
    }

    // Generate image using DALLE-3
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: robotDescription,
      n: 1,
      size: "1024x1024",
    });

    const imageUrl = imageResponse.data[0]?.url;

    if (!imageUrl) {
      return res.status(500).send('Failed to generate image');
    }

    // Return HTML with the generated image and a "Send report" button
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>DALLE-3 Generated Image</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          img {
            max-width: 100%;
            margin-top: 20px;
          }
          .description {
            margin-top: 20px;
            padding: 10px;
            background-color: #f5f5f5;
            border-radius: 5px;
          }
          a, button {
            display: inline-block;
            margin-top: 20px;
            margin-right: 10px;
            padding: 10px 20px;
            background-color: #4CAF50;
            color: white;
            text-decoration: none;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
          }
          button:hover {
            background-color: #45a049;
          }
          #report-result {
            margin-top: 20px;
            padding: 10px;
            border-radius: 5px;
            display: none;
          }
          .success {
            background-color: #dff0d8;
            color: #3c763d;
          }
          .error {
            background-color: #f2dede;
            color: #a94442;
          }
        </style>
      </head>
      <body>
        <h1>DALLE-3 Generated Image</h1>
        <div class="description">
          <h3>Description:</h3>
          <p>${robotDescription}</p>
        </div>
        <h3>Generated Image:</h3>
        <img src="${imageUrl}" alt="Generated image of a robot">
        <br>
        <a href="/">Back to Home</a>
        <button id="send-report">Send Report</button>
        <div id="report-result"></div>

        <script>
          document.getElementById('send-report').addEventListener('click', async () => {
            try {
              const response = await fetch('/send-report', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  imageUrl: '${imageUrl}',
                }),
              });
              
              const result = await response.json();
              
              const reportResultElement = document.getElementById('report-result');
              reportResultElement.style.display = 'block';
              
              if (response.ok) {
                reportResultElement.className = 'success';
                reportResultElement.innerHTML = '<h3>Report Sent Successfully</h3><pre>' + JSON.stringify(result, null, 2) + '</pre>';
              } else {
                reportResultElement.className = 'error';
                reportResultElement.innerHTML = '<h3>Error Sending Report</h3><pre>' + JSON.stringify(result, null, 2) + '</pre>';
              }
            } catch (error) {
              const reportResultElement = document.getElementById('report-result');
              reportResultElement.style.display = 'block';
              reportResultElement.className = 'error';
              reportResultElement.innerHTML = '<h3>Error Sending Report</h3><p>' + error.message + '</p>';
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// Endpoint to send the report
app.post('/send-report', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    const apiKey = process.env.AIDEVS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'AIDEVS_API_KEY not found in environment variables' });
    }

    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }

    // Create an instance of the ReportService with the API URL and key
    const reportService = new ReportService('https://c3ntrala.ag3nts.org/report', apiKey);

    // Send the report with task name and the image URL
    const reportResult = await reportService.sendReport('robotid', imageUrl);
    res.json(reportResult);
  } catch (error) {
    console.error('Error sending report:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

export {};


